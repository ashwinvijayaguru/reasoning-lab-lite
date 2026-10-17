/**
 * Deterministic answer validator.
 *
 * The SAME function checks the participant's answer and the AI baseline's answer,
 * using the reviewed rules in the private problem key. The AI solver is never
 * used as ground truth. Answers that cannot be interpreted are "unverified",
 * not "incorrect".
 */
import type { AnswerFormat, FinalAnswer, Rule, ValidatorConfig } from "@/lib/problems/types";

export const VALIDATOR_ENGINE_VERSION = "validator-engine@1.0.0";

export type ValidationStatus = "correct" | "incorrect" | "unverified";

export interface ConstraintCheck {
  constraint_id: string;
  passed: boolean;
  detail: string;
}

export interface ValidationResult {
  status: ValidationStatus;
  engine: "rules" | "answer_key";
  engine_version: string;
  validator_version: string;
  checks: ConstraintCheck[];
  /** answer_key engine: per-field agreement with any accepted answer. */
  field_matches?: Record<string, boolean>;
  notes: string[];
}

type Normalized =
  | { kind: "choice_fields"; fields: Record<string, string> }
  | { kind: "multi_select"; selected: string[] };

/** Check the answer's shape against the public format. Returns null when it cannot be interpreted. */
export function normalizeAnswer(format: AnswerFormat, answer: unknown): { value: Normalized | null; reason?: string } {
  if (!answer || typeof answer !== "object") return { value: null, reason: "Answer is missing or not an object." };
  if (format.kind === "choice_fields") {
    const raw = (answer as { fields?: unknown }).fields;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { value: null, reason: "Expected an answer for each field." };
    const out: Record<string, string> = {};
    for (const [fieldId, optionId] of Object.entries(raw as Record<string, unknown>)) {
      const field = format.fields.find((f) => f.id === fieldId);
      if (!field) return { value: null, reason: `Unknown field "${fieldId}".` };
      if (optionId === null || optionId === undefined || optionId === "") continue;
      if (typeof optionId !== "string" || !field.options.some((o) => o.id === optionId)) {
        return { value: null, reason: `Unknown option for field "${fieldId}".` };
      }
      out[fieldId] = optionId;
    }
    return { value: { kind: "choice_fields", fields: out } };
  }
  const raw = (answer as { selected?: unknown }).selected;
  if (!Array.isArray(raw)) return { value: null, reason: "Expected a list of selected options." };
  const selected: string[] = [];
  for (const optionId of raw) {
    if (typeof optionId !== "string" || !format.options.some((o) => o.id === optionId)) {
      return { value: null, reason: "Unknown selected option." };
    }
    if (!selected.includes(optionId)) selected.push(optionId);
  }
  return { value: { kind: "multi_select", selected: selected.sort() } };
}

function slotIndex(fields: Record<string, string>, slots: string[], value: string): number {
  return slots.findIndex((s) => fields[s] === value);
}

function checkRule(rule: Rule, ans: Normalized, attributes: Record<string, Record<string, string | number | boolean>>, format: AnswerFormat): ConstraintCheck {
  const c = (passed: boolean, detail: string): ConstraintCheck => ({ constraint_id: rule.constraint_id, passed, detail });
  const fields = ans.kind === "choice_fields" ? ans.fields : {};
  const selected = ans.kind === "multi_select" ? ans.selected : [];
  const allFieldIds = format.kind === "choice_fields" ? format.fields.map((f) => f.id) : [];
  const attr = (optionId: string, name: string) => attributes[optionId]?.[name];

  switch (rule.type) {
    case "all_fields_answered": {
      const missing = allFieldIds.filter((f) => !fields[f]);
      return c(missing.length === 0, missing.length === 0 ? "Every item has an answer." : `${missing.length} item(s) left blank.`);
    }
    case "distinct": {
      const ids = rule.fields ?? allFieldIds;
      const values = ids.map((f) => fields[f]).filter(Boolean);
      const ok = new Set(values).size === values.length;
      return c(ok, ok ? "No option is used twice." : "The same option is used more than once.");
    }
    case "field_in": {
      const v = fields[rule.field];
      const ok = v !== undefined && rule.allowed.includes(v);
      return c(ok, ok ? `"${rule.field}" meets the rule.` : `"${rule.field}" breaks the rule.`);
    }
    case "value_not_in_fields": {
      const ok = !rule.fields.some((f) => fields[f] === rule.value);
      return c(ok, ok ? "Placement rule respected." : "Placement rule broken.");
    }
    case "value_in_fields": {
      const ok = rule.fields.some((f) => fields[f] === rule.value);
      return c(ok, ok ? "Placement rule respected." : "Placement rule broken.");
    }
    case "before": {
      const ia = slotIndex(fields, rule.slots, rule.a);
      const ib = slotIndex(fields, rule.slots, rule.b);
      const ok = ia >= 0 && ib >= 0 && ia < ib;
      return c(ok, ok ? "Order rule respected." : "Order rule broken.");
    }
    case "immediately_before": {
      const ia = slotIndex(fields, rule.slots, rule.a);
      const ib = slotIndex(fields, rule.slots, rule.b);
      const ok = ia >= 0 && ib === ia + 1;
      return c(ok, ok ? "Back-to-back rule respected." : "Back-to-back rule broken.");
    }
    case "not_adjacent": {
      const ia = slotIndex(fields, rule.slots, rule.a);
      const ib = slotIndex(fields, rule.slots, rule.b);
      const ok = ia < 0 || ib < 0 || Math.abs(ia - ib) !== 1;
      return c(ok, ok ? "Spacing rule respected." : "Spacing rule broken.");
    }
    case "count_value_at_most": {
      const n = Object.values(fields).filter((v) => v === rule.value).length;
      const ok = n <= rule.max;
      return c(ok, ok ? `Uses ${n} of ${rule.max} available.` : `Uses ${n}, but only ${rule.max} available.`);
    }
    case "selected_count": {
      const n = selected.length;
      const ok = n >= rule.min && n <= rule.max;
      return c(ok, ok ? `${n} selected.` : `${n} selected; required ${rule.min === rule.max ? rule.min : `${rule.min}–${rule.max}`}.`);
    }
    case "selected_sum_at_most": {
      const sum = selected.reduce((s, o) => s + Number(attr(o, rule.attr) ?? 0), 0);
      const ok = sum <= rule.max;
      return c(ok, ok ? `Total ${sum} is within ${rule.max}.` : `Total ${sum} exceeds ${rule.max}.`);
    }
    case "selected_any": {
      const ok = selected.some((o) => attr(o, rule.attr) === rule.equals);
      return c(ok, ok ? "At least one selection meets this need." : "No selection meets this need.");
    }
    case "field_attr": {
      const v = fields[rule.field];
      const a = v === undefined ? undefined : attr(v, rule.attr);
      let ok = false;
      if (a !== undefined) {
        if (rule.op === "eq") ok = a === rule.value;
        else if (rule.op === "lte") ok = Number(a) <= Number(rule.value);
        else ok = Number(a) >= Number(rule.value);
      }
      return c(ok, ok ? "Meets the requirement." : "Does not meet the requirement.");
    }
  }
}

