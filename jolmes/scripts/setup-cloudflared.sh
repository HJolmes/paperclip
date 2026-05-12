#!/usr/bin/env bash
# ---------------------------------------------------------------------
# jolmes/scripts/setup-cloudflared.sh
# ---------------------------------------------------------------------
# Richtet einen Cloudflare-Named-Tunnel auf der Hetzner-VM ein, der den
# lokalen Paperclip-Port (3100) als https://paperclip.hjolmes.org public
# erreichbar macht. Ziel: HTTPS-Endpunkt für Microsoft-Graph-Webhooks
# (Mail-/To-Do-Subscriptions), ohne Inbound-Port am Server zu öffnen.
#
# Aufruf auf der Hetzner-VM aus dem Repo-Root:
#
#   cd ~/paperclip && ./jolmes/scripts/setup-cloudflared.sh
#
# Das Skript ist idempotent. Einmaliger interaktiver Schritt:
# `cloudflared tunnel login` öffnet einen Browser-Link, der mit dem
# Cloudflare-Konto bestätigt werden muss (einmalig je VM).
# ---------------------------------------------------------------------
set -euo pipefail

TUNNEL_NAME="${TUNNEL_NAME:-paperclip-hetzner}"
# Bash setzt $HOSTNAME automatisch auf den VM-Namen — deshalb eigene Variable.
TUNNEL_HOSTNAME="${TUNNEL_HOSTNAME:-paperclip.hjolmes.org}"
LOCAL_URL="${LOCAL_URL:-http://localhost:3100}"
CLOUDFLARED_DIR="/etc/cloudflared"
SERVICE_USER="${SERVICE_USER:-$USER}"

log() { printf '\n==> %s\n' "$*"; }
err() { printf 'FEHLER: %s\n' "$*" >&2; exit 1; }

# --- 1) Pre-flight ---------------------------------------------------
log "1/7 Pre-flight"

if [ "$(uname -s)" != "Linux" ]; then
  err "Nur für Linux gedacht (Hetzner-VM, Debian/Ubuntu)."
fi

if ! command -v curl >/dev/null 2>&1; then
  err "curl fehlt. sudo apt-get install -y curl"
fi

if [ "$EUID" -eq 0 ]; then
  err "Bitte als normaler Nutzer aufrufen, nicht als root. sudo wird gezielt verwendet."
fi

# --- 2) cloudflared installieren ------------------------------------
log "2/7 cloudflared installieren (falls fehlt)"

if command -v cloudflared >/dev/null 2>&1; then
  echo "   cloudflared bereits installiert: $(cloudflared --version | head -n1)"
else
  ARCH="$(dpkg --print-architecture 2>/dev/null || echo amd64)"
  TMP_DEB="/tmp/cloudflared-${ARCH}.deb"
  curl -fsSL -o "$TMP_DEB" \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
  sudo dpkg -i "$TMP_DEB"
  rm -f "$TMP_DEB"
  echo "   installiert: $(cloudflared --version | head -n1)"
fi

# --- 3) Login (einmalig, interaktiv) --------------------------------
log "3/7 Cloudflare-Login"

CERT_PATH="${HOME}/.cloudflared/cert.pem"
if [ -f "$CERT_PATH" ]; then
  echo "   cert.pem vorhanden, Login überspringen."
else
  cat <<EOF
   Es öffnet sich gleich ein Browser-Link. Diesen kopieren, im Browser
   öffnen, mit dem Cloudflare-Konto einloggen und die Domain
   ${TUNNEL_HOSTNAME#*.} auswählen. Danach kehrt cloudflared selbständig zurück.
EOF
  cloudflared tunnel login
  [ -f "$CERT_PATH" ] || err "Login fehlgeschlagen — cert.pem fehlt."
fi

# --- 4) Tunnel anlegen ----------------------------------------------
log "4/7 Tunnel '${TUNNEL_NAME}' anlegen"

if cloudflared tunnel list 2>/dev/null | awk 'NR>1 {print $2}' | grep -qx "$TUNNEL_NAME"; then
  echo "   Tunnel existiert bereits."
else
  cloudflared tunnel create "$TUNNEL_NAME"
fi

TUNNEL_ID="$(cloudflared tunnel list 2>/dev/null \
  | awk -v n="$TUNNEL_NAME" 'NR>1 && $2==n {print $1; exit}')"
[ -n "$TUNNEL_ID" ] || err "Tunnel-ID nicht ermittelbar."
echo "   Tunnel-ID: $TUNNEL_ID"

# --- 5) Config schreiben --------------------------------------------
log "5/7 Config schreiben nach ${CLOUDFLARED_DIR}/config.yml"

sudo mkdir -p "$CLOUDFLARED_DIR"
sudo cp "${HOME}/.cloudflared/${TUNNEL_ID}.json" "${CLOUDFLARED_DIR}/${TUNNEL_ID}.json"
sudo chmod 600 "${CLOUDFLARED_DIR}/${TUNNEL_ID}.json"

sudo tee "${CLOUDFLARED_DIR}/config.yml" >/dev/null <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: ${CLOUDFLARED_DIR}/${TUNNEL_ID}.json

ingress:
  - hostname: ${TUNNEL_HOSTNAME}
    service: ${LOCAL_URL}
    originRequest:
      connectTimeout: 30s
      noTLSVerify: true
  - service: http_status:404
EOF

# --- 6) DNS-Route -----------------------------------------------------
log "6/7 DNS-Eintrag für ${TUNNEL_HOSTNAME} setzen"

# `route dns` ist idempotent: legt CNAME an oder meldet, dass er existiert.
# Echte Fehler (Konflikt mit anderem Tunnel, fehlende Permission) liefern
# einen Non-Zero-Exit-Code.
set +e
cloudflared tunnel route dns "$TUNNEL_NAME" "$TUNNEL_HOSTNAME" 2>&1 | tee /tmp/cf-route.log
ROUTE_RC=${PIPESTATUS[0]}
set -e

if [ "$ROUTE_RC" -eq 0 ]; then
  echo "   DNS-Eintrag ok."
elif grep -qiE "(already exists|already a)" /tmp/cf-route.log; then
  echo "   DNS-Eintrag existierte bereits — ok."
else
  err "DNS-Route fehlgeschlagen (siehe Output oben). Im Cloudflare-Dashboard prüfen, ob der Name auf einen anderen Tunnel zeigt."
fi

# --- 7) systemd-Service installieren ---------------------------------
log "7/7 systemd-Service installieren und starten"

if systemctl list-unit-files | grep -q '^cloudflared\.service'; then
  echo "   cloudflared.service existiert bereits — neu laden."
  sudo systemctl daemon-reload
else
  sudo cloudflared service install
fi

sudo systemctl enable cloudflared.service
sudo systemctl restart cloudflared.service
sleep 2
sudo systemctl status cloudflared.service --no-pager -l | head -15 || true

cat <<EOF

==> Fertig.

   Tunnel:   ${TUNNEL_NAME} (${TUNNEL_ID})
   Hostname: https://${TUNNEL_HOSTNAME}
   Origin:   ${LOCAL_URL}

   Smoke-Test (auf der VM):
     curl -fsS https://${TUNNEL_HOSTNAME}/ | head -20

   Logs:
     sudo journalctl -u cloudflared -f

   Webhook-Endpoint für Microsoft Graph z.B.:
     https://${TUNNEL_HOSTNAME}/webhooks/graph/todo
EOF
