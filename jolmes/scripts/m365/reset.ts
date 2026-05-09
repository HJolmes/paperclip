/**
 * Wipe sync-created Paperclip issues and clear the local mapping state so
 * the next sync.ts run rebuilds everything from scratch (with current
 * enrichment logic).
 *
 * Two modes (combinable):
 *   default          retire issues listed in the local mapping state
 *   --from-project   also sweep the configured M365_PROJECT_ID for orphan
 *                    issues (description starts with "**Quelle:** Microsoft
 *                    To-Do") that are no longer in the mapping
 *
 * Required env:
 *   PAPERCLIP_API_URL      e.g. http://localhost:3100
 *   PAPERCLIP_COMPANY_ID
 *   M365_PROJECT_ID        (only for --from-project)
 *
 * Optional env:
 *   PAPERCLIP_API_KEY      only needed in non-local-trusted deployments
 *
 * Pass --confirm to actually retire; without it, the script only prints
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
const fromProject = process.argv.includes("--from-project");
const COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID;
const PROJECT_ID = process.env.M365_PROJECT_ID;
const SOURCE_MARKER = "**Quelle:** Microsoft To-Do";

type ApiIssue = {
  id: string;
  identifier?: string;
  title?: string;
  status?: string;
  description?: string;
};

async function listProjectIssues(): Promise<ApiIssue[]> {
  if (!COMPANY_ID || !PROJECT_ID) {
    throw new Error("--from-project requires PAPERCLIP_COMPANY_ID and M365_PROJECT_ID");
  }
  const headers: Record<string, string> = {};
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
  const url = `${API_URL}/api/companies/${COMPANY_ID}/issues?projectId=${PROJECT_ID}&limit=500`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`list issues -> ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { value?: ApiIssue[] } | ApiIssue[];
  return Array.isArray(data) ? data : (data.value ?? []);
}

async function retireIssue(issueId: string): Promise<{ ok: boolean; err?: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

  // First try a hard DELETE (works for issues without rich child rows).
  let res = await fetch(`${API_URL}/api/issues/${issueId}`, { method: "DELETE", headers });
  if (res.ok || res.status === 404) return { ok: true };

  // Fallback: cancel the issue. Always works, hides it from default filters.
  res = await fetch(`${API_URL}/api/issues/${issueId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      status: "cancelled",
      comment: "Cancelled by m365 reset script — replaced by a fresh sync run.",
    }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, err: `${res.status} ${await res.text()}` };
}

async function main(): Promise<void> {
  const state = await readState();
  const stateEntries = Object.entries(state.items);
  console.log(`Mapping has ${stateEntries.length} sync-created issue(s).`);

  let projectOrphans: ApiIssue[] = [];
  if (fromProject) {
    const all = await listProjectIssues();
    const mappedIds = new Set(stateEntries.map(([, e]) => e.issueId));
    projectOrphans = all.filter(
      (i) =>
        !mappedIds.has(i.id) &&
        i.status !== "cancelled" &&
        (i.description ?? "").includes(SOURCE_MARKER),
    );
    console.log(
      `Project sweep found ${all.length} issue(s) total; ${projectOrphans.length} orphans match marker.`,
    );
  }

  const total = stateEntries.length + projectOrphans.length;
  if (total === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (!confirm) {
    console.log("\nDRY RUN — would retire (delete or cancel):");
    for (const [, entry] of stateEntries) {
      console.log(`  [mapped]  ${entry.issueIdentifier ?? entry.issueId}`);
    }
    for (const i of projectOrphans) {
      console.log(`  [orphan]  ${i.identifier ?? i.id}  ${i.title ?? ""}`);
    }
    console.log("\nRe-run with --confirm to actually retire and reset state.");
    return;
  }

  let retired = 0;
  let failed = 0;
  const handle = async (issueId: string, label: string): Promise<void> => {
    const r = await retireIssue(issueId);
    if (r.ok) {
      retired += 1;
      process.stdout.write(".");
    } else {
      failed += 1;
      console.log(`\nFAILED ${label}: ${r.err}`);
    }
  };
  for (const [, entry] of stateEntries) {
    await handle(entry.issueId, entry.issueIdentifier ?? entry.issueId);
  }
  for (const i of projectOrphans) {
    await handle(i.id, i.identifier ?? i.id);
  }
  console.log(`\nRetired ${retired} issue(s), ${failed} failed.`);

  await rm(M365_SYNC_STATE_FILE, { force: true });
  console.log(`Cleared state at ${M365_SYNC_STATE_FILE}.`);
  console.log("\nNext `sync.ts` run will recreate the issues with current enrichment logic.");
}

main().catch((err) => {
  console.error("reset failed:", err.message);
  process.exit(1);
});
