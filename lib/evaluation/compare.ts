/**
 * Explanation comparison: blind A/B assignment, rule-based comparator, evidence
 * checks, remapping back to "human" / "reference". Pure and deterministic apart from
 * the A/B coin flip (which can be injected for tests).
 */
import crypto from "node:crypto";
import type { Rubric, PublicPayload } from "@/lib/problems/types";
import { checkComparison, constraintMatrix, type AlternativesSummary, type ConstraintRow, type Finding, type Side } from "./evidence";
import type { ExplanationDoc } from "./explanation";
import { ruleCompare, RULE_COMPARATOR_VERSION } from "./rule-comparator";

export const EXPLANATION_FORMAT_VERSION = "explanation-doc@1";
export const COMPARATOR_VERSION = RULE_COMPARATOR_VERSION;

export interface StoredComparison {
  explanation_format_version: string;
  text_hashes: Record<Side, string>;
  ab_mapping: { A: Side; B: Side };
  findings: Finding[];
  alternatives: Record<Side, AlternativesSummary>;
  constraint_matrix: ConstraintRow[];
  rejected_counts: Record<string, number>;
  rejected_total: number;
  limitations: string[];
}

export function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function compareExplanations(args: { payload: PublicPayload; rubric: Rubric; human: ExplanationDoc; reference: ExplanationDoc; random?: () => number }): StoredComparison {
  const rand = args.random ?? (() => crypto.randomInt(0, 2 ** 31) / 2 ** 31);
  const humanIsA = rand() < 0.5;
  const mapping: { A: Side; B: Side } = humanIsA ? { A: "human", B: "reference" } : { A: "reference", B: "human" };
  const constraintIds = args.payload.constraints.map((c) => c.id);

  const raw = ruleCompare({ A: humanIsA ? args.human : args.reference, B: humanIsA ? args.reference : args.human, rubric: args.rubric, constraintIds });
  const checked = checkComparison({
    raw,
    mapping,
    texts: { human: args.human.text, reference: args.reference.text },
    constraintIds,
    answerRanges: { human: args.human.sections.answer, reference: args.reference.sections.answer },
  });

  const rejected_counts: Record<string, number> = {};
  for (const r of checked.rejected) rejected_counts[r.reason] = (rejected_counts[r.reason] ?? 0) + 1;

  return {
    explanation_format_version: EXPLANATION_FORMAT_VERSION,
    text_hashes: { human: sha256(args.human.text), reference: sha256(args.reference.text) },
    ab_mapping: mapping,
    findings: checked.findings,
    alternatives: checked.alternatives,
    constraint_matrix: constraintMatrix(checked.findings, constraintIds),
    rejected_counts,
    rejected_total: checked.rejected.length,
    limitations: [
      "Findings come from keyword matching against reviewed cue words — not from an AI model. Requirements written in other words can be missed, and contradictions are not detected.",
      "“Not stated” means no sentence about it was found in the written explanation — not that the author didn’t think of it.",
      "Findings are automatic and provisional. If one looks wrong, use Dispute.",
    ],
  };
}
