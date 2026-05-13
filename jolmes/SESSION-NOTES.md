# Session-Notes – Jolmes Paperclip Setup

> Lies das in einer neuen Claude-Session mit:
> *„Lies `jolmes/SESSION-NOTES.md` und setze fort."*

Letzter Stand: **2026-05-11** · Branch `master` · **Paperclip läuft auf Hetzner-VM**
(`http://23.88.46.202`), Codespace-Setup parallel weiterhin lauffähig.

> Neue Hosting-Realität siehe **Abschnitt 11** unten. Alles aus
> Abschnitten 1–10 bleibt inhaltlich gültig, bezieht sich aber auf die
> Codespace-Instanz.

---

## 1. Wer und was

- **Maintainer:** Henning Jolmes, CEO Jolmes Gruppe (Gebäudedienstleistung,
  Paderborn)
- **Stack:** Microsoft 365, kein Google
- **Repo:** `HJolmes/paperclip` (Fork von `paperclipai/paperclip`)
- **Auth-Modus:** **Subscription** über `claude_local`-Adapter mit Pro/**Max**-
  Abo (Opus 4.7 Zugriff bestätigt). KEIN `ANTHROPIC_API_KEY`.
- **Hosting Phase 1:** GitHub Codespace (auto-suspend nach 30 Min Idle)

## 2. Use-Case-Entscheidung

**Strategischer Hauptanwendungsfall:** **Objekt-Manager-Bot pro Großkunden-Standort.**

- Eine persistente `claude_local`-Rolle pro Großobjekt (Krankenhäuser,
  Bürokomplexe, Schulen, Industrie)
- Hierarchie geplant:
  1. **Objekt-Manager** (unten, einer pro Standort)
  2. **Regional-Coach** (mittel, aggregiert über Region)
  3. **Operations-Lead** (oben, Cockpit für Henning)
- ROI-Hypothese: ~14k €/Monat Standortleiter-Kapazität freischaufeln,
  plus Frühwarnsystem gegen Großkunden-Verlust

**Verworfene Alternativen** (mit kurzer Begründung):
- Mail-Klassifikator → läuft schon via persönliches Claude.ai-Setup
- Prozessanalyse → Paperclip ist Overkill für einmaliges Projekt
- Angebots-Drafter → gut, aber Objekt-Manager hat höheren Hebel
- „Jolmes Vertrieb"-Company → umbenannt auf `Jolmes Operations`

## 3. M365-MCP-Discovery (wichtig!)

Beim ersten Adapter-Test im Codespace stellte sich heraus, dass der
persönliche Claude-Account von Henning bereits **Microsoft-365-MCP**
verbunden hat. Damit stehen folgende Tools dem `claude_local`-Adapter
**ohne** weitere Konfiguration zur Verfügung:

- `outlook_email_search`
- `outlook_calendar_search`
- `chat_message_search` (Teams)
- `sharepoint_search`, `sharepoint_folder_search`
- `read_resource`

**Konsequenz:** Phase 2 (Microsoft-Graph-Anbindung) ist auf der Claude-
Seite quasi vorgezogen. Der Operations-Lead-Bot kann Vertrags-PDFs aus
SharePoint und Beschwerde-Mails aus Outlook **direkt selbst lesen**,
ohne dass wir eigene Webhook-Pipelines bauen müssen. Das spart Wochen.

## 4. Aktueller Stand

- ✅ Codespace läuft, Branding korrekt (`Jolmes Operations`)
- ✅ Subscription-Auth getestet (`apiKeySource: none`, Opus 4.7 verfügbar)
- ✅ Hostname-Whitelist gesetzt: `ubiquitous-eureka-779vr5rgpqpp3px5j-3100.app.github.dev`
- ✅ Erstes Issue **JOLA-1** „Steckbrief-Vorlage entwerfen" → Status `done`
  - Output: `jolmes/objekt-steckbrief-template.md`
  - Ergebnis qualitativ gut: Ampel-Logik, Tabellen statt Freitext, Branchen-
    Kontext (TVöD, DGUV, RKI/HACCP), Datenquellen-Tabelle mit Owner

**Pilot-Empfehlung des Bots (zum späteren Aufgreifen):**
> Mittelgroßes Krankenhaus oder Bürocampus aus dem Paderborner Stamm,
> Vertragsverlängerung 12-18 Monate weg (Ampel gelb), > 2 Jahre
> Standortkenntnis der Objektleiterin, digital vorhandene Vertrags-/
> Beschwerdedaten. Kriterien-Reihenfolge: Datenqualität > Vertragsrisiko >
> strategische Bedeutung.

## 5. Offene Themen / nächste Schritte

### 5a. Pilot-Objekt benennen
- Henning soll konkret 1 Großobjekt benennen (anonymisiert ok)
- Steckbrief-Template damit befüllen lassen (zweites Issue)
- Echte Beschwerde-Beispiele + 1 Quartalsmeeting-Inhalt einspielen

### 5b. Hosting-Frage
Henning will Always-On. Drei Optionen wurden besprochen:

| Option | Kosten | Aufwand | DSGVO |
| --- | --- | --- | --- |
| Codespace 24/7 | ~80–130 €/Mo | minimal | mittel |
| **Hetzner CX22 + Docker** | **~5–9 €/Mo** | 30–60 Min | volle Kontrolle, DC Falkenstein/Nürnberg |
| **On-Prem-Server / VM** | Hardware einmalig ~300 € | 2-3 h | maximale Kontrolle, alles im Hause |
| Azure Container Apps | ~50–100 €/Mo | halber Tag | Phase-2 der Roadmap |

**Henning tendiert in Richtung Hetzner oder On-Prem.** Beides offen,
zurückgestellt für die nächste Session.

Action für nächste Session:
- `jolmes/docs/HETZNER-DEPLOYMENT.md` schreiben (Variante B)
- ODER `jolmes/docs/ONPREM-DEPLOYMENT.md` schreiben (Mini-PC oder VM)
- Migration vom Codespace zum echten Server: Daten-Volume aus
  `~/.paperclip/instances/default/` per `tar`-Backup mitnehmen

### 5c. Sub-Rollen für Operations-Linie
Wenn Pilot-Objekt sitzt:
- `Objekt-Manager <Pilot-Kunde>` als zweiter Agent (claude_local, Sonnet 4.6)
- Skills-Folder mit Vertragsdaten, Org-Chart, Beschwerden-Historie
- Heartbeat-Setup: täglich morgens, wakeOnAssignment=true

### 5d. M365-MCP nutzen
Nächste Iteration: System-Prompt des Operations-Leads explizit auf
`outlook_email_search` und `sharepoint_search` zeigen, mit Beispiel-
Suchanfragen. Damit kann der Bot Beschwerden selbst aus dem Postfach
holen statt manuelles Copy-Paste.

### 5e. Datei-Persistenz – Erkenntnis dokumentiert

**Wichtige Beobachtung am 2026-05-08:** Paperclip-Agenten arbeiten in
**isolierten Sandbox-Working-Directories** unter

```
~/.paperclip/instances/default/projects/<project-UUID>/<run-UUID>/_default/
```

Wenn der Bot eine Datei mit dem `Write`-Tool anlegt, landet sie **dort**,
**nicht** in `/workspaces/paperclip/`. Konsequenzen:

- Outputs wandern nicht automatisch ins Repo
- Bei Codespace-Delete sind sie weg (Codespace-Filesystem ≠ Repo)
- Auch beim nächsten Heartbeat-Run: **frische Sandbox**, alte Files
  nicht automatisch sichtbar

**Bewährte Muster:**

1. **Per Hand kopieren** nach jedem produktiven Run:
   ```bash
   find ~/.paperclip/instances -name "<datei>.md" 2>/dev/null
   cp <gefundener-pfad> /workspaces/paperclip/jolmes/
   ```
2. **Agent anweisen, am Ende `git add && git commit && git push`** zu
   machen – setzt voraus, dass der Agent-Sandbox-cwd der echte Repo-
   Checkout ist (Adapter-Setting `cwd: /workspaces/paperclip`)
3. **Skills-Folder als persistenten Pfad konfigurieren** im Adapter-
   Setting, damit zumindest Lese-Daten erhalten bleiben

**Phase-1-Status:** `objekt-steckbrief-template.md` wurde manuell aus
der Sandbox geholt und auf master gepusht (Commit `948db64`).

## 6. Repo-Struktur (Stand)

```
HJolmes/paperclip/
├── .devcontainer/devcontainer.json    # Codespace: pnpm 9.15.4 + claude CLI
├── .claude/CLAUDE.md                  # Kontext für Claude Code
├── jolmes/
│   ├── README.md                      # Overlay-Übersicht
│   ├── SETUP.md                       # Phase-1-Anleitung (Subscription-Modus)
│   ├── SESSION-NOTES.md               # diese Datei
│   ├── bootstrap.sh                   # idempotenter Setup-Runner
│   ├── prompts/mail-klassifikator.md  # initialer Test-Prompt (deprecated für aktuellen Use Case)
│   ├── docs/SMOKE-TEST.md             # Runbook
│   ├── docs/PHASE-2-AZURE.md          # Azure-Deployment-Skizze
│   └── objekt-steckbrief-template.md  # ← Output von JOLA-1 (im Codespace, noch nicht committed)
└── … upstream paperclipai/paperclip Code unverändert …
```

## 7. Konventionen

- **Branch für Claude-Code-Sessions:** `claude/setup-paperclip-4Xbkd`
- **PRs auf master:** squash-merge
- Sprache: Deutsch in Erklärungen, Englisch in Code/Commits
- Telemetrie: aus (`PAPERCLIP_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1`)
- DSGVO-Modus: alle Datenquellen primär in DE/EU

## 8. Aufwärm-Prompt für die nächste Session

Copy-paste in eine neue Claude-Code-Session:

> Lies `jolmes/SESSION-NOTES.md`. Wir machen weiter beim Punkt …
> (entweder „Pilot-Objekt benennen", „Hetzner-Deployment", „On-Prem-Setup"
> oder „Sub-Rolle Objekt-Manager"). Sprache Deutsch, knapp.

---

## 9. Use Case „To-Dos mit Mail-Kontext" (Branch `…-email-todos-WJN1k`)

Parallel zum Objekt-Manager-Strang läuft ein zweiter, persönlicher Use Case:
Henning will seine Microsoft-To-Do-Aufgaben automatisch mit Kontext aus
seinem Outlook-Postfach anreichern, damit er sie strukturiert abarbeiten
kann.

### 9.1 Entscheidung (akzeptiert 2026-05-08)

- **Neuer Agent**: `M365-Triage` (claude_local, Sonnet 4.6)
- **Konfliktregeln**: Standard übernommen
  - title/status: To-Do gewinnt
  - description: Paperclip gewinnt
  - neue Items: nur To-Do → Paperclip
  - close-in-one closes the other
- **Trigger**: Cron `*/15 * * * *` Europe/Berlin
- **Hosting Phase 1**: Codespace, Phase 2 zusammen mit dem Rest auf
  Hetzner/On-Prem.

### 9.2 Was schon gebaut ist

| Datei                                            | Zweck                                  |
| ------------------------------------------------ | -------------------------------------- |
| `jolmes/scripts/m365/bootstrap.ts`               | Device-Code-Login, Refresh-Token-Bake  |
| `jolmes/scripts/m365/sync.ts`                    | Sync-Lauf (Graph ↔ Paperclip)          |
| `jolmes/scripts/m365/lib/{paths,secrets,graph,state,mapping,paperclip}.ts` | Helfer |
| `jolmes/prompts/m365-triage.md`                  | System-Prompt                          |
| `jolmes/docs/M365-TODO-SYNC.md`                  | Runbook (Entra-Setup → Smoke-Test)     |
| `.env.example`                                   | Erweitert um `M365_*`-Hinweis          |

### 9.3 Was Henning noch tun muss (~10 Min)

1. Entra-App registrieren (siehe Runbook §1).
2. `M365_TENANT_ID` + `M365_CLIENT_ID` mitteilen oder selbst exportieren.
3. `pnpm dlx tsx jolmes/scripts/m365/bootstrap.ts` einmalig laufen lassen.
4. Im Paperclip-UI Projekt `M365 Inbox` anlegen, Agent erstellen, Routine
   verdrahten (alle Schritte als curl/HTTP im Runbook).

### 9.4 Risiken / offene Punkte

- **Datei-Persistenz**: `~/.paperclip/secrets/m365.json` lebt im
  Codespace-Volume. Beim Codespace-Delete weg → Bootstrap neu.
- **Graph `$search`**: braucht in manchen Tenants explizites
  `ConsistencyLevel: eventual` — gesetzt. Falls leere Treffer, Tenant-Policy
  prüfen.
- **Kein DB-Backed-State**: Mapping liegt als JSON. Bei Konflikten
  Multi-Agent in Phase 2 ggf. auf SQLite migrieren.
- **Description-Konflikt**: Agent reichert Description **nicht** an, sondern
  nur Kommentare. Falls Description-Anreicherung gewünscht → Skript-
  Erweiterung, Konfliktregeln neu klären.

---

## 10. Live-Stand „M365 To-Do Sync" (2026-05-09)

Der Sync läuft. Diese Sektion ersetzt § 9 als aktueller Stand.

### 10.1 Was steht

**Eigene Company `Henning Personal Ops` (Prefix `HEN`).**
- Company-ID: `75fb6ae7-67e0-4d25-a8d4-5a364b72074a`
- Project `M365 Inbox` ID: `e442bc37-d976-4448-ab2c-f3130f3485b1`
- Agents:
  - `M365-Triage` (`909cbf0a-ceeb-4eff-9768-7870967601b1`) — autonomer Sync-Worker
  - `Productivity-Lead` (`1d2b1d08-7aa7-47b6-9b2d-e906b794b29b`) — Hennings einziger Ansprechpartner

**Routine `M365 To-Do Sync`** (`87b07877-cb27-4bf7-bbce-0e723d2e12b6`)
mit Schedule-Trigger `*/15 * * * *` Europe/Berlin, Cron-getriggert seit 00:35
UTC am 2026-05-09.

**Microsoft 365**:
- Entra-App registriert, Tenant `908b64a0-e899-4080-bbec-2fe62f9943ec`,
  Client `8a558036-fb75-4273-a0b9-d233f63ed5ca`.
- Refresh-Token in `~/.paperclip/secrets/m365.json` (mode 0600).
- Sync-Konfig in `~/.paperclip/state/m365-todo-sync.config.json`
  (`projectId` zeigt auf M365 Inbox).
- Mapping-State in `~/.paperclip/state/m365-todo-sync.json`
  (132 Einträge nach erstem Voll-Sync).

**Paperclip M365 Inbox**:
- 132 Issues von 134 offenen To-Do-Tasks gemappt
  (alle 12 Listen inkl. „Flagged Emails" werden aggregiert).
- 34 davon sind Karteileichen mit Status `cancelled` aus den frühen
  Reset-Versuchen — in der UI ausgeblendet, Skript respektiert sie.
- Aktive Issues haben:
  - „**Quelle:** Microsoft To-Do — Liste «…»" in der Description
  - Mail-Kontext-Kommentar mit Top-3-Treffern aus Outlook-Volltextsuche

### 10.2 Konfliktregeln (verbindlich)

- **title/status**: To-Do gewinnt
- **description**: Paperclip gewinnt (Initial-Anlage einmalig, danach nie überschrieben)
- **neue Items**: nur To-Do → Paperclip
- **close in einem Ort** schließt im anderen
- **lastModifiedDateTime <= lastSyncedAt** + Status unverändert → Task wird übersprungen
  (Performance-Fast-Path; Skript läuft im Heartbeat in Sekunden statt Minuten)

### 10.3 Skripte unter `jolmes/scripts/m365/`

| Datei                       | Zweck                                               |
| --------------------------- | --------------------------------------------------- |
| `bootstrap.ts`              | Einmalig: Device-Code-Login → Refresh-Token         |
| `connection-test.ts`        | Listen + Top-5-Tasks anzeigen (Diagnose)           |
| `probe.ts`                  | 8 Graph-URL-Varianten testen (URL-Encoding-Bugs)    |
| `sync.ts`                   | Hauptlauf — wird vom Agent im Heartbeat aufgerufen |
| `configure.ts`              | Schreibt sync.config.json                           |
| `show-ids.ts`               | Listet Company/Project/Agent-UUIDs                  |
| `update-agent-prompt.ts`    | Pusht AGENTS.md-Body in Live-Agent                  |
| `reset.ts`                  | Cancellt sync-erstellte Issues + leert State        |
| `lib/{graph,paperclip,conversation,state,config,secrets,mapping,paths}.ts` | Helfer |

### 10.4 Was funktioniert, was nicht

**Funktioniert** (verifiziert):
- ✅ Status-Sync To-Do → Paperclip (HEN-2 wurde abgehakt → automatisch `done`)
- ✅ Status-Sync Paperclip → To-Do (HEN-3 auf `done` → in To-Do durchgestrichen)
- ✅ Mail-Kontext via Outlook-Volltextsuche (Top-3-Treffer mit Subject/Absender/Datum/Snippet/Link)
- ✅ Listen-übergreifender Sync (alle 12 Listen, 132 Tasks)
- ✅ Performance-Fast-Path (`unchanged=132` in unter 30 Sek lokal)
- ✅ Routine-Heartbeat mit `claude_local`-Adapter (Agent kommentiert auf Deutsch)

**Funktioniert NICHT** (zurückgestellt):
- ❌ Mail-Thread-Anreicherung (`## Mail-Thread`-Block via `conversationId`).
  Code ist drin (`lib/conversation.ts`), greift aber nicht — Microsoft
  liefert für die `linkedResource.externalId` keine direkt nutzbare
  Mail-ID, und der Search-Hit-Fallback hat einen Bug. Aktuell rendern
  alle neuen Issues die alte „Top-Treffer"-Form. Henning hat entschieden:
  reicht so, später bei Bedarf fixen.

