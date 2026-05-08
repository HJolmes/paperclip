# Smoke-Test – Phase 1

Ziel: Beweisen, dass die Toolchain (Anthropic API → Paperclip → Heartbeat
→ Audit-Trail → Cost-Tracking) end-to-end funktioniert. Kein produktiver
Use-Case.

## Voraussetzungen

- `pnpm dev` läuft, `http://localhost:3100` ist erreichbar
- `.env` enthält gültigen `ANTHROPIC_API_KEY`
- Company `Jolmes Automation` ist angelegt
- Rolle `Mail-Klassifikator` existiert mit System-Prompt aus
  `prompts/mail-klassifikator.md` (Phase 1)
- Budget der Rolle: 10 € / Monat, Hard-Stop aktiviert

## Ablauf

1. **Heartbeat-Loop starten** (Terminal im Codespace):
   ```bash
   pnpm paperclipai heartbeat run --role "Mail-Klassifikator"
   ```
   Erwartung: Loop loggt `polling…` alle paar Sekunden.

2. **Goal anlegen** (via UI oder CLI):
   ```bash
   pnpm paperclipai issue create \
     --company "Jolmes Automation" \
     --role "Mail-Klassifikator" \
     --title "Smoke-Test Status-Report" \
     --body "Schreibe einen einzeiligen Status-Report über deinen aktuellen Zustand."
   ```

3. **Beobachten**
   - Heartbeat zieht das Issue.
   - Activity-Log in der UI zeigt: `tool_use=false`, `model=claude-sonnet-4-6`.
   - Antwort erscheint im Issue als Comment.

## Akzeptanzkriterien

| Check                                      | Ziel                            |
| ------------------------------------------ | ------------------------------- |
| Issue-Status nach Lauf                     | `done`                          |
| Anzahl Anthropic-API-Calls                 | exakt 1                         |
| Cost-Anzeige für Issue                     | > 0 € und < 0,01 €              |
| Audit-Trail im UI                          | enthält Request + Response      |
| Budget-Restanzeige der Rolle               | ≈ 10 € − Issue-Kosten           |
| Telemetrie-Beacon nach extern              | **darf nicht** stattfinden      |

## Telemetrie-Verifikation

Quick-Check, dass kein Outbound-Tracking rausgeht:

```bash
grep -E "PAPERCLIP_TELEMETRY_DISABLED|DO_NOT_TRACK" .env
# Erwartet:
# PAPERCLIP_TELEMETRY_DISABLED=1
# DO_NOT_TRACK=1
```

## Fehlerbilder & Fixes

| Symptom                                | Root Cause                       | Fix                                                  |
| -------------------------------------- | -------------------------------- | ---------------------------------------------------- |
| Heartbeat loggt `401 Unauthorized`     | Anthropic-Key fehlt/abgelaufen   | `.env` aktualisieren, `pnpm dev` neu starten        |
| Cost bleibt 0 €                        | Cost-Provider-Mapping fehlt      | siehe `doc/SPEC-implementation.md` (Upstream)       |
| Issue bleibt `in_progress`             | Heartbeat nicht gestartet        | Schritt 1 erneut ausführen                           |
| Antwort ist auf Englisch               | System-Prompt nicht übernommen   | Rolle prüfen, ggf. neu speichern                     |
