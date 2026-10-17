/**
 * A seed file (content/problems/*.json) contains BOTH public and private parts.
 * The seed script splits them: 'public' goes to public.problem_versions (readable
 * by anyone), everything under 'private' goes to the server-only problem_keys table
 * (server only). Client code must only ever import the *public* types below.
 */
import { z } from "zod";

export const CATEGORY_IDS = ["logic", "debugging", "community", "math", "chess", "ethics"] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

const id = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,62}$/, "lowercase id");

export const OptionSchema = z.object({
  id,
  label: z.string().min(1).max(300),
  /** Optional code shown for debugging patch options. */
  code: z.string().max(1200).optional(),
  /** Machine-readable patch, applied to `public.code.lines` by the deterministic key test. */
  patch: z
    .object({
      op: z.enum(["replace", "insert_before", "replace_range"]),
      line: z.number().int().positive(),
      to_line: z.number().int().positive().optional(),
    })
    .optional(),
});
export type Option = z.infer<typeof OptionSchema>;

export const ChoiceFieldsFormat = z.object({
  kind: z.literal("choice_fields"),
  instructions: z.string().max(400),
  fields: z
    .array(
      z.object({
        id,
        label: z.string().max(200),
        options: z.array(OptionSchema).min(2).max(12),
      }),
    )
    .min(1)
    .max(8),
});

export const MultiSelectFormat = z.object({
  kind: z.literal("multi_select"),
  instructions: z.string().max(400),
  min: z.number().int().min(0),
  max: z.number().int().min(1),
  options: z.array(OptionSchema).min(2).max(12),
});

export const AnswerFormatSchema = z.discriminatedUnion("kind", [ChoiceFieldsFormat, MultiSelectFormat]);
export type AnswerFormat = z.infer<typeof AnswerFormatSchema>;

export const ConstraintSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9-]{1,30}$/),
  text: z.string().min(5).max(400),
  /** "practical" marks the constraint that differs between matched variants. */
  kind: z.enum(["rule", "practical"]).default("rule"),
});

export const FactTableSchema = z.object({
  caption: z.string().max(200),
  columns: z.array(z.string().max(60)).min(1).max(8),
  rows: z.array(z.array(z.string().max(160))).min(1).max(12),
});

export const PublicPayloadSchema = z.object({
  summary: z.string().min(10).max(240),
  statement: z.string().min(20).max(2000),
  facts: z.array(z.string().max(400)).max(12).default([]),
  fact_table: FactTableSchema.optional(),
  code: z
    .object({ language: z.enum(["javascript"]), lines: z.array(z.string().max(160)).min(1).max(40) })
    .optional(),
  constraints: z.array(ConstraintSchema).min(1).max(10),
  answer_format: AnswerFormatSchema,
  explanation_prompt: z.string().max(300),
});
export type PublicPayload = z.infer<typeof PublicPayloadSchema>;

export const ProvenanceSchema = z.object({
  author: z.string().max(120),
  created: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  license: z.string().max(60),
  origin: z.enum(["original", "adapted"]),
  fictional_data: z.boolean(),
  contamination_note: z.string().max(400),
});

/* private */

const fieldRef = z.string();
export const RuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all_fields_answered"), constraint_id: z.string() }),
  z.object({ type: z.literal("distinct"), constraint_id: z.string(), fields: z.array(fieldRef).optional() }),
  z.object({ type: z.literal("field_in"), constraint_id: z.string(), field: fieldRef, allowed: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("value_not_in_fields"), constraint_id: z.string(), value: z.string(), fields: z.array(fieldRef).min(1) }),
  z.object({ type: z.literal("value_in_fields"), constraint_id: z.string(), value: z.string(), fields: z.array(fieldRef).min(1) }),
  /** Fields are ordered slots; value `a` must sit in an earlier slot than value `b`. */
  z.object({ type: z.literal("before"), constraint_id: z.string(), a: z.string(), b: z.string(), slots: z.array(fieldRef).min(2) }),
  z.object({ type: z.literal("immediately_before"), constraint_id: z.string(), a: z.string(), b: z.string(), slots: z.array(fieldRef).min(2) }),
  z.object({ type: z.literal("not_adjacent"), constraint_id: z.string(), a: z.string(), b: z.string(), slots: z.array(fieldRef).min(2) }),
  z.object({ type: z.literal("count_value_at_most"), constraint_id: z.string(), value: z.string(), max: z.number().int().min(0) }),
  z.object({ type: z.literal("selected_count"), constraint_id: z.string(), min: z.number().int().min(0), max: z.number().int().min(0) }),
  z.object({ type: z.literal("selected_sum_at_most"), constraint_id: z.string(), attr: z.string(), max: z.number() }),
  z.object({ type: z.literal("selected_any"), constraint_id: z.string(), attr: z.string(), equals: z.union([z.string(), z.number(), z.boolean()]) }),
  z.object({
    type: z.literal("field_attr"),
    constraint_id: z.string(),
    field: fieldRef,
    attr: z.string(),
    op: z.enum(["eq", "lte", "gte"]),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
]);
export type Rule = z.infer<typeof RuleSchema>;