### 10.5 Bekannte Eigenarten

- **Hard-DELETE auf Paperclip-Issues** wirft 500 für Issues mit
  Comments/Documents (kein CASCADE). Workaround in `reset.ts`: PATCH
  status=cancelled. Dadurch entstehen Karteileichen.
- **Microsoft-Graph-URL-Encoding**: Outlook-IDs müssen mit rohem `=`
  (ohne `%3D`) im Pfad bleiben. `lib/graph.ts:pathId` macht das.
  `$select=...` mit Komma trippt den Path-Parser → wir verzichten auf `$select`.
  `$filter=conversationId eq '...'` muss URL-encoded sein.
- **Subscription-Mode**: Der `claude_local`-Adapter läuft über Hennings
  Pro/Max-Abo. Kein `ANTHROPIC_API_KEY` nötig.
- **`local_trusted` Deployment-Mode**: Im Codespace authentifiziert sich
  jeder API-Call automatisch als „Local Board" — kein Bearer-Token nötig.
  In Phase 2 (Hetzner) brauchen wir explizite API-Keys.

### 10.6 Wenn was schiefgeht (Symptom → Aktion)

| Symptom                                       | Aktion                                                          |
| --------------------------------------------- | --------------------------------------------------------------- |
| `M365 secret missing`                         | `pnpm dlx tsx jolmes/scripts/m365/bootstrap.ts` neu             |
| `Token refresh failed (400 invalid_grant)`    | Bootstrap neu (Passwort/MFA hat Token invalidiert)              |
| Sync hängt > 5 Min im Heartbeat               | Run-Issue auf cancelled → check `lastModifiedDateTime`-Filter    |
| State korrupt                                 | `rm ~/.paperclip/state/m365-todo-sync.json`, voller Re-Sync     |
| Komische orphan-Mappings                      | `pnpm dlx tsx jolmes/scripts/m365/sync.ts` (räumt auto auf)     |
| Issue-Identifier finden                       | `curl -sS http://localhost:3100/api/issues/<uuid>`              |

