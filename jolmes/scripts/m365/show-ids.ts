/**
 * Print Paperclip company + project + agent ids needed for sync setup.
 *
 * Required env:
 *   PAPERCLIP_API_URL    e.g. http://localhost:3100
 *   PAPERCLIP_API_KEY    bearer token from UI -> Settings -> API Keys
 *
 * Optional env:
 *   PAPERCLIP_COMPANY_PREFIX   e.g. HEN  (used to filter by URL prefix)
 *   PAPERCLIP_COMPANY_ID       skip lookup if you already have it
 */

const API_URL = process.env.PAPERCLIP_API_URL?.replace(/\/+$/, "");
const API_KEY = process.env.PAPERCLIP_API_KEY ?? null;
if (!API_URL) {
  console.error("Set PAPERCLIP_API_URL first (e.g. http://localhost:3100).");
  process.exit(1);
}

async function call<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
  const res = await fetch(`${API_URL}${path}`, { headers });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

type Company = { id: string; name: string; urlPrefix?: string; shortName?: string };
type Project = { id: string; name: string; slug?: string };
type Agent = { id: string; name: string; slug?: string; urlKey?: string };

async function main(): Promise<void> {
  let companyId = process.env.PAPERCLIP_COMPANY_ID?.trim();
  if (!companyId) {
    const list = await call<{ value?: Company[] } | Company[]>(`/api/companies`);
    const companies = (Array.isArray(list) ? list : (list.value ?? [])) as Company[];
    const prefix = process.env.PAPERCLIP_COMPANY_PREFIX?.trim().toUpperCase();
    const match = prefix
      ? companies.find((c) => c.urlPrefix?.toUpperCase() === prefix || c.shortName?.toUpperCase() === prefix)
      : null;
    if (match) {
      companyId = match.id;
      console.log(`Company  ${match.name}  id=${match.id}  prefix=${match.urlPrefix ?? match.shortName ?? ""}`);
    } else {
      console.log("# Companies you can access:");
      for (const c of companies) {
        console.log(`  - ${c.name}  id=${c.id}  prefix=${c.urlPrefix ?? c.shortName ?? "?"}`);
      }
      if (!prefix) {
        console.log("\nSet PAPERCLIP_COMPANY_PREFIX=HEN (or paste id) and re-run.");
      }
      return;
    }
  } else {
    const c = await call<Company>(`/api/companies/${companyId}`);
    console.log(`Company  ${c.name}  id=${c.id}  prefix=${c.urlPrefix ?? c.shortName ?? ""}`);
  }

  const projects = await call<{ value?: Project[] } | Project[]>(
    `/api/companies/${companyId}/projects`,
  );
  const projectList = Array.isArray(projects) ? projects : (projects.value ?? []);
  console.log("\nProjects:");
  for (const p of projectList) {
    console.log(`  - ${p.name}  id=${p.id}  slug=${p.slug ?? "?"}`);
  }

  const agents = await call<{ value?: Agent[] } | Agent[]>(
    `/api/companies/${companyId}/agents`,
  );
  const agentList = Array.isArray(agents) ? agents : (agents.value ?? []);
  console.log("\nAgents:");
  for (const a of agentList) {
    console.log(`  - ${a.name}  id=${a.id}  urlKey=${a.urlKey ?? a.slug ?? "?"}`);
  }
}

main().catch((err) => {
  console.error("show-ids failed:", err.message);
  process.exit(1);
});
