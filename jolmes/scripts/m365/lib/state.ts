import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { M365_SYNC_STATE_FILE, STATE_DIR } from "./paths.js";

export type SubtaskMappingEntry = {
  checklistItemId: string;
  lastSubtaskStatus: string;
  lastChecklistChecked: boolean;
  lastSyncedAt: string;
};

export type SyncMappingEntry = {
  todoListId: string;
  issueId: string;
  issueIdentifier?: string;
  lastTitle: string;
  lastTodoStatus: string;
  lastIssueStatus: string;
  lastSyncedAt: string;
  enrichedAt: string | null;
  // Phase 2A: per-issue breakdown bookkeeping.
  // breakdownEvaluatedAt is set the first time the breakdown agent
  // looked at this issue (whether it created subtasks or not), so we
  // don't burn LLM credits re-asking every run.
  breakdownEvaluatedAt?: string | null;
  // subtaskMapping links Paperclip subtask issue ids to Outlook
  // checklistItem ids. Populated lazily when sync.ts pushes subtasks
  // to the parent To-Do task.
  subtaskMapping?: Record<string, SubtaskMappingEntry>;
};

export type SyncState = {
  version: 1;
  items: Record<string, SyncMappingEntry>;
};

const EMPTY: SyncState = { version: 1, items: {} };

export async function readState(): Promise<SyncState> {
  try {
    const raw = await readFile(M365_SYNC_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<SyncState>;
    return { version: 1, items: parsed.items ?? {} };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY };
    throw err;
  }
}

export async function writeState(state: SyncState): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  await mkdir(dirname(M365_SYNC_STATE_FILE), { recursive: true });
  // Atomic: write to a sibling tmp file, then rename. A crash mid-write
  // can only leave the tmp file orphaned, never an empty or partial
  // state.json — which previously caused the sync to treat all M365
  // tasks as new on the next run.
  const tmp = `${M365_SYNC_STATE_FILE}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, M365_SYNC_STATE_FILE);
}