### 10.7 Nächste mögliche Themen

- **Heartbeat-Comment-Timeout umgangen** (2026-05-09): Statt den Agent
  per Bash-`curl` einen Status-Comment + Status-Patch auf das Run-Issue
  posten zu lassen, erledigt das jetzt `sync.ts` selbst (`finalizeRunIssue()`).
  Das Skript nutzt `PAPERCLIP_ISSUE_ID`/`PAPERCLIP_ISSUE_TITLE` aus dem
  Heartbeat-Env, postet einen einzeiligen Counts-Comment und patcht das
  Run-Issue auf `done`. Plus: alle Paperclip-API-Calls haben jetzt einen
  Timeout (`PAPERCLIP_API_TIMEOUT_MS`, default 15s) — kein lautloses Hängen
  mehr. Agent-Prompt entsprechend abgespeckt (kein Doppel-Comment).
  Die eigentliche Server-Ursache (warum POST `/comments` aus dem
  Heartbeat-Bash hängt, andere Endpoints aber nicht) ist nicht geklärt —
  wer Lust hat: in `server/src/routes/issues.ts:4102` rein, Verdacht auf
  `issueReferencesSvc.syncComment` oder `expireRequestConfirmationsSupersededByComment`.
- **Cleanup-Routine** für die 34 cancelled Karteileichen (löschen über
  DB direkt, weil API es ablehnt).
- **Mail-Thread-Anreicherung** doch noch fixen (`lib/conversation.ts`).
- **Weitere Agents** in `Henning Personal Ops`: Wochenrückblick,
  Tagesplaner, Mail-Triage-Heuristik.
- **Phase-2-Migration** auf Hetzner / On-Prem (siehe § 5b).

### 10.8 Aufwärm-Prompt für die nächste Session

```
Lies jolmes/SESSION-NOTES.md, ab Abschnitt 10 (Live-Stand M365 To-Do Sync).
Routine läuft alle 15 Min, Henning Personal Ops ist auf master.
Nächstes Thema: <wähle eins aus § 10.7>.
Sprache Deutsch, knapp.
```

---

## 11. Hetzner-Deployment live (2026-05-11)

Paperclip läuft jetzt auf einer eigenen Hetzner-VM. Codespace bleibt als
Dev-Werkbank, Hetzner ist die persistente Instanz.

### 11.1 Was steht

- **VM:** Hetzner CX23 (2 vCPU / 4 GB / 40 GB Intel) in Falkenstein,
  Ubuntu 24.04 LTS, IP **`23.88.46.202`**.
- **Provisioning:** vollautomatisch via `jolmes/scripts/hetzner-up.sh`
  (hcloud-CLI auto-installiert) + `jolmes/hetzner/cloud-init.yaml`.
- **Service:** systemd-Unit `paperclip.service` mit
  `pnpm dev --bind lan`, User `paperclip`, `WorkingDirectory=~/paperclip`.
