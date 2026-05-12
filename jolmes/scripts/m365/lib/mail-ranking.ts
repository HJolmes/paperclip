/**
 * Ranks and filters Graph mail search hits so the comment on a synced
 * Paperclip issue surfaces *the actual thread*, not bystander mentions.
 *
 * Background: Graph $search is full-text and scores body matches and
 * subject matches alike. For a To-Do like "260326 Reinigung Verl" that
 * means Henning's own daily "Abschlussbericht E-Mail Manager" digest
 * (which lists every processed subject in the body) outranks the real
 * thread "WG: 260326 Reinigung Verl". We re-rank locally: subject hits
 * beat body hits, and known digest subjects are dropped entirely.
 */
export type RankableMessage = {
  id: string;
  subject?: string;
  conversationId?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  bodyPreview?: string;
  webLink?: string;
};

export type MatchKind = "subject-exact" | "subject-reply" | "body-only";

export type ScoredMessage<T extends RankableMessage> = {
  message: T;
  score: number;
  matchKind: MatchKind;
};

const DIGEST_SUBJECT = /Abschlussbericht\s+E-?Mail\s+Manager/i;
const REPLY_PREFIX = /^\s*(AW|WG|Re|Fwd|FW|RE|Antw|WG\.|RE\.|AW\.)\s*:\s*/i;

const norm = (s: string | undefined | null): string =>
  (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

const stripReplyPrefix = (subject: string): string =>
  subject.replace(REPLY_PREFIX, "").trim();

const scoreOne = (
  query: string,
  message: RankableMessage,
): { score: number; matchKind: MatchKind } => {
  const subject = message.subject ?? "";
  const subN = norm(subject);
  const subStripped = norm(stripReplyPrefix(subject));
  const qN = norm(query);

  if (!qN) return { score: 0, matchKind: "body-only" };

  if (subN === qN || subStripped === qN) {
    return { score: 100, matchKind: "subject-exact" };
  }
  if (subN.includes(qN)) {
    return { score: 80, matchKind: "subject-reply" };
  }
  // Token-overlap on subject: at least half of query words appear in subject.
  const qTokens = qN.split(" ").filter((t) => t.length >= 3);
  if (qTokens.length > 0) {
    const hits = qTokens.filter((t) => subN.includes(t)).length;
    if (hits / qTokens.length >= 0.5) {
      return { score: 50, matchKind: "subject-reply" };
    }
  }
  return { score: 1, matchKind: "body-only" };
};

export function rankAndFilterMails<T extends RankableMessage>(
  query: string,
  mails: T[],
): ScoredMessage<T>[] {
  const scored: ScoredMessage<T>[] = [];
  for (const m of mails) {
    if (DIGEST_SUBJECT.test(m.subject ?? "")) continue;
    const { score, matchKind } = scoreOne(query, m);
    scored.push({ message: m, score, matchKind });
  }

  // Dedup by conversationId, keep highest score; tiebreak by recency
  // (the more recent mail in the same thread is the more useful seed).
  // Mails without conversationId are kept individually (defensive —
  // Graph normally returns it, but $select can drop it).
  const byConv = new Map<string, ScoredMessage<T>>();
  const unkeyed: ScoredMessage<T>[] = [];
  for (const s of scored) {
    const key = s.message.conversationId;
    if (!key) {
      unkeyed.push(s);
      continue;
    }
    const prev = byConv.get(key);
    if (!prev) {
      byConv.set(key, s);
      continue;
    }
    if (s.score > prev.score) {
      byConv.set(key, s);
      continue;
    }
    if (s.score === prev.score) {
      const dPrev = prev.message.receivedDateTime ?? "";
      const dCur = s.message.receivedDateTime ?? "";
      if (dCur > dPrev) byConv.set(key, s);
    }
  }

  return [...byConv.values(), ...unkeyed].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    const ta = a.message.receivedDateTime ?? "";
    const tb = b.message.receivedDateTime ?? "";
    return ta < tb ? 1 : -1;
  });
}

export function bestMatchKind(scored: ScoredMessage<RankableMessage>[]): MatchKind | null {
  if (scored.length === 0) return null;
  return scored[0].matchKind;
}
