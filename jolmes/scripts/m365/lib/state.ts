import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { M365_SYNC_STATE_FILE, STATE_DIR } from "./paths.js";

export type SyncMappingEntry = {
  todoListId: string;
  issueId: string;
  issueIdentifier?: string;
  lastTitle: string;
  lastTodoStatus: string;
  lastIssueStatus: string;
  lastSyncedAt: string;
  enrichedAt: string | null;
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
  await writeFile(M365_SYNC_STATE_FILE, JSON.stringify(state, null, 2));
}
