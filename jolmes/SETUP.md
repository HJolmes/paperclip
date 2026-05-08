# Paperclip – Setup-Leitfaden für Jolmes Gruppe

> Ziel: Paperclip lauffähig im GitHub Codespace, mit deinem **Claude Pro/Max-Abo**
> (Direkt-API als Alternative), erste Test-Company und erstem Agent.
>
> Maintainer: Henning Jolmes (`@HJolmes`) · Stack: Microsoft 365, kein Google.

---

## 0. Voraussetzungen

- GitHub-Account `HJolmes` mit Codespaces-Zugang
- Repo `HJolmes/paperclip` (Fork von `paperclipai/paperclip`)
- **Default-Pfad:** Aktives Claude **Pro** (20 $/Monat) oder **Max**
  (100 $ / 200 $) Abo auf https://claude.ai
- Optional: Anthropic-API-Key, falls du später auf Direkt-API
  umsteigen willst (siehe Abschnitt 3)

---

## 1. Codespace starten

Auf https://github.com/HJolmes/paperclip:

1. **Code → Codespaces → Create codespace on master**
2. `.devcontainer/devcontainer.json` (im Fork bereits angelegt) richtet
   automatisch ein:
   - Node 20 + pnpm 9.15.4 via Corepack (mit `sudo`)
   - **Claude Code CLI** (`@anthropic-ai/claude-code`)
   - Port-Forwarding für `:3100`
   - Telemetrie aus (`PAPERCLIP_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1`)
   - VS-Code-Extensions: ESLint, Prettier, Claude Code
3. `postCreateCommand` läuft automatisch und macht `pnpm install`.

---

## 2. Bootstrap im Codespace-Terminal

```bash
./jolmes/bootstrap.sh
```

Das Skript ist idempotent und macht:

1. Prüft Node + pnpm (mit sudo-Fallback)
2. Installiert `claude` CLI falls nicht vorhanden
3. `pnpm install`
4. Legt `.env` aus `.env.example` an
5. Setzt einen frischen `BETTER_AUTH_SECRET`
6. Hängt einen Jolmes-Block an `.env` an – **ohne `ANTHROPIC_API_KEY`**
   (Subscription-Modus)
7. Versucht `pnpm db:migrate`

Nach dem Lauf:

```bash
claude login
```

→ Öffnet einen Browser-Tab, du loggst dich mit deinem Claude.ai-Account
ein, gibst die Berechtigung. Token wird in `~/.claude/` abgelegt.

---

## 3. Modell-Modus: Subscription vs. Direkt-API

### 3.1 Subscription-Modus (Default, was du willst)

- Auth: `claude login` einmalig
- `ANTHROPIC_API_KEY` bleibt **leer** in `.env`
- Adapter in Paperclip: **`claude_local`**
- Vorteil: dein Abo deckt alles, keine zusätzlichen Tokenkosten
- Limit: Rate-Limits deines Abos (5h-Fenster bei Pro, höher bei Max)
- Cost-Tracking in Paperclip: zeigt nur Token-Counts, keine Euro-Beträge

### 3.2 Direkt-API-Modus (für Phase 3 Produktion)

- Auth: `ANTHROPIC_API_KEY=sk-ant-...` in `.env`
- Adapter in Paperclip: weiterhin `claude_local` (er erkennt den Key
  und schaltet automatisch um) **oder** Provider-Adapter direkt
- Vorteil: pro Token bezahlt, keine Subscription-Rate-Limits, sauberes
  Hard-Stop-Budget pro Rolle
- Nachteil: zahlst on-top zum Abo

> **Hinweis:** Wenn `ANTHROPIC_API_KEY` gesetzt ist, nutzt der
> `claude_local`-Adapter laut Upstream-Doku automatisch API-Auth statt
> Subscription-Login. Paperclip warnt nur in der Environment-Test-UI,
> ohne harten Fehler.

---

## 4. Wichtige Environment-Variablen

| Variable                          | Pflicht                  | Default               | Zweck                           |
| --------------------------------- | :----------------------: | --------------------- | ------------------------------- |
| `BETTER_AUTH_SECRET`              | ✅                       | wird gesetzt          | Auth-Cookies                    |
| `ANTHROPIC_API_KEY`               | nur in 3.2               | leer                  | Direkt-API-Modus                |
| `DATABASE_URL`                    | ⛔                       | Upstream-Default      | Postgres                        |
| `PORT`                            | ⛔                       | `3100`                | Server-Port                     |
| `SERVE_UI`                        | ⛔                       | `false`               | UI im API-Prozess               |
| `PAPERCLIP_TELEMETRY_DISABLED`    | ⛔ (Bootstrap setzt)     | `1`                   | DSGVO                           |
| `DO_NOT_TRACK`                    | ⛔ (Bootstrap setzt)     | `1`                   | Standard-Konvention             |

Volle Liste siehe `doc/DOCKER.md`.

---

