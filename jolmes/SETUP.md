# Paperclip – Setup-Leitfaden für Jolmes Gruppe

> Ziel: Paperclip lauffähig im GitHub Codespace, mit Anthropic API, erste
> Test-Company und erstem Agent.
>
> Maintainer: Henning Jolmes (`@HJolmes`) · Stack: Microsoft 365, kein Google.

Diese Datei führt dich von „Codespace gestartet" bis „erster Agent hat
Goal abgearbeitet". Sie ergänzt – ersetzt nicht – die Upstream-Doku
unter `doc/` und `docs/`.

---

## 0. Voraussetzungen

- GitHub-Account `HJolmes` mit Codespaces-Zugang
- Repo `HJolmes/paperclip` (Fork von `paperclipai/paperclip`)
- Anthropic-API-Key (https://console.anthropic.com/) – wir nutzen
  **Claude Sonnet 4.6** (`claude-sonnet-4-6`)
- Optional: OpenAI-Key, falls du später auch Codex/GPT-Adapter testen willst

---

## 1. Codespace starten

Auf https://github.com/HJolmes/paperclip:

1. **Code → Codespaces → Create codespace on master**
2. Warten, bis Codespace bereit ist
3. `.devcontainer/devcontainer.json` (in diesem Fork bereits angelegt)
   richtet automatisch ein:
   - Node 20 + pnpm 9.15.4 via Corepack
   - Port-Forwarding für `:3100`
   - Telemetrie aus (`PAPERCLIP_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1`)
   - VS-Code-Extensions: ESLint, Prettier, Claude Code

Die `postCreateCommand` läuft automatisch und macht `pnpm install`.

---

## 2. Bootstrap im Codespace-Terminal

```bash
./jolmes/bootstrap.sh
```

Das Skript ist idempotent und macht:

1. Prüft Node + pnpm
2. `pnpm install` (falls noch nicht durch postCreate erledigt)
3. Legt `.env` aus `.env.example` an (falls nicht vorhanden)
4. Setzt einen frischen `BETTER_AUTH_SECRET`
5. Hängt einen Jolmes-Block (`ANTHROPIC_API_KEY=`,
   `PAPERCLIP_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1`) an die `.env` an –
   nur einmalig
6. Versucht `pnpm db:migrate`

Nach dem Lauf öffne `.env` und trage **`ANTHROPIC_API_KEY=sk-ant-...`** ein.

---

## 3. Environment-Variablen

| Variable                          | Pflicht | Default / Beispiel              | Zweck                                                  |
| --------------------------------- | :-----: | ------------------------------- | ------------------------------------------------------ |
| `ANTHROPIC_API_KEY`               |   ✅    | `sk-ant-...`                    | Claude-Sonnet-4.6 Adapter                              |
| `BETTER_AUTH_SECRET`              |   ✅    | wird vom Bootstrap zufällig befüllt | Auth-Cookies signieren                              |
| `DATABASE_URL`                    |   ⛔    | Upstream-Default reicht         | Postgres-Verbindung                                    |
| `PORT`                            |   ⛔    | `3100`                          | Server-Port                                            |
| `SERVE_UI`                        |   ⛔    | `false` (Upstream-Default)      | UI separat oder mit-serven                             |
| `OPENAI_API_KEY`                  |   ⛔    | leer lassen                     | Nur falls Codex/GPT-Agent gebraucht wird               |
| `PAPERCLIP_TELEMETRY_DISABLED`    |   ⛔    | `1` (Bootstrap setzt das)       | DSGVO – Telemetrie aus                                 |
| `DO_NOT_TRACK`                    |   ⛔    | `1` (Bootstrap setzt das)       | Standard-Konvention                                    |
| `PAPERCLIP_DEPLOYMENT_MODE`       |   ⛔    | `development`                   | `authenticated` für Produktiv-Modus                    |
| `PAPERCLIP_DEPLOYMENT_EXPOSURE`   |   ⛔    | `private`                       | `public` öffnet ohne Auth                              |
| `PAPERCLIP_PUBLIC_URL`            |   ⛔    | Codespace-Forward-URL           | Auth-Callbacks                                         |

Die volle Upstream-Liste steht in `doc/DOCKER.md`.

---

## 4. Dev-Server starten

```bash
pnpm dev
```

- API + UI auf `http://localhost:3100`
- Codespaces forwarded den Port automatisch (Popup → **„Open in Browser"**)
- Health-Check: `curl http://localhost:3100/api/health`

---

## 5. Test-Company & erster Agent (UI-geführt)

Sobald die UI im Browser geladen ist:

1. **Onboarding-Wizard** durchlaufen – Operator = Henning
2. **Company anlegen**
   - Name: `Jolmes Automation`
   - Beschreibung: kurzer Satz, z. B. *„Sandbox für interne Automatisierungs-Experimente"*
3. **Rolle erstellen**
   - Name: `Mail-Klassifikator`
   - Modell: `claude-sonnet-4-6`
   - Provider: Anthropic
   - Monats-Budget: **10 € Hard-Stop**
   - System-Prompt: copy-paste aus
     [`jolmes/prompts/mail-klassifikator.md`](./prompts/mail-klassifikator.md)
     (Phase-1-Variante)
4. **Heartbeat starten** – im Codespace-Terminal:
   ```bash
   pnpm paperclipai heartbeat run --role "Mail-Klassifikator"
   ```

Detail-Befehle in `doc/CLI.md` (Upstream).

---

## 6. Smoke-Test

Komplette Runbook in
[`jolmes/docs/SMOKE-TEST.md`](./docs/SMOKE-TEST.md). Kurzform:

> **Goal:** *„Schreibe einen einzeiligen Status-Report über deinen aktuellen Zustand."*

Akzeptanzkriterien:

- 1 Anthropic-API-Call, > 0 € und < 0,01 €
- Audit-Trail in der UI sichtbar
- Budget der Rolle reduziert sich um den Betrag

---

## 7. Commit-Hygiene

Auf diesem Fork landen Konfig-Dateien (`.devcontainer/`, `jolmes/`,
`.claude/CLAUDE.md`) – **niemals `.env`**. Die Upstream-`.gitignore`
schließt `.env` schon aus.

```bash
git status                  # nur erlaubte Files prüfen
git add .devcontainer jolmes .claude/CLAUDE.md
git commit -m "chore(jolmes): setup overlay"
```

Branching-Regel für Claude-Code-Sessions: alles auf
`claude/setup-paperclip-4Xbkd`. PR auf `master` öffnen, sobald grün.

---

## 8. Was ist NICHT Teil dieser Phase

- Azure-Deployment (Container Apps / Postgres Flexible Server)
- Produktive Mail-Klassifikation (M365-Graph-Anbindung)
- SSO via Entra ID
- Backup/Restore-Strategie für `~/.paperclip`

→ Skizze in [`jolmes/docs/PHASE-2-AZURE.md`](./docs/PHASE-2-AZURE.md).

---

## 9. Troubleshooting

| Problem                       | Ursache                       | Fix                                                       |
| ----------------------------- | ----------------------------- | --------------------------------------------------------- |
| `pnpm: command not found`     | Corepack nicht aktiv          | `corepack enable && corepack prepare pnpm@9.15.4 --activate` |
| Port 3100 belegt              | anderes Tool läuft            | `PORT=3200 pnpm dev`                                       |
| 401 von Anthropic             | Key fehlt/falsch              | `.env` prüfen, `echo $ANTHROPIC_API_KEY`                  |
| UI lädt nicht                 | `SERVE_UI=false` und kein UI-Dev | `SERVE_UI=true pnpm dev` oder `pnpm --filter ui dev` separat |
| Postgres-Fehler               | Datenordner kaputt            | `rm -rf ~/.paperclip/instances/default/db && pnpm dev`    |
| Heartbeat zieht keine Issues  | Rolle/Company falsch geschrieben | Genaue Namen prüfen, UTF-8 beachten                       |