/** Aggregate rule checks into one entry per public constraint id (all rules must pass). */
function rollUp(checks: ConstraintCheck[]): ConstraintCheck[] {
  const byId = new Map<string, ConstraintCheck>();
  for (const ch of checks) {
    const prev = byId.get(ch.constraint_id);
    if (!prev) byId.set(ch.constraint_id, { ...ch });
    else if (prev.passed && !ch.passed) byId.set(ch.constraint_id, { ...ch });
  }
  return [...byId.values()];
}

export function validateAnswer(
  format: AnswerFormat,
  config: ValidatorConfig,
  validatorVersion: string,
  answer: unknown,
): ValidationResult {
  const base = { engine: config.engine, engine_version: VALIDATOR_ENGINE_VERSION, validator_version: validatorVersion };
  const norm = normalizeAnswer(format, answer);
  if (!norm.value) {
    return { ...base, status: "unverified", checks: [], notes: [norm.reason ?? "Answer could not be interpreted."] };
  }
  const ans = norm.value;

  if (config.engine === "rules") {
    const checks = rollUp(config.rules.map((r) => checkRule(r, ans, config.attributes, format)));
    const ok = checks.every((ch) => ch.passed);
    return { ...base, status: ok ? "correct" : "incorrect", checks, notes: config.preferences.length ? ["Preferences (not graded): " + config.preferences.join(" ")] : [] };
  }

  // answer_key engine (debugging MVP): match any reviewed accepted answer.
  if (ans.kind !== "choice_fields") {
    return { ...base, status: "unverified", checks: [], notes: ["Answer key engine expects field answers."] };
  }
  const matched = config.accepted.some((acc) => Object.entries(acc).every(([k, v]) => ans.fields[k] === v) && Object.keys(ans.fields).length >= Object.keys(acc).length);
  const fieldMatches: Record<string, boolean> = {};
  const fieldIds = new Set(config.accepted.flatMap((a) => Object.keys(a)));
  for (const f of fieldIds) fieldMatches[f] = config.accepted.some((acc) => acc[f] === ans.fields[f]);
  return {
    ...base,
    status: matched ? "correct" : "incorrect",
    checks: [],
    field_matches: fieldMatches,
    notes: ["Checked against a reviewed answer key; no submitted code was executed."],
  };
}

/** Every syntactically possible answer for a format — used by the deterministic key tests. */
export function enumerateAnswers(format: AnswerFormat): FinalAnswer[] {
  if (format.kind === "choice_fields") {
    let acc: Record<string, string>[] = [{}];
    for (const field of format.fields) {
      const next: Record<string, string>[] = [];
      for (const partial of acc) for (const o of field.options) next.push({ ...partial, [field.id]: o.id });
      acc = next;
    }
    return acc.map((fields) => ({ fields }));
  }
  const ids = format.options.map((o) => o.id);
  const out: FinalAnswer[] = [];
  for (let mask = 0; mask < 1 << ids.length; mask++) {
    const sel = ids.filter((_, i) => mask & (1 << i));
    if (sel.length >= format.min && sel.length <= format.max) out.push({ selected: sel.sort() });
  }
  return out;
}

/** Canonical string for comparing answers (order-insensitive for multi-select). */
export function answerKey(answer: unknown): string {
  if (answer && typeof answer === "object" && "selected" in answer) {
    return "S:" + [...((answer as { selected: string[] }).selected ?? [])].sort().join(",");
  }
  const fields = (answer as { fields?: Record<string, string> })?.fields ?? {};
  return "F:" + Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join(",");
}

