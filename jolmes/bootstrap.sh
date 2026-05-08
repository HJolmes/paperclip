#!/usr/bin/env bash
# ---------------------------------------------------------------------
# Paperclip Bootstrap – Jolmes-Setup (Subscription-Modus)
# ---------------------------------------------------------------------
# Idempotent: kann beliebig oft erneut laufen.
# Wird im Repo-Root des HJolmes/paperclip-Forks ausgeführt:
#     ./jolmes/bootstrap.sh
#
# Default: nutzt Claude Code CLI mit deinem Pro/Max-Abo.
# Für Direkt-API-Modus siehe jolmes/SETUP.md Abschnitt 3.
# ---------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."   # → Repo-Root

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

echo "== 1/6 ==> Toolchain prüfen"
node --version

# corepack braucht in Codespaces oft sudo, weil /usr/local/bin/ nicht
# vom Default-User beschreibbar ist.
if ! command -v pnpm >/dev/null 2>&1; then
  if corepack enable >/dev/null 2>&1 && corepack prepare pnpm@9.15.4 --activate >/dev/null 2>&1; then
    echo "   pnpm via corepack aktiviert"
  elif [ -n "$SUDO" ] && $SUDO corepack enable && $SUDO corepack prepare pnpm@9.15.4 --activate; then
    echo "   pnpm via sudo+corepack aktiviert"
  else
    echo "   corepack nicht möglich – fallback: npm i -g pnpm@9.15.4"
    $SUDO npm install -g pnpm@9.15.4
  fi
fi
pnpm --version

echo "== 2/6 ==> Claude Code CLI installieren"
if ! command -v claude >/dev/null 2>&1; then
  $SUDO npm install -g @anthropic-ai/claude-code
  echo "   claude CLI installiert."
else
  echo "   claude CLI bereits vorhanden ($(claude --version 2>/dev/null || echo unbekannt))."
fi

echo "== 3/6 ==> Dependencies installieren"
pnpm install

echo "== 4/6 ==> .env vorbereiten"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "   .env aus .env.example angelegt."
fi

# BETTER_AUTH_SECRET härten – nur wenn noch der Default-Wert drinsteht
if grep -q '^BETTER_AUTH_SECRET=paperclip-dev-secret$' .env; then
  SECRET="$(openssl rand -hex 32)"
  awk -v s="$SECRET" '/^BETTER_AUTH_SECRET=/{print "BETTER_AUTH_SECRET=" s; next} {print}' .env > .env.tmp
  mv .env.tmp .env
  echo "   BETTER_AUTH_SECRET zufällig gesetzt."
fi

# Jolmes-Block einmalig anhängen – Subscription-Modus = KEIN ANTHROPIC_API_KEY
if ! grep -q '^# === Jolmes additions ===' .env; then
  cat >> .env <<'EOF'

# === Jolmes additions ===
# Subscription-Modus: ANTHROPIC_API_KEY bewusst NICHT setzen.
# claude_local-Adapter nutzt dann den 'claude login'-Auth-Token
# deines Pro/Max-Abos.
# (Wenn du auf Direkt-API umsteigen willst: Zeile unten füllen.)
# ANTHROPIC_API_KEY=

# Telemetrie aus (DSGVO)
PAPERCLIP_TELEMETRY_DISABLED=1
DO_NOT_TRACK=1
EOF
  echo "   Jolmes-Block an .env angehängt (Subscription-Modus, ohne API-Key)."
fi

echo "== 5/6 ==> DB-Migrationen"
pnpm db:migrate || echo "   (DB-Migration übersprungen oder bereits aktuell)"

echo "== 6/6 ==> Claude-Login prüfen"
# Nicht-interaktiver Check: liefert exit 0, wenn Token existiert
if claude --version >/dev/null 2>&1 && [ -d "$HOME/.claude" ] && [ -n "$(ls -A "$HOME/.claude" 2>/dev/null)" ]; then
  echo "   ~/.claude existiert – vermutlich schon eingeloggt."
else
  echo "   Bitte 'claude login' im nächsten Schritt manuell ausführen."
fi

cat <<'EOF'

Setup fertig. Nächste Schritte:

  1. claude login              # einmalig, öffnet Browser-Tab
  2. pnpm dev                   # API + UI auf :3100
  3. UI öffnen → Onboarding → Company "Jolmes Automation"
  4. Rolle "Mail-Klassifikator" mit Adapter "claude_local"
     (Modell + Prompt aus jolmes/prompts/mail-klassifikator.md)
  5. Smoke-Test: jolmes/docs/SMOKE-TEST.md

EOF
