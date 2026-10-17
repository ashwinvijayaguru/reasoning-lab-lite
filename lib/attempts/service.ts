import "server-only";
/**
 * Attempt lifecycle: start → draft (in the browser) → atomic lock → evaluation → reveal,
 * plus separate revisions and feedback. Every query filters by the signed-in
 * participant id; nothing here trusts an id sent by the browser alone.
 */
import crypto from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { withTx } from "@/lib/db/pool";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { FinalAnswerSchema, PublicPayloadSchema, RubricSchema, ValidatorConfigSchema, type AnswerFormat, type PublicProblem } from "@/lib/problems/types";
import { PUBLIC_COLUMNS } from "@/lib/problems/catalog";
import { normalizeAnswer, validateAnswer, VALIDATOR_ENGINE_VERSION, type ValidationResult } from "@/lib/evaluation/validate";
import { humanExplanation, referenceExplanation, type ExplanationDoc } from "@/lib/evaluation/explanation";
import { ReferenceOutputSchema } from "@/lib/evaluation/schemas";
import { compareExplanations, COMPARATOR_VERSION, sha256, type StoredComparison } from "@/lib/evaluation/compare";

/* ------------------------------------------------------------------ inputs */

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
const optionalText = (max: number) => z.string().max(max).nullish().transform((s) => (s ? clean(s) || null : null));

export const SubmitInputSchema = z.object({
  final_answer: FinalAnswerSchema,
  main_approach: z.string().max(4000).transform(clean).pipe(z.string().min(3, "Please describe your main approach (a few words is fine).")),
  alternatives: optionalText(3000),
  assumptions: optionalText(3000),
  confidence: z.number().int().min(0).max(100).nullish().transform((v) => v ?? null),
  idempotency_key: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
});
export type SubmitInput = z.infer<typeof SubmitInputSchema>;

export const RevisionInputSchema = z.object({ revised_answer: FinalAnswerSchema, note: optionalText(2000) });
export const FeedbackInputSchema = z.object({
  finding_id: z.string().max(80).nullish().transform((v) => v ?? null),
  kind: z.enum(["dispute", "unclear", "helpful"]),
  comment: optionalText(1000),
});

const uuid = z.string().uuid();
function assertUuid(id: string) {
  if (!uuid.safeParse(id).success) throw new AppError(404, "not_found", "Attempt not found.");
}

/** A complete answer in the right shape, or a user-facing error. */
export function assertCompleteAnswer(format: AnswerFormat, answer: unknown) {
  const norm = normalizeAnswer(format, answer);
  if (!norm.value) throw new AppError(400, "invalid_answer", "Your answer doesn't match this challenge's options.");
  const v = norm.value;
  if (v.kind === "choice_fields" && format.kind === "choice_fields") {
    const missing = format.fields.filter((f) => !v.fields[f.id]);
    if (missing.length) throw new AppError(400, "incomplete_answer", `Please complete: ${missing.map((m) => m.label).join(", ")}.`);
  }
  if (v.kind === "multi_select" && format.kind === "multi_select") {
    const n = v.selected.length;
    if (n < format.min || n > format.max) throw new AppError(400, "incomplete_answer", format.min === format.max ? `Please select exactly ${format.min}.` : `Please select ${format.min}–${format.max}.`);
  }
}

/* ------------------------------------------------------------------ start */

