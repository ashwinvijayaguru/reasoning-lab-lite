/**
 * Evidence checks applied to EVERY comparator output (model or rule-based) before
 * anything is stored or shown. Findings that fail are dropped and counted — never
 * "repaired" into something the comparator did not support.
 */
import type { ComparatorRaw, Dimension, EvidenceStatus } from "./schemas";
import { BOILERPLATE } from "./explanation";

export type Side = "human" | "reference";

export interface Finding {
  id: string;
  dimension: Dimension;
  side: Side;
  observation: string;
  evidence_excerpt: string | null;
  character_offsets: [number, number] | null;
  constraint_id: string | null;
  evidence_status: EvidenceStatus;
  review_state: "automated_provisional" | "human_confirmed" | "human_corrected";
}

export type RejectionReason =
  | "invented_excerpt"
  | "excerpt_on_not_stated"
  | "missing_excerpt"
  | "boilerplate_excerpt"
  | "unknown_constraint"
  | "constraint_required"
  | "unsupported_number"
  | "mental_state_claim"
  | "duplicate";

export interface Rejection {
  reason: RejectionReason;
  dimension: Dimension | "alternatives_list";
  side: Side;
}

export interface AlternativesSummary {
  count: number;
  excerpts: { text: string; offsets: [number, number] }[];
}

export interface CheckedComparison {
  findings: Finding[];
  alternatives: Record<Side, AlternativesSummary>;
  rejected: Rejection[];
}

const MENTAL_STATE = /\b(thought|thinks|thinking|realis(?:e|ed)|realiz(?:e|ed)|forgot|forgets|didn'?t (?:consider|think|notice)|did not (?:consider|think|notice)|failed to (?:consider|think|notice)|was aware|unaware|intended|believes?|knew|ignored)\b/i;

const STOP = new Set("a an the and or of to in on for with at by from is are be it this that as into then than".split(" "));

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9$\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t && !STOP.has(t)),
  );
}

/** True when every content word of the shorter text appears in the longer one. */
export function contained(a: string, b: string): boolean {
  const A = tokens(a);
  const B = tokens(b);
  const [small, big] = A.size <= B.size ? [A, B] : [B, A];
  if (!small.size) return true;
  for (const t of small) if (!big.has(t)) return false;
  return true;
}

