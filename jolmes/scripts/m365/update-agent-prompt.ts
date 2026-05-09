/**
 * Push the body of companies/henning-personal-ops/agents/m365-triage/AGENTS.md
 * into the live Paperclip agent record.
 *
 * The CLI's `company import --collision replace` is blocked on the safe
 * import route, so we rewrite the agent's instructions bundle directly.
 *
 * Required env:
 *   PAPERCLIP_API_URL    e.g. http://localhost:3100
 *
 * Usage:
 *   pnpm dlx tsx jolmes/scripts/m365/update-agent-prompt.ts <agent-id> <agents-md-path>
 *
 * Default arguments target the m365-triage agent in this repo.
 */
import { readFile } from "node:fs/promises";

const AGENT_ID = process.argv[2] ?? "909cbf0a-ceeb-4eff-9768-7870967601b1";
const FILE_PATH =
  process.argv[3] ?? "companies/henning-personal-ops/agents/m365-triage/AGENTS.md";
const API_URL = process.env.PAPERCLIP_API_URL?.replace(/\/+$/, "");
const API_KEY = process.env.PAPERCLIP_API_KEY ?? null;

if (!API_URL) {
  console.error("Set PAPERCLIP_API_URL.");
  process.exit(1);
}

function stripFrontmatter(raw: string): string {
  const m = raw.match(/^---\n[\s\S]*?\n---\n/);
  return m ? raw.slice(m[0].length) : raw;
}

async function main(): Promise<void> {
  const raw = await readFile(FILE_PATH, "utf8");
  const body = stripFrontmatter(raw).trimStart();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
  const res = await fetch(
    `${API_URL}/api/agents/${AGENT_ID}/instructions-bundle/file`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ path: "AGENTS.md", content: body }),
    },
  );
  if (!res.ok) {
    console.error(`PUT failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log(`OK. Updated agent ${AGENT_ID} with ${body.length} chars from ${FILE_PATH}.`);
}

main().catch((err) => {
  console.error("update failed:", err.message);
  process.exit(1);
});
