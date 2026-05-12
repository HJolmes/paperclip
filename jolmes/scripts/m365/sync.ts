/**
 * One-shot two-way sync between Microsoft To-Do and Paperclip issues.
 *
 * Runs inside a Paperclip heartbeat (uses injected PAPERCLIP_* env).
 * Conflict rules (agreed with Henning, 2026-05-08):
 *   - title/status: To-Do wins (user edits there)
 *   - description: Paperclip wins (agent enriches there)
 *   - new items: To-Do -> Paperclip (one-way create)
 *   - close in either side closes the other
 *
 * Config (env, set on the M365-Triage agent):
 *   M365_TODO_LIST_ID    optional, defaults to the user's default list
 *   M365_PROJECT_ID      Paperclip project for newly created issues
 *   M365_MAIL_TOP        max mails to attach as context (default 3)
 *   M365_LIMIT           cap on NEW issues created in this run (0 = no cap)
 *   M365_DRY_RUN         "1" to log planned actions without touching Paperclip
 *
 * Open vs completed: completed To-Do tasks are skipped on first encounter.
 * Once a task is mapped, status updates flow both ways.
 */
import { graph, graphList, pathId } from "./lib/graph.js";
import { renderThread, summariseThread } from "./lib/conversation.js";
import { readConfig } from "./lib/config.js";
import {
  bestMatchKind,
  rankAndFilterMails,
  type RankableMessage,
} from "./lib/mail-ranking.js";
import { readState, writeState, type SyncMappingEntry } from "./lib/state.js";
import {
  importanceToPriority,
  issueToTodoStatus,
  todoToIssueStatus,
  type TodoImportance,
  type TodoStatus,
} from "./lib/mapping.js";
import {
  addComment,
  createIssue,
  getIssue,
  patchIssue,
  type Issue,
  type IssueStatus,
} from "./lib/paperclip.js";

type TodoTask = {
  id: string;
  title: string;
  status: TodoStatus;
  importance?: TodoImportance;
  body?: { content?: string; contentType?: string };
  linkedResources?: Array<{
    id: string;
    webUrl?: string;
    applicationName?: string;
    displayName?: string;
    externalId?: string;
  }>;
  lastModifiedDateTime?: string;
};

type Message = RankableMessage & {
  subject: string;
};

type TodoList = { id: string; displayName: string; wellknownListName?: string };

const log = (...args: unknown[]): void => console.log("[m365-sync]", ...args);

async function resolveLists(): Promise<TodoList[]> {
  const cfg = await readConfig();
  const explicit = process.env.M365_TODO_LIST_ID || cfg.todoListId;
  const lists = await graphList<TodoList>("/me/todo/lists");
  if (explicit) {
    const found = lists.find((l) => l.id === explicit);
    if (!found) throw new Error(`Configured M365_TODO_LIST_ID not found: ${explicit}`);
    log(`using single list "${found.displayName}"`);
    return [found];
  }
  log(`using ${lists.length} list(s): ${lists.map((l) => l.displayName).join(", ")}`);
  return lists;
}

async function fetchTasks(listId: string): Promise<TodoTask[]> {
  return graphList<TodoTask>(
    `/me/todo/lists/${pathId(listId)}/tasks?$top=100&$expand=linkedResources`,
  );
}

async function searchMails(query: string, top: number): Promise<Message[]> {
  if (!query.trim()) return [];
  // Fetch a wider pool than `top` so local re-ranking has room to drop
  // digest noise and dedup conversations before trimming to `top`.
  const fetchSize = Math.max(top * 4, 10);
  const path =
    `/me/messages?$top=${fetchSize}` +
    `&$select=id,subject,conversationId,from,receivedDateTime,bodyPreview,webLink` +
    `&$search=${encodeURIComponent('"' + query.replace(/"/g, "") + '"')}`;
  try {
    const res = await graph<{ value: Message[] }>(path, {
      headers: { ConsistencyLevel: "eventual" },
    });
    const ranked = rankAndFilterMails(query, res.value);
    return ranked.slice(0, top).map((s) => s.message);
  } catch (err) {
    log("mail search failed:", (err as Error).message);
    return [];
  }
}

function renderMailContext(linked: TodoTask["linkedResources"]): string {
  // We deliberately do NOT render the Graph full-text search hit list
  // here. It produces more noise than signal: when the linked-resource
  // path and the thread-seed path both miss, full-text on a short task
  // title typically lights up unrelated digest mails, marketing
  // mentions or thread quotations. Returning an empty section is
  // better than a confidently wrong one. If linked resources exist,
  // we list those — they're authoritative.
  if (!linked || linked.length === 0) return "";
  const lines: string[] = ["## Kontext aus Outlook", "", "**Verknüpft im To-Do**:"];
  for (const r of linked) {
    const label = r.displayName ?? r.applicationName ?? "Linked resource";
    lines.push(`- [${label}](${r.webUrl ?? "#"})`);
  }
  return lines.join("\n");
}

