/**
 * Persist sync configuration to ~/.paperclip/state/m365-todo-sync.config.json
 * so the routine-driven sync run does not need adapter-level env injection.
 *
 * Usage:
 *   pnpm dlx tsx jolmes/scripts/m365/configure.ts \
 *     --project-id <uuid> [--list-id <id>] [--mail-top 3]
 *
 * Existing values are preserved; pass empty strings to unset.
 */
import { CONFIG_PATH, readConfig, writeConfig, type SyncConfig } from "./lib/config.js";

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = "";
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const current = await readConfig();
  const next: SyncConfig = { ...current };

  if ("project-id" in args) next.projectId = args["project-id"] || undefined;
  if ("list-id" in args) next.todoListId = args["list-id"] || undefined;
  if ("mail-top" in args) {
    const n = Number.parseInt(args["mail-top"], 10);
    next.mailTop = Number.isFinite(n) && n > 0 ? n : undefined;
  }

  await writeConfig(next);
  console.log(`Wrote ${CONFIG_PATH}`);
  console.log(JSON.stringify(next, null, 2));
}

main().catch((err) => {
  console.error("configure failed:", err.message);
  process.exit(1);
});
