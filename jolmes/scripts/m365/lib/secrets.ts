import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { M365_SECRET_FILE, SECRETS_DIR } from "./paths.js";

export type M365Secret = {
  tenantId: string;
  clientId: string;
  refreshToken: string;
  scope: string;
  account?: string;
  obtainedAt: string;
};

export async function readM365Secret(): Promise<M365Secret | null> {
  try {
    const raw = await readFile(M365_SECRET_FILE, "utf8");
    return JSON.parse(raw) as M365Secret;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeM365Secret(secret: M365Secret): Promise<void> {
  await mkdir(SECRETS_DIR, { recursive: true, mode: 0o700 });
  await mkdir(dirname(M365_SECRET_FILE), { recursive: true, mode: 0o700 });
  await writeFile(M365_SECRET_FILE, JSON.stringify(secret, null, 2), { mode: 0o600 });
  await chmod(M365_SECRET_FILE, 0o600);
}