/**
 * Strip residue from a retired reverse-sync. An earlier iteration of
 * this tool wrote Paperclip comments back into the Microsoft To-Do
 * task body under a `--- Paperclip-Kommentare ---` marker. Outlook
 * persists that, so every fresh sync would otherwise re-import the
 * stale block (including the long-removed "Top-Treffer (Volltextsuche)"
 * fulltext-hit rendering). We cut everything from the marker onwards.
 */
const REVERSE_SYNC_MARKER = "--- Paperclip-Kommentare ---";
function stripReverseSyncBleed(body: string): string {
  const idx = body.indexOf(REVERSE_SYNC_MARKER);
  if (idx === -1) return body;
  return body.slice(0, idx).replace(/\s+$/u, "");
}

function buildInitialDescription(task: TodoTask, list: TodoList): string {
  const rawBody = task.body?.content?.trim() ?? "";
  const userBody = stripReverseSyncBleed(rawBody).trim();
  const sourceBlock = `**Quelle:** Microsoft To-Do — Liste «${list.displayName}»`;
  return userBody ? `${sourceBlock}\n\n${userBody}` : sourceBlock;
}

async function ensureIssueForTask(
  task: TodoTask,
  list: TodoList,
  projectId: string | undefined,
  state: { items: Record<string, SyncMappingEntry> },
): Promise<{ entry: SyncMappingEntry; created: boolean }> {
  const existing = state.items[task.id];
  if (existing) return { entry: existing, created: false };

  const issue = await createIssue({
    title: task.title || "(unbenanntes To-Do)",
    description: buildInitialDescription(task, list),
    status: todoToIssueStatus(task.status),
    priority: importanceToPriority(task.importance),
    projectId,
  });
  const entry: SyncMappingEntry = {
    todoListId: list.id,
    issueId: issue.id,
    issueIdentifier: issue.identifier,
    lastTitle: task.title,
    lastTodoStatus: task.status,
    lastIssueStatus: issue.status,
    lastSyncedAt: new Date().toISOString(),
    enrichedAt: null,
  };
  state.items[task.id] = entry;
  return { entry, created: true };
}

async function reconcileExisting(
  task: TodoTask,
  entry: SyncMappingEntry,
  state: { items: Record<string, SyncMappingEntry> },
): Promise<"reconciled" | "orphan-removed"> {
  const issue = await getIssue(entry.issueId).catch(() => null);
  if (!issue) {
    log(`issue ${entry.issueId} for todo ${task.id} disappeared; removing mapping`);
    delete state.items[task.id];
    return "orphan-removed";
  }

  const desiredStatus = todoToIssueStatus(task.status);
  const patch: Parameters<typeof patchIssue>[1] = {};

  if (task.title && task.title !== issue.title) patch.title = task.title;
  if (desiredStatus !== issue.status) patch.status = desiredStatus;

  if (issue.status === "done" && task.status !== "completed") {
    await markTodoCompleted(entry.todoListId, task.id);
    entry.lastTodoStatus = "completed";
  }

  if (Object.keys(patch).length > 0) {
    const updated = await patchIssue(entry.issueId, patch);
    entry.lastIssueStatus = updated.status;
    entry.lastTitle = updated.title;
  } else {
    entry.lastIssueStatus = issue.status;
    entry.lastTitle = issue.title;
  }
  entry.lastTodoStatus = task.status;
  entry.lastSyncedAt = new Date().toISOString();
  return "reconciled";
}

async function markTodoCompleted(listId: string, taskId: string): Promise<void> {
  await graph(`/me/todo/lists/${pathId(listId)}/tasks/${pathId(taskId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed" }),
  });
}

function candidateMessageIds(task: TodoTask): string[] {
  const out: string[] = [];
  for (const r of task.linkedResources ?? []) {
    if (typeof r.externalId === "string" && r.externalId.length > 0) {
      out.push(r.externalId);
    }
  }
  return out;
}

async function enrichWithMailContext(
  task: TodoTask,
  entry: SyncMappingEntry,
  top: number,
): Promise<void> {
  const sections: string[] = [];
  let threadFound = false;

  // 1) Try linkedResource externalIds directly.
  for (const candidate of candidateMessageIds(task)) {
    const thread = await summariseThread(candidate).catch(() => null);
    if (thread) {
      sections.push(renderThread(thread));
      threadFound = true;
      break;
    }
  }

  // Search once if we still need fallback material to *seed* a thread.
  const mails = threadFound ? [] : await searchMails(task.title, top);

  // 2) Use the first search hit as a thread seed (its conversationId
  //    is what we actually need; the message id resolves reliably).
  if (!threadFound && mails.length > 0) {
    const thread = await summariseThread(mails[0].id).catch(() => null);
    if (thread) {
      sections.push(renderThread(thread));
      threadFound = true;
    }
  }

  // 3) Last resort: if linked resources exist but we couldn't get a
  //    thread, surface those. We no longer dump the raw full-text
  //    search hit list — it was confidently wrong too often.
  if (!threadFound) {
    const block = renderMailContext(task.linkedResources);
    if (block) sections.push(block);
  }

  if (sections.length === 0) return;
  await addComment(entry.issueId, sections.join("\n\n---\n\n"));
  entry.enrichedAt = new Date().toISOString();
}

type SyncSummary = {
  created: number;
  reconciled: number;
  enriched: number;
  unchanged: number;
  skipped: number;
  dryRun: boolean;
};

function renderRunComment(s: SyncSummary): string {
  const parts = [
    `created=${s.created}`,
    `reconciled=${s.reconciled}`,
    `enriched=${s.enriched}`,
    `unchanged=${s.unchanged}`,
  ];
  if (s.skipped > 0) parts.push(`skipped=${s.skipped} (limit)`);
  if (s.dryRun) parts.push("DRY-RUN");
  return `**M365 To-Do Sync** — ${parts.join(" · ")}`;
}

async function finalizeRunIssue(summary: SyncSummary): Promise<void> {
  const runIssueId = process.env.PAPERCLIP_ISSUE_ID;
  if (!runIssueId) return;
  const expectedTitle = process.env.PAPERCLIP_ISSUE_TITLE ?? "";
  if (!/M365 To-Do Sync/i.test(expectedTitle)) {
    log(`run-issue title "${expectedTitle}" doesn't match routine — skipping auto-close`);
    return;
  }
  const body = renderRunComment(summary);
  try {
    await addComment(runIssueId, body);
  } catch (err) {
    log(`run-issue comment failed (continuing): ${(err as Error).message}`);
  }
  if (summary.dryRun) return;
  try {
    await patchIssue(runIssueId, { status: "done" });
  } catch (err) {
    log(`run-issue close failed: ${(err as Error).message}`);
  }
}