- **Datenbank:** **embedded-postgres** auf Port 54329
  (`~/.paperclip/instances/default/db`). **Kein** Docker-Postgres mehr,
  kein externer 5432-Port.
- **Reverse-Proxy:** Caddy auf Port 80 → `127.0.0.1:3100`. UFW erlaubt
  nur 22 + 80, 3100 ist dicht. Grund: Jolmes-Firmen-Firewall blockt
  Port 3100 outbound.
- **Auth-Modus:** Subscription über Pro/Max-Abo, `claude login` auf der
  VM einmalig durchlaufen, Token in `/home/paperclip/.claude/`.
  `deploymentMode=authenticated`, `deploymentExposure=public`,
  `PAPERCLIP_ALLOWED_HOSTNAMES=23.88.46.202`,
  `PAPERCLIP_PUBLIC_URL=http://23.88.46.202`.
- **Owner:** Board-Claim wurde per einmaliger Claim-URL durchgezogen,
  `henning@jolmes.de`-Account ist Instance-Admin.
- **Companies in der VM-Instanz:**
  - `Henning Personal Ops` (Prefix `HEN`, active) — via
    `paperclipai company import companies/henning-personal-ops` aus dem
    Repo importiert. **Frische DB**, keine Mappings, keine M365-State.
  - `_temp` (Prefix `TEM`) — Onboarding-Dummy, nicht löschbar (siehe
    11.4 cascade-bug).
  - `tet` — archived, vom ersten Onboarding-Versuch.

### 11.2 Konfigurations-Lehren (alle nötig, alle im cloud-init)

1. **Hetzner-Server-Typen** wurden Mitte 2025 umbenannt: `cx22/32/…` →
   `cx23/33/…`. Default im `hetzner-up.sh` ist jetzt `cx23`.
2. **`local_trusted`-Mode erlaubt nicht `HOST=0.0.0.0`** (fail-fast aus
   `packages/shared/src/network-bind.ts:46`). Für externen Zugriff muss
   `PAPERCLIP_DEPLOYMENT_MODE=authenticated` sein.
3. **`scripts/dev-runner.ts:176-179`** löscht ohne `--bind`-Flag stumm
   die deployment-Env-Vars und fällt auf `local_trusted` zurück. Daher
   muss systemd `pnpm dev --bind lan` rufen, nicht nur `pnpm dev`.
4. **`PAPERCLIP_ALLOWED_HOSTNAMES`** muss die VM-IP enthalten, sonst
   blockt die `private-hostname-guard`-Middleware fremde `Host`-Header.
5. **embedded-postgres SHM-Cleanup:** Nach hartem Service-Stop hängen
   manchmal `/dev/shm/PostgreSQL.*`-Segments, der nächste Start
   schlägt mit „could not open shared memory segment" fehl. Fix:
   `sudo rm -f /dev/shm/PostgreSQL.*` vor Service-Start.
6. **Firmen-Firewall** der Jolmes blockt Port 3100 outbound — daher
   Caddy davor auf Port 80. UFW schließt 3100 dann komplett.
7. **`xdg-open` fehlt** auf headless Ubuntu, `paperclipai auth login`
   crasht beim browser-spawn. Cloud-init legt `ln -s /bin/true
   /usr/local/bin/xdg-open` an.
8. **Vite-Dev-HMR-WebSocket** wird mit `bindHost=0.0.0.0` als
   `ws://0.0.0.0:13100/` an den Browser geliefert, scheitert immer.
   Browser zeigt dann schwarzen Bildschirm. Workaround: **Chrome
   Inkognito**. Saubere Lösung: UI-Production-Build (Phase 2).
9. **Edge blockt nackte IPs** via SmartScreen — Chrome statt Edge.
10. **Corepack** zieht `pnpm@11` außerhalb des Repo-Verzeichnisses (das
    braucht Node 22). Daher CLI-Befehle immer aus `~/paperclip` rufen,
    dort gilt der `packageManager`-Pin auf `pnpm@9.15.4`.

### 11.3 Repo-Stand für Hetzner

| Datei                                  | Zweck                                              |
| -------------------------------------- | -------------------------------------------------- |
| `jolmes/scripts/hetzner-up.sh`         | One-Shot-Provisioning via hcloud-CLI (idempotent)  |
| `jolmes/hetzner/cloud-init.yaml`       | First-Boot: Node 20, pnpm, Claude-CLI, Caddy, .env, systemd, UFW, xdg-open-Stub |
| `jolmes/docs/HETZNER-SETUP.md`         | Anleitung (Token-Klicks → ein Befehl → claude login) |
| `jolmes/SETUP.md` §9                   | Phase-2-Hosting verweist auf Hetzner               |

`jolmes/docs/PHASE-2-AZURE.md` bleibt als historisches Dokument liegen,
ist nicht mehr aktiv.

### 11.4 Bekannte Bugs (Upstream, ungefixt)

- **Company-DELETE 500** mit FK-Constraint
  `cost_events_heartbeat_run_id_heartbeat_runs_id_fk`. Cascade fehlt.
  Workaround: Company in der UI archivieren statt löschen.
- **Vite-HMR-Bind** für nicht-loopback-Bind unbrauchbar (siehe 11.2 §8).
  Workaround Inkognito, Fix mit Production-Build.

### 11.5 Was offen ist – konkret

**Direkt (vor produktiver Nutzung der VM):**

1. **M365-State von Codespace zur VM portieren.** Die alte
   Codespace-Instanz hatte 132 Mappings + Refresh-Token. Auf der VM ist
   noch nichts. Optionen:
   - (a) `rsync ~/.paperclip/secrets/m365.json` + `state/m365-todo-sync.*`
     vom Codespace zur VM. **Aber:** Company-/Project-/Agent-IDs sind
     in der neuen Instanz andere → Mapping-State muss durch
     `jolmes/scripts/m365/configure.ts` aktualisiert oder per `reset.ts`
     + voller Re-Sync gemacht werden.
   - (b) Komplett neu auf der VM: `pnpm dlx tsx jolmes/scripts/m365/bootstrap.ts`,
     dann sync. Doppelt zu den Codespace-Issues.
   - (c) Codespace stilllegen, dann VM neu syncen.
   Henning entscheidet, welche Variante.
2. **M365-Triage env inputs** in der UI setzen (`M365_PROJECT_ID`
   required, andere optional). Project-ID aus
   <http://23.88.46.202/HEN/projects>.
3. **Routine `M365 To-Do Sync`** in der UI neu anlegen (Cron
   `*/15 * * * *` Europe/Berlin), die alte ist nur in der Codespace-DB.

**Phase 2 (Hardening, ~1 Stunde Block):**

1. **UI Production-Build**: `pnpm --filter @paperclipai/ui build`,
   systemd-Unit auf statisches Asset-Serving, `PAPERCLIP_UI_DEV_MIDDLEWARE`
   ungesetzt. Killt die Inkognito-Pflicht und HMR-Probleme dauerhaft.
2. **Domain + TLS:** `paperclip.jolmes.de` als A-Record auf
   `23.88.46.202`, Caddyfile auf `paperclip.jolmes.de { reverse_proxy
   127.0.0.1:3100 }` umstellen, Caddy holt automatisch Let's-Encrypt-
   Cert. Dann ALLOWED_HOSTNAMES + PUBLIC_URL anpassen.
3. **M365-SSO:** `socialProviders.microsoft` in
   `server/src/auth/better-auth.ts` ergänzen (better-auth unterstützt
   Microsoft out-of-the-box). Braucht Entra-App-Registration mit
   Redirect-URI `https://paperclip.jolmes.de/api/auth/callback/microsoft`.
   Erst nach Schritt 2.
