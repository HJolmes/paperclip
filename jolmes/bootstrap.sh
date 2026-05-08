#!/usr/bin/env bash
# ---------------------------------------------------------------------
# Paperclip Bootstrap – Jolmes-Setup
# ---------------------------------------------------------------------
# Idempotent: kann beliebig oft erneut laufen.
# Wird im Repo-Root des HJolmes/paperclip-Forks ausgeführt:
#     ./jolmes/bootstrap.sh
# ---------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."   # → Repo-Root

echo "== 1/5 ==> Toolchain prüfen"
node --version

# corepack braucht in Codespaces oft sudo, weil /usr/local/bin/ nicht
# vom Default-User beschreibbar ist. Wir versuchen erst ohne, fallen
# dann auf sudo zurück, und als letzten Ausweg auf 'npm i -g'.
SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

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

echo "== 2/5 ==> Dependencies installieren"
pnpm install

echo "== 3/5 ==> .env vorbereiten"
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

# Jolmes-Block einmalig anhängen
if ! grep -q '^# === Jolmes additions ===' .env; then
  cat >> .env <<'EOF'

# === Jolmes additions ===
# Anthropic API Key – holen unter https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=

# Telemetrie aus (DSGVO)
PAPERCLIP_TELEMETRY_DISABLED=1
DO_NOT_TRACK=1
EOF
  echo "   Jolmes-Block an .env angehängt – ANTHROPIC_API_KEY noch leer!"
fi

echo "== 4/5 ==> DB-Migrationen"
pnpm db:migrate || echo "   (DB-Migration übersprungen oder bereits aktuell)"

echo "== 5/5 ==> fertig"
cat <<EOF

Setup fertig. Nächste Schritte:

  1. .env öffnen und ANTHROPIC_API_KEY eintragen
  2. pnpm dev
  3. Browser auf http://localhost:3100 öffnen
  4. UI-Onboarding durchlaufen → Company "Jolmes Automation"
  5. Rolle "Mail-Klassifikator" mit System-Prompt aus
     jolmes/prompts/mail-klassifikator.md anlegen
  6. Smoke-Test: jolmes/docs/SMOKE-TEST.md

EOF