async function main(): Promise<void> {
  const cfg = await readConfig();
  const projectId = process.env.M365_PROJECT_ID || cfg.projectId || undefined;
  const top =
    Number.parseInt(process.env.M365_MAIL_TOP ?? "", 10) ||
    cfg.mailTop ||
    3;
  const limit = Number.parseInt(process.env.M365_LIMIT ?? "0", 10) || 0;
  const dryRun = process.env.M365_DRY_RUN === "1";

  const lists = await resolveLists();

  type TaskWithList = { task: TodoTask; list: TodoList };
  const allTasks: TaskWithList[] = [];
  for (const list of lists) {
    const tasks = await fetchTasks(list.id);
    log(`  ${list.displayName}: ${tasks.length} task(s)`);
    for (const task of tasks) allTasks.push({ task, list });
  }
  const state = await readState();
  const open = allTasks.filter(
    ({ task }) => task.status !== "completed" || state.items[task.id],
  );
  open.sort((a, b) => {
    const ta = a.task.lastModifiedDateTime ?? "";
    const tb = b.task.lastModifiedDateTime ?? "";
    if (ta === tb) return 0;
    return ta < tb ? 1 : -1;
  });
  log(
    `fetched ${allTasks.length} total · ${open.length} active+mapped · sorted by recency` +
      (dryRun ? " · DRY-RUN" : "") +
      (limit > 0 ? ` · limit=${limit}` : ""),
  );

  let created = 0;
  let reconciled = 0;
  let enriched = 0;
  let skipped = 0;
  let unchanged = 0;

  for (const { task, list } of open) {
    try {
      const existing = state.items[task.id];
      const isNew = !existing;
      if (isNew && limit > 0 && created >= limit) {
        skipped += 1;
        continue;
      }

      // Fast path: skip tasks that have not changed since last sync.
      // lastModifiedDateTime is updated by Microsoft on title, status,
      // body, and importance changes — exactly the fields we sync.
      if (
        !isNew &&
        !dryRun &&
        existing.lastSyncedAt &&
        task.lastModifiedDateTime &&
        task.lastModifiedDateTime <= existing.lastSyncedAt &&
        task.status === existing.lastTodoStatus
      ) {
        unchanged += 1;
        continue;
      }

      if (dryRun) {
        if (isNew) {
          log(`[dry] would CREATE: «${list.displayName}» "${task.title}" (status=${task.status})`);
          created += 1;
        } else {
          log(`[dry] would RECONCILE: "${task.title}"`);
          reconciled += 1;
        }
        continue;
      }
      const { entry, created: didCreate } = await ensureIssueForTask(
        task,
        list,
        projectId,
        state,
      );
      if (didCreate) {
        created += 1;
        await enrichWithMailContext(task, entry, top);
        if (entry.enrichedAt) enriched += 1;
      } else {
        const outcome = await reconcileExisting(task, entry, state);
        if (outcome === "reconciled") reconciled += 1;
      }
    } catch (err) {
      log(`task ${task.id} (${task.title}) failed:`, (err as Error).message);
    }
  }

  if (!dryRun) await writeState(state);
  log(
    `done. created=${created} reconciled=${reconciled} enriched=${enriched}` +
      (unchanged > 0 ? ` unchanged=${unchanged}` : "") +
      (skipped > 0 ? ` skipped=${skipped} (limit)` : "") +
      (dryRun ? " (no writes)" : ""),
  );

  await finalizeRunIssue({ created, reconciled, enriched, unchanged, skipped, dryRun });
}

main().catch((err) => {
  console.error("[m365-sync] fatal:", err);
  process.exit(1);
});