4. **DB-Backups:** Cron `pnpm db:backup` + `rclone push` zur Hetzner
   Storage Box. Pfad: `/home/paperclip/.paperclip/instances/default/data/backups`.
5. **Codespace-Daten retten:** vor Stilllegung die Sandbox-Outputs aus
   `~/.paperclip/instances/.../projects/.../` ins Repo / nach Hetzner kopieren.
6. **Upstream-PR** für den `cost_events`-Cascade-Bug bei
   `paperclipai/paperclip` aufmachen (siehe 11.4).

### 11.6 Aufwärm-Prompt für die nächste Session

```
Lies jolmes/SESSION-NOTES.md ab Abschnitt 11.
Paperclip läuft auf der Hetzner-VM http://23.88.46.202 (Owner-Login
henning@jolmes.de), Company "Henning Personal Ops" (Prefix HEN) ist
importiert aber leer. Codespace-Setup ist parallel noch lauffähig.

Nächstes Thema: <wähle eins aus § 11.5>.
Browser-Tipp: bei "schwarzer Seite" Chrome-Inkognito nutzen
(Vite-Dev-Cache, wird mit UI-Production-Build behoben).

Sprache Deutsch, knapp.
```

---

## 12. Plan „persönliche Produktivität + Stabilisierung" (2026-05-11)

Henning will Paperclip behalten und stärker nutzen — primär für
persönliche Strukturierung, perspektivisch fürs Wissensmanagement.
Jolmes-Operations-Bots (Domäne B) sind aufgeschoben.

**Gewählte Schwerpunkte:**
- Domäne A — Persönliche Strukturierung (priorisiert)
- Domäne C — Wissens-/Dokumentenpflege (folgt)
- Reihenfolge: Stabilisierung und Use-Cases **parallel**

Vollständige Plan-Notizen liegen in
`/root/.claude/plans/lies-jolmes-session-notes-md-ab-abschnit-velvet-metcalfe.md`
(ephemerer Pfad — die wichtigen Teile sind hier dauerhaft eingefroren).

### 12.1 Spur 1 – Stabilisierung

**Pflicht (in dieser Reihenfolge):**

| # | Schritt                                                | Begründung                              |
|---|--------------------------------------------------------|-----------------------------------------|
| 1 | UI-Production-Build aktivieren                         | killt HMR-Login-Bug / Inkognito-Pflicht |
| 2 | embedded-pg → system-postgres migrieren                | DB neustart-fest (Crash nach Reboot)    |
| 3 | DB-Backup-Cron (`pnpm db:backup` + rclone Storage Box) | Schutz gegen Festplattenausfall         |

Befehl/Kontext zu Schritt 1: `pnpm --filter @paperclipai/ui build`,
`paperclip.service` auf statisches Asset-Serving.
Befehl zu Schritt 2: `jolmes/scripts/migrate-to-system-postgres.sh`.

**Optional (nur bei konkretem Bedarf):**

- Domain + TLS (`paperclip.jolmes.de` via Caddy) — übersprungen, weil
  Henning mit IP gut klarkommt. Wert: TLS schützt Cookies + M365-Tokens
  bei Zugriff aus Café/Hotel-WLAN.
- Cloudflare Zero Trust Tunnel für SSH — übersprungen, solange SSH per
  Key + Fail2ban stabil ist.

**Gestrichen:**

- Phase-2-Azure (`jolmes/docs/PHASE-2-AZURE.md`). Hetzner + M365-MCP
  decken alles ab, was die Azure-Migration bringen sollte. Doc bleibt
  als historischer Stand stehen, wird aber nicht weiterverfolgt.

### 12.2 Spur 2 – Use-Cases (Reihenfolge: parallel zur Stabilisierung)

**Use-Case A6 — Weekly-Review** (Freitag 16:00, Sonnet 4.6)

- Trainings-Bot für strukturierte Wochen-Reflexion.
- 3 Sections: „Was lief", „Was rutscht", „3 Schwerpunkte Mo".
- Token-Disziplin: max. 3 Tool-Calls, nur Metadaten, ≤ 600 Output-Tokens,
  Ziel < 5 ¢ pro Lauf.
- System-Prompt: `jolmes/prompts/weekly-review.md`.
- Company-Spec: `companies/henning-personal-ops/agents/weekly-review/AGENTS.md`.

**Use-Case A5 — Followup-Watchdog** (Mo–Fr 11:00, Sonnet 4.6)

- Faden-Detektor: zeigt, wo seit ≥ 5 Werktagen Bewegung fehlt.
- 3 Heuristiken (eigene gesendete Mails ohne Antwort; eingehende Fragen
  ohne Reaktion; `in_progress`-Issues > 5 wt ohne Update). Dedup gegen
  letzte 5 Listen.
- Selbe Token-Disziplin wie A6.
- System-Prompt: `jolmes/prompts/followup-watchdog.md`.
- Company-Spec: `companies/henning-personal-ops/agents/followup-watchdog/AGENTS.md`.

**Folge-Use-Cases (nach A5/A6, in dieser Reihenfolge wahrscheinlich
sinnvoll):**

- A4 Meeting-Briefing (1 h vor jedem Termin) — Kalender-Trigger,
  größerer Aufwand, hoher Nutzen.
- A3 Inbox-Triage (3× täglich) — gut, sobald Watchdog läuft.
- C1 Standort-Steckbriefe — erst sinnvoll, wenn Domäne B reaktiviert wird.
- C3 Personal Knowledge Base — wenn Henning merkt, dass er alte
  Entscheidungen oft sucht.

### 12.3 Erledigt (2026-05-11)

- Prompt-Dateien für A6 + A5 (Commit `40fd075`):
  `jolmes/prompts/weekly-review.md`,
  `jolmes/prompts/followup-watchdog.md`,
  beide AGENTS.md unter
  `companies/henning-personal-ops/agents/{weekly-review,followup-watchdog}/`.
- M365-Sync ohne Bot — systemd-Timer als Quelle der Wahrheit:
  `jolmes/hetzner/units/m365-sync.{service,timer}` als Unit-Files,
  `jolmes/scripts/install-m365-timer.sh` als idempotentes Install-Skript
  für die bestehende VM, `jolmes/hetzner/cloud-init.yaml` ruft dasselbe
  Skript bei Neu-Provision. `ConditionPathExists` auf das M365-Secret
  hält den Timer inert, bis `bootstrap.ts` auf der VM gelaufen ist.
- M365-Sync läuft seit 2026-05-11 23:18 produktiv auf der VM,
  alle 15 Min (`*:0/15`, Europe/Berlin), **ohne Token-Kosten**
  (siehe §12.6 unten zu Setup-Lessons).
- Sync-Output gesäubert (gleicher Abend): die Graph-Volltextsuche-
  Trefferliste wird nicht mehr als Issue-Comment dazugeschrieben
  (war zu oft falsch). `jolmes/scripts/m365/clean-comment-bleed.ts`
  hat retroaktiv 196 Description-Bleeds (Reste vom alten
  Reverse-Sync) bereinigt und 244 Volltext-Noise-Comments per
  psql gelöscht.
