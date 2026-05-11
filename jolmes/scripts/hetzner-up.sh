#!/usr/bin/env bash
# ---------------------------------------------------------------------
# hetzner-up.sh – Paperclip-VM auf Hetzner Cloud provisionieren
# ---------------------------------------------------------------------
# Voraussetzungen:
#   - HCLOUD_TOKEN env var gesetzt (Read & Write Token aus der
#     Hetzner Cloud Console: Security → API Tokens)
#   - SSH-Pubkey vorhanden (default: ~/.ssh/id_ed25519.pub)
#
# Optional konfigurierbar per env:
#   PAPERCLIP_VM_NAME       Default: paperclip-prod
#   PAPERCLIP_VM_TYPE       Default: cx23         (4 €/Mo, FSN, Intel)
#   PAPERCLIP_VM_LOCATION   Default: fsn1         (Falkenstein, DE)
#   PAPERCLIP_VM_IMAGE      Default: ubuntu-24.04
#   PAPERCLIP_SSH_KEY_NAME  Default: paperclip-admin
#   PAPERCLIP_SSH_KEY_FILE  Default: ~/.ssh/id_ed25519.pub
#   PAPERCLIP_REPO_URL      Default: https://github.com/HJolmes/paperclip.git
#   PAPERCLIP_REPO_BRANCH   Default: master
#
# Das Skript ist idempotent: SSH-Key und Server werden nur angelegt,
# falls noch nicht vorhanden. Erneuter Aufruf zeigt nur die IP an.
# ---------------------------------------------------------------------
set -euo pipefail

# --- 0) Variablen + Plausi-Checks --------------------------------------------

VM_NAME="${PAPERCLIP_VM_NAME:-paperclip-prod}"
VM_TYPE="${PAPERCLIP_VM_TYPE:-cx23}"
VM_LOCATION="${PAPERCLIP_VM_LOCATION:-fsn1}"
VM_IMAGE="${PAPERCLIP_VM_IMAGE:-ubuntu-24.04}"
SSH_KEY_NAME="${PAPERCLIP_SSH_KEY_NAME:-paperclip-admin}"
SSH_KEY_FILE="${PAPERCLIP_SSH_KEY_FILE:-$HOME/.ssh/id_ed25519.pub}"
REPO_URL="${PAPERCLIP_REPO_URL:-https://github.com/HJolmes/paperclip.git}"
REPO_BRANCH="${PAPERCLIP_REPO_BRANCH:-master}"

if [ -z "${HCLOUD_TOKEN:-}" ]; then
  cat >&2 <<'EOF'
ERROR: HCLOUD_TOKEN ist nicht gesetzt.

So legst du ein Token an:
  1. https://console.hetzner.cloud/projects öffnen
  2. Projekt wählen (oder neu anlegen, z.B. "paperclip-prod")
  3. Security → API Tokens → "Generate API Token"
     Permissions: "Read & Write"
  4. Token kopieren und exportieren:
        export HCLOUD_TOKEN=...
  5. Dieses Skript erneut starten.
EOF
  exit 1
fi

# SSH-Key existiert?
if [ ! -f "$SSH_KEY_FILE" ]; then
  echo "ERROR: Pubkey '$SSH_KEY_FILE' nicht gefunden." >&2
  echo "Tipp: 'ssh-keygen -t ed25519 -f \$HOME/.ssh/id_ed25519 -N \"\"' und neu starten." >&2
  exit 1
fi

SSH_PUBKEY="$(cat "$SSH_KEY_FILE")"

# --- 1) hcloud CLI sicherstellen ---------------------------------------------

if ! command -v hcloud >/dev/null 2>&1; then
  echo "==> hcloud CLI nicht gefunden – installiere via direktem Download"
  HCLOUD_VERSION="1.51.0"
  TMP="$(mktemp -d)"
  ARCH="amd64"
  case "$(uname -m)" in
    aarch64|arm64) ARCH="arm64" ;;
  esac
  curl -fsSL "https://github.com/hetznercloud/cli/releases/download/v${HCLOUD_VERSION}/hcloud-linux-${ARCH}.tar.gz" \
    -o "$TMP/hcloud.tar.gz"
  tar -xzf "$TMP/hcloud.tar.gz" -C "$TMP" hcloud
  if [ -w /usr/local/bin ]; then
    install -m 0755 "$TMP/hcloud" /usr/local/bin/hcloud
  else
    sudo install -m 0755 "$TMP/hcloud" /usr/local/bin/hcloud
  fi
  rm -rf "$TMP"
fi

hcloud version

# --- 2) SSH-Key hochladen (falls fehlt) --------------------------------------

if ! hcloud ssh-key describe "$SSH_KEY_NAME" >/dev/null 2>&1; then
  echo "==> Lade SSH-Key '$SSH_KEY_NAME' nach Hetzner hoch"
  hcloud ssh-key create --name "$SSH_KEY_NAME" --public-key "$SSH_PUBKEY"
else
  echo "==> SSH-Key '$SSH_KEY_NAME' existiert bereits"
fi

# --- 3) cloud-init rendern ---------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLOUD_INIT_TEMPLATE="$SCRIPT_DIR/../hetzner/cloud-init.yaml"
if [ ! -f "$CLOUD_INIT_TEMPLATE" ]; then
  echo "ERROR: cloud-init Template fehlt: $CLOUD_INIT_TEMPLATE" >&2
  exit 1
fi

CLOUD_INIT_RENDERED="$(mktemp -t paperclip-cloud-init.XXXXXX)"
trap 'rm -f "$CLOUD_INIT_RENDERED"' EXIT

# Achtung: SSH-Pubkey kann '/' enthalten → wir nutzen awk statt sed
awk \
  -v pubkey="$SSH_PUBKEY" \
  -v repo="$REPO_URL" \
  -v branch="$REPO_BRANCH" \
  '{
     gsub(/__SSH_PUBKEY__/, pubkey)
     gsub(/__REPO_URL__/, repo)
     gsub(/__REPO_BRANCH__/, branch)
     print
   }' \
  "$CLOUD_INIT_TEMPLATE" > "$CLOUD_INIT_RENDERED"

# --- 4) Server anlegen (oder bestehenden anzeigen) ---------------------------

if hcloud server describe "$VM_NAME" >/dev/null 2>&1; then
  echo "==> Server '$VM_NAME' existiert bereits – kein neuer wird angelegt."
else
  echo "==> Lege Server '$VM_NAME' an ($VM_TYPE, $VM_LOCATION, $VM_IMAGE)"
  hcloud server create \
    --name "$VM_NAME" \
    --type "$VM_TYPE" \
    --location "$VM_LOCATION" \
    --image "$VM_IMAGE" \
    --ssh-key "$SSH_KEY_NAME" \
    --user-data-from-file "$CLOUD_INIT_RENDERED" \
    --label "project=paperclip" \
    --label "managed-by=hetzner-up.sh"
fi

IPV4="$(hcloud server ip "$VM_NAME")"

cat <<EOF

============================================================
  Paperclip-VM '$VM_NAME' bereit.
============================================================
  IPv4:  $IPV4
  SSH:   ssh paperclip@$IPV4
  UI:    http://$IPV4:3100  (sobald cloud-init durch ist)

  Cloud-init braucht beim ersten Boot ~4-6 Minuten. Status:
    ssh paperclip@$IPV4 'tail -f /var/log/paperclip-bootstrap.log'

  Wenn 'paperclip-bootstrap: done' erscheint:
    ssh paperclip@$IPV4
    claude login                              # einmalig
    sudo systemctl restart paperclip
============================================================
EOF
