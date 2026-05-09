# Henning Personal Ops

Eine Zwei-Agenten-Company, die Henning Jolmes' persönliche Microsoft-To-Do-
Aufgaben in Paperclip sichtbar hält und mit Mail-Kontext aus Outlook anreichert.

Diese Company ist **strikt getrennt** von „Jolmes Operations" (Business). Hier
geht's nur um Hennings eigenen Arbeitsalltag.

## Wie die Company arbeitet

```
                       Henning
                          │
                          ▼
                 ┌────────────────┐
                 │ Productivity-  │  ← einziger Ansprechpartner
                 │ Lead (CEO)     │     für Henning
                 └────────────────┘
                          │
                          │  delegiert nur bei Blockern
                          ▼
                 ┌────────────────┐     cron */15 Min
                 │ M365-Triage    │ ◀──────────────── Routine
                 └────────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
      ┌──────────────┐        ┌──────────────┐
      │ MS Graph     │        │ Paperclip    │
      │ /me/todo     │        │ M365 Inbox   │
      │ /me/messages │        │ (Project)    │
      └──────────────┘        └──────────────┘
```

- **Henning ↔ Productivity-Lead**: on-demand. Henning fragt, der CEO antwortet
  aus dem aktuellen Stand des Inbox-Projekts.
- **Productivity-Lead ↔ M365-Triage**: nur, wenn etwas hakt. Sonst läuft
  Triage autonom auf seiner Cron-Routine.
- **Triage ↔ Microsoft 365**: lesend für Outlook, lesen+schreibend für To-Do.

## Org Chart

| Slug                 | Name              | Titel                | Berichtet an     | Skills    |
| -------------------- | ----------------- | -------------------- | ---------------- | --------- |
| `productivity-lead`  | Productivity-Lead | CEO / Productivity-Lead | —             | paperclip |
| `m365-triage`        | M365-Triage       | M365 Sync Worker     | productivity-lead | paperclip |

## Agenten kurz

- **Productivity-Lead** — beantwortet Hennings Fragen zum Stand der Dinge.
  Liest das Inbox-Projekt, erstellt Snapshots, delegiert bei Bedarf an Triage.
  Kein autonomes Reorganisieren der Issues.
- **M365-Triage** — autonomer Sync-Worker. Pull aus Microsoft Graph, Push in
  Paperclip-Issues, Konflikt-Regeln (siehe `COMPANY.md`). Läuft alle 15 Min
  per Routine.

## Projekte

- **`m365-inbox`** — Single Source of Truth für Hennings offene Aufgaben.
  Owner: `productivity-lead`. Issues werden von `m365-triage` angelegt und
  gepflegt.

## Starter-Tasks

- `first-sync-validation` (in `m365-inbox`) — initialer Smoke-Test. Läuft
  einmalig nach Import, um die Sync-Pipeline zu verifizieren.

## Voraussetzungen vor Import

1. **Microsoft-365-Bootstrap** muss gelaufen sein:
   ```bash
   pnpm dlx tsx jolmes/scripts/m365/bootstrap.ts
   ```
   Details: [`jolmes/docs/M365-TODO-SYNC.md`](../../jolmes/docs/M365-TODO-SYNC.md)
2. **Refresh-Token** liegt in `~/.paperclip/secrets/m365.json` (mode 0600).
3. Nach dem Import: `M365_PROJECT_ID` ENV-Variable des `m365-triage`-Agenten
   auf die UUID des angelegten `m365-inbox`-Projekts setzen.

## Getting Started

Nach den Voraussetzungen — einer der beiden Wege:

**Variante A: Web-UI (empfohlen, kein Build nötig)**

1. Im Browser unter `http://localhost:3100` einloggen
2. Companies → „Import" → Pfad oder Dateien aus `companies/henning-personal-ops/` auswählen
3. Vorschau prüfen → bestätigen

**Variante B: CLI**

```bash
pnpm --filter paperclipai build
node cli/dist/index.js company import companies/henning-personal-ops
```

Anschließend (beide Wege gleich):

1. UUID des Projekts `M365 Inbox` kopieren.
2. Auf dem `m365-triage`-Agenten ENV `M365_PROJECT_ID` setzen.
3. Routine `M365 To-Do Sync` mit Cron-Trigger `*/15 * * * *` (Europe/Berlin)
   anlegen, assignee = `m365-triage`, project = `m365-inbox`.
4. Manuellen Run feuern → der `first-sync-validation`-Task validiert die
   Pipeline.

## Referenzen

- Spec: [Agent Companies Specification](https://agentcompanies.io/specification)
- Plattform: [Paperclip](https://github.com/paperclipai/paperclip)
- Sync-Skripte und Runbook: [`jolmes/scripts/m365/`](../../jolmes/scripts/m365/),
  [`jolmes/docs/M365-TODO-SYNC.md`](../../jolmes/docs/M365-TODO-SYNC.md)

## Lizenz

MIT — siehe `LICENSE`.
