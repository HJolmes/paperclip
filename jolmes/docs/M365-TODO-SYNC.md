# M365-To-Do ⇄ Paperclip Sync (Phase 1)

Ziel: Hennings persönliche To-Do-Aufgaben (Microsoft To-Do) mit Mail-Kontext
aus Outlook anreichern und in einem Paperclip-Projekt sichtbar machen, damit
sie strukturiert abgearbeitet werden können.

Stand: **Phase 1, lokal im Codespace**, Always-On in Phase 2.

---

## Architektur in einem Satz

Eine Paperclip-Routine triggert alle 15 Minuten den Agenten **M365-Triage**;
dieser ruft `jolmes/scripts/m365/sync.ts` auf, das per Microsoft-Graph-API
To-Do-Tasks abholt, Mails dazu sucht und Issues im Paperclip-Projekt anlegt
oder aktualisiert.

```
   ┌──────────────┐  cron */15  ┌──────────────────┐  pnpm dlx tsx   ┌──────────────┐
   │ Routine in   │────────────▶│ Issue an M365-   │────────────────▶│ sync.ts      │
   │ Paperclip    │             │ Triage-Agent     │                 │ (Graph + API)│
   └──────────────┘             └──────────────────┘                 └──────────────┘
                                                                              │
                                                          ┌───────────────────┴────────────────┐
                                                          ▼                                    ▼
                                                ┌─────────────────┐                  ┌───────────────────┐
                                                │ MS Graph        │                  │ Paperclip-API     │
                                                │ /me/todo, /me/  │                  │ /api/companies/.. │
                                                │ messages        │                  │ /api/issues/..    │
                                                └─────────────────┘                  └───────────────────┘
```

## Dateien

| Pfad                                            | Rolle                                            |
| ----------------------------------------------- | ------------------------------------------------ |
| `jolmes/scripts/m365/bootstrap.ts`              | Einmaliger Device-Code-Login → Refresh-Token     |
| `jolmes/scripts/m365/sync.ts`                   | Sync-Lauf (Parent + Subtask-Checklist), vom Triage-Agenten aufgerufen |
| `jolmes/scripts/m365/breakdown.ts`              | LLM-getriebener Subtask-Breakdown, vom Task-Breaker-Agenten aufgerufen |
| `jolmes/scripts/m365/lib/*.ts`                  | Graph-/Paperclip-/Checklist-/State-Helfer        |
| `jolmes/prompts/m365-triage.md`                 | System-Prompt des Sync-Agenten                   |
| `jolmes/prompts/task-breaker.md`                | System-Prompt des Breakdown-Agenten              |
| `~/.paperclip/secrets/m365.json` (mode 0600)    | Refresh-Token, **niemals committen**             |
| `~/.paperclip/state/m365-todo-sync.json`        | Mapping todoTaskId → Issue (+ Subtask-Mapping)   |

## Konfliktregeln

### Parent-Task (Issue ↔ Outlook-Task)

- **title/status**: To-Do gewinnt (Mensch editiert dort)
- **description**: Paperclip gewinnt (Initial-Anlage einmal, danach nie überschrieben)
- **neue Items**: nur To-Do → Paperclip
- **abschließen**: in beide Richtungen (To-Do `completed` ↔ Issue `done`)

### Subtasks (Issue mit `parentId` ↔ Outlook-`checklistItem`)

Seit Phase 2A legt der separate **Task-Breaker**-Agent priorisierte
Subtasks an, wenn das LLM eine Aufgabe für aufsplitt-würdig hält
(nicht jede Aufgabe — nur die, bei denen es Sinn ergibt). `sync.ts`
spiegelt diese Subtasks auf die Outlook-Parent-Task als
`checklistItems`:

- **title**: Paperclip gewinnt (Subtask wird zentral angelegt)
- **status**: in beide Richtungen
  - Subtask `done`/`cancelled` → `checklistItem.isChecked = true`
  - `checklistItem.isChecked = true` in Outlook → Subtask wird auf `done` gesetzt
- **neue Subtasks**: nur Paperclip (Task-Breaker) → Outlook
- **Reihenfolge**: nach Priorität sortiert (critical → low)
- **Idempotenz**: `breakdownEvaluatedAt` im State stellt sicher, dass
  jedes Issue maximal einmal vom LLM betrachtet wird. Wer den Marker
  zurücksetzen will (re-evaluate), kann den State editieren —
  Subtask-Mapping bleibt davon unberührt.

