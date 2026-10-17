/**
 * Seeding logic shared by scripts/seed.ts and the tests.
 * Inserts each problem version, its server-only key, and its hand-written reference
 * explanation once. Refuses to silently change anything already published.
 */
import fs from "node:fs";
import path from "node:path";
import type { Client, PoolClient } from "pg";
import { contentHash, loadProblemSeeds } from "./load";
import { ReferenceOutputSchema, type ReferenceOutput } from "@/lib/evaluation/schemas";
import { validateAnswer } from "@/lib/evaluation/validate";

type Q = Pick<Client | PoolClient, "query">;

export function loadReferenceExplanations(): Map<string, ReferenceOutput> {
  const file = JSON.parse(fs.readFileSync(path.join(process.cwd(), "content/reference-explanations/reference-explanations.json"), "utf8"));
  const map = new Map<string, ReferenceOutput>();
  for (const e of file.explanations as { problem_version_id: string; output: unknown }[]) {
    map.set(e.problem_version_id, ReferenceOutputSchema.parse(e.output));
  }
  return map;
}

export async function seedProblems(db: Q, opts: { quiet?: boolean } = {}) {
  const seeds = loadProblemSeeds();
  const refs = loadReferenceExplanations();
  let inserted = 0;
  for (const s of seeds) {
    const ref = refs.get(s.id);
    if (!ref) throw new Error(`Missing reference explanation for ${s.id}`);
    // The reference answer must be readable by the same validator used for people (it may be wrong on purpose).
    if (validateAnswer(s.public.answer_format, s.private.validator, s.private.validator_version, ref.final_answer).status === "unverified") {
      throw new Error(`Reference explanation for ${s.id} does not match the answer format`);
    }
    const hash = contentHash(s);
    const existing = await db.query<{ content_hash: string; same_key: boolean }>(
      `select p.content_hash, (k.validator = $2::jsonb and k.rubric = $3::jsonb and k.reference_output = $4::jsonb) as same_key
         from problem_versions p join problem_keys k on k.problem_version_id = p.id where p.id = $1`,
      [s.id, s.private.validator, s.private.rubric, ref],
    );
    if (existing.rowCount) {
      if (existing.rows[0].content_hash !== hash || !existing.rows[0].same_key) {
        throw new Error(`${s.id} is already published with different content. Bump "version" in the seed file to publish a new version.`);
      }
      continue;
    }
    await db.query(
      `insert into problem_versions (id, family_id, slug, version, variant, category, difficulty, est_minutes, title, public_payload, provenance, content_hash)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [s.id, s.family_id, s.slug, s.version, s.variant, s.category, s.difficulty, s.est_minutes, s.title, s.public, s.provenance, hash],
    );
    await db.query(
      `insert into problem_keys (problem_version_id, validator, validator_version, rubric, rubric_version, reviewed_explanation, review, reference_output)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [s.id, s.private.validator, s.private.validator_version, s.private.rubric, s.private.rubric.version, s.private.reviewed_explanation, s.private.review, ref],
    );
    inserted++;
  }
  // Retire versions that are no longer in content/ (kept in the database for existing attempts).
  const ids = seeds.map((s) => s.id);
  const retired = await db.query(`update problem_versions set status = 'retired' where status = 'published' and not (id = any($1)) returning id`, [ids]);
  if (!opts.quiet) console.log(`problems: ${inserted} inserted, ${seeds.length - inserted} unchanged${retired.rowCount ? `, ${retired.rowCount} retired` : ""}`);
  return seeds;
}
