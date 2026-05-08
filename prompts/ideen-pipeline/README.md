# Ideen-Pipeline

Eine kleine Paperclip-Company gegen das klassische
„Ich-fang-an-aber-mach-nicht-fertig"-Problem. Sie verwaltet **persönliche
Vorhaben** von Henning Jolmes — keine fremden Projekte, keine Teams.

## Wozu das gut ist

- Jede Idee bekommt ein **Ziel** und eine **Definition of Done**.
- Jedes aktive Projekt hat jederzeit **einen konkreten nächsten Schritt**.
- Wöchentlich wird sichtbar, was **stillsteht** — und was eingemottet oder
  gekillt gehört.
- Henning bleibt **alleiniger Entscheider** über Start, Stop und Kill. Die
  Company entscheidet nicht.

## Workflow

```
Idee → Triage → Planner → (Ausführung) → Closer → CEO → Henning
                                            ▲
                                  wöchentlicher Sweep
```

Der CEO ist die einzige Schnittstelle zu Henning. Triage, Planner und
Closer arbeiten im Hintergrund.

## Org-Chart

| Rolle   | Title              | Reports to | Skills    | Aufgabe                                              |
| ------- | ------------------ | ---------- | --------- | ---------------------------------------------------- |
| CEO     | Chief Executive    | —          | paperclip | Verdichtet Status, legt Henning Entscheidungen vor   |
| Triage  | Idea Triage        | CEO        | paperclip | Idee → Ziel + Definition of Done                     |
| Planner | Next-Step Planner  | CEO        | paperclip | Ziel → konkreter nächster Schritt                    |
| Closer  | Stillstand-Detektor| CEO        | paperclip | Wöchentlicher Sweep, Vorschläge zum Einmotten/Killen |

## Wiederkehrende Routinen

| Task         | Assignee | Rhythmus            |
| ------------ | -------- | ------------------- |
| Weekly Sweep | Closer   | Montags 08:00 (CET) |

## Sprache

- Outputs an Henning: **Deutsch**, knapp, max. 5 Bullets.
- Slugs, Code, Commit-Messages, Task-Namen: **Englisch**.

## Getting Started

Aus dem Paperclip-Repo heraus:

```bash
paperclipai company import --from prompts/ideen-pipeline
```

Danach in der UI auf Port 3100 die Company aktivieren und eine erste Idee
an Triage werfen.

## Spec & Quellen

- [Agent Companies Specification](https://agentcompanies.io/specification)
- [Paperclip](https://github.com/paperclipai/paperclip)
- Modell-Default: `claude-sonnet-4-6` (siehe `.paperclip.yaml`)

## Phase

Diese Company ist Teil von **Phase 1** der Jolmes-Paperclip-Installation
(Codespace-Setup, erste Test-Company, Smoke-Test). Sie ist bewusst klein
gehalten und soll als Vorlage für spätere Companies dienen.
