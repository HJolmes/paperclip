import { homedir } from "node:os";
import { join } from "node:path";

const root = process.env.PAPERCLIP_HOME ?? join(homedir(), ".paperclip");

export const SECRETS_DIR = join(root, "secrets");
export const STATE_DIR = join(root, "state");

export const M365_SECRET_FILE = join(SECRETS_DIR, "m365.json");
export const M365_SYNC_STATE_FILE = join(STATE_DIR, "m365-todo-sync.json");
