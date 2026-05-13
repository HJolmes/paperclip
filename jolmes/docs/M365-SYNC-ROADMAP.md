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

## Offen — Phase 2C: Subtask-Dedup + direkter Sync

Stand: 2026-05-13. Aufgesetzt nach Henning's Beobachtung in Outlook
To-Do nach dem ersten produktiven Breakdown-Lauf.

### Block 1 — Doppelte Checklist-Items in To-Do aufräumen

#### Symptom

Nach dem Reset von Paperclip (TRUNCATE + Resync) und einem
Breakdown-Lauf haben Outlook-Tasks, die zuvor schon einmal zerlegt
worden waren, jetzt **doppelte Checklist-Items**: die alten
checklistItems aus dem ersten Lauf sind in M365 erhalten geblieben
(Sync löscht nichts in M365, gewollt), und der zweite
Breakdown-Lauf hat dieselben Subtasks noch einmal hingeschrieben,
weil der Paperclip-State nach dem Reset leer war und nichts wieder­
erkannt hat.

#### Ursache

`reconcileSubtasks` in `sync.ts` matcht Outlook-checklistItems über
`state.items[m365TaskId].subtaskMapping[subIssueId] = checklistItemId`.
Beim Reset ging dieses Mapping verloren, also wurden neue
checklistItems erzeugt; die alten kennt der Sync nicht, lässt sie
also (korrekt) in Ruhe — Resultat: Duplikate.

Generelles Risiko: jedes Mal, wenn `state.items` ein Subtask-Mapping
verliert (Datei-Korruption, manueller State-Reset, Crash vor
`writeState`), produziert der nächste Breakdown-Lauf doppelte
Checklist-Einträge.

#### Plan

1. **Einmaliger Cleanup-Skript** `jolmes/scripts/m365/dedupe-checklists.ts`:
   - Pro M365-Task im State alle checklistItems laden.
   - Gruppieren nach normalisiertem Titel (`title.trim().toLowerCase()`).
   - Bei Gruppen mit >1 Item: jüngere(s) Item(s) löschen, ältestes
     behalten. Mapping in `state.items[…].subtaskMapping` so
     anpassen, dass es auf die behaltene checklistItemId zeigt.
   - Default: Dry-Run; nur bei `--apply` echte DELETEs.
2. **Härtung in `reconcileSubtasks`** (`sync.ts`):
   - Vor dem `createChecklistItem` prüfen, ob es schon ein
     checklistItem mit identischem normalisierten Titel an der Task
     gibt. Wenn ja: adoptieren statt anlegen (`subtaskMapping`-Eintrag
     setzen, kein API-POST). Macht das Verhalten idempotent gegenüber
     State-Verlust.
3. Akzeptanz: Skript zweimal mit `--apply` laufen lassen → zweiter
   Lauf zeigt 0 Löschungen.

#### Out of Scope

- Duplikate auf Parent-Task-Ebene (die hat Phase 1 schon gefixt durch
  atomic `writeState`).
- Andere Listen als die im Sync konfigurierten.

### Block 2 — Direkter / Echtzeit-Sync

Henning's Wunsch: Änderungen sollen "direkt" propagieren statt im
5-Minuten-Timer-Takt. Konkretes Design noch offen — drei Achsen:

#### Open Questions (vor Implementierung mit Henning klären)

1. **Welche Richtung ist die kritische?**
   - Paperclip → To-Do (z. B. Subtask-Erzeugung sofort in Outlook
     sichtbar)
   - To-Do → Paperclip (Henning hakt in Outlook ab, will ohne
     Verzögerung in Paperclip-UI gespiegelt sehen)
   - Beide
2. **Webhook oder Push aus Paperclip?**
   - **a) M365 Graph Change-Notifications** (M365 → uns):
     [`/subscriptions`](https://learn.microsoft.com/en-us/graph/webhooks)
     auf `/me/todo/lists/{listId}/tasks`. Erfordert eine öffentlich
     erreichbare URL (Webhook-Receiver auf der VM oder via Tunnel) und
     Erneuerung alle ~3 Tage. Latenz: Sekunden.
   - **b) Paperclip-Event-Hook** (uns → M365):
     Wenn der Paperclip-Server beim Speichern von Issue-Änderungen
     einen Webhook/Event auslöst, fängt unser Bootstrap-Script den ab
     und schreibt sofort an die Graph-API.
   - **c) Beides** für echte Echtzeit beidseitig.
3. **Replace oder Ergänzung?**
   - Bleibt der 5-min-Timer als Safety-Net (für verpasste Webhooks)
     oder fliegt er raus? Empfehlung: bleibt — Webhook-basierte Syncs
     verlieren ab und zu Events.
4. **Architektur-Ort**: Bootstrap-Script (wie aktuell) oder direkt
   ins Paperclip-Backend integriert? Bootstrap ist einfacher zu
   iterieren; Backend ist langfristig sauberer (siehe Phase 2 Azure).

#### Empfehlung als Ausgangspunkt

- Mit **(2a) Graph Webhooks** anfangen — gibt sofortige
  Outlook→Paperclip-Reaktivität und ist isoliert testbar.
- Webhook-Receiver als eigener tsx-Service auf der VM, Public-URL via
  `nginx` + Let's Encrypt oder via Cloudflare-Tunnel (DSGVO prüfen).
- Bei Graph-Notification: einfach einen `sync.ts`-Lauf triggern (kein
  Vollscan, sondern targeted auf die geänderte Task).
- Timer parallel weiterlaufen lassen als Safety-Net auf 15 min
  hochgesetzt.

#### Akzeptanzkriterien

- [ ] Änderung an einer Outlook-Task ist in Paperclip-UI binnen
      &lt;10 s sichtbar.
- [ ] Webhook-Subscription erneuert sich automatisch, bevor sie
      abläuft (cron + Renewal-Endpoint).
- [ ] Webhook-Receiver verifiziert `validationToken` und
      `clientState` (sonst kann jeder fremde Events einspielen).
- [ ] DSGVO-Check: Webhook-URL/-Daten gehen nicht durch
      Drittanbieter-Telemetrie.

### Abhängigkeiten

- Block 1 ist eigenständig, kann sofort gemacht werden.
- Block 2 benötigt Public-Reachable URL — vermutlich erst zusammen mit
  Phase 2 (Azure Container Apps) sinnvoll, **oder** als Übergangs­
  lösung via Cloudflare-Tunnel zur Hetzner-VM.