Status-Mapping:

| To-Do              | Paperclip       |
| ------------------ | --------------- |
| `notStarted`       | `todo`          |
| `inProgress`       | `in_progress`   |
| `completed`        | `done`          |
| `waitingOnOthers`  | `blocked`       |
| `deferred`         | `blocked`       |

---

## Setup (einmalig)

### 1. Entra-App-Registrierung (macht Henning, ~10 Min)

Im Microsoft-Entra-Admin-Center (https://entra.microsoft.com):

1. **App registrations → New registration**
   - Name: `Paperclip M365-Triage`
   - Supported account types: *Accounts in this organizational directory only*
   - Redirect URI: leer lassen
2. **Authentication**
   - Allow public client flows: **Yes** (aktiviert Device-Code-Flow)
   - Eine Plattform/Redirect-URI ist **nicht** nötig.
3. **API permissions → Add a permission → Microsoft Graph → Delegated**
   - `Tasks.ReadWrite`
   - `Mail.Read`
   - `User.Read`
   - `offline_access`
   - **Grant admin consent** (Henning ist global admin im Tenant)
4. Notiere aus *Overview*:
   - **Application (client) ID** → `M365_CLIENT_ID`
   - **Directory (tenant) ID** → `M365_TENANT_ID`

### 2. Device-Code-Login (einmalig, im Codespace)

```bash
export M365_TENANT_ID=<tenant-id>
export M365_CLIENT_ID=<client-id>
pnpm dlx tsx jolmes/scripts/m365/bootstrap.ts
```

Das Skript zeigt einen Code, der unter `https://microsoft.com/devicelogin`
mit Hennings Konto einzulösen ist. Danach liegt der Refresh-Token unter
`~/.paperclip/secrets/m365.json` (mode 0600). Der Token überlebt Codespace-
Restarts, solange das Datenvolume bleibt.

### 3. Paperclip vorbereiten

In der Test-Company **Jolmes Operations** (UUID `27ccadd6-7ce9-4691-9608-9175ee5c95f4`):

1. **Projekt anlegen**: `M365 Inbox` (oder bestehendes nutzen). UUID merken.
2. **Agent erstellen** über UI oder API:
   - Name: `M365-Triage`
   - Adapter: `claude_local`
   - Modell: `claude-sonnet-4-6`
   - System-Prompt: Inhalt aus `jolmes/prompts/m365-triage.md`
   - Heartbeat: `wakeOnAssignment=true`, kein Polling
   - ENV (im Adapter):

     ```
     M365_PROJECT_ID=<projekt-uuid>
     M365_TODO_LIST_ID=                    # optional, leer = Default-Liste
     M365_MAIL_TOP=3
     ```

3. **Routine anlegen** (über API oder Agent-eigene Routine):

   ```http
   POST /api/companies/{companyId}/routines
   {
     "title": "M365 To-Do Sync",
     "description": "Holt To-Do-Tasks und reichert sie mit Mail-Kontext an.",
     "assigneeAgentId": "<m365-triage-agent-id>",
     "projectId": "<projekt-uuid>",
     "priority": "medium",
     "concurrencyPolicy": "skip_if_active",
     "catchUpPolicy": "skip_missed"
   }
   ```

4. **Schedule-Trigger** an die Routine hängen:

   ```http
   POST /api/routines/{routineId}/triggers
   { "kind": "schedule", "cronExpression": "*/15 * * * *", "timezone": "Europe/Berlin" }
   ```

### 4. Smoke-Test

1. Lege in Microsoft To-Do einen Test-Task an, z.B.:
   *„Vertrag KH-Paderborn verlängern – Frist Q3"*
2. Manueller Run (statt 15 Min warten):
   ```http
   POST /api/routines/{routineId}/run
   { "source": "manual" }
   ```
3. Beobachte den Run im UI: Issue im Projekt `M365 Inbox` taucht auf, Kommentar
   mit Mail-Treffern aus Outlook.
4. Setze in Paperclip den Issue auf `done` → beim nächsten Sync wird der
   To-Do-Task ebenfalls auf `completed` gesetzt.

---

## Betrieb

- **Logs**: stehen im Run-Output des Agent-Heartbeats. Filter: `[m365-sync]`.
- **Token-Rotation**: Microsoft rotiert Refresh-Tokens gelegentlich. Das Skript
  schreibt neue Tokens automatisch in `m365.json` zurück.
- **Token-Ablauf**: Wenn der User Passwort ändert oder MFA-Policy zieht,
  schlägt der Refresh fehl → Bootstrap erneut laufen lassen.
- **Mapping-Reset**: `rm ~/.paperclip/state/m365-todo-sync.json` setzt den
  Sync auf null (legt alle aktuellen Tasks neu in Paperclip an — die alten
  Issues bleiben verwaist; manuell aufräumen).

## Sicherheit

- Refresh-Token in `~/.paperclip/secrets/m365.json` (0600). Nicht committen.
- Mail-Inhalte landen in Paperclip-Kommentaren — DSGVO: Test-Company läuft
  lokal im Codespace, in Phase 2 in EU-Region (Hetzner FRA / Azure West Europe).
- Keine Telemetrie. `PAPERCLIP_TELEMETRY_DISABLED=1` ist gesetzt.

## Phase 2 (Always-On)

Beim Move auf Hetzner/On-Prem mitnehmen:

- `~/.paperclip/secrets/` und `~/.paperclip/state/` per `tar` ins neue Volume
- ENV im Server-Container: `M365_PROJECT_ID`, optional `M365_TODO_LIST_ID`
- Routine-Trigger bleibt unverändert, weil sie an Routine-ID hängt, nicht an Hostname.

## Phase 2A: Task-Breaker (LLM-Subtasks → Outlook-Checklist)

Seit Mai 2026 gibt es einen zweiten Agenten **Task-Breaker**, der für
ausgewählte Aufgaben Subtasks anlegt und priorisiert. Diese erscheinen
automatisch als `checklistItems` an der dazugehörigen Outlook-To-Do-Task.

### Anlage

1. **Routine** in derselben Company:

   ```http
   POST /api/companies/{companyId}/routines
   {
     "title": "Task Breakdown",
     "description": "Zerlegt geeignete To-Do-Tasks in priorisierte Subtasks.",
     "assigneeAgentId": "<task-breaker-agent-id>",
     "projectId": "<m365-inbox-projekt-uuid>",
     "priority": "medium",
     "concurrencyPolicy": "skip_if_active",
     "catchUpPolicy": "skip_missed"
   }
   ```

2. **Agent** mit System-Prompt aus `jolmes/prompts/task-breaker.md`,
   Adapter `claude_local`. ENV minimal — der Agent erbt die
   M365-Variablen nicht (Skript liest nur Paperclip-State):

   ```
   M365_BREAKDOWN_LIMIT=10
   ```

3. **Schedule-Trigger**, deutlich seltener als der Sync — z.B. 1×/Stunde:

   ```http
   POST /api/routines/{routineId}/triggers
   { "kind": "schedule", "cronExpression": "*/60 * * * *", "timezone": "Europe/Berlin" }
   ```

### Funktionsweise

- Geht über alle Mappings in `~/.paperclip/state/m365-todo-sync.json`
  ohne `breakdownEvaluatedAt`.
- Pro Issue: ruft `claude -p` lokal mit einem Strict-JSON-Prompt auf.
  Das LLM entscheidet *erst* `breakdown: true|false` und liefert dann
  ggf. 2-7 priorisierte Subtasks.
- Bei `true`: legt Subtasks via Paperclip-API mit `parentId` und der
  vorgeschlagenen `priority` an, kommentiert den Parent mit der
  Begründung.
- Bei `false`: nichts anlegen, aber `breakdownEvaluatedAt` setzen,
  damit das Issue nicht in jedem Lauf neu evaluiert wird.
- Der nächste `sync.ts`-Lauf sieht die Subtasks und pusht sie als
  `checklistItems` an die Outlook-Task (siehe Konfliktregeln oben).

### Smoke-Test

1. To-Do-Task erstellen, der mehrere Schritte enthält, z.B.
   *„Bürobedarf bestellen — Stifte, Druckerpatronen, Notizblöcke,
   Versandlabel drucken"*
2. Warten bis `sync.ts` das Issue angelegt hat (≤5 min).
3. Manueller Run der Breakdown-Routine über die UI.
4. Im Paperclip-Issue erscheinen Subtasks; nächster Sync-Lauf macht
   daraus `checklistItems` in Outlook.
5. Eine Checkbox in Outlook abhaken → beim nächsten Sync wird der
   Paperclip-Subtask auf `done` gesetzt.
