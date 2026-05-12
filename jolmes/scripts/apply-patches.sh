#!/usr/bin/env bash
# ---------------------------------------------------------------------
# jolmes/scripts/apply-patches.sh
# ---------------------------------------------------------------------
# Wendet alle Patches aus jolmes/patches/*.patch idempotent auf den
# Repo-Root an. Jeder Patch trägt im Header eine "Marker"-Zeile:
#
#   # Marker: "<eindeutiges String-Snippet aus der gepatchten Version>"
#
# Ist dieser Marker im Repo bereits gefunden (per grep), wird der Patch
# übersprungen. Sonst wird er via `git apply` angewendet.
# ---------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PATCH_DIR="$ROOT_DIR/jolmes/patches"

cd "$ROOT_DIR"

if [ ! -d "$PATCH_DIR" ]; then
  echo "apply-patches: keine $PATCH_DIR – nichts zu tun."
  exit 0
fi

shopt -s nullglob
patches=("$PATCH_DIR"/*.patch)

if [ ${#patches[@]} -eq 0 ]; then
  echo "apply-patches: keine .patch-Dateien in $PATCH_DIR."
  exit 0
fi

for patch in "${patches[@]}"; do
  name="$(basename "$patch")"

  # Marker-Zeile aus dem Patch-Header lesen.
  marker="$(grep -E '^# Marker: ' "$patch" | head -n1 | sed -E 's/^# Marker: //; s/^"//; s/"$//')"
  if [ -z "$marker" ]; then
    echo "apply-patches: $name – kein '# Marker:' im Header, überspringe (Fehler im Patch?)."
    continue
  fi

  # Zielpfad aus der ersten 'diff --git a/...'-Zeile bestimmen.
  target_rel="$(grep -E '^diff --git a/' "$patch" | head -n1 | sed -E 's|^diff --git a/([^ ]+) .*$|\1|')"
  if [ -z "$target_rel" ] || [ ! -f "$target_rel" ]; then
    echo "apply-patches: $name – Zieldatei '$target_rel' fehlt, überspringe."
    continue
  fi

  # Idempotenz: ist die gepatchte Form schon im Repo?
  if grep -qF -- "$marker" "$target_rel"; then
    echo "apply-patches: $name – schon drin (Marker gefunden), skip."
    continue
  fi

  # Sauberer Apply-Versuch.
  if ! git apply --check "$patch" 2>/dev/null; then
    echo "apply-patches: $name – git apply --check fehlgeschlagen."
    echo "                Vermutlich hat sich Upstream verschoben. Bitte Patch prüfen."
    exit 1
  fi

  git apply "$patch"
  echo "apply-patches: $name – angewendet."
done

echo "apply-patches: fertig."
