import { graph, pathId } from "./graph.js";
import { readM365Secret } from "./secrets.js";

export type ConversationMessage = {
  id: string;
  subject: string;
  conversationId?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  bodyPreview?: string;
  webLink?: string;
};

export type ThreadSummary = {
  conversationId: string;
  messages: ConversationMessage[];
  selfAddress: string | null;
  lastFromSelf: ConversationMessage | null;
  lastFromOther: ConversationMessage | null;
};

let cachedSelf: string | null | undefined;

async function getSelfAddress(): Promise<string | null> {
  if (cachedSelf !== undefined) return cachedSelf;
  const secret = await readM365Secret();
  if (secret?.account) {
    cachedSelf = secret.account.toLowerCase();
    return cachedSelf;
  }
  try {
    const me = await graph<{ mail?: string; userPrincipalName?: string }>(
      "/me?$select=mail,userPrincipalName",
    );
    cachedSelf = (me.mail ?? me.userPrincipalName ?? "").toLowerCase() || null;
  } catch {
    cachedSelf = null;
  }
  return cachedSelf;
}

const isSelf = (m: ConversationMessage, self: string | null): boolean => {
  if (!self) return false;
  return (m.from?.emailAddress?.address ?? "").toLowerCase() === self;
};

export async function loadMessage(
  messageId: string,
): Promise<ConversationMessage | null> {
  // No $select — comma in the value trips Graph's URL parser on this tenant.
  // Response is small enough that fetching all fields is fine.
  //
  // Outlook flagged-mail-to-To-Do creates a linkedResource whose externalId
  // is the *immutable* message id. Graph rejects those when read without
  // `Prefer: IdType="ImmutableId"`. We try the default form first (works
  // for normal ids) and retry with the Immutable header on failure, which
  // is the format flagged-mail tasks need.
  try {
    return await graph<ConversationMessage>(`/me/messages/${pathId(messageId)}`);
  } catch {
    try {
      return await graph<ConversationMessage>(
        `/me/messages/${pathId(messageId)}`,
        { headers: { Prefer: 'IdType="ImmutableId"' } },
      );
    } catch {
      return null;
    }
  }
}

export async function loadThread(
  conversationId: string,
  maxMessages = 25,
): Promise<ConversationMessage[]> {
  // $filter and $orderby contain spaces and quotes that must be URL-encoded.
  const filter = `conversationId eq '${conversationId}'`;
  const url =
    `/me/messages` +
    `?$top=${maxMessages}` +
    `&$filter=${encodeURIComponent(filter)}` +
    `&$orderby=${encodeURIComponent("receivedDateTime asc")}`;
  try {
    const res = await graph<{ value: ConversationMessage[] }>(url, {
      headers: { ConsistencyLevel: "eventual" },
    });
    return res.value;
  } catch {
    return [];
  }
}

export async function summariseThread(
  messageId: string,
): Promise<ThreadSummary | null> {
  const seed = await loadMessage(messageId);
  if (!seed?.conversationId) return null;
  const self = await getSelfAddress();
  const messages = await loadThread(seed.conversationId);
  if (messages.length === 0) return null;
  let lastFromSelf: ConversationMessage | null = null;
  let lastFromOther: ConversationMessage | null = null;
  for (const m of messages) {
    if (isSelf(m, self)) lastFromSelf = m;
    else lastFromOther = m;
  }
  return {
    conversationId: seed.conversationId,
    messages,
    selfAddress: self,
    lastFromSelf,
    lastFromOther,
  };
}

export function renderThread(thread: ThreadSummary): string {
  const lines: string[] = ["## Mail-Thread", ""];

  // status line
  const last = thread.messages[thread.messages.length - 1];
  if (last) {
    const lastIsSelf = thread.selfAddress
      ? (last.from?.emailAddress?.address ?? "").toLowerCase() === thread.selfAddress
      : false;
    const when = last.receivedDateTime?.slice(0, 10) ?? "?";
    if (lastIsSelf) {
      lines.push(
        `**Status:** Du hast zuletzt am ${when} geantwortet — Ball liegt beim Gegenüber.`,
      );
    } else {
      const who =
        last.from?.emailAddress?.name ??
        last.from?.emailAddress?.address ??
        "Gegenüber";
      lines.push(`**Status:** Letzte Mail von ${who} am ${when} — du hast noch nicht geantwortet.`);
    }
    lines.push("");
  }

  // chronological summary
  lines.push(`**Verlauf** (${thread.messages.length} Mails):`, "");
  for (const m of thread.messages) {
    const who =
      m.from?.emailAddress?.name ??
      m.from?.emailAddress?.address ??
      "unbekannt";
    const when = m.receivedDateTime?.slice(0, 16).replace("T", " ") ?? "?";
    const tag = thread.selfAddress &&
      (m.from?.emailAddress?.address ?? "").toLowerCase() === thread.selfAddress
      ? " *(du)*"
      : "";
    const preview = (m.bodyPreview ?? "").replace(/\s+/g, " ").slice(0, 200);
    const linkPart = m.webLink ? ` · [öffnen](${m.webLink})` : "";
    lines.push(`- **${when}** — ${who}${tag}${linkPart}`);
    if (preview) lines.push(`  > ${preview}`);
  }

  return lines.join("\n");
}
