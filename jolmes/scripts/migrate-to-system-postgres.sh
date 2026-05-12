#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Migrate Paperclip storage from embedded-postgres (PG18 beta) to system-postgres
# (PG18 from postgresql.org APT) on the Hetzner VM.
#
# Why: embedded-postgres occasionally loses DSM segments at runtime
# ("could not open shared memory segment ..."), the Node connection pool keeps
# stale handles, every query returns FATAL 58P01, the systemd unit stays
# "active" and never restarts. See SESSION-NOTES.md §11.11.
#
# Run on the VM as the paperclip user (the script re-elevates to root via sudo
# when needed):
#     ssh paperclip@<vm>
#     cd ~/paperclip
#     bash jolmes/scripts/migrate-to-system-postgres.sh
#
# Idempotent: re-running after a successful migration is a no-op.
# -----------------------------------------------------------------------------
set -euo pipefail

# ----- Config ---------------------------------------------------------------
PAPERCLIP_HOME="${PAPERCLIP_HOME:-$HOME/paperclip}"
INSTANCE_DIR="$HOME/.paperclip/instances/default"
EMBEDDED_PORT=54329
SYSTEM_PORT=5432
DB_NAME="paperclip"
DB_USER="paperclip"
SECRETS_DIR="$HOME/.paperclip/secrets"
PASSWORD_FILE="$SECRETS_DIR/postgres.pwd"
ENV_FILE="$PAPERCLIP_HOME/.env"
SERVICE="paperclip.service"
DUMP_FILE="/tmp/paperclip-migration-$(date +%Y%m%dT%H%M%S).sql"
PG_MAJOR=18

log() { printf "\033[1;34m[migrate]\033[0m %s\n" "$*"; }
die() { printf "\033[1;31m[migrate]\033[0m %s\n" "$*" >&2; exit 1; }

[ "$(id -un)" = "paperclip" ] || die "Run as the paperclip user (got $(id -un))."
[ -d "$PAPERCLIP_HOME" ] || die "Paperclip repo not found at $PAPERCLIP_HOME"
[ -f "$ENV_FILE" ] || die ".env not found at $ENV_FILE"

# ----- Detect prior migration ----------------------------------------------
if grep -qE '^DATABASE_URL=postgresql://[^@]+@127\.0\.0\.1:'"$SYSTEM_PORT"'/' "$ENV_FILE" 2>/dev/null; then
  log ".env already points at system-postgres on :$SYSTEM_PORT — assuming migration ran."
  log "Re-running is safe. If you want to redo: remove DATABASE_URL from .env first."
  exit 0
fi

# ----- 1) Install postgresql-$PG_MAJOR from postgresql.org APT (FIRST) -----
# Important: embedded-postgres only ships {initdb, pg_ctl, postgres} — no
# pg_dump. We need a matching-major pg_dump from pgdg (embedded is PG 18
# beta, so we install PG 18 stable; pg_dump 18 dumps PG 18 cleanly).
log "Installing postgresql-$PG_MAJOR (apt) — sudo required..."
if ! dpkg -s "postgresql-$PG_MAJOR" >/dev/null 2>&1; then
  if [ ! -f /etc/apt/sources.list.d/pgdg.list ]; then
    sudo install -d /usr/share/keyrings
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | sudo gpg --dearmor -o /usr/share/keyrings/pgdg-archive-keyring.gpg
    CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
    echo "deb [signed-by=/usr/share/keyrings/pgdg-archive-keyring.gpg] http://apt.postgresql.org/pub/repos/apt $CODENAME-pgdg main" \
      | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
    sudo apt-get update -y
  fi
  sudo apt-get install -y "postgresql-$PG_MAJOR" "postgresql-client-$PG_MAJOR"
fi
sudo systemctl enable --now "postgresql@$PG_MAJOR-main.service" || sudo systemctl enable --now postgresql

PG_BIN_DIR="/usr/lib/postgresql/$PG_MAJOR/bin"
[ -x "$PG_BIN_DIR/pg_dump" ] || die "pg_dump not found at $PG_BIN_DIR/pg_dump after install"
log "  using $PG_BIN_DIR/pg_dump ($("$PG_BIN_DIR/pg_dump" --version | awk '{print $NF}'))"

# ----- 2) Verify embedded-postgres is reachable (service running) ----------
log "Checking embedded-postgres on 127.0.0.1:$EMBEDDED_PORT..."
if ! ss -ltn "sport = :$EMBEDDED_PORT" | grep -q LISTEN; then
  log "Embedded postgres not listening — starting paperclip.service to wake it..."
  sudo systemctl start "$SERVICE"
  for i in {1..30}; do
    sleep 2
    if ss -ltn "sport = :$EMBEDDED_PORT" | grep -q LISTEN; then break; fi
    [ "$i" = 30 ] && die "Embedded postgres did not come up after 60s. Abort."
  done
fi
log "  embedded-postgres OK."

# ----- 3) Dump the live DB -------------------------------------------------
# embedded-postgres uses a hardcoded password "paperclip" for the
# "paperclip" role (see server/src/index.ts:385). md5/scram is enforced,
# not trust, so pg_dump needs PGPASSWORD.
log "Dumping embedded DB → $DUMP_FILE"
PGPASSWORD="${EMBEDDED_PASSWORD:-paperclip}" \
"$PG_BIN_DIR/pg_dump" \
  --host=127.0.0.1 --port="$EMBEDDED_PORT" \
  --username="$DB_USER" \
  --no-owner --no-acl --no-comments \
  --format=plain \
  --dbname="$DB_NAME" \
  > "$DUMP_FILE"
