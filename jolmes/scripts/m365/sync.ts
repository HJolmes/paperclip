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
 */
import { graph, graphList } from "./lib/graph.js";
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

async function resolveListId(): Promise<string> {
  const explicit = process.env.M365_TODO_LIST_ID;
  if (explicit) return explicit;
  const lists = await graphList<TodoList>("/me/todo/lists");
  const def =
    lists.find((l) => l.wellknownListName === "defaultList") ??
    lists.find((l) => l.displayName === "Tasks") ??
    lists[0];
  if (!def) throw new Error("No To-Do lists found for this account.");
  log(`using list "${def.displayName}" (${def.id})`);
  return def.id;
}

async function fetchTasks(listId: string): Promise<TodoTask[]> {
  return graphList<TodoTask>(
    `/me/todo/lists/${encodeURIComponent(listId)}/tasks?$top=100&$expand=linkedResources`,
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

async function ensureIssueForTask(
  task: TodoTask,
  listId: string,
  projectId: string | undefined,
  state: { items: Record<string, SyncMappingEntry> },
): Promise<{ entry: SyncMappingEntry; created: boolean }> {
  const existing = state.items[task.id];
  if (existing) return { entry: existing, created: false };

  const issue = await createIssue({
    title: task.title || "(unbenanntes To-Do)",
    description: task.body?.content?.trim() || undefined,
    status: todoToIssueStatus(task.status),
    priority: importanceToPriority(task.importance),
    projectId,
  });
  const entry: SyncMappingEntry = {
    todoListId: listId,
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
  await graph(
    `/me/todo/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    },
  );
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

  const listId = await resolveListId();
  const tasks = await fetchTasks(listId);
  log(`fetched ${tasks.length} task(s)`);

  const state = await readState();
  let created = 0;
  let reconciled = 0;
  let enriched = 0;

  for (const task of tasks) {
    try {
      const { entry, created: didCreate } = await ensureIssueForTask(
        task,
        listId,
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

  await writeState(state);
  log(`done. created=${created} reconciled=${reconciled} enriched=${enriched}`);
}

main().catch((err) => {
  console.error("[m365-sync] fatal:", err);
  process.exit(1);
});
