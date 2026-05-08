---
name: Henning Personal Ops
description: Personal productivity company for Henning Jolmes — keeps Microsoft To-Do, Outlook, and Paperclip in sync so daily tasks always carry their email context.
slug: henning-personal-ops
schema: agentcompanies/v1
version: 0.1.0
license: MIT
authors:
  - name: Henning Jolmes
goals:
  - Keep Henning's Microsoft To-Do tasks visible in Paperclip with mail context
  - Surface daily and weekly priorities so the inbox does not run Henning's day
  - Stay separate from "Jolmes Operations" (business) — this is personal scope only
---

Henning Personal Ops is a small two-agent company that exists to make Henning's
own work-day legible. It does not serve customers; it serves one user.

The Productivity-Lead is the CEO and the only agent Henning talks to directly.
Whenever Henning has a question about his open work ("what's on my plate
today?", "remind me what's blocked"), he asks the Productivity-Lead. The
Productivity-Lead reads the current state of the M365 Inbox project, summarises,
and answers — or delegates to the M365-Triage agent if state needs refreshing.

The M365-Triage agent runs autonomously every 15 minutes. It pulls Microsoft
To-Do tasks via Microsoft Graph, enriches them with matching mail context from
Outlook, and creates or updates issues in the M365 Inbox project. It does not
talk to Henning directly — it only reports back to the Productivity-Lead and
posts comments on the Paperclip issues it owns.

Workflow pattern: on-demand for human ↔ CEO, scheduled for CEO ↔ Triage.

Conflict rules between Microsoft To-Do and Paperclip (decided 2026-05-08):
- title and status: To-Do wins
- description: Paperclip wins (Triage enriches, never overwrites after creation)
- new items: only flow To-Do → Paperclip
- closing in either side closes the other
