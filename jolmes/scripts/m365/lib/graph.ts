import { readM365Secret, writeM365Secret, type M365Secret } from "./secrets.js";

const AUTH_BASE = "https://login.microsoftonline.com";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
export const DEFAULT_SCOPE = "Tasks.ReadWrite Mail.Read offline_access User.Read";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};

let cached: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  const secret = await readM365Secret();
  if (!secret) {
    throw new Error(
      "M365 secret missing. Run: pnpm tsx jolmes/scripts/m365/bootstrap.ts",
    );
  }
  const body = new URLSearchParams({
    client_id: secret.clientId,
    grant_type: "refresh_token",
    refresh_token: secret.refreshToken,
    scope: secret.scope || DEFAULT_SCOPE,
  });
  const res = await fetch(`${AUTH_BASE}/${secret.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as TokenResponse;
  if (json.refresh_token && json.refresh_token !== secret.refreshToken) {
    const next: M365Secret = {
      ...secret,
      refreshToken: json.refresh_token,
      scope: json.scope ?? secret.scope,
      obtainedAt: new Date().toISOString(),
    };
    await writeM365Secret(next);
  }
  cached = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

export async function graph<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken();
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph ${init.method ?? "GET"} ${path} failed (${res.status}): ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Outlook/To-Do item ids are base64 strings; their trailing '=' padding
 * confuses the Graph path parser even when URL-encoded. Strip padding,
 * then URL-encode for safety against future special chars.
 */
export function pathId(id: string): string {
  return encodeURIComponent(id.replace(/=+$/, ""));
}

export async function graphList<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = path;
  while (next) {
    const page: { value: T[]; "@odata.nextLink"?: string } = await graph(next);
    out.push(...page.value);
    next = page["@odata.nextLink"] ?? null;
  }
  return out;
}