## 5. Dev-Server starten

```bash
pnpm dev
```

- API + UI auf `http://localhost:3100`
- Codespaces forwarded den Port automatisch
- Health-Check: `curl http://localhost:3100/api/health`

---

## 6. Test-Company & erster Agent (UI-geführt)

In der UI auf `:3100`:

1. **Onboarding-Wizard** – Operator = Henning
2. **Company anlegen**
   - Name: `Jolmes Automation`
   - Beschreibung: *„Sandbox für interne Automatisierungs-Experimente"*
3. **Agent / Rolle erstellen**
   - Name: `Mail-Klassifikator`
   - **Adapter: `claude_local`** ← entscheidend für Subscription-Modus
   - Modell: `claude-sonnet-4-6`
     *(falls Pro-Abo; mit Max kannst du `claude-opus-4-7` nehmen)*
   - `cwd`: `/workspaces/paperclip` (Codespace-Workspace)
   - Prompt-Template: copy-paste aus
     [`jolmes/prompts/mail-klassifikator.md`](./prompts/mail-klassifikator.md)
   - Heartbeat: `intervalSec: 0` (manueller Trigger fürs Testen),
     `wakeOnAssignment: true`
   - Budget: 10 € / Monat – im Subscription-Modus eher
     symbolisch (Tokens werden nicht in € umgerechnet)
4. **Test Environment** Button drücken
   - Erwartung: grüne Häkchen für CLI vorhanden, Working-Dir ok,
     Auth-Mode `subscription`
   - Falls Warnung „API-Key gesetzt" erscheint → Key aus `.env`
     entfernen und neu testen
5. **Manuellen Heartbeat triggern** über UI-Button oder:
   ```bash
   pnpm paperclipai agent local-cli "Mail-Klassifikator" --company-id <id>
   ```

Detail-Befehle in `doc/CLI.md` (Upstream).

---

## 7. Smoke-Test

Komplette Runbook in
[`jolmes/docs/SMOKE-TEST.md`](./docs/SMOKE-TEST.md). Kurzform:

> **Goal:** *„Schreibe einen einzeiligen Status-Report über deinen aktuellen Zustand."*

Akzeptanzkriterien (Subscription-Modus):

- 1 erfolgreicher Heartbeat-Run mit Status `succeeded`
- Audit-Trail in der UI sichtbar
- Token-Usage angezeigt (Cost in € bleibt 0,00 € – das ist im
  Subscription-Modus erwartet)

---

## 8. Commit-Hygiene

Auf diesem Fork landen Konfig-Dateien (`.devcontainer/`, `jolmes/`,
`.claude/CLAUDE.md`) – **niemals `.env`** oder `~/.claude/`-Tokens.
Die Upstream-`.gitignore` schließt `.env` und `.claude/settings.local.json`
schon aus.

```bash
git status                  # nur erlaubte Files prüfen
git add .devcontainer jolmes .claude/CLAUDE.md
git commit -m "chore(jolmes): …"
```

Branching-Regel für Claude-Code-Sessions: alles auf
`claude/setup-paperclip-4Xbkd`. PR auf `master` öffnen, sobald grün.

---

## 9. Was ist NICHT Teil dieser Phase

- Azure-Deployment (Container Apps / Postgres Flexible Server)
- Produktive Mail-Klassifikation (M365-Graph-Anbindung)
- SSO via Entra ID
- Backup/Restore-Strategie für `~/.paperclip`

→ Skizze in [`jolmes/docs/PHASE-2-AZURE.md`](./docs/PHASE-2-AZURE.md).

---

## 10. Troubleshooting

| Problem                              | Ursache                              | Fix                                                       |
| ------------------------------------ | ------------------------------------ | --------------------------------------------------------- |
| `claude: command not found`          | CLI nicht installiert                | `sudo npm install -g @anthropic-ai/claude-code`           |
| `claude login` öffnet keinen Browser | Codespace-Browser-Forward fehlt      | Code per Hand kopieren und auf claude.ai/api/oauth/... eingeben |
| Adapter-Test: „API key auth detected" | `ANTHROPIC_API_KEY` doch gesetzt    | aus `.env` löschen, `pnpm dev` neu starten                |
| Rate-Limit erreicht                  | Pro/Max-Window voll                  | warten bis nächstes Fenster oder auf Direkt-API umsteigen |
| `pnpm: command not found`            | Corepack nicht aktiv                 | `sudo corepack enable && sudo corepack prepare pnpm@9.15.4 --activate` |
| Port 3100 belegt                     | anderes Tool läuft                   | `PORT=3200 pnpm dev`                                       |
| UI lädt nicht                        | `SERVE_UI=false` und kein UI-Dev     | `SERVE_UI=true pnpm dev` oder `pnpm --filter ui dev`      |
| Postgres-Fehler                      | Datenordner kaputt                   | `rm -rf ~/.paperclip/instances/default/db && pnpm dev`    |
