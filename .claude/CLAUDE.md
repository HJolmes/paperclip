# Kontext für Claude Code in diesem Repo

Dieses Verzeichnis ist die Bootstrap-Schicht für die Paperclip-Installation
der Jolmes Gruppe. Wenn du als Claude Code in einer Codespace-Sitzung auf
diesem Repo arbeitest, gilt:

## Sprache
- Antworten auf **Deutsch**, knapp und direkt.
- Code, Variablen, Commit-Messages: Englisch.

## Repo-Charakter
- Das hier ist **nicht** der Paperclip-Sourcecode, sondern eine Setup-/
  Konfig-Schicht. Quelle ist `paperclipai/paperclip` (Default-Branch:
  `master`).
- Nach erfolgreichem Fork sollten die hiesigen Dateien (`SETUP.md`,
  `.devcontainer/`, `.env.example`, `bootstrap.sh`, `docs/`, `prompts/`)
  in den Fork wandern und dort `master` ergänzen.

## Git-Workflow & PR-Ziel (WICHTIG)
- Dieses Repo ist ein **Fork**: `HJolmes/paperclip`. Upstream ist
  `paperclipai/paperclip` (nur lesend, keine PRs dorthin von hier aus).
- **Alle Pull Requests gehen gegen `HJolmes/paperclip:master`**, niemals
  gegen `paperclipai/paperclip:master`. GitHub schlägt beim Erstellen
  per Default das Upstream-Repo vor — das ist falsch und muss
  überschrieben werden.
- Bei `mcp__github__create_pull_request`: `owner="HJolmes"`,
  `repo="paperclip"`, `base="master"` — explizit setzen.
- Bei `gh pr create` (falls verwendet): `--repo HJolmes/paperclip
  --base master`.
- Feature-Branches haben das Schema `claude/<topic>-<slug>` und werden
  immer auf `HJolmes/paperclip` gepusht.

## Sicherheits-Leitplanken
- **Niemals** echte Werte in `.env.example` schreiben.
- **Niemals** `.env`, Keys oder Secrets committen.
- DSGVO ist nicht verhandelbar: Telemetrie bleibt aus
  (`PAPERCLIP_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1`).
- Kein externer Telemetrie-Beacon, kein Google.

## Stack-Defaults
- Modell: `claude-sonnet-4-6`
- **Node 22 LTS** (NodeSource). Pflicht seit pnpm 11; auf Node 20 crasht
  pnpm mit `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`.
- **pnpm**: Version aus `package.json` (`packageManager`), aktuell `9.15.4`,
  über Corepack on-demand gezogen.
- Ports: API+UI auf 3100
- Daten: `~/.paperclip/instances/default/`
- **DB**: System-Postgres 17 (kein embedded-postgres mehr auf Hetzner).
  Migration via `jolmes/scripts/migrate-to-system-postgres.sh`.
- **Updates auf der Hetzner-VM**: `./jolmes/scripts/update-vm.sh`
  (idempotent, mit DB-Backup + Rollback-Hinweis).

## Aktueller Phasenplan
- **Phase 1** (jetzt): Codespace-Setup, erste Test-Company, Smoke-Test.
- **Phase 2**: Azure Container Apps + Postgres Flex + M365-Graph-Connector
  + Entra-ID-SSO. Skizze in `docs/PHASE-2-AZURE.md`.
- **Phase 3**: produktive Mail-Klassifikation, weitere Rollen.

## Wenn Henning fragt
- „Was ist offen?" → kurze Statusliste, max. 5 Punkte.
- „Wie war das nochmal mit X?" → Verweise auf konkrete Dateien
  (`SETUP.md#…`, `prompts/…`).
- Ambiguität → fragen, nicht raten.
