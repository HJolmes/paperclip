# Jolmes-Overlay für Paperclip

Dieses Verzeichnis enthält den Jolmes-spezifischen Konfigurations-Layer
über dem Upstream-Code von
[paperclipai/paperclip](https://github.com/paperclipai/paperclip).

Alles unter `jolmes/` ist additiv – Upstream-Files werden nicht
verändert. Damit bleibt `git fetch upstream && git merge upstream/master`
konfliktfrei.

## Inhalt

| Pfad                                  | Zweck                                                      |
| ------------------------------------- | ---------------------------------------------------------- |
| `jolmes/SETUP.md`                     | Schritt-für-Schritt-Anleitung Phase 1                      |
| `jolmes/bootstrap.sh`                 | Idempotenter Setup-Lauf (deps, .env, migrate)              |
| `jolmes/prompts/operations-lead.md`   | System-Prompt für den Cockpit-Bot (oberste Ebene)           |
| `jolmes/prompts/objekt-manager.md`    | System-Prompt-Template für Objekt-Manager pro Standort      |
| `jolmes/prompts/_archive/`            | Verworfene Prompts (z. B. Phase-1-Mail-Klassifikator)        |
| `jolmes/docs/SMOKE-TEST.md`           | Runbook für den End-to-End-Test                            |
| `jolmes/docs/PHASE-2-AZURE.md`        | Architektur-Skizze für Phase 2 (Azure + M365)              |

Zwei Dateien liegen außerhalb von `jolmes/`, weil ihre Position vom
Werkzeug erzwungen wird:

| Pfad                                  | Zweck                                                      |
| ------------------------------------- | ---------------------------------------------------------- |
| `.devcontainer/devcontainer.json`     | Codespace-Konfiguration (Node 20, pnpm 9.15.4, Port 3100)  |
| `.claude/CLAUDE.md`                   | Kontext für Claude Code im Codespace (Sprache, DSGVO)      |

## Schnellstart

```bash
./jolmes/bootstrap.sh    # einmalig nach Codespace-Start
# .env editieren → ANTHROPIC_API_KEY setzen
pnpm dev
```

Vollständige Anleitung: [`SETUP.md`](./SETUP.md).

## Roadmap

- ✅ Phase 1 – Codespace-Setup, Test-Company, Smoke-Test
- ⏳ Phase 2 – Azure-Deployment, M365-Mail-Integration, Entra-ID-SSO
- ⏳ Phase 3 – produktive Mail-Klassifikation, weitere Rollen
