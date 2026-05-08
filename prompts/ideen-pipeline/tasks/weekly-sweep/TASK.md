---
name: Weekly Sweep
assignee: closer
schedule:
  timezone: Europe/Berlin
  startsAt: 2026-05-11T08:00:00+02:00
  recurrence:
    frequency: weekly
    interval: 1
    weekdays:
      - monday
    time:
      hour: 8
      minute: 0
---

Wöchentlicher Sweep über alle offenen Projekte der Ideen-Pipeline.

## Auftrag

1. Hole die Liste aller aktiven Projekte über das Paperclip-API.
2. Klassifiziere jedes nach den Closer-Regeln (aktiv & gesund / wackelig /
   stillstand / kill-kandidat / ohne ziel).
3. Für „wackelig": Planner triggern mit der Bitte um neuen nächsten Schritt.
4. Für „ohne ziel": Triage triggern mit der Bitte um Brief.
5. Für „stillstand" und „kill-kandidat": einen verdichteten Bericht an den
   CEO, der ihn Henning vorlegt.

## Output

Ein Bericht im Closer-Format (siehe `agents/closer/AGENTS.md`), als
Task-Kommentar an den CEO.

## Done

- Bericht an CEO erstellt.
- Mindestens ein konkreter Vorschlag (einmotten / killen / reaktivieren /
  weiterlaufen) pro Stillstand-Kandidat.
- Planner und Triage für die jeweiligen Kategorien getriggert.
