---
name: Erste Sync-Validation
slug: first-sync-validation
assignee: m365-triage
project: m365-inbox
---

Initialer Smoke-Test nach Company-Import.

**Vorbedingungen** (vom Importeur sicherzustellen):

- `~/.paperclip/secrets/m365.json` existiert (Bootstrap gelaufen).
- ENV `M365_PROJECT_ID` zeigt auf das Inbox-Projekt.
- In Microsoft To-Do existiert mindestens ein offener Test-Task.

**Was du tust:**

1. Sync einmal manuell anstoßen:
   ```bash
   pnpm dlx tsx jolmes/scripts/m365/sync.ts
   ```
2. Bestätige in einem Kommentar, dass mindestens ein Test-Task als Issue im
   `M365 Inbox`-Projekt erscheint und einen Mail-Kontext-Kommentar bekommen
   hat (oder begründet keinen, weil keine passenden Mails gefunden wurden).
3. Setze diesen Task auf `done`.

**Bei Fehlern:** Wechsle auf `blocked`, halte dich an die Symptom-Tabelle in
deinem Agent-Prompt.
