/**
 * Builds the canonical text of an explanation. Human and AI explanations use the
 * SAME layout and headings, so the comparator cannot tell them apart by structure,
 * and character offsets always refer to this exact text.
 */
import type { AnswerFormat } from "@/lib/problems/types";
import type { ReferenceOutput } from "./schemas";

export const HEADINGS = {
  answer: "Final answer:",
  main: "Main approach:",
  alternatives: "Other options considered:",
  assumptions: "Assumptions or constraints noted:",
} as const;

export function describeAnswer(format: AnswerFormat, answer: unknown): string {
  if (format.kind === "choice_fields") {
    const fields = (answer as { fields?: Record<string, string> })?.fields ?? {};
    return format.fields
      .map((f) => `${f.label}: ${f.options.find((o) => o.id === fields[f.id])?.label ?? "(blank)"}`)
      .join("; ");
  }
  const sel = (answer as { selected?: string[] })?.selected ?? [];
  const labels = format.options.filter((o) => sel.includes(o.id)).map((o) => o.label);
  return labels.length ? labels.join("; ") : "(none selected)";
}

function section(heading: string, body: string | null | undefined): string {
  const b = (body ?? "").trim();
  return `${heading}\n${b.length ? b : "(not reported)"}`;
}

export interface ExplanationDoc {
  text: string;
  sections: { answer: [number, number]; main: [number, number]; alternatives: [number, number]; assumptions: [number, number] };
}

function build(parts: { answer: string; main: string; alternatives: string; assumptions: string }): ExplanationDoc {
  const blocks = [
    section(HEADINGS.answer, parts.answer),
    section(HEADINGS.main, parts.main),
    section(HEADINGS.alternatives, parts.alternatives),
    section(HEADINGS.assumptions, parts.assumptions),
  ];
  const text = blocks.join("\n\n");
  const ranges: [number, number][] = [];
  let pos = 0;
  for (const b of blocks) {
    const bodyStart = pos + b.indexOf("\n") + 1;
    ranges.push([bodyStart, pos + b.length]);
    pos += b.length + 2;
  }
  return { text, sections: { answer: ranges[0], main: ranges[1], alternatives: ranges[2], assumptions: ranges[3] } };
}

export function humanExplanation(
  format: AnswerFormat,
  s: { final_answer: unknown; main_approach: string; alternatives: string | null; assumptions: string | null },
): ExplanationDoc {
  return build({
    answer: describeAnswer(format, s.final_answer),
    main: s.main_approach,
    alternatives: s.alternatives ?? "",
    assumptions: s.assumptions ?? "",
  });
}

export function referenceExplanation(format: AnswerFormat, o: ReferenceOutput): ExplanationDoc {
  const bullets = (xs: string[]) => xs.map((x) => `- ${x.trim()}`).join("\n");
  const assumptions = [...o.stated_assumptions];
  if (o.uncertainty_notes.trim()) assumptions.push(`Uncertainty: ${o.uncertainty_notes.trim()}`);
  return build({
    answer: describeAnswer(format, o.final_answer),
    main: o.concise_explanation,
    alternatives: bullets(o.stated_alternatives),
    assumptions: bullets(assumptions),
  });
}

/** Boilerplate an excerpt may not consist of. */
export const BOILERPLATE = [...Object.values(HEADINGS), "(not reported)"];