export const ValidatorConfigSchema = z.discriminatedUnion("engine", [
  z.object({
    engine: z.literal("rules"),
    /** Option attributes the rules refer to; the key test checks they match the public facts. */
    attributes: z.record(z.string(), z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))).default({}),
    rules: z.array(RuleSchema).min(1),
    /** Every accepted answer, as reviewed. The key test re-derives this by enumeration. */
    expected_solutions: z.array(z.record(z.string(), z.unknown())).min(1),
    /** Ties attribute values to columns of the public fact table so the key test can check they agree. */
    fact_table_binding: z.object({ label_column: z.number().int().min(0), columns: z.record(z.string(), z.number().int().min(0)) }).optional(),
    preferences: z.array(z.string().max(300)).default([]),
  }),
  z.object({
    engine: z.literal("answer_key"),
    accepted: z.array(z.record(z.string(), z.string())).min(1),
    /** Reviewed test cases used by the deterministic key test to confirm which patches work. */
    harness: z
      .object({
        entry: z.string(),
        helpers: z.array(z.string()).default([]),
        cases: z.array(z.object({ name: z.string(), check: z.string() })).min(1),
        patch_field: z.string(),
      })
      .optional(),
  }),
]);
export type ValidatorConfig = z.infer<typeof ValidatorConfigSchema>;

export const RubricSchema = z.object({
  version: z.string(),
  dimensions: z.array(z.enum(["constraints", "alternatives", "assumptions", "edge_cases", "trade_offs"])).min(1),
  constraint_cues: z.record(z.string(), z.array(z.string().min(2)).min(1)),
  edge_case_cues: z.array(z.string()).default([]),
  trade_off_cues: z.array(z.string()).default([]),
  anchors: z.record(z.string(), z.string()).default({}),
});
export type Rubric = z.infer<typeof RubricSchema>;

export const ProblemSeedSchema = z.object({
  id: z.string().regex(/^[a-z]+\.[a-z0-9-]+@\d+(-[a-z0-9-]+)?$/),
  family_id: z.string(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  version: z.number().int().positive(),
  variant: z.string().default("standard"),
  category: z.enum(CATEGORY_IDS),
  difficulty: z.enum(["easy", "moderate"]),
  est_minutes: z.number().int().min(1).max(60),
  title: z.string().min(3).max(80),
  public: PublicPayloadSchema,
  provenance: ProvenanceSchema,
  private: z.object({
    validator: ValidatorConfigSchema,
    validator_version: z.string(),
    rubric: RubricSchema,
    reviewed_explanation: z.object({ text: z.string().min(20).max(2000), accepted_summary: z.string().max(400) }),
    review: z.object({
      author_checked: z.boolean(),
      independent_review: z.object({ status: z.enum(["pending", "approved", "changes_requested"]), reviewer: z.string().nullable(), date: z.string().nullable() }),
      notes: z.string().max(600).default(""),
    }),
  }),
});
export type ProblemSeed = z.infer<typeof ProblemSeedSchema>;

/** What the browser is allowed to receive about a problem version. */
export interface PublicProblem {
  id: string;
  family_id: string;
  slug: string;
  version: number;
  variant: string;
  category: CategoryId;
  difficulty: "easy" | "moderate";
  est_minutes: number;
  title: string;
  public_payload: PublicPayload;
  provenance: z.infer<typeof ProvenanceSchema>;
}

/** Participant answers. */
export const ChoiceAnswerSchema = z.object({ fields: z.record(z.string().max(64), z.string().max(64)) }).strict();
export const MultiAnswerSchema = z.object({ selected: z.array(z.string().max(64)).max(12) }).strict();
export const FinalAnswerSchema = z.union([ChoiceAnswerSchema, MultiAnswerSchema]);
export type FinalAnswer = z.infer<typeof FinalAnswerSchema>;

