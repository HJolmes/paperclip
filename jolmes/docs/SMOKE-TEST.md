# Smoke-Test – Phase 1 (Subscription-Modus)

Ziel: Beweisen, dass die Toolchain
(Claude-Code-CLI → Paperclip-Heartbeat → Audit-Trail) end-to-end
funktioniert. Kein produktiver Use-Case.

## Voraussetzungen

- `pnpm dev` läuft, `http://localhost:3100` ist erreichbar
- `claude --version` funktioniert (CLI installiert)
- `claude login` einmalig ausgeführt (~/.claude/-Token vorhanden)
- `.env` **ohne** `ANTHROPIC_API_KEY` (Subscription-Modus)
- Company `Jolmes Automation` ist angelegt
- Rolle `Mail-Klassifikator` existiert mit:
  - Adapter `claude_local`
  - cwd `/workspaces/paperclip`
  - System-Prompt aus `prompts/mail-klassifikator.md` (Phase 1)
- **Test-Environment-Button** in der Rolle hat grüne Häkchen geliefert

## Ablauf

1. **Adapter-Smoketest** (separat von Paperclip):
   ```bash
   echo "ping" | claude --print - --output-format stream-json --verbose
   ```
   Erwartung: JSON-Stream mit Antwort, kein 401, kein Login-Prompt.

2. **Goal anlegen** (UI: Issue erstellen, oder CLI):
   ```bash
   pnpm paperclipai issue create \
     --company "Jolmes Automation" \
     --title "Smoke-Test Status-Report" \
     --body "Schreibe einen einzeiligen Status-Report über deinen aktuellen Zustand."
   ```
   Issue der Rolle `Mail-Klassifikator` zuweisen.

3. **Heartbeat manuell triggern**
   - In der UI: Button **„Wake now"** auf der Rolle
   - oder im Terminal:
     ```bash
     pnpm paperclipai agent local-cli "Mail-Klassifikator" --company-id <id>
     ```

4. **Beobachten**
   - Heartbeat-Run-Status wechselt: `queued` → `running` → `succeeded`
   - Antwort erscheint im Issue als Comment
   - Activity-Log zeigt einen Run mit Token-Usage

## Akzeptanzkriterien

| Check                                | Ziel                                     |
| ------------------------------------ | ---------------------------------------- |
| Heartbeat-Run-Status                 | `succeeded`                              |
| Issue-Status nach Lauf               | `done` / Antwort vorhanden               |
| Audit-Trail im UI                    | enthält Run-Log + Token-Usage            |
| Cost-Anzeige für Issue               | 0 € (Subscription-Modus, Tokens-only)    |
| Token-Counts in Run-Details          | > 0                                      |
| Telemetrie-Beacon nach extern        | **darf nicht** stattfinden               |

## Telemetrie-Verifikation

```bash
grep -E "PAPERCLIP_TELEMETRY_DISABLED|DO_NOT_TRACK" .env
# Erwartet:
# PAPERCLIP_TELEMETRY_DISABLED=1
# DO_NOT_TRACK=1
```

## Fehlerbilder & Fixes

| Symptom                                       | Root Cause                                 | Fix                                                          |
| --------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `claude: command not found`                   | CLI nicht installiert                      | `sudo npm install -g @anthropic-ai/claude-code`              |
| Test-Env: „API key auth detected" (Warnung)   | `ANTHROPIC_API_KEY` doch in `.env`         | Zeile löschen, `pnpm dev` neu starten                        |
| Heartbeat hängt in `running`                  | `claude` wartet auf interaktive Permission | Adapter-Setting `dangerouslySkipPermissions: true` aktivieren |
| Adapter-Test schlägt fehl mit `auth required` | Login fehlt                                | `claude login` ausführen                                     |
| Run liefert leere Antwort                     | Modell-Wahl passt nicht zum Abo            | Pro: `claude-sonnet-4-6`; Max: `claude-opus-4-7`             |
| Issue bleibt `in_progress`                    | Heartbeat nicht getriggert                 | UI: „Wake now"; oder `wakeOnAssignment: true` setzen         |
| Antwort ist auf Englisch                      | System-Prompt nicht übernommen             | Rolle prüfen, ggf. neu speichern                             |
| Rate-Limit (`429` o. ä.)                      | Pro/Max-Window voll                        | warten oder auf Direkt-API umsteigen                         |
