/**
 * One-shot cleanup for two flavours of leaked noise in M365-Inbox
 * issues. Both are leftovers from earlier sync-iterations:
 *
 *   (A) Descriptions polluted with the retired reverse-sync marker
 *       `--- Paperclip-Kommentare ---`. The reverse-sync wrote
 *       Paperclip comments back into the M365 To-Do task body;
 *       Microsoft persists that, so fresh `sync.ts` runs pick it up
 *       via task.body.content and bake it into the new Paperclip
 *       issue description.
 *
 *   (B) Sync comments containing `**Top-Treffer (Volltextsuche)**`.
 *       That was the Graph full-text fallback rendering — it produced
 *       confidently wrong results too often (digest mails, unrelated
 *       quotations). The rendering has been removed from `sync.ts`;
 *       this script deletes the comments that were already written.
 *
 * The script is idempotent: rerun anytime. Issues / comments without
 * the markers are skipped untouched.
 *
 * Required env (loaded from ~/.paperclip/state/m365-sync.env if you
 * source that file first):
 *   PAPERCLIP_API_URL
 *   PAPERCLIP_COMPANY_ID
 *   M365_PROJECT_ID
 *   PAPERCLIP_API_KEY    (agent bearer; agent must belong to the
 *                         same company)
 *
 * Modes:
 *   default       dry-run, prints what would change
 *   --confirm     actually PATCH each issue
 */

const API_URL = process.env.PAPERCLIP_API_URL?.replace(/\/+$/, "");
const API_KEY = process.env.PAPERCLIP_API_KEY ?? null;
const COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID;
const PROJECT_ID = process.env.M365_PROJECT_ID;

if (!API_URL || !COMPANY_ID || !PROJECT_ID) {
  console.error(
    "Required env missing. Need PAPERCLIP_API_URL, PAPERCLIP_COMPANY_ID, M365_PROJECT_ID. " +
      "Tip: `set -a; source ~/.paperclip/state/m365-sync.env; set +a` before running.",
  );
  process.exit(1);
}

const confirm = process.argv.includes("--confirm");
const DESCRIPTION_MARKER = "--- Paperclip-Kommentare ---";
const FULLTEXT_COMMENT_MARKER = "**Top-Treffer (Volltextsuche)**";

type ApiIssue = {
  id: string;
  identifier?: string;
  title?: string;
  status?: string;
  description?: string;
};

type ApiComment = {
  id: string;
  body?: string;
  authorAgentId?: string | null;
};

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers = { ...extra };
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
  return headers;
}

async function listProjectIssues(): Promise<ApiIssue[]> {
  const url = `${API_URL}/api/companies/${COMPANY_ID}/issues?projectId=${PROJECT_ID}&limit=500`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`list issues -> ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { value?: ApiIssue[] } | ApiIssue[];
  return Array.isArray(data) ? data : (data.value ?? []);
}

async function patchDescription(issueId: string, description: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/issues/${issueId}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ description }),
  });
  if (!res.ok) {
    throw new Error(`PATCH ${issueId} -> ${res.status} ${await res.text()}`);
  }
}

async function listIssueComments(issueId: string): Promise<ApiComment[]> {
  const res = await fetch(`${API_URL}/api/issues/${issueId}/comments`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      `list comments ${issueId} -> ${res.status} ${await res.text()}`,
    );
  }
  const data = (await res.json()) as { value?: ApiComment[] } | ApiComment[];
  return Array.isArray(data) ? data : (data.value ?? []);
}

async function deleteComment(issueId: string, commentId: string): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/issues/${issueId}/comments/${commentId}`,
    { method: "DELETE", headers: authHeaders() },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(
      `DELETE comment ${commentId} -> ${res.status} ${await res.text()}`,
    );
  }
}

function stripBleed(description: string): string {
  const idx = description.indexOf(DESCRIPTION_MARKER);
  if (idx === -1) return description;
  return description.slice(0, idx).replace(/\s+$/u, "") + "\n";
}

async function main(): Promise<void> {
  const issues = await listProjectIssues();
  console.log(`Inspecting ${issues.length} issue(s) in project ${PROJECT_ID}.`);

  // (A) collect description-bleed targets
  const descTargets: Array<{ issue: ApiIssue; next: string }> = [];
  for (const issue of issues) {
    const desc = issue.description ?? "";
    if (!desc.includes(DESCRIPTION_MARKER)) continue;
    descTargets.push({ issue, next: stripBleed(desc) });
  }

  // (B) collect full-text-comment-noise targets
  const commentTargets: Array<{ issue: ApiIssue; comment: ApiComment }> = [];
  for (const issue of issues) {
    let comments: ApiComment[] = [];
    try {
      comments = await listIssueComments(issue.id);
    } catch (err) {
      console.log(
        `  skip comments for ${issue.identifier ?? issue.id}: ${(err as Error).message}`,
      );
      continue;
    }
    for (const c of comments) {
      if ((c.body ?? "").includes(FULLTEXT_COMMENT_MARKER)) {
        commentTargets.push({ issue, comment: c });
      }
    }
  }

  const total = descTargets.length + commentTargets.length;
  if (total === 0) {
    console.log("Nothing to clean. Done.");
    return;
  }

  if (!confirm) {
    if (descTargets.length > 0) {
      console.log(`\nDRY RUN — would strip description bleed from ${descTargets.length} issue(s):`);
      for (const { issue } of descTargets) {
        console.log(`  ${issue.identifier ?? issue.id}  ${issue.title ?? ""}`);
      }
    }
    if (commentTargets.length > 0) {
      console.log(`\nDRY RUN — would delete ${commentTargets.length} fulltext-noise comment(s):`);
      for (const { issue, comment } of commentTargets) {
        console.log(`  ${issue.identifier ?? issue.id} comment=${comment.id}`);
      }
    }
    console.log("\nRe-run with --confirm to apply.");
    return;
  }

  let okDesc = 0;
  let failDesc = 0;
  for (const { issue, next } of descTargets) {
    try {
      await patchDescription(issue.id, next);
      okDesc += 1;
      process.stdout.write(".");
    } catch (err) {
      failDesc += 1;
      console.log(
        `\nFAILED desc ${issue.identifier ?? issue.id}: ${(err as Error).message}`,
      );
    }
  }
  if (descTargets.length > 0) {
    console.log(`\nDescription cleanup: ${okDesc} ok, ${failDesc} failed.`);
  }

  let okCmt = 0;
  let failCmt = 0;
  for (const { issue, comment } of commentTargets) {
    try {
      await deleteComment(issue.id, comment.id);
      okCmt += 1;
      process.stdout.write(".");
    } catch (err) {
      failCmt += 1;
      console.log(
        `\nFAILED comment ${issue.identifier ?? issue.id}/${comment.id}: ${(err as Error).message}`,
      );
    }
  }
  if (commentTargets.length > 0) {
    console.log(`\nComment cleanup: ${okCmt} ok, ${failCmt} failed.`);
  }
}

main().catch((err) => {
  console.error("clean-comment-bleed failed:", err.message);
  process.exit(1);
});
