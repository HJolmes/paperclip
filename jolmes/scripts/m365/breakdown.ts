/**
 * Auto-breakdown: walks Paperclip issues that came from To-Do, asks the
 * LLM "is it worth splitting this into subtasks?" and only creates
 * subtasks when the LLM says yes. The LLM also assigns priorities so the
 * downstream push step can order checklistItems sensibly.
 *
 * Idempotent: every issue is evaluated at most once (per state file).
 * The flag lives on the SyncMappingEntry (`breakdownEvaluatedAt`).
 *
 * Designed to run as its own Paperclip routine, less frequently than
 * sync.ts (e.g. hourly) because each evaluation costs LLM tokens.
 *
 * Config (env, set on the Task-Breaker agent):
 *   M365_PROJECT_ID    Paperclip project the M365 sync writes into; only
 *                      issues already mapped via sync.ts state are
 *                      candidates (mapping is the opt-in signal).
 *   M365_BREAKDOWN_LIMIT   cap on issues evaluated per run (default 10)
 *   M365_DRY_RUN       "1" to log decisions without creating subtasks
 *
 * Will skip an issue when:
 *   - it's not currently in `state.items` (i.e. not from To-Do)
 *   - it already has subtasks in Paperclip (parentId === issue.id)
 *   - it's already evaluated (`breakdownEvaluatedAt` set)
 *   - it's in a terminal status (done/cancelled)
 */
import { decideBreakdown } from "./lib/breakdown-llm.js";
import {
  addComment,
  createIssue,
  getIssue,
  listIssuesByParent,
} from "./lib/paperclip.js";
import { readState, writeState, type SyncMappingEntry } from "./lib/state.js";

const log = (...args: unknown[]): void => console.log("[m365-breakdown]", ...args);

async function evaluateIssue(
  todoTaskId: string,
  entry: SyncMappingEntry,
  state: { items: Record<string, SyncMappingEntry> },
  dryRun: boolean,
): Promise<"created" | "skipped" | "orphan"> {
  const issue = await getIssue(entry.issueId).catch(() => null);
  if (!issue) {
    log(`issue ${entry.issueId} missing; removing mapping for todo ${todoTaskId}`);
    if (!dryRun) delete state.items[todoTaskId];
    return "orphan";
  }
  if (issue.status === "done" || issue.status === "cancelled") {
    entry.breakdownEvaluatedAt = new Date().toISOString();
    return "skipped";
  }
  const existing = await listIssuesByParent(issue.id);
  if (existing.length > 0) {
    log(`"${issue.title}" already has ${existing.length} subtask(s); marking evaluated`);
    entry.breakdownEvaluatedAt = new Date().toISOString();
    return "skipped";
  }

  const decision = await decideBreakdown({
    title: issue.title,
    description: issue.description,
    priority: issue.priority,
  });

  if (!decision.breakdown) {
    log(`skip "${issue.title}": ${decision.reason ?? "no breakdown needed"}`);
    entry.breakdownEvaluatedAt = new Date().toISOString();
    return "skipped";
  }

  log(
    `breakdown "${issue.title}" → ${decision.subtasks.length} subtask(s)` +
      (dryRun ? " (dry-run)" : ""),
  );

  if (dryRun) {
    for (const s of decision.subtasks) {
      log(`  - [${s.priority}] ${s.title}`);
    }
    return "skipped";
  }

  for (const s of decision.subtasks) {
    await createIssue({
      title: s.title,
      status: "todo",
      priority: s.priority,
      projectId: issue.projectId,
      parentId: issue.id,
    });
  }

  const summary = [
    "**Auto-Breakdown**",
    decision.reason ? `_Begründung_: ${decision.reason}` : null,
    "",
    "Subtasks:",
    ...decision.subtasks.map((s, idx) => `${idx + 1}. [${s.priority}] ${s.title}`),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  await addComment(issue.id, summary).catch((err) => {
    log(`comment failed for ${issue.id} (continuing): ${(err as Error).message}`);
  });

  entry.breakdownEvaluatedAt = new Date().toISOString();
  // Touch lastSyncedAt so the next sync.ts run picks the issue up for
  // checklistItem reconciliation immediately.
  entry.lastSyncedAt = new Date().toISOString();
  return "created";
}

async function finalizeRunIssue(summary: {
  evaluated: number;
  created: number;
  skipped: number;
  orphans: number;
  dryRun: boolean;
}): Promise<void> {
  const runIssueId = process.env.PAPERCLIP_ISSUE_ID;
  if (!runIssueId) return;
  const expectedTitle = process.env.PAPERCLIP_ISSUE_TITLE ?? "";
  if (!/Task[- ]Breakdown|Subtask[- ]Breakdown/i.test(expectedTitle)) return;
  const parts = [
    `evaluated=${summary.evaluated}`,
    `created=${summary.created}`,
    `skipped=${summary.skipped}`,
  ];
  if (summary.orphans > 0) parts.push(`orphans=${summary.orphans}`);
  if (summary.dryRun) parts.push("DRY-RUN");
  try {
    await addComment(runIssueId, `**Task Breakdown** — ${parts.join(" · ")}`);
  } catch (err) {
    log(`run-issue comment failed (continuing): ${(err as Error).message}`);
  }
  if (summary.dryRun) return;
  try {
    const { patchIssue } = await import("./lib/paperclip.js");
    await patchIssue(runIssueId, { status: "done" });
  } catch (err) {
    log(`run-issue close failed: ${(err as Error).message}`);
  }
}

async function main(): Promise<void> {
  const dryRun = process.env.M365_DRY_RUN === "1";
  const rawLimit = Number.parseInt(process.env.M365_BREAKDOWN_LIMIT ?? "10", 10);
  const evalLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : Infinity;
  const state = await readState();

  // Sort newest-first so a freshly mapped issue gets the LLM attention
  // before we wade through ancient candidates. Orphans (issue missing
  // in Paperclip) get removed in-place and don't count toward the
  // LLM-call limit — they're cheap and just stale-state cleanup.
  const pending = Object.entries(state.items)
    .filter(([, entry]) => !entry.breakdownEvaluatedAt)
    .sort(([, a], [, b]) => {
      const ta = a.lastSyncedAt ?? "";
      const tb = b.lastSyncedAt ?? "";
      if (ta === tb) return 0;
      return ta < tb ? 1 : -1;
    });

  log(
    `${Object.keys(state.items).length} mapped issue(s) · ${pending.length} pending evaluation` +
      (Number.isFinite(evalLimit) ? ` · llm-limit=${evalLimit}` : "") +
      (dryRun ? " · DRY-RUN" : ""),
  );

  let evaluated = 0;
  let created = 0;
  let skipped = 0;
  let orphans = 0;

  for (const [todoTaskId, entry] of pending) {
    if (evaluated >= evalLimit) break;
    try {
      const outcome = await evaluateIssue(todoTaskId, entry, state, dryRun);
      if (outcome === "orphan") {
        orphans += 1;
        continue;
      }
      evaluated += 1;
      if (outcome === "created") created += 1;
      else skipped += 1;
    } catch (err) {
      log(`issue ${entry.issueId} failed: ${(err as Error).message}`);
    }
  }

  if (!dryRun) await writeState(state);
  log(
    `done. evaluated=${evaluated} created=${created} skipped=${skipped} orphans=${orphans}` +
      (dryRun ? " (no writes)" : ""),
  );
  await finalizeRunIssue({ evaluated, created, skipped, orphans, dryRun });
}

main().catch((err) => {
  console.error("[m365-breakdown] fatal:", err);
  process.exit(1);
});
