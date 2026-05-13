# M365-Sync Roadmap

Stand: 2026-05-12. Issues sind im Fork (`HJolmes/paperclip`) deaktiviert,
deshalb sammeln wir Folgearbeiten erstmal hier. Sobald Issues aktiviert
sind, wandert jeder Block in einen eigenen GitHub-Issue.

## Erledigt

- **Bidirektionale Status-Schließung Paperclip → To-Do**
  (Branch `claude/sync-paperclip-todo-tasks-slpLK`, Commit `5fe0c04`).
  Fast-Path-Skip entfernt, `paperclipClosureWins`-Pfad in
  `reconcileExisting` ergänzt, Timer auf 5 min reduziert.

- **Phase 2A — Subtask-Propagation via Task-Breaker (Mai 2026)**.
  Branch `claude/paperclip-subtasks-feature-KDi0Y`. Neuer Agent
  `Task-Breaker` ruft `breakdown.ts` auf, das pro Issue lokal `claude
  -p` befragt ("Breakdown sinnvoll?"). Bei Ja: priorisierte Subtasks
  via Paperclip-API. `sync.ts` reconciled Subtasks bidirektional als
  Outlook-`checklistItems`. State um `breakdownEvaluatedAt` und
  `subtaskMapping` erweitert. Doku: `M365-TODO-SYNC.md` Phase 2A.

  Nicht enthalten (out of scope): vollständige Paperclip → To-Do
  Create-Richtung für *Parent*-Tasks (nur Subtasks fließen rückwärts;
  Parents müssen weiterhin aus To-Do kommen).

## Offen — Phase 2B: Paperclip → To-Do Create für Parent-Tasks

### Kontext

Der aktuelle Sync (`jolmes/scripts/m365/sync.ts`) ist bei der
Erstellung neuer Items absichtlich einseitig:

- **To-Do → Paperclip**: neue Outlook-Tasks legen Paperclip-Issues an
- **Paperclip → To-Do**: keine Erstellung
- **Status-Änderungen** (offen ↔ erledigt): beidseitig (seit dem Fix)

Das wurde so festgelegt, damit interne Agenten-Tickets nicht ungewollt
in Henning's Outlook landen (`sync.ts:5-9`, `M365-TODO-SYNC.md:49`).

Neu gewünscht:

1. **Selektiv Paperclip → To-Do Create**: bestimmte Paperclip-Issues
   sollen aktiv als neuer Task im Outlook To-Do erscheinen, ohne dass
   automatisch jedes Agent-Ticket dort auftaucht.
2. **Subtask-Propagation**: wenn ein Paperclip-Issue Subtasks/
   Sub-Issues hat, sollen diese als zugehörige To-Do-Items erscheinen.

### Anforderungen

#### A) Opt-in für Paperclip → To-Do

Mögliche Mechanismen — am Ende einer wählen:

- **Label / Tag**: Issue mit Label `sync:m365` wird in To-Do gespiegelt
- **Projekt-basiert**: Issues in einem dedizierten Projekt (z. B.
  „Henning Personal Ops") werden gespiegelt
- **Body-Marker**: ein Tag wie `#m365-sync` im Issue-Body
- **Eigene Aktion**: expliziter Button in Paperclip-UI „in To-Do pushen"

Empfehlung: **projekt-basiert** (klare Grenze, kein magisches
Verhalten, einfach zu konfigurieren via Ergänzung von
`M365_PROJECT_ID` bzw. einer neuen `M365_PUSH_PROJECT_IDS`-Liste).

#### B) Ziel-Liste in To-Do

- Default: konfigurierte Liste (`M365_TODO_LIST_ID`), Fallback erste
  Standardliste
- Optional: pro Paperclip-Projekt eine eigene Liste mappen
  (`M365_PROJECT_LIST_MAP={projectId: listId, ...}`)

#### C) Subtask-Propagation

Zu klären:

1. **Subtask-Repräsentation in Paperclip**: vermutlich `parentId` an
   Issues (siehe `lib/paperclip.ts`); zu prüfen, ob die UI das aktuell
   schon pflegt.
2. **Graph-Optionen**:
   - `checklistItems` an einer Task (`POST /me/todo/lists/{listId}
     /tasks/{taskId}/checklistItems`): einfache Sub-Items innerhalb
     einer Task, kein eigener Status/Termin — gut für Mini-Checklisten.
   - Mehrere Tasks mit gemeinsamer Liste, Verknüpfung via Body-Link:
     jeder Subtask wird eine eigene Task, aber Parent-Beziehung ist
     nicht nativ in To-Do.
3. Startpunkt-Empfehlung:
   - **1 Paperclip-Issue = 1 To-Do-Task**
   - **Subtasks (`parentId === issueId`) = `checklistItems`** an der
     Parent-Task
   - Status der `checklistItems` wird zurück gesynct (Subtask
     `done` ↔ `checklistItem.isChecked`)

#### D) State-Erweiterung

`SyncMappingEntry` (in `lib/state.ts`) bekommt:

- `direction`: `"todo-to-issue"` (aktuell) oder `"issue-to-todo"` (neu)
- Bei `issue-to-todo`: zusätzliches
  `subtaskMapping?: Record<paperclipSubtaskId, graphChecklistItemId>`
  für deterministische Subtask-Reconciliation
- Migration: bestehende ~133 Einträge bekommen implizit
  `direction: "todo-to-issue"`

#### E) Konflikt-Regeln (Erweiterung)

Aktuell für `todo-to-issue`-Items:

| Feld          | Quelle der Wahrheit |
| ------------- | ------------------- |
| title         | To-Do               |
| status        | To-Do (Close beidseitig) |
| description   | Paperclip           |
| new items     | nur To-Do → Paperclip |

Neu für `issue-to-todo`-Items:

| Feld          | Quelle der Wahrheit |
| ------------- | ------------------- |
| title         | Paperclip           |
| status        | Paperclip (Close beidseitig) |
| description   | Paperclip           |
| new items     | nur Paperclip → To-Do |

### Akzeptanzkriterien

- [ ] Issue in markiertem Paperclip-Projekt anlegen → ≤5 min später in
      To-Do-Liste sichtbar
- [ ] Subtasks zu diesem Issue → erscheinen als `checklistItems` an
      der Parent-Task
- [ ] `checklistItem` in To-Do abhaken → zugehöriger Paperclip-Subtask
      `done`
- [ ] Parent-Issue in Paperclip schließen → To-Do-Task `completed`
- [ ] Bestehende To-Do → Paperclip-Sync (133 Mappings) läuft
      unverändert weiter (regressionsfrei)
- [ ] `M365-TODO-SYNC.md` ist um die neue Konflikt-Tabelle, den
      Opt-in-Mechanismus und die State-Migration ergänzt

### Out of Scope (für diese Phase)

- Bidirektionale Subtask-Erstellung (Subtasks in To-Do → Sub-Issues in
  Paperclip): erst wenn Phase A stabil läuft.
- Andere Outlook-Elemente (Termine, Mails als Tasks): separates Issue.

### Abhängigkeiten

- Paperclip-Server muss `parentId` und Subtask-Listings sauber
  exponieren. Falls nicht: kleines Server-PR vorab.
- Falls Issues im Fork aktiviert werden, diesen Block in einen
  GitHub-Issue überführen und hier durch einen Link ersetzen.
