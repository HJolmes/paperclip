const apiUrl = (): string => {
  const url = process.env.PAPERCLIP_API_URL;
  if (!url) throw new Error("PAPERCLIP_API_URL not set (run inside a heartbeat or export it).");
  return url.replace(/\/+$/, "");
};

const apiKey = (): string | null => process.env.PAPERCLIP_API_KEY ?? null;

const runId = (): string | null => process.env.PAPERCLIP_RUN_ID ?? null;

export const companyId = (): string => {
  const id = process.env.PAPERCLIP_COMPANY_ID;
  if (!id) throw new Error("PAPERCLIP_COMPANY_ID not set.");
  return id;
};

export const agentId = (): string | null => process.env.PAPERCLIP_AGENT_ID ?? null;

const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.PAPERCLIP_API_TIMEOUT_MS ?? "", 10) || 15_000;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const key = apiKey();
  if (key) headers.set("Authorization", `Bearer ${key}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const rid = runId();
  if (rid) headers.set("X-Paperclip-Run-Id", rid);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${apiUrl()}${path}`, { ...init, headers, signal: ctrl.signal });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      throw new Error(`Paperclip ${init.method ?? "GET"} ${path} timed out after ${DEFAULT_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paperclip ${init.method ?? "GET"} ${path} failed (${res.status}): ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type IssueStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "blocked"
  | "cancelled";

export type Issue = {
  id: string;
  identifier?: string;
  title: string;
  status: IssueStatus;
  priority?: "critical" | "high" | "medium" | "low";
  description?: string;
  projectId?: string;
};

export async function createIssue(input: {
  title: string;
  description?: string;
  status?: IssueStatus;
  priority?: "critical" | "high" | "medium" | "low";
  projectId?: string;
  assigneeAgentId?: string;
  parentId?: string;
}): Promise<Issue> {
  return call<Issue>(`/api/companies/${companyId()}/issues`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function patchIssue(
  issueId: string,
  patch: Partial<{
    title: string;
    status: IssueStatus;
    priority: "critical" | "high" | "medium" | "low";
    description: string;
    comment: string;
  }>,
): Promise<Issue> {
  return call<Issue>(`/api/issues/${issueId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function addComment(issueId: string, body: string): Promise<void> {
  await call(`/api/issues/${issueId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export async function getIssue(issueId: string): Promise<Issue> {
  return call<Issue>(`/api/issues/${issueId}`);
}
