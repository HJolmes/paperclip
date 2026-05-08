# Session-Notes – Jolmes Paperclip Setup

> Lies das in einer neuen Claude-Session mit:
> *„Lies `jolmes/SESSION-NOTES.md` und setze fort."*

Letzter Stand: **2026-05-08** · Branch `master` · Codespace lief unter Subscription-Modus.

> Aktiver Feature-Branch: `claude/paperclip-email-todos-WJN1k` —
> Setup für Use Case **„To-Dos mit Mail-Kontext"**. Siehe Abschnitt 9.

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