- Folgefehler im Cleanup: das Skript hat den **ganzen** „Kontext
  aus Outlook"-Comment gelöscht, weil der Volltext-Block und der
  „Verknüpft im To-Do"-Block im selben Comment standen. Damit
  fehlten danach auch die `linkedResources`-Verknüpfungen.
  Behoben mit Variante B (reset.ts --from-project --confirm,
  130 Issues retire'd, dann frischer Sync) — 128 Issues neu
  angelegt mit 91 enrichten. Letzter Tagesstand: Timer steht
  wieder aktiv auf `*:0/15`.
- Bugfix-Bündel (Commit `e2b73c6`):
  - `jolmes/scripts/m365/lib/mail-ranking.ts` (+ Tests) sortiert
    Volltext-Suchtreffer lokal: Subject-Hits schlagen Body-Hits, der
    eigene „Abschlussbericht E-Mail Manager"-Digest wird komplett
    gefiltert, Dedup nach `conversationId`. Behebt den Fehl-Verweis
    auf einem „Reinigung Verl"-Issue.
  - `lib/conversation.ts` `loadMessage` retried jetzt mit
    `Prefer: IdType="ImmutableId"`. Damit lösen flagged-Mail-To-Dos
    ihren `linkedResources.externalId` direkt auf — der Productivity-Lead
    sieht den realen Mail-Thread statt zu raten.
  - Productivity-Lead-Prompt (`agents/productivity-lead/AGENTS.md`) hat
    jetzt eine „Single-issue triage"-Section: keine Spekulation über
    Issue-Herkunft, ehrliche „Quelle unklar"-Antwort wenn der
    Sync-Kommentar fehlt.

### 12.4 Offene Todos

| Prio | Thema | Notiz |
|------|-------|-------|
| ~~hoch~~ | ~~M365-Sync-Timer auf die laufende VM bringen~~ | **erledigt 2026-05-11 23:18**, siehe §12.6 |
| hoch | UI-Production-Build aktivieren (12.1 Schritt 1) | `pnpm --filter @paperclipai/ui build`, Service umstellen |
| hoch | A6 + A5 in der UI verdrahten: Agent anlegen, System-Prompt aus `jolmes/prompts/*.md` reinkopieren, Modell `claude-sonnet-4-6`, `max_output_tokens=600`, Cron `0 16 * * 5` bzw. `0 11 * * 1-5` (`Europe/Berlin`), Test-Lauf | UI-Arbeit, kann Claude nicht von hier |
| mittel | embedded-pg → system-postgres migrieren (12.1 Schritt 2) | Service-Stop nötig |
| mittel | DB-Backup-Cron (12.1 Schritt 3) | `pnpm db:backup` + rclone |
| niedrig | Domain + TLS — bei Bedarf | s. 12.1 Optional |
| niedrig | Cloudflare Zero Trust Tunnel — bei Bedarf | s. 12.1 Optional |

### 12.5 Aufwärm-Prompt für die nächste Session

```
Codespace-Session-Start.

Lies jolmes/SESSION-NOTES.md ab Abschnitt 12.

Letzter Stand (2026-05-11 abends):
- M365-Sync läuft als systemd-Timer alle 15 Min produktiv
  auf der Hetzner-VM 23.88.46.202. Null Token-Kosten.
- Repo-Spitze: Branch claude/add-core-tests-ZGENJ, Commit 6fd5963
  (sync.ts strippt jetzt den Reverse-Sync-Bleed beim Import).
- Letzter Live-Sync hat 128 Issues angelegt, die noch den alten
  Bleed in der Description haben (Issues VOR dem 6fd5963-Fix
  angelegt). Räumen wir gleich auf.

Erstes Item heute (VM, eine Anweisung pro Nachricht bitte):
  cd ~/paperclip && git pull
  set -a; source ~/.paperclip/state/m365-sync.env; set +a
  pnpm dlx tsx jolmes/scripts/m365/clean-comment-bleed.ts --confirm

Danach offene Items aus §12.4 (Priorität von oben):
  1. UI-Production-Build aktivieren (killt den Inkognito-Bug)
  2. A6 Wochen-Review + A5 Followup-Watchdog in der UI als
     Routinen verdrahten (Prompts liegen in jolmes/prompts/)
  3. DB-Backup-Cron (rclone → Hetzner Storage Box)

Konventionen:
- Antworten Deutsch, knapp.
- VM = Production (nur git pull, nicht editieren).
  Codespace = Dev.
- Bei Setup-Schritten: eine Anweisung pro Nachricht,
  Henning bestätigt jeweils, bevor's weitergeht.
```

### 12.6 Setup-Lessons aus dem M365-Sync-Live-Gang (2026-05-11)

Im Setup tauchten Stolpersteine auf, die im Repo nicht standen.
Damit das nicht nochmal weh tut:

**Env-Vars, die der systemd-Timer braucht** (im Heartbeat wurden sie
automatisch injiziert, beim Timer nicht):

| Variable | Beispielwert | Quelle |
|----------|--------------|--------|
| `PAPERCLIP_API_URL` | `http://localhost:3100` | konstant |
| `PAPERCLIP_COMPANY_ID` | UUID der Company „Henning Personal Ops" | `psql -c "SELECT id FROM companies WHERE issue_prefix='HEN'"` |
| `PAPERCLIP_API_KEY` | 52-char Bearer | UI: Company → Agents → `M365-Sync-Runner` → Keys → Add Key |
| `M365_PROJECT_ID` | UUID des Projekts „M365 Inbox" | `psql -c "SELECT id FROM projects WHERE name='M365 Inbox'"` |

Die landen in `~/.paperclip/state/m365-sync.env` (mode 0600), wird
von der Service-Unit per `EnvironmentFile=-…` geladen.

**Identitätsanker:** der Sync nutzt einen dedizierten, schlafenden
Agent **`M365-Sync-Runner`** als Token-Halter — Heartbeat aus,
`wakeOnAssignment=false`, Max-Turns=1. Damit kein versehentlicher
LLM-Lauf entsteht. Der Agent muss in der Company „Henning Personal
Ops" existieren, sonst gibt's 401 beim API-Aufruf.

**`assertCompanyAccess` in `server/src/routes/authz.ts:44`** prüft
`agent.companyId === requested companyId` — der Agent-Key kann also
nur in der eigenen Company schreiben. Cross-Company-Setups bräuchten
einen Board-Key (heute nicht über UI verfügbar, nur über `claim`-Flow).

**System-Postgres statt embedded-pg:** Auf der laufenden Hetzner-VM
läuft Postgres 18 auf Port 5432 (Unix-Socket, peer-auth für User
`paperclip`). Embedded-pg-Port 54329 hat dort schon niemand mehr.

**M365-To-Do-Listen:** Ohne `M365_TODO_LIST_ID` syncen wir alle
Listen. Outlook hat eine System-Liste **„Flagged Emails"** mit jeder
jemals geflaggten Mail (in Hennings Account: 3599) — der Sync filtert
`status=completed` aber raus, also fließen nur die wirklich noch
offenen Flags ins Paperclip-Projekt. Nach erstem Sync waren 247
Issues im M365-Inbox-Projekt (28 vorher gemappt, 100 neu, ~119 aus
Company-Import vorher schon da).

**Bash-History-Trap bei Keys:** `read -rs PAPERCLIP_API_KEY` setzt
die Variable korrekt, aber sie überlebt keine neue SSH-Session.
Wenn die env-Datei mit `$PAPERCLIP_API_KEY` aus einer Shell ohne
diese Variable geschrieben wird, landet ein leerer Wert drin (Datei
zu klein → 170 statt 222 Bytes). Verifizieren mit `wc -c`.

### 12.7 M365-Sync-Bugfix + 5-Min-Cadence (2026-05-12)

Branch `claude/sync-paperclip-todo-tasks-slpLK`, PR **#16** gegen
`HJolmes/paperclip:master` (NICHT Upstream — Regel ist jetzt fix in
`.claude/CLAUDE.md` dokumentiert).

**Symptom (Henning):** „Aufgaben, die ich in Paperclip schließe,
werden in To-Do nicht abgehakt, auch nach mehreren Syncs."

**Drei zusammenhängende Bugs in `jolmes/scripts/m365/sync.ts`:**

1. **Fast-Path-Skip war einseitig** (`main()`, vorher Zeile 373-383):
   prüfte nur To-Do-Seite (`task.lastModifiedDateTime` +
   `task.status`). Paperclip-Schließungen waren unsichtbar — jeder
   Sync hat den Eintrag als „unchanged" abgehakt und
   `reconcileExisting` gar nicht erst aufgerufen.
2. **Reconcile-Reopen** (`reconcileExisting`, vorher Zeile 192-204):
   bei `issue.status="done"` und `task.status="notStarted"` wurde
   `patch.status = "todo"` gesetzt UND `markTodoCompleted` getriggert
   — das To-Do wurde korrekt geschlossen, der Paperclip-Issue aber
   in der gleichen Operation wieder aufgemacht.
3. **State-Overwrite** (Zeile 211): `entry.lastTodoStatus = task.status`
   am Ende der Reconcile-Funktion überschrieb das „completed" aus
   Bug 2 mit dem alten Snapshot — Statefile war inkonsistent zur
   Realität auf Graph.

**Fix:** Fast-Path komplett raus (Reconcile ist günstig — 1 GET +
ggf. 1 PATCH pro Mapping; bidirektionale Change-Detection ohne
Issue-Fetch ist nicht möglich). `paperclipClosureWins`-Pfad in
`reconcileExisting` unterdrückt sowohl `patch.status` als auch den
trailing State-Overwrite, wenn die Paperclip-Seite geschlossen hat.

**Timer-Cadenz:** von 15 auf **5 Minuten** halbiert
(`jolmes/hetzner/units/m365-sync.timer: OnCalendar=*:0/5`). Ein Lauf
braucht ~5 s CPU bei 133 Mappings → unkritisch.

**Recovery-Procedure für hängende Altlasten:**

```bash
# 1. Backup
sudo cp -a /home/paperclip/.paperclip/state/m365-todo-sync.json \
  /home/paperclip/.paperclip/state/m365-todo-sync.json.bak-$(date +%Y%m%d-%H%M%S)

# 2. Alle lastSyncedAt auf 1970 → bricht den Fast-Path-Skip für alle Items
sudo node -e '
const fs = require("fs");
const p = "/home/paperclip/.paperclip/state/m365-todo-sync.json";
const s = JSON.parse(fs.readFileSync(p,"utf8"));
for (const k of Object.keys(s.items)) s.items[k].lastSyncedAt = "1970-01-01T00:00:00.000Z";
fs.writeFileSync(p, JSON.stringify(s, null, 2));
'

# 3. Sync laufen lassen (oder Timer-Tick abwarten)
sudo systemctl start m365-sync.service
```

**Verifikation nach Fix:** 11 Issues mit `lastIssueStatus="done"` in
State, alle gepaart mit `lastTodoStatus="completed"`. Keine
Mismatches.

**Footgun:** `systemctl start m365-sync.service` ist `Type=oneshot`
und dedupliziert: wenn ein Lauf gerade aktiv ist (~45 s),
**verwirft** systemd den zweiten `start` schweigend. Für „garantiert
frischer Lauf" entweder warten bis der laufende durch ist, oder den
Timer-Tick nehmen. Im normalen Betrieb (alle 5 min automatisch)
irrelevant.

**Nächste Phase** (siehe `jolmes/docs/M365-SYNC-ROADMAP.md`):
Paperclip → To-Do Create für markierte Issues + Subtask-Propagation
via Graph `checklistItems`. Issues im Fork sind noch deaktiviert,
deshalb erstmal als Markdown-Doc statt GitHub-Issue. Wenn Issues
aktiviert werden, in echtes Issue überführen.

**Fork-PR-Regel (jetzt in `.claude/CLAUDE.md`):** Alle PRs gegen
`HJolmes/paperclip:master`, NIEMALS gegen `paperclipai/paperclip`.
GitHub schlägt per Default das Upstream-Repo vor — bei
`gh pr create` bzw. dem Github-MCP also immer `owner=HJolmes`,
`repo=paperclip`, `base=master` explizit setzen.

### 12.8 Cloudflare Tunnel als TLS-Endpunkt (2026-05-12, abends)

Branch `claude/paperclip-power-automate-cYxQS`, PR **#18** gegen
`HJolmes/paperclip:master` (merged).

**Auslöser:** Diskussion über Hennings Power-Automate-Flow
„E-Mail Manager v2 – Claude" (Haiku-Klassifikation in 4 Kategorien
Aufgabe/Reaktion/Info/Werbung mit Zeit-Buckets, Schreibspur in
Excel + Outlook-Categories). Klassifikation bleibt in PA — günstig,
stabil, mobil. Paperclip soll **nur die `Aufgabe`-Fälle** als Tasks
übernehmen und bidirektional mit Microsoft To-Do syncen. Dafür
braucht Paperclip einen Endpunkt, den Microsoft-Graph-Change-
Notifications erreichen können → **HTTPS mit gültigem Cert auf
einer Domain**, nicht IP. Henning hat (noch) keinen Zugriff auf
`jolmes.de`-DNS, hat darum kurzerhand `hjolmes.org` bei Cloudflare
für 7,50 €/Jahr registriert.

