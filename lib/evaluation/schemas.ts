/**
 * Data contracts for the reference explanation and for comparator output.
 * Validated with Zod whenever they are loaded or produced.
 */
import { z } from "zod";

/** A hand-written reference explanation (same shape a model solver would return). */
export const ReferenceOutputSchema = z.object({
  final_answer: z.union([
    z.object({ fields: z.record(z.string(), z.string()) }).strict(),
    z.object({ selected: z.array(z.string()).max(12) }).strict(),
  ]),
  concise_explanation: z.string().min(1).max(2000),
  stated_alternatives: z.array(z.string().min(1).max(400)).max(12),
  stated_assumptions: z.array(z.string().min(1).max(400)).max(12),
  cited_constraint_ids: z.array(z.string().max(40)).max(20),
  uncertainty_notes: z.string().max(800),
});
export type ReferenceOutput = z.infer<typeof ReferenceOutputSchema>;

export const DIMENSIONS = ["constraints", "alternatives", "assumptions", "edge_cases", "trade_offs"] as const;
export const EVIDENCE_STATUSES = ["explicit", "contradicted", "not_stated", "unclear"] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

/** Comparator output in anonymised A/B terms, before evidence checks. */
export const ComparatorRawSchema = z.object({
  findings: z
    .array(
      z.object({
        dimension: z.enum(DIMENSIONS),
        response_label: z.enum(["A", "B"]),
        observation: z.string().min(1).max(400),
        evidence_excerpt: z.string().min(1).max(600).nullable(),
        constraint_id: z.string().max(40).nullable(),
        evidence_status: z.enum(EVIDENCE_STATUSES),
      }),
    )
    .max(60),
  alternatives: z.array(z.object({ response_label: z.enum(["A", "B"]), excerpt: z.string().min(1).max(600) })).max(40),
});
export type ComparatorRaw = z.infer<typeof ComparatorRawSchema>;
