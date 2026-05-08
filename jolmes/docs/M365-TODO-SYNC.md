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
| `jolmes/scripts/m365/sync.ts`                   | Sync-Lauf, vom Agenten pro Heartbeat aufgerufen  |
| `jolmes/scripts/m365/lib/*.ts`                  | Graph-/Paperclip-/State-Helfer                   |
| `jolmes/prompts/m365-triage.md`                 | System-Prompt des Agenten                        |
| `~/.paperclip/secrets/m365.json` (mode 0600)    | Refresh-Token, **niemals committen**             |
| `~/.paperclip/state/m365-todo-sync.json`        | Mapping todoTaskId → Paperclip-Issue             |

## Konfliktregeln

- **title/status**: To-Do gewinnt (Mensch editiert dort)
- **description**: Paperclip gewinnt (Initial-Anlage einmal, danach nie überschrieben)
- **neue Items**: nur To-Do → Paperclip
- **abschließen**: in beide Richtungen (To-Do `completed` ↔ Issue `done`)

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
   - Mobile and desktop applications → Add platform → "Mobile and desktop": leer (kein Redirect nötig)
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
