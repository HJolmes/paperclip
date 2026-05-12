#!/usr/bin/env bash
# Install (or refresh) the m365-sync.service + m365-sync.timer units on
# the running Paperclip VM.
#
# Idempotent: run it as often as you like. Re-runs simply re-copy the
# unit files from the repo and reload systemd.
#
# Usage (from the VM, as a sudo-capable user — e.g. 'paperclip'):
#   ./jolmes/scripts/install-m365-timer.sh
#
# Source of truth for the unit content is jolmes/hetzner/units/. Cloud-
# init runs this same script during VM provisioning, so don't drift the
# logic between the two.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNIT_SRC="$REPO_ROOT/jolmes/hetzner/units"
UNIT_DST="/etc/systemd/system"

for f in m365-sync.service m365-sync.timer; do
  if [ ! -f "$UNIT_SRC/$f" ]; then
    echo "missing unit file: $UNIT_SRC/$f" >&2
    exit 1
  fi
done

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -E "$0" "$@"
fi

install -m 0644 "$UNIT_SRC/m365-sync.service" "$UNIT_DST/m365-sync.service"
install -m 0644 "$UNIT_SRC/m365-sync.timer"   "$UNIT_DST/m365-sync.timer"

systemctl daemon-reload
systemctl enable --now m365-sync.timer

echo
echo "m365-sync.timer installed and enabled."
systemctl status --no-pager m365-sync.timer || true
echo
echo "Next scheduled runs:"
systemctl list-timers --no-pager m365-sync.timer || true
echo
echo "Note: m365-sync.service has ConditionPathExists for"
echo "  /home/paperclip/.paperclip/secrets/m365.json"
echo "so it stays inert until you've run:"
echo "  pnpm dlx tsx jolmes/scripts/m365/bootstrap.ts"
