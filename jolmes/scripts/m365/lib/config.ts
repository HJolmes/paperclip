import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { STATE_DIR } from "./paths.js";

const CONFIG_FILE = join(STATE_DIR, "m365-todo-sync.config.json");

export type SyncConfig = {
  projectId?: string;
  todoListId?: string;
  mailTop?: number;
};

export async function readConfig(): Promise<SyncConfig> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf8");
    return JSON.parse(raw) as SyncConfig;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

export async function writeConfig(cfg: SyncConfig): Promise<void> {
  await mkdir(dirname(CONFIG_FILE), { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

export const CONFIG_PATH = CONFIG_FILE;
