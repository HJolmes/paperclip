/**
 * Push the AGENTS.md bodies of the Henning-personal-ops agents into the
 * live Paperclip instance. Resolves agent IDs by name (via the
 * `GET /api/companies/:id/agents` endpoint) so the script keeps working
 * across re-imports.
 *
 * Required env:
 *   PAPERCLIP_API_URL    e.g. http://localhost:3100
 *   PAPERCLIP_COMPANY_ID id of the henning-personal-ops company
 *
 * Auth is picked up automatically, in this order:
 *   1. PAPERCLIP_API_KEY env var
 *   2. ~/.paperclip/auth.json (the same store paperclipai CLI writes via
 *      `paperclipai auth login`)
 *
 * Usage:
 *   pnpm dlx tsx jolmes/scripts/push-agent-prompts.ts             # push all known agents
 *   pnpm dlx tsx jolmes/scripts/push-agent-prompts.ts <name>      # push one agent
 *   pnpm dlx tsx jolmes/scripts/push-agent-prompts.ts --dry-run   # show planned diffs only
 */
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

type AgentBinding = { name: string; file: string };

const AGENTS: AgentBinding[] = [
  {
    name: "m365-triage",
    file: "companies/henning-personal-ops/agents/m365-triage/AGENTS.md",
  },
  {
    name: "productivity-lead",
    file: "companies/henning-personal-ops/agents/productivity-lead/AGENTS.md",
  },
];

const API_URL = process.env.PAPERCLIP_API_URL?.replace(/\/+$/, "");
const COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID;

if (!API_URL) {
  console.error("Set PAPERCLIP_API_URL (e.g. http://localhost:3100).");
  process.exit(1);
}
if (!COMPANY_ID) {
  console.error("Set PAPERCLIP_COMPANY_ID. Find it with: pnpm paperclipai company list");
  process.exit(1);
}

function loadStoredBoardToken(apiBase: string): string | null {
  const storePath =
    process.env.PAPERCLIP_AUTH_STORE?.trim() ||
    resolve(homedir(), ".paperclip", "auth.json");
  try {
    const raw = readFileSync(storePath, "utf8");
    const parsed = JSON.parse(raw) as {
      credentials?: Record<string, { token?: string }>;
    };
    const normalized = apiBase.trim().replace(/\/+$/, "");
    const token = parsed.credentials?.[normalized]?.token;
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

const API_KEY = process.env.PAPERCLIP_API_KEY ?? loadStoredBoardToken(API_URL);
if (!API_KEY) {
  console.warn(
    "No auth token found. Tried PAPERCLIP_API_KEY and ~/.paperclip/auth.json. " +
      "If the server requires auth, run `pnpm paperclipai auth login` first.",
  );
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyName = args.find((a: string) => !a.startsWith("--"));

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) h.Authorization = `Bearer ${API_KEY}`;
  return h;
}

function stripFrontmatter(raw: string): string {
  const m = raw.match(/^---\n[\s\S]*?\n---\n/);
  return m ? raw.slice(m[0].length) : raw;
}

async function fetchAgentsForCompany(): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(`${API_URL}/api/companies/${COMPANY_ID}/agents`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`GET agents failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as Array<{ id: string; name: string }>;
}

async function pushOne(agent: AgentBinding, id: string): Promise<void> {
  const raw = await readFile(resolve(agent.file), "utf8");
  const body = stripFrontmatter(raw).trimStart();
  if (dryRun) {
    console.log(`[dry] ${agent.name} (${id}) ← ${agent.file} (${body.length} chars)`);
    return;
  }
  const res = await fetch(`${API_URL}/api/agents/${id}/instructions-bundle/file`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ path: "AGENTS.md", content: body }),
  });
  if (!res.ok) {
    throw new Error(`PUT ${agent.name} failed (${res.status}): ${await res.text()}`);
  }
  console.log(`OK  ${agent.name} (${id}) ← ${agent.file} (${body.length} chars)`);
}

async function main(): Promise<void> {
  const wanted = onlyName ? AGENTS.filter((a) => a.name === onlyName) : AGENTS;
  if (wanted.length === 0) {
    console.error(`Unknown agent name: ${onlyName}. Known: ${AGENTS.map((a) => a.name).join(", ")}`);
    process.exit(1);
  }

  const live = await fetchAgentsForCompany();
  const byName = new Map(live.map((a) => [a.name.toLowerCase(), a.id] as const));

  let failed = 0;
  for (const agent of wanted) {
    const id = byName.get(agent.name.toLowerCase());
    if (!id) {
      console.warn(
        `SKIP ${agent.name}: no live agent with that name in company ${COMPANY_ID}. ` +
          `Known: ${live.map((a) => a.name).join(", ")}`,
      );
      failed += 1;
      continue;
    }
    try {
      await pushOne(agent, id);
    } catch (err) {
      console.error((err as Error).message);
      failed += 1;
    }
  }
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("push failed:", err.message);
  process.exit(1);
});