export function jaccard(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function numbersIn(s: string): string[] {
  return s.match(/\d+(?:[.,]\d+)*/g) ?? [];
}

function isBoilerplate(excerpt: string): boolean {
  let t = excerpt;
  for (const b of BOILERPLATE) t = t.split(b).join(" ");
  return (t.match(/[a-z0-9]/gi)?.length ?? 0) < 3;
}

/** Locate an excerpt; returns offsets only for an exact, unique-or-first match. */
export function locate(text: string, excerpt: string): [number, number] | null {
  const i = text.indexOf(excerpt);
  return i < 0 ? null : [i, i + excerpt.length];
}

export function checkComparison(args: {
  raw: ComparatorRaw;
  mapping: { A: Side; B: Side };
  texts: Record<Side, string>;
  constraintIds: string[];
  /** The generated "Final answer" line of each side; quotes from it are not explanation evidence. */
  answerRanges?: Record<Side, [number, number]>;
  idPrefix?: string;
}): CheckedComparison {
  const { raw, mapping, texts, constraintIds } = args;
  const findings: Finding[] = [];
  const rejected: Rejection[] = [];
  const seen = new Set<string>();
  let n = 0;
  const inAnswerLine = (side: Side, o: [number, number]) => {
    const r = args.answerRanges?.[side];
    return !!r && o[0] < r[1] && r[0] < o[1];
  };

  for (const f of raw.findings) {
    const side = mapping[f.response_label];
    const reject = (reason: RejectionReason) => rejected.push({ reason, dimension: f.dimension, side });

    if (f.constraint_id !== null && !constraintIds.includes(f.constraint_id)) { reject("unknown_constraint"); continue; }
    if (f.dimension === "constraints" && f.constraint_id === null) { reject("constraint_required"); continue; }
    if (MENTAL_STATE.test(f.observation)) { reject("mental_state_claim"); continue; }

    let offsets: [number, number] | null = null;
    let excerpt = f.evidence_excerpt;
    if (f.evidence_status === "not_stated") {
      if (excerpt !== null) { reject("excerpt_on_not_stated"); continue; }
    } else {
      if (excerpt === null) {
        if (f.evidence_status !== "unclear") { reject("missing_excerpt"); continue; }
      } else {
        offsets = locate(texts[side], excerpt);
        if (!offsets) { reject("invented_excerpt"); continue; }
        if (isBoilerplate(excerpt) || inAnswerLine(side, offsets)) { reject("boilerplate_excerpt"); continue; }
      }
    }
    const nums = numbersIn(f.observation);
    if (nums.length && (!excerpt || !nums.every((x) => excerpt!.includes(x)))) { reject("unsupported_number"); continue; }

    const key = `${side}|${f.dimension}|${f.constraint_id ?? ""}`;
    if (f.dimension !== "alternatives" && seen.has(key)) { reject("duplicate"); continue; }
    seen.add(key);

    findings.push({
      id: `${args.idPrefix ?? "f"}${++n}`,
      dimension: f.dimension,
      side,
      observation: f.observation.trim(),
      evidence_excerpt: excerpt,
      character_offsets: offsets,
      constraint_id: f.constraint_id,
      evidence_status: f.evidence_status,
      review_state: "automated_provisional",
    });
  }

  // Alternatives: count distinct, verified quotes. Paraphrases (high word overlap),
  // fragments of an already-counted option, and overlapping quotes collapse into one, so longer text does not inflate counts.
  const alternatives: Record<Side, AlternativesSummary> = { human: { count: 0, excerpts: [] }, reference: { count: 0, excerpts: [] } };
  for (const a of raw.alternatives) {
    const side = mapping[a.response_label];
    const offsets = locate(texts[side], a.excerpt);
    if (!offsets) { rejected.push({ reason: "invented_excerpt", dimension: "alternatives_list", side }); continue; }
    if (isBoilerplate(a.excerpt) || inAnswerLine(side, offsets)) { rejected.push({ reason: "boilerplate_excerpt", dimension: "alternatives_list", side }); continue; }
    const list = alternatives[side].excerpts;
    const dup = list.some(
      (e) => jaccard(e.text, a.excerpt) >= 0.6 || contained(e.text, a.excerpt) || (offsets[0] < e.offsets[1] && e.offsets[0] < offsets[1]),
    );
    if (dup) { rejected.push({ reason: "duplicate", dimension: "alternatives_list", side }); continue; }
    list.push({ text: a.excerpt, offsets });
  }
  alternatives.human.count = alternatives.human.excerpts.length;
  alternatives.reference.count = alternatives.reference.excerpts.length;

  return { findings, alternatives, rejected };
}

const STATUS_RANK: Record<EvidenceStatus, number> = { explicit: 3, contradicted: 2, unclear: 1, not_stated: 0 };

export interface ConstraintRow {
  constraint_id: string;
  human: { status: EvidenceStatus; finding_id: string | null };
  reference: { status: EvidenceStatus; finding_id: string | null };
}

/** One row per public constraint; absence of a verified quote is shown as "not stated". */
export function constraintMatrix(findings: Finding[], constraintIds: string[]): ConstraintRow[] {
  return constraintIds.map((cid) => {
    const pick = (side: Side) => {
      const fs = findings.filter((f) => f.dimension === "constraints" && f.constraint_id === cid && f.side === side);
      fs.sort((a, b) => STATUS_RANK[b.evidence_status] - STATUS_RANK[a.evidence_status]);
      return fs[0] ? { status: fs[0].evidence_status, finding_id: fs[0].id } : { status: "not_stated" as EvidenceStatus, finding_id: null };
    };
    return { constraint_id: cid, human: pick("human"), reference: pick("reference") };
  });
}
