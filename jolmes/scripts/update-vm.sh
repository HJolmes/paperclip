#!/usr/bin/env bash
# ---------------------------------------------------------------------
# jolmes/scripts/update-vm.sh
# ---------------------------------------------------------------------
# Idempotenter Update-Lauf auf der Hetzner-VM. Als paperclip-User
# aus dem Repo-Root aufrufen:
#
#   cd ~/paperclip && ./jolmes/scripts/update-vm.sh
#
# Reihenfolge: pre-flight checks → DB-Backup → git pull → Service stop
# → patches → pnpm install → migrate → UI-Build → Service start.
# Bricht bei jedem Fehler ab; ein laufender Backup-Pfad wird am Ende
# ausgegeben, damit Rollback via pg_restore möglich bleibt.
# ---------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

log() { printf '\n==> %s\n' "$*"; }

# --- 1) Pre-flight ---------------------------------------------------
log "1/9 Pre-flight"

if [ ! -f .env ]; then
  echo "FEHLER: .env nicht gefunden in $ROOT_DIR" >&2
  exit 1
fi

# Node muss >= 22 sein. pnpm 11 (von corepack als latest aktiviert)
# crasht auf Node 20 mit ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite.
# Der bloße engines.node-Check aus package.json (">=20") würde das
# nicht erwischen.
if ! command -v node >/dev/null 2>&1; then
  echo "FEHLER: node nicht im PATH." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  cat >&2 <<EOF
FEHLER: Node $NODE_MAJOR.x ist zu alt (mindestens v22 erforderlich).

  Upgrade via NodeSource:
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs

  Danach update-vm.sh erneut aufrufen.
EOF
  exit 1
fi

# pnpm muss tatsächlich startfähig sein (catcht Corepack-/Node-Mismatch).
if ! pnpm --version >/dev/null 2>&1; then
  echo "FEHLER: 'pnpm --version' schlägt fehl. Vermutlich Corepack-/Node-Mismatch." >&2
  echo "        Versuche: corepack enable && corepack prepare pnpm@latest --activate" >&2
  exit 1
fi

if ! git diff-index --quiet HEAD --; then
  echo "FEHLER: working tree dirty – bitte erst committen/stashen." >&2
  git status --short
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "master" ]; then
  echo "FEHLER: nicht auf master (aktuell: $CURRENT_BRANCH)." >&2
  exit 1
fi

# DATABASE_URL aus .env lesen (zum Backup).
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -n1 | cut -d= -f2- | sed -E 's/^"//; s/"$//')"
if [ -z "${DATABASE_URL}" ]; then
  echo "FEHLER: DATABASE_URL fehlt in .env." >&2
  exit 1
fi

# --- 2) DB-Backup ----------------------------------------------------
log "2/9 DB-Backup"
BACKUP_DIR="${HOME}/.paperclip/backups"
mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/db-${TS}.sql.gz"
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
echo "   Backup: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# --- 3) git pull -----------------------------------------------------
log "3/9 git pull origin master"
git fetch origin master
LOCAL_BEFORE="$(git rev-parse HEAD)"
git pull --ff-only origin master
LOCAL_AFTER="$(git rev-parse HEAD)"

if [ "$LOCAL_BEFORE" = "$LOCAL_AFTER" ]; then
  echo "   Schon auf $LOCAL_AFTER – kein Update nötig."
  echo "   (Service wird trotzdem nicht angefasst.)"
  rm -f "$BACKUP_FILE"
  exit 0
fi

echo "   $LOCAL_BEFORE → $LOCAL_AFTER"

# --- 4) Service stoppen ----------------------------------------------
log "4/9 paperclip.service stoppen"
sudo systemctl stop paperclip.service

# --- 5) Patches anwenden --------------------------------------------
log "5/9 Jolmes-Patches anwenden"
./jolmes/scripts/apply-patches.sh

# --- 6) pnpm install -------------------------------------------------
log "6/9 pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

# --- 7) DB-Migrationen ----------------------------------------------
log "7/9 pnpm db:migrate"
pnpm db:migrate

# --- 8) UI Production-Build -----------------------------------------
log "8/9 pnpm --filter @paperclipai/ui build"
pnpm --filter @paperclipai/ui build

# --- 9) Service starten + Status ------------------------------------
log "9/9 paperclip.service starten"
sudo systemctl start paperclip.service
sleep 3
sudo systemctl status paperclip.service --no-pager -l | head -20 || true

echo
echo "==> Fertig. Backup vor Update: $BACKUP_FILE"
echo "    Rollback bei Bedarf:"
echo "      sudo systemctl stop paperclip.service"
echo "      gunzip -c \"$BACKUP_FILE\" | psql \"\$DATABASE_URL\""
echo "      git reset --hard $LOCAL_BEFORE"
echo "      sudo systemctl start paperclip.service"