**Entscheidung:** Cloudflare **Named Tunnel** (outbound von der
Hetzner-VM, kein Inbound-Port nötig, TLS managed Cloudflare). Statt
Caddy + Let's Encrypt. Phase-2-fest: beim Move auf Azure Container
Apps lässt sich der DNS-CNAME einfach auf die Azure-FQDN umbiegen,
Tunnel kommt weg.

**Was geliefert (PR #18):**

- `jolmes/scripts/setup-cloudflared.sh` — idempotent, installiert
  `cloudflared` (.deb von GitHub-Release), legt Tunnel
  `paperclip-hetzner` an, schreibt `/etc/cloudflared/config.yml`,
  setzt DNS-CNAME via Cloudflare-API, installiert systemd-Service.
- `jolmes/docs/CLOUDFLARE-TUNNEL.md` — Architektur, Setup, Security
  (clientState-Secret, kein Payload im Webhook, Renewal automatisch),
  Phase-2-Übergabe, Troubleshooting-Tabelle.

**Vier Bugs auf dem Weg, alle gefunden + gefixt:**

1. **`HOSTNAME`-Bash-Shadow:** Bash setzt `$HOSTNAME` automatisch auf
   den VM-Namen (`paperclip`). Mein `HOSTNAME="${HOSTNAME:-...}"`
   hat den Default deshalb nie gegriffen — `/etc/cloudflared/config.yml`
   bekam `hostname: paperclip` statt `paperclip.hjolmes.org`. Fix:
   eigene Variable `TUNNEL_HOSTNAME`.
2. **Zu enger Grep auf cloudflared-Output:** `route dns` loggt
   „Added CNAME … will route to this tunnel" — meine Erfolgsregel
   suchte nach „created/already exists" und erklärte den Schritt
   fälschlich für fehlgeschlagen, obwohl Exit-Code 0 war und der
   CNAME tatsächlich angelegt wurde. Fix: auf Exit-Code prüfen,
   Grep nur als Fallback für den „already exists"-Fall.
3. **Paperclip-Hostname-Allowlist:** Paperclip nutzt **keine**
   `config.json` für Hostname-Whitelisting, sondern die ENV-Variablen
   `PAPERCLIP_ALLOWED_HOSTNAMES` + `PAPERCLIP_PUBLIC_URL` in
   `/home/paperclip/paperclip/.env`. Der CLI-Befehl
   `pnpm paperclipai allowed-hostname …` sucht eine `config.json`
   die's nicht gibt und meckert „Run paperclip onboard first" — der
   richtige Weg ist direkter ENV-Edit + Service-Restart.
4. **UFW-Regelreihenfolge:** `ufw deny 80` greift nicht, wenn weiter
   oben noch ein älteres `ALLOW 80/tcp` aus der Erst-Installation
   steht — UFW evaluiert in Listenreihenfolge. Fix:
   `ufw delete allow 80/tcp` löscht v4 + v6 in einem Rutsch.

**Footgun: Loopback umgeht UFW.** `curl http://23.88.46.202/`
**von der VM selbst** liefert weiter 200, obwohl Port 80 für extern
dicht ist — Linux routet local-to-self über Loopback, das fällt
nicht in den INPUT-Chain. Externer Test (aus dem Codespace) ist
Pflicht für den UFW-Beweis.

**Nebenbefund:** Auf der VM lief noch ein **Caddy** aus der Erst-
Installation auf Port 80. Mit aktiviertem UFW von außen unerreichbar,
aber redundant. `sudo systemctl disable --now caddy` weggeräumt.

**Stand nach Merge:**

| Punkt                                              | Status |
| -------------------------------------------------- | ------ |
| Tunnel `paperclip-hetzner` aktiv (fra07/08/15/17)  | ✅     |
| DNS `paperclip.hjolmes.org` → `cfargotunnel.com`   | ✅     |
| TLS Cloudflare-managed, kein Let's-Encrypt-Renewal | ✅     |
| Paperclip via HTTPS                                | ✅ 200 |
| UFW blockt 80/443 extern (extern verifiziert)      | ✅     |
| Caddy disabled                                     | ✅     |

**Offen (Folge-PRs, nicht in #18):**

- `BETTER_AUTH_BASE_URL=https://paperclip.hjolmes.org` in `.env`
  setzen — der Server loggt noch `authPublicBaseUrl=http://23.88.46.202`,
  d.h. Login-Redirects können auf die alte IP zeigen.
- `23.88.46.202` aus `PAPERCLIP_ALLOWED_HOSTNAMES` raus, sobald 1-2
  Tage Probebetrieb durch sind.
- Webhook-Endpoint in Paperclip (`/webhooks/graph/todo` o.ä.) für
  Graph-Change-Notifications — Voraussetzung für die eigentliche
  Story (PA → Paperclip-Task → To-Do-Sync, bidirektional).
- systemd-Service auf Production-Build umstellen (statt `pnpm dev`).
  Aktueller Boot kostet 45 s + 750 MB RAM pro Restart, hartes
  TS-Watcher-Setup.

**Lernen für später:**

- Bash-Builtin-Variablen (`HOSTNAME`, `UID`, `PWD`, `RANDOM` …)
  niemals als Default-Pattern-Variablen verwenden. Eigene Namen
  nehmen.
- Bei Setup-Skripten, die externe CLIs aufrufen, **immer auf Exit-
  Code prüfen** und Output-Pattern-Matching nur als Zusatz.
- Public-URL-fähiger Endpunkt ist Voraussetzung für jede Form von
  Webhook-Integration. Cloudflare Tunnel ist die Phase-1-Lösung
  schlechthin: keine offenen Inbound-Ports, kein Cert-Renewal, kein
  DNS-Eintrag-Theater.

### 12.9 Task-Breaker: LLM-Subtasks → Outlook-Checklist (2026-05-13)

Branch `claude/paperclip-subtasks-feature-KDi0Y`. Hennings Wunsch:
„Paperclip soll Subtasks für meine Aufgaben anlegen, priorisieren,
und mir das zurück nach To-Do spielen — aber nur wo es Sinn ergibt,
nicht für jeden Task."

**Architektur:** zweistufig, weil Sync-Frequenz (5 min) und
LLM-Frequenz (1× pro Issue, ever) sich nicht vertragen.

1. **Neuer Agent `Task-Breaker`** (`jolmes/prompts/task-breaker.md`)
   ruft per Routine das neue Skript `jolmes/scripts/m365/breakdown.ts`
   auf. Das geht über alle Mappings im M365-State ohne
   `breakdownEvaluatedAt`, fragt pro Issue lokal `claude -p` mit
   einem Strict-JSON-Prompt: erst `breakdown: true|false`, dann ggf.
   2-7 Subtasks mit Priorität. Bei `false` wird das Issue trotzdem als
   evaluiert markiert, damit nicht jeder Lauf neu fragt (kostet sonst
   pro Mapping ~1 Claude-Token-Round).
2. **`sync.ts` erweitert um `reconcileSubtasks`**: nach dem
   Parent-Reconcile holt es alle Subtasks (`listIssuesByParent`),
   sortiert nach Priorität (critical→low) und legt für jeden Subtask
   einen `checklistItem` an der Outlook-Parent-Task an. Zwei-Wege-
   Schließung: Subtask `done` → `isChecked=true`, abgehakter
   `checklistItem` → Subtask `done`. Titel-Edits in Paperclip pushen
   in Outlook; manuelle Outlook-Edits am Titel werden überschrieben
   (Subtask-Titel ist Paperclip-autoritativ).

**State-Migration:** `SyncMappingEntry` bekam zwei optionale Felder
(`breakdownEvaluatedAt`, `subtaskMapping`). Bestehende 133 Einträge
sind beim ersten Lauf weder evaluiert noch haben sie ein Mapping —
Task-Breaker fängt also bei null an. Wer einen Re-Eval will: Feld
löschen, im nächsten Lauf wird neu gefragt.

**Konflikt-Regel-Erweiterung** (jetzt in `M365-TODO-SYNC.md`):
- Parent-Task title/status: To-Do wins (unverändert)
- Subtask title: Paperclip wins
- Subtask status: zweiseitig
- Subtask-Anlage: nur Task-Breaker → Outlook

**Bewusste Design-Calls:**
- *LLM via `claude` CLI, nicht via Anthropic-SDK*: kein zusätzlicher
  API-Key, der Adapter-Container hat das Binary sowieso.
- *Pro-Issue-Evaluierung statt projekt-basiert opt-in*: weil das LLM
  ohnehin pro Task entscheiden muss („Sinn?"), spart ein
  Projekt-Filter nicht — und das Sticky-Flag schützt vor Mehrfach-
  Kosten.
- *checklistItems statt eigener Tasks pro Subtask*: Outlook-Tasks für
  jeden Subtask würden Henning's Liste fluten und sind in To-Do nicht
  nativ als Kind verknüpfbar. Phase-2A-Roadmap empfahl checklistItems
  aus genau diesem Grund.
- *Parent-Tasks nur To-Do → Paperclip*: anders als Phase 2A
  ursprünglich vorsah, ist die Parent-Direction noch nicht umgekehrt.
  Erstes Ziel ist Subtask-Flow; Parent-Push bleibt Phase 2B.

**Smoke-Test (vor Merge auf der VM):**
1. Komplexen To-Do-Task anlegen (mehrere Schritte erkennbar).
2. `sync.ts` läuft, Issue erscheint.
3. Task-Breakdown-Routine manuell triggern, prüfen ob Subtasks
   angelegt werden.
4. Nächster Sync-Lauf: Outlook-Task hat checklistItems.
5. Eine Checkbox in Outlook abhaken → Subtask geht in Paperclip auf
   `done`.

**Offen für Folge-PR:**
- Re-Eval-Trigger („dieser Task soll neu zerlegt werden") über einen
  Issue-Kommentar oder Label.
- Parent-Push (Phase 2B): Issues aus einem Push-Projekt nach Outlook
  als neue Tasks (nicht nur als Subtask-Checklist).
- Test mit echten 133 Mappings auf der Hetzner-VM, Token-Verbrauch
  und Latenz pro `claude -p`-Call messen.