export async function createAttempt(participantId: string, familySlug: string): Promise<{ id: string; resumed: boolean }> {
  const e = env();
  return withTx(async (c) => {
    const versions = (
      await c.query<{ id: string; family_id: string; version: number; variant: string }>(
        `select id, family_id, version, variant from problem_versions where slug = $1 and status = 'published'`,
        [familySlug],
      )
    ).rows;
    if (!versions.length) throw new AppError(404, "not_found", "That challenge isn't available.");
    const latest = Math.max(...versions.map((v) => v.version));
    const candidates = versions.filter((v) => v.version === latest);
    const familyId = candidates[0].family_id;

    // Resume an unfinished draft instead of creating duplicates.
    const draft = await c.query<{ id: string }>(
      `select id from attempts where participant_id = $1 and family_id = $2 and state = 'DRAFT' order by started_at desc limit 1`,
      [participantId, familyId],
    );
    if (draft.rowCount) return { id: draft.rows[0].id, resumed: true };

    const recent = await c.query<{ n: string }>(`select count(*) as n from attempts where participant_id = $1 and started_at > now() - interval '1 day'`, [participantId]);
    if (Number(recent.rows[0].n) >= e.MAX_ATTEMPTS_PER_DAY) throw new AppError(429, "quota", "You've reached today's limit of challenges for this session. Please come back tomorrow.");

    const prior = await c.query<{ revealed: boolean }>(
      `select bool_or(state <> 'DRAFT') as revealed from attempts where participant_id = $1 and family_id = $2 having count(*) > 0`,
      [participantId, familyId],
    );
    const exposure = !prior.rowCount ? "first_exposure" : prior.rows[0].revealed ? "previously_revealed" : "repeat_family";

    // Matched variants (with / without one practical requirement) are chosen at random by the server.
    const pick = candidates[crypto.randomInt(0, candidates.length)];
    const r = await c.query<{ id: string }>(
      `insert into attempts (participant_id, problem_version_id, family_id, variant, exposure) values ($1,$2,$3,$4,$5) returning id`,
      [participantId, pick.id, familyId, pick.variant, exposure],
    );
    return { id: r.rows[0].id, resumed: false };
  });
}

/* ------------------------------------------------------------------ workspace */

export interface WorkspaceView {
  attempt: { id: string; state: string; exposure: string; started_at: string };
  problem: PublicProblem;
}

async function ownAttempt(c: PoolClient, participantId: string, attemptId: string) {
  const a = await c.query(
    `select id, state, exposure, started_at, submitted_at, revealed_at, problem_version_id from attempts where id = $1 and participant_id = $2`,
    [attemptId, participantId],
  );
  if (!a.rowCount) throw new AppError(404, "not_found", "Attempt not found.");
  return a.rows[0];
}

export async function getWorkspace(participantId: string, attemptId: string): Promise<WorkspaceView> {
  assertUuid(attemptId);
  return withTx(async (c) => {
    const a = await ownAttempt(c, participantId, attemptId);
    const p = await c.query<PublicProblem>(`select ${PUBLIC_COLUMNS} from problem_versions where id = $1`, [a.problem_version_id]);
    return { attempt: { id: a.id, state: a.state, exposure: a.exposure, started_at: a.started_at }, problem: p.rows[0] };
  });
}

/* ------------------------------------------------------------------ submit + evaluate */

export async function submitFirstResponse(participantId: string, attemptId: string, input: SubmitInput) {
  const ws = await getWorkspace(participantId, attemptId);
  if (ws.attempt.state === "DRAFT") assertCompleteAnswer(ws.problem.public_payload.answer_format, input.final_answer);
  // The database function re-checks ownership and state, and handles idempotent replays, atomically.
  const res = await withTx(async (c) => {
    const r = await c.query<{ submission_id: string; replayed: boolean }>(
      `select * from submit_first_response($1, $2, $3, $4, $5, $6, $7, $8)`,
      [participantId, attemptId, input.final_answer, input.main_approach, input.alternatives, input.assumptions, input.confidence, input.idempotency_key],
    );
    return r.rows[0];
  });
  await evaluateIfNeeded(participantId, attemptId);
  return res;
}

/**
 * Compute and store the answer checks and explanation comparison for a locked attempt.
 * Everything is deterministic and local, so this normally completes inside the submit
 * request. If it ever fails, the attempt stays SUBMITTED (still locked) and the next
 * result request simply tries again.
 */
