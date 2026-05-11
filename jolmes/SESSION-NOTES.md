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

- **Heartbeat-Comment-Timeout** debuggen. Symptom: Agent macht den Sync
  erfolgreich (Skript loggt `done. unchanged=132`), versucht dann
  `curl -X POST /api/issues/.../comments` und kriegt curl exit 28
  (Timeout). Localhost-API antwortet aus der Heartbeat-Sandbox auf
  diesem Endpoint nicht in akzeptabler Zeit. Andere Endpoints der
  selben API gehen aber durch. Verdacht: spezifisches Problem mit dem
  Comment-Schema oder mit Inhalt der DB-Schreiboperation. Reproduzieren:
  manuelles `curl -X POST /api/issues/<id>/comments` aus dem
  Heartbeat-Worker laufen lassen. Workaround bis dahin: Routine-
  Run-Issue manuell auf `done` patchen (siehe § 10.6).
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
