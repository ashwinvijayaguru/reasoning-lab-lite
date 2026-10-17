/**
 * Loads problem seeds from content/problems. Used by the seed script, the
 * baseline generator and tests — never by browser code.
 *
 * Family files (`"family": true`) define matched variants: every variant shares
 * the same statement, facts, table and options, and differs only by the
 * constraints/facts it omits. Generating variants from one file guarantees the
 * "with" and "without" versions are otherwise identical.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ProblemSeedSchema, type ProblemSeed } from "./types";

export const CONTENT_DIR = path.join(process.cwd(), "content", "problems");

interface VariantSpec {
  variant: string;
  id: string;
  omit_constraints?: string[];
  omit_facts?: number[];
  expected_solutions: unknown[];
  reviewed_explanation: { text: string; accepted_summary: string };
}

function expandFamily(raw: Record<string, unknown>): unknown[] {
  const { variants, family: _family, ...base } = raw as Record<string, unknown> & { variants: VariantSpec[]; family: boolean };
  return variants.map((v) => {
    const copy = structuredClone(base) as Record<string, any>;
    copy.id = v.id;
    copy.variant = v.variant;
    const omitC = new Set(v.omit_constraints ?? []);
    const omitF = new Set(v.omit_facts ?? []);
    copy.public.constraints = copy.public.constraints.filter((c: { id: string }) => !omitC.has(c.id));
    copy.public.facts = copy.public.facts.filter((_: string, i: number) => !omitF.has(i));
    copy.private.validator.rules = copy.private.validator.rules.filter((r: { constraint_id: string }) => !omitC.has(r.constraint_id));
    copy.private.validator.expected_solutions = v.expected_solutions;
    for (const cid of omitC) delete copy.private.rubric.constraint_cues[cid];
    copy.private.reviewed_explanation = v.reviewed_explanation;
    copy.private.validator_version = `${v.id}/v1`;
    return copy;
  });
}

export function loadProblemSeeds(dir = CONTENT_DIR): ProblemSeed[] {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const out: ProblemSeed[] = [];
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const items = raw.family ? expandFamily(raw) : [raw];
    for (const item of items) {
      const parsed = ProblemSeedSchema.safeParse(item);
      if (!parsed.success) {
        throw new Error(`Invalid seed in ${file}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      }
      out.push(parsed.data);
    }
  }
  const ids = new Set<string>();
  for (const s of out) {
    if (ids.has(s.id)) throw new Error(`Duplicate problem id ${s.id}`);
    ids.add(s.id);
  }
  return out;
}

/** Stable hash of the public payload; a published version can never change content under the same id. */
export function contentHash(seed: ProblemSeed): string {
  return crypto.createHash("sha256").update(JSON.stringify({ public: seed.public, category: seed.category, version: seed.version, variant: seed.variant })).digest("hex");
}
