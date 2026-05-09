/**
 * Wipe sync-created Paperclip issues and clear the local mapping state so
 * the next sync.ts run rebuilds everything from scratch (with current
 * enrichment logic).
 *
 * Required env:
 *   PAPERCLIP_API_URL    e.g. http://localhost:3100
 *   PAPERCLIP_COMPANY_ID
 *
 * Optional env:
 *   PAPERCLIP_API_KEY    only needed in non-local-trusted deployments
 *
 * Pass --confirm to actually delete; without it, the script only prints
 * what it would do.
 */
import { rm } from "node:fs/promises";
import { M365_SYNC_STATE_FILE } from "./lib/paths.js";
import { readState } from "./lib/state.js";

const API_URL = process.env.PAPERCLIP_API_URL?.replace(/\/+$/, "");
const API_KEY = process.env.PAPERCLIP_API_KEY ?? null;
if (!API_URL) {
  console.error("Set PAPERCLIP_API_URL.");
  process.exit(1);
}

const confirm = process.argv.includes("--confirm");

async function deleteIssue(issueId: string): Promise<{ ok: boolean; err?: string }> {
  const headers: Record<string, string> = {};
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
  const res = await fetch(`${API_URL}/api/issues/${issueId}`, {
    method: "DELETE",
    headers,
  });
  if (res.ok || res.status === 404) return { ok: true };
  return { ok: false, err: `${res.status} ${await res.text()}` };
}

async function main(): Promise<void> {
  const state = await readState();
  const entries = Object.entries(state.items);
  console.log(`Mapping has ${entries.length} sync-created issue(s).`);
  if (entries.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (!confirm) {
    console.log("\nDRY RUN — would delete:");
    for (const [todoId, entry] of entries) {
      console.log(`  - ${entry.issueIdentifier ?? entry.issueId}  (todo=${todoId.slice(0, 16)}…)`);
    }
    console.log("\nRe-run with --confirm to actually delete and reset state.");
    return;
  }

  let deleted = 0;
  let failed = 0;
  for (const [, entry] of entries) {
    const r = await deleteIssue(entry.issueId);
    if (r.ok) {
      deleted += 1;
      process.stdout.write(".");
    } else {
      failed += 1;
      console.log(`\nFAILED ${entry.issueIdentifier ?? entry.issueId}: ${r.err}`);
    }
  }
  console.log(`\nDeleted ${deleted} issue(s), ${failed} failed.`);

  await rm(M365_SYNC_STATE_FILE, { force: true });
  console.log(`Cleared state at ${M365_SYNC_STATE_FILE}.`);
  console.log("\nNext `sync.ts` run will recreate the issues with current enrichment logic.");
}

main().catch((err) => {
  console.error("reset failed:", err.message);
  process.exit(1);
});
