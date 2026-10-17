/**
 * Rule-based DEMO comparator. Not an AI model: it matches reviewed cue words from
 * the rubric and quotes the sentence that contains them. It is deliberately simple,
 * labelled as such in the interface, and goes through exactly the same evidence
 * checks as the model comparator. It cannot detect "contradicted" evidence or
 * paraphrases without cue words, so its findings stay provisional.
 */
import type { ComparatorRaw } from "./schemas";
import type { Rubric } from "@/lib/problems/types";
import type { ExplanationDoc } from "./explanation";

export const RULE_COMPARATOR_VERSION = "rule-comparator@1";

interface Segment {
  text: string;
  start: number;
}

/** Split a range of text into sentences/lines with exact offsets. */
export function segments(text: string, [from, to]: [number, number]): Segment[] {
  const out: Segment[] = [];
  const body = text.slice(from, to);
  const re = /[^\n.!?]+(?:[.!?]+|$)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    let s = m[0];
    let start = from + m.index;
    const lead = s.match(/^\s*(?:[-*•]|\d+[.)])?\s*/)?.[0].length ?? 0;
    s = s.slice(lead);
    start += lead;
    const trimmed = s.replace(/\s+$/, "");
    if (trimmed.replace(/[^a-z0-9]/gi, "").length >= 3 && trimmed !== "(not reported)") out.push({ text: trimmed, start });
  }
  return out;
}

function findCue(doc: ExplanationDoc, cues: string[]): Segment | null {
  const lc = cues.map((c) => c.toLowerCase());
  for (const range of [doc.sections.main, doc.sections.alternatives, doc.sections.assumptions]) {
    for (const seg of segments(doc.text, range)) {
      const t = seg.text.toLowerCase();
      if (lc.some((c) => t.includes(c))) return seg;
    }
  }
  return null;
}

export function ruleCompare(args: { A: ExplanationDoc; B: ExplanationDoc; rubric: Rubric; constraintIds: string[] }): ComparatorRaw {
  const findings: ComparatorRaw["findings"] = [];
  const alternatives: ComparatorRaw["alternatives"] = [];

  for (const label of ["A", "B"] as const) {
    const doc = args[label];

    for (const cid of args.constraintIds) {
      const seg = findCue(doc, args.rubric.constraint_cues[cid] ?? []);
      findings.push(
        seg
          ? { dimension: "constraints", response_label: label, constraint_id: cid, evidence_status: "explicit", evidence_excerpt: seg.text, observation: "Refers to this requirement in the written explanation." }
          : { dimension: "constraints", response_label: label, constraint_id: cid, evidence_status: "not_stated", evidence_excerpt: null, observation: "No sentence about this requirement was found in the written explanation." },
      );
    }

    const assumption = segments(doc.text, doc.sections.assumptions)[0];
    if (args.rubric.dimensions.includes("assumptions")) {
      findings.push(
        assumption
          ? { dimension: "assumptions", response_label: label, constraint_id: null, evidence_status: "explicit", evidence_excerpt: assumption.text, observation: "States an assumption or noted condition." }
          : { dimension: "assumptions", response_label: label, constraint_id: null, evidence_status: "not_stated", evidence_excerpt: null, observation: "No assumption is written down." },
      );
    }

    if (args.rubric.dimensions.includes("edge_cases") && args.rubric.edge_case_cues.length) {
      const seg = findCue(doc, args.rubric.edge_case_cues);
      findings.push(
        seg
          ? { dimension: "edge_cases", response_label: label, constraint_id: null, evidence_status: "explicit", evidence_excerpt: seg.text, observation: "Names an edge case or unusual input." }
          : { dimension: "edge_cases", response_label: label, constraint_id: null, evidence_status: "not_stated", evidence_excerpt: null, observation: "No edge case is named in the written explanation." },
      );
    }

    if (args.rubric.dimensions.includes("trade_offs") && args.rubric.trade_off_cues.length) {
      const seg = findCue(doc, args.rubric.trade_off_cues);
      findings.push(
        seg
          ? { dimension: "trade_offs", response_label: label, constraint_id: null, evidence_status: "explicit", evidence_excerpt: seg.text, observation: "Describes a trade-off or a reason to prefer one option over another." }
          : { dimension: "trade_offs", response_label: label, constraint_id: null, evidence_status: "not_stated", evidence_excerpt: null, observation: "No trade-off between options is described." },
      );
    }

    // Each written line/sentence in "Other options considered" is a candidate alternative.
    for (const seg of segments(doc.text, doc.sections.alternatives)) {
      alternatives.push({ response_label: label, excerpt: seg.text });
    }
  }
  return { findings, alternatives };
}