DUMP_SIZE="$(wc -c < "$DUMP_FILE")"
log "  dump size: $DUMP_SIZE bytes"
[ "$DUMP_SIZE" -gt 1024 ] || die "Dump suspiciously small (<1 KB). Abort, do not destroy embedded DB."

# ----- 4) Provision role + database in system-postgres ---------------------
log "Ensuring role '$DB_USER' and database '$DB_NAME' exist in system-postgres..."

mkdir -p "$SECRETS_DIR" && chmod 700 "$SECRETS_DIR"
if [ ! -f "$PASSWORD_FILE" ]; then
  umask 077
  openssl rand -hex 24 > "$PASSWORD_FILE"
  chmod 600 "$PASSWORD_FILE"
  log "  generated new password → $PASSWORD_FILE"
fi
PG_PASSWORD="$(cat "$PASSWORD_FILE")"

ROLE_EXISTS="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" || true)"
if [ "$ROLE_EXISTS" = "1" ]; then
  sudo -u postgres psql -c "ALTER ROLE \"$DB_USER\" WITH LOGIN PASSWORD '$PG_PASSWORD'" >/dev/null
else
  sudo -u postgres psql -c "CREATE ROLE \"$DB_USER\" WITH LOGIN PASSWORD '$PG_PASSWORD'" >/dev/null
fi
DB_EXISTS="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" || true)"
if [ "$DB_EXISTS" != "1" ]; then
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
fi

# Allow scram-sha-256 from localhost for our user (default on modern PG, but
# pg_hba.conf may default to peer for local). Ensure md5/scram-sha-256 for
# 127.0.0.1 lines.
HBA_FILE="$(sudo -u postgres psql -tAc 'SHOW hba_file')"
if ! sudo grep -qE "^host\s+$DB_NAME\s+$DB_USER\s+127\.0\.0\.1/32\s+scram-sha-256" "$HBA_FILE"; then
  echo "host $DB_NAME $DB_USER 127.0.0.1/32 scram-sha-256" | sudo tee -a "$HBA_FILE" >/dev/null
  sudo systemctl reload "postgresql@$PG_MAJOR-main.service" || sudo systemctl reload postgresql
fi

# ----- 5) Stop paperclip.service before restoring --------------------------
log "Stopping paperclip.service..."
sudo systemctl stop "$SERVICE" || true

# ----- 6) Restore dump into system-postgres --------------------------------
log "Restoring dump into system-postgres on :$SYSTEM_PORT..."
PGPASSWORD="$PG_PASSWORD" psql \
  --host=127.0.0.1 --port="$SYSTEM_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --set ON_ERROR_STOP=on \
  --quiet \
  -f "$DUMP_FILE"
log "  restore complete."

# Sanity: row count of issues table (best-effort)
ISSUE_COUNT="$(PGPASSWORD="$PG_PASSWORD" psql -h 127.0.0.1 -p "$SYSTEM_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc 'SELECT COUNT(*) FROM issues' 2>/dev/null || echo 'n/a')"
log "  issues row count in system-postgres: $ISSUE_COUNT"

# ----- 7) Wire DATABASE_URL into .env --------------------------------------
DATABASE_URL="postgresql://$DB_USER:$PG_PASSWORD@127.0.0.1:$SYSTEM_PORT/$DB_NAME"
log "Setting DATABASE_URL in $ENV_FILE..."
if grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DATABASE_URL|" "$ENV_FILE"
else
  echo "DATABASE_URL=$DATABASE_URL" >> "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

# ----- 8) Remove obsolete SHM-cleanup drop-in (no longer needed) -----------
DROPIN=/etc/systemd/system/paperclip.service.d/10-shm-cleanup.conf
if [ -f "$DROPIN" ]; then
  log "Removing obsolete drop-in $DROPIN..."
  sudo rm -f "$DROPIN"
  sudo systemctl daemon-reload
fi

# ----- 9) Restart paperclip + smoke test ----------------------------------
log "Starting paperclip.service..."
sudo systemctl start "$SERVICE"

log "Waiting for /api/health..."
for i in {1..60}; do
  STATUS="$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/api/health 2>/dev/null || echo 000)"
  if [ "$STATUS" = "200" ]; then
    log "  /api/health → 200. Service is up."
    break
  fi
  sleep 2
  [ "$i" = 60 ] && die "API did not become healthy after 120s. Check journalctl -u $SERVICE -n 200 --no-pager"
done

# ----- 10) Archive embedded data dir (do NOT delete yet) -------------------
EMBED_DIR="$INSTANCE_DIR/db"
if [ -d "$EMBED_DIR" ] && [ ! -L "$EMBED_DIR" ]; then
  ARCHIVE="$INSTANCE_DIR/db.embedded.pre-system-pg.$(date +%Y%m%d-%H%M%S)"
  log "Moving old embedded data dir → $ARCHIVE (keep until you're sure)"
  mv "$EMBED_DIR" "$ARCHIVE"
fi

cat <<EOF

[migrate] DONE.

  Dump file:        $DUMP_FILE
  DB password:      $PASSWORD_FILE  (mode 600)
  DATABASE_URL:     in $ENV_FILE
  Old embedded dir: archived as $INSTANCE_DIR/db.embedded.pre-system-pg.*
  Issues in DB:     $ISSUE_COUNT

Verify in the UI: http://23.88.46.202  → HEN → Issues. If the M365 Inbox
project still shows ~133 issues with mail context, the migration is good.

Once you've confirmed (a day or two later), you can drop the archive:
    rm -rf $INSTANCE_DIR/db.embedded.pre-system-pg.*

And tighten up the dump:
    rm $DUMP_FILE
EOF
