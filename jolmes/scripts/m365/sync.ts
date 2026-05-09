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

type Message = {
  id: string;
  subject: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  bodyPreview?: string;
  webLink?: string;
};

type TodoList = { id: string; displayName: string; wellknownListName?: string };

const log = (...args: unknown[]): void => console.log("[m365-sync]", ...args);

async function resolveLists(): Promise<TodoList[]> {
  const explicit = process.env.M365_TODO_LIST_ID;
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
  const path =
    `/me/messages?$top=${top}` +
    `&$select=id,subject,from,receivedDateTime,bodyPreview,webLink` +
    `&$search=${encodeURIComponent('"' + query.replace(/"/g, "") + '"')}`;
  try {
    const res = await graph<{ value: Message[] }>(path, {
      headers: { ConsistencyLevel: "eventual" },
    });
    return res.value;
  } catch (err) {
    log("mail search failed:", (err as Error).message);
    return [];
  }
}

function renderMailContext(mails: Message[], linked: TodoTask["linkedResources"]): string {
  const lines: string[] = ["## Kontext aus Outlook", ""];
  if (linked && linked.length > 0) {
    lines.push("**Verknüpft im To-Do**:");
    for (const r of linked) {
      const label = r.displayName ?? r.applicationName ?? "Linked resource";
      lines.push(`- [${label}](${r.webUrl ?? "#"})`);
    }
    lines.push("");
  }
  if (mails.length === 0) {
    lines.push("_Keine passenden Mails per Suche gefunden._");
    return lines.join("\n");
  }
  lines.push("**Top-Treffer (Volltextsuche)**:");
  for (const m of mails) {
    const from =
      m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "unbekannt";
    const when = m.receivedDateTime?.slice(0, 10) ?? "?";
    const preview = (m.bodyPreview ?? "").replace(/\s+/g, " ").slice(0, 240);
    lines.push(
      `- **${m.subject}** — ${from} · ${when}` +
        (m.webLink ? ` · [öffnen](${m.webLink})` : "") +
        (preview ? `\n  > ${preview}` : ""),
    );
  }
  return lines.join("\n");
}

function buildInitialDescription(task: TodoTask, list: TodoList): string {
  const userBody = task.body?.content?.trim() ?? "";
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
): Promise<void> {
  const issue = await getIssue(entry.issueId).catch(() => null);
  if (!issue) {
    log(`issue ${entry.issueId} for todo ${task.id} disappeared; skipping`);
    return;
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
}

async function markTodoCompleted(listId: string, taskId: string): Promise<void> {
  await graph(`/me/todo/lists/${pathId(listId)}/tasks/${pathId(taskId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed" }),
  });
}

async function enrichWithMailContext(
  task: TodoTask,
  entry: SyncMappingEntry,
  top: number,
): Promise<void> {
  const linkedHas = task.linkedResources && task.linkedResources.length > 0;
  const mails = await searchMails(task.title, top);
  if (!linkedHas && mails.length === 0) return;
  const body = renderMailContext(mails, task.linkedResources);
  await addComment(entry.issueId, body);
  entry.enrichedAt = new Date().toISOString();
}

async function main(): Promise<void> {
  const projectId = process.env.M365_PROJECT_ID || undefined;
  const top = Number.parseInt(process.env.M365_MAIL_TOP ?? "3", 10) || 3;
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

  for (const { task, list } of open) {
    try {
      const isNew = !state.items[task.id];
      if (isNew && limit > 0 && created >= limit) {
        skipped += 1;
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
        await reconcileExisting(task, entry);
        reconciled += 1;
      }
    } catch (err) {
      log(`task ${task.id} (${task.title}) failed:`, (err as Error).message);
    }
  }

  if (!dryRun) await writeState(state);
  log(
    `done. created=${created} reconciled=${reconciled} enriched=${enriched}` +
      (skipped > 0 ? ` skipped=${skipped} (limit)` : "") +
      (dryRun ? " (no writes)" : ""),
  );
}

main().catch((err) => {
  console.error("[m365-sync] fatal:", err);
  process.exit(1);
});
