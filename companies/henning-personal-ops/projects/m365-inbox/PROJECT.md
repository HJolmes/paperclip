---
name: M365 Inbox
description: Single source of truth for Henning's open work — every Microsoft To-Do task lands here, enriched with mail context.
slug: m365-inbox
owner: productivity-lead
---

The M365 Inbox project is the only place Henning needs to look to know what's
open, what's blocked, and what's next.

Issues in this project are **created and maintained by `m365-triage`**. They
mirror Microsoft To-Do tasks one-to-one, with extra Paperclip-side context:
mail snippets, linked resources, comment threads.

The Productivity-Lead reads this project to answer Henning's status questions.
Henning himself can re-prioritise, comment, or close issues directly in
Paperclip — closures propagate back to To-Do on the next sync.

Status mapping (Microsoft To-Do ↔ Paperclip issue):

| To-Do              | Paperclip       |
| ------------------ | --------------- |
| `notStarted`       | `todo`          |
| `inProgress`       | `in_progress`   |
| `completed`        | `done`          |
| `waitingOnOthers`  | `blocked`       |
| `deferred`         | `blocked`       |
