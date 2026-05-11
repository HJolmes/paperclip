/**
 * Run locally:
 *   pnpm dlx tsx --test jolmes/scripts/m365/lib/mail-ranking.test.ts
 *
 * Pure-function tests, no Graph access required.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rankAndFilterMails,
  bestMatchKind,
  type RankableMessage,
} from "./mail-ranking.js";

const mk = (
  partial: Partial<RankableMessage> & { id: string; subject: string },
): RankableMessage => ({
  ...partial,
});

test("subject hit beats body-only digest mention", () => {
  const query = "260326 Reinigung Verl";
  const mails: RankableMessage[] = [
    mk({
      id: "1",
      subject: "Abschlussbericht E-Mail Manager - 08.04.2026",
      conversationId: "conv-digest",
      bodyPreview: "... 260326 Reinigung Verl ...",
    }),
    mk({
      id: "2",
      subject: "WG: 260326 Reinigung Verl",
      conversationId: "conv-real",
      bodyPreview: "Mit freundlichen Gruessen Henning",
    }),
  ];
  const ranked = rankAndFilterMails(query, mails);
  // Digest is filtered entirely; real thread wins.
  assert.equal(ranked.length, 1, "digest must be dropped");
  assert.equal(ranked[0].message.id, "2");
  // After stripping the "WG:" prefix the subject equals the query
  // verbatim, so this counts as an exact subject match.
  assert.equal(ranked[0].matchKind, "subject-exact");
});

test("exact subject beats reply-prefixed subject", () => {
  const query = "Reflexion Event & Ideen";
  const mails: RankableMessage[] = [
    mk({
      id: "a",
      subject: "AW: Reflexion Event & Ideen",
      conversationId: "x",
    }),
    mk({
      id: "b",
      subject: "Reflexion Event & Ideen",
      conversationId: "y",
    }),
  ];
  const ranked = rankAndFilterMails(query, mails);
  assert.equal(ranked[0].message.id, "b");
  assert.equal(ranked[0].matchKind, "subject-exact");
});

test("conversation dedup keeps highest-scored mail in thread", () => {
  const query = "Vertrag Alaoui";
  const mails: RankableMessage[] = [
    mk({
      id: "old",
      subject: "AW: Vertrag Alaoui",
      conversationId: "same",
      receivedDateTime: "2026-01-01T10:00:00Z",
    }),
    mk({
      id: "newer",
      subject: "WG: Vertrag Alaoui",
      conversationId: "same",
      receivedDateTime: "2026-05-01T10:00:00Z",
    }),
    mk({
      id: "noise",
      subject: "Newsletter",
      conversationId: "other",
      bodyPreview: "Vertrag Alaoui am Rande erwaehnt",
    }),
  ];
  const ranked = rankAndFilterMails(query, mails);
  assert.equal(ranked.length, 2, "one conv dedup, one body-only kept");
  assert.ok(["old", "newer"].includes(ranked[0].message.id));
  // Tiebreak by recency: newer wins.
  assert.equal(ranked[0].message.id, "newer");
});

test("no subject hit anywhere -> body-only with worst MatchKind", () => {
  const query = "Reflexion Event & Ideen";
  const mails: RankableMessage[] = [
    mk({
      id: "z",
      subject: "Wochenupdate",
      conversationId: "c1",
      bodyPreview: "... Reflexion Event & Ideen kurz erwaehnt ...",
    }),
  ];
  const ranked = rankAndFilterMails(query, mails);
  assert.equal(bestMatchKind(ranked), "body-only");
});

test("digest filter applies to all subject variants", () => {
  const query = "irgendwas";
  const mails: RankableMessage[] = [
    mk({ id: "d1", subject: "Abschlussbericht E-Mail Manager - 01.01.2026" }),
    mk({ id: "d2", subject: "Abschlussbericht EMail Manager (KW 12)" }),
    mk({ id: "d3", subject: "AW: Abschlussbericht E-Mail Manager" }),
  ];
  const ranked = rankAndFilterMails(query, mails);
  assert.equal(ranked.length, 0);
});

test("empty query returns scored zero, no crash", () => {
  const mails: RankableMessage[] = [mk({ id: "x", subject: "irgendwas" })];
  const ranked = rankAndFilterMails("", mails);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].score, 0);
});
