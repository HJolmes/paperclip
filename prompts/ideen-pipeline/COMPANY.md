---
name: Ideen-Pipeline
description: Bringt halbe Projekte zu Ende, statt neue anzufangen
slug: ideen-pipeline
schema: agentcompanies/v1
version: 0.1.0
license: MIT
authors:
  - name: Henning Jolmes
goals:
  - Jede Idee bekommt ein klares Ziel und eine Definition of Done
  - Jedes offene Projekt hat jederzeit einen konkreten nächsten Schritt
  - Stillstehende Projekte werden wöchentlich erkannt und vorgelegt
  - Henning entscheidet Start, Stop und Kill — die Company entscheidet nicht selbst
tags:
  - personal-productivity
  - project-completion
---

Die Ideen-Pipeline ist eine kleine Company gegen das klassische
„Ich-fang-an-aber-mach-nicht-fertig"-Problem. Sie verwaltet keine fremden
Projekte und keine Teams — sie verwaltet **Hennings Vorhaben**.

## Workflow (Pipeline mit CEO als Pufferschicht)

```
Idee
  │
  ▼
Triage   ─── definiert Ziel + Definition of Done
  │
  ▼
Planner  ─── leitet einen konkreten nächsten Schritt ab
  │
  ▼
(Henning oder Worker) führt aus
  │
  ▼
Closer   ─── prüft wöchentlich, was stillsteht
  │
  ▼
CEO      ─── verdichtet Status, legt Henning Entscheidungen vor
```

Der CEO ist die einzige Schnittstelle zu Henning. Triage, Planner und Closer
arbeiten im Hintergrund und reporten nach oben. Henning sieht nur den CEO.

## Sprache

- Outputs an Henning: **Deutsch**, knapp, direkt.
- Tasks, Slugs, Code, Commit-Messages: **Englisch**.