export async function evaluateIfNeeded(participantId: string, attemptId: string): Promise<void> {
  try {
    await withTx(async (c) => {
      const row = (
        await c.query(
          `select a.id, a.state, s.final_answer, s.main_approach, s.alternatives, s.assumptions,
                  p.public_payload, k.validator, k.validator_version, k.rubric, k.rubric_version, k.reference_output
             from attempts a
             join first_submissions s on s.attempt_id = a.id
             join problem_versions p on p.id = a.problem_version_id
             join problem_keys k on k.problem_version_id = a.problem_version_id
            where a.id = $1 and a.participant_id = $2
            for update of a`,
          [attemptId, participantId],
        )
      ).rows[0];
      if (!row || row.state !== "SUBMITTED") return; // not locked yet, or already evaluated

      const payload = PublicPayloadSchema.parse(row.public_payload);
      const validator = ValidatorConfigSchema.parse(row.validator);
      const reference = ReferenceOutputSchema.parse(row.reference_output);
      // Same rules for both answers.
      const humanValidation = validateAnswer(payload.answer_format, validator, row.validator_version, row.final_answer);
      const referenceValidation = validateAnswer(payload.answer_format, validator, row.validator_version, reference.final_answer);
      const comparison = compareExplanations({
        payload,
        rubric: RubricSchema.parse(row.rubric),
        human: humanExplanation(payload.answer_format, row),
        reference: referenceExplanation(payload.answer_format, reference),
      });
      await c.query(
        `insert into evaluations (attempt_id, participant_id, human_validation, reference_validation, comparison, validator_version, rubric_version, comparator_version)
         values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (attempt_id) do nothing`,
        [attemptId, participantId, humanValidation, referenceValidation, comparison, `${row.validator_version}+${VALIDATOR_ENGINE_VERSION}`, row.rubric_version, COMPARATOR_VERSION],
      );
      await c.query(`update attempts set state = 'READY' where id = $1 and state = 'SUBMITTED'`, [attemptId]);
    });
  } catch (err) {
    log.error("evaluation_failed", err, { attempt: attemptId });
  }
}

/* ------------------------------------------------------------------ result */

export interface ResultView {
  attempt: { id: string; state: string; exposure: string; submitted_at: string; revealed_at: string | null };
  problem: PublicProblem;
  submission: { final_answer: unknown; main_approach: string; alternatives: string | null; assumptions: string | null; confidence: number | null; locked_at: string };
  ready: boolean;
  answer_check: { human: ValidationResult; reference: ValidationResult } | null;
  human_doc: ExplanationDoc;
  reference: { doc: ExplanationDoc; final_answer: unknown } | null;
  comparison: (StoredComparison & { offsets_valid: boolean }) | null;
  review_state: string | null;
  versions: Record<string, string> | null;
  reviewed_explanation: { text: string; accepted_summary: string } | null;
  revisions: { id: string; revised_answer: unknown; note: string | null; created_at: string; validation: ValidationResult }[];
  feedback: { id: string; finding_id: string | null; kind: string; created_at: string }[];
}

export async function getResult(participantId: string, attemptId: string): Promise<ResultView> {
  assertUuid(attemptId);
  const state = await withTx(async (c) => (await ownAttempt(c, participantId, attemptId)).state);
  if (state === "DRAFT") throw new AppError(409, "not_locked", "Submit your first response to see the comparison.");
  if (state === "SUBMITTED") await evaluateIfNeeded(participantId, attemptId);

  return withTx(async (c) => {
    const a = await ownAttempt(c, participantId, attemptId);
    const p = (await c.query<PublicProblem>(`select ${PUBLIC_COLUMNS} from problem_versions where id = $1`, [a.problem_version_id])).rows[0];
    const s = (await c.query(`select final_answer, main_approach, alternatives, assumptions, confidence, locked_at from first_submissions where attempt_id = $1 and participant_id = $2`, [attemptId, participantId])).rows[0];
    const ev = (await c.query(`select * from evaluations where attempt_id = $1 and participant_id = $2`, [attemptId, participantId])).rows[0];
    const rev = await c.query(`select id, revised_answer, note, created_at, revision_validation from revisions where attempt_id = $1 and participant_id = $2 order by created_at`, [attemptId, participantId]);
    const fb = await c.query(`select id, finding_id, kind, created_at from feedback where attempt_id = $1 and participant_id = $2 order by created_at`, [attemptId, participantId]);

    const payload = PublicPayloadSchema.parse(p.public_payload);
    const humanDoc = humanExplanation(payload.answer_format, s);
    let reference: ResultView["reference"] = null;
    let reviewed: ResultView["reviewed_explanation"] = null;
    if (ev) {
      // Only revealed after the lock: the reference explanation and the authors' explanation.
      const k = (await c.query(`select reference_output, reviewed_explanation from problem_keys where problem_version_id = $1`, [a.problem_version_id])).rows[0];
      const out = ReferenceOutputSchema.parse(k.reference_output);
      reference = { doc: referenceExplanation(payload.answer_format, out), final_answer: out.final_answer };
      reviewed = k.reviewed_explanation;
      if (!a.revealed_at) await c.query(`update attempts set revealed_at = now() where id = $1 and revealed_at is null`, [attemptId]);
    }
    const comp = ev?.comparison as StoredComparison | undefined;
    return {
      attempt: { id: a.id, state: a.state, exposure: a.exposure, submitted_at: a.submitted_at, revealed_at: a.revealed_at },
      problem: p,
      submission: s,
      ready: !!ev,
      answer_check: ev ? { human: ev.human_validation, reference: ev.reference_validation } : null,
      human_doc: humanDoc,
      reference,
      comparison: comp && reference ? { ...comp, offsets_valid: comp.text_hashes.human === sha256(humanDoc.text) && comp.text_hashes.reference === sha256(reference.doc.text) } : null,
      review_state: ev?.review_state ?? null,
      versions: ev ? { validator: ev.validator_version, rubric: ev.rubric_version, comparator: ev.comparator_version } : null,
      reviewed_explanation: reviewed,
      revisions: rev.rows.map((r) => ({ id: r.id, revised_answer: r.revised_answer, note: r.note, created_at: r.created_at, validation: r.revision_validation })),
      feedback: fb.rows,
    };
  });
}

/* ------------------------------------------------------------------ after the reveal */

export async function addRevision(participantId: string, attemptId: string, input: z.infer<typeof RevisionInputSchema>) {
  const view = await getResult(participantId, attemptId); // ownership + lock checks
  if (!view.ready) throw new AppError(409, "not_revealed", "You can revise once the answer check is available.");
  if (view.revisions.length >= 3) throw new AppError(429, "revision_limit", "You've already added three revisions to this attempt.");
  const format = view.problem.public_payload.answer_format;
  assertCompleteAnswer(format, input.revised_answer);
  return withTx(async (c) => {
    const k = (await c.query(`select validator, validator_version from problem_keys where problem_version_id = $1`, [view.problem.id])).rows[0];
    const validation = validateAnswer(format, ValidatorConfigSchema.parse(k.validator), k.validator_version, input.revised_answer);
    const r = await c.query<{ id: string }>(
      `insert into revisions (attempt_id, participant_id, revised_answer, note, revision_validation) values ($1,$2,$3,$4,$5) returning id`,
      [attemptId, participantId, input.revised_answer, input.note, validation],
    );
    return { id: r.rows[0].id, validation };
  });
}

export async function addFeedback(participantId: string, attemptId: string, input: z.infer<typeof FeedbackInputSchema>) {
  const view = await getResult(participantId, attemptId);
  if (view.feedback.length >= 20) throw new AppError(429, "feedback_limit", "Thanks — we've received plenty of feedback on this attempt.");
  if (input.finding_id && !view.comparison?.findings.some((f) => f.id === input.finding_id)) {
    throw new AppError(400, "unknown_finding", "That finding isn't part of this result.");
  }
  return withTx(async (c) => {
    const r = await c.query<{ id: string }>(
      `insert into feedback (attempt_id, participant_id, finding_id, kind, comment) values ($1,$2,$3,$4,$5) returning id`,
      [attemptId, participantId, input.finding_id, input.kind, input.comment],
    );
    if (input.kind === "dispute") await c.query(`update evaluations set review_state = 'disputed' where attempt_id = $1`, [attemptId]);
    return { id: r.rows[0].id };
  });
}
