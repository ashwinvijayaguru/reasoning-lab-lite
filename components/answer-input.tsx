"use client";
import { useId } from "react";
import type { AnswerFormat } from "@/lib/problems/types";
import { cn } from "@/lib/utils";

export type AnswerValue = { fields: Record<string, string> } | { selected: string[] };

export function emptyAnswer(format: AnswerFormat): AnswerValue {
  return format.kind === "choice_fields" ? { fields: {} } : { selected: [] };
}

export function answerComplete(format: AnswerFormat, v: AnswerValue): boolean {
  if (format.kind === "choice_fields") {
    const f = (v as { fields: Record<string, string> }).fields ?? {};
    return format.fields.every((x) => !!f[x.id]);
  }
  const n = ((v as { selected: string[] }).selected ?? []).length;
  return n >= format.min && n <= format.max;
}

/**
 * Renders any supported answer format with native, labelled controls:
 * radio cards when options carry code or there are few options, a <select> otherwise,
 * and checkboxes for multi-select.
 */
export function AnswerInput({ format, value, onChange, disabled }: { format: AnswerFormat; value: AnswerValue; onChange: (v: AnswerValue) => void; disabled?: boolean }) {
  const base = useId();
  if (format.kind === "multi_select") {
    const selected = (value as { selected: string[] }).selected ?? [];
    const toggle = (id: string) => onChange({ selected: selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id] });
    return (
      <fieldset disabled={disabled} className="min-w-0">
        <legend className="text-sm font-semibold text-ink">{format.instructions}</legend>
        <p className="mt-1 text-xs text-ink-muted" aria-live="polite">
          {selected.length} of {format.min === format.max ? format.min : `${format.min}–${format.max}`} selected
        </p>
        <div className="mt-3 space-y-2">
          {format.options.map((o) => {
            const id = `${base}-${o.id}`;
            const checked = selected.includes(o.id);
            return (
              <label
                key={o.id}
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-[15px] transition-colors",
                  checked ? "border-human bg-human-soft" : "border-line-strong bg-paper hover:bg-canvas",
                )}
              >
                <input id={id} type="checkbox" className="mt-1 size-[18px] shrink-0 accent-[var(--color-human)]" checked={checked} onChange={() => toggle(o.id)} />
                <span className="text-ink">{o.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  const fields = (value as { fields: Record<string, string> }).fields ?? {};
  const set = (fid: string, oid: string) => onChange({ fields: { ...fields, [fid]: oid } });
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-5">
      <legend className="text-sm font-semibold text-ink">{format.instructions}</legend>
      {format.fields.map((f) => {
        const asCards = f.options.some((o) => o.code) || (format.fields.length === 1 && f.options.length <= 6) || f.options.length <= 3;
        const fid = `${base}-${f.id}`;
        if (!asCards) {
          return (
            <div key={f.id} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <label htmlFor={fid} className="text-[15px] font-semibold text-ink">
                {f.label}
              </label>
              <select
                id={fid}
                value={fields[f.id] ?? ""}
                onChange={(e) => set(f.id, e.target.value)}
                className="h-11 w-full rounded-xl border border-line-strong bg-paper px-3 text-[15px] text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus sm:w-64"
              >
                <option value="">Choose…</option>
                {f.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        return (
          <fieldset key={f.id} className="min-w-0">
            <legend className="mb-2 text-[15px] font-semibold text-ink">{f.label}</legend>
            <div className={cn("grid grid-cols-1 gap-2", !f.options.some((o) => o.code) && f.options.length > 2 && "sm:grid-cols-2")}>
              {f.options.map((o) => {
                const id = `${fid}-${o.id}`;
                const checked = fields[f.id] === o.id;
                return (
                  <label
                    key={o.id}
                    htmlFor={id}
                    className={cn(
                      "flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-[15px] transition-colors",
                      checked ? "border-human bg-human-soft" : "border-line-strong bg-paper hover:bg-canvas",
                    )}
                  >
                    <input id={id} type="radio" name={fid} value={o.id} checked={checked} onChange={() => set(f.id, o.id)} className="mt-1 size-[18px] shrink-0 accent-[var(--color-human)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-ink">
                        {o.code && <span className="mr-1.5 font-mono text-xs font-bold text-ink-muted">{o.id.toUpperCase()}.</span>}
                        {o.label}
                      </span>
                      {o.code && <code className="mt-1.5 block overflow-x-auto whitespace-pre rounded-lg bg-[#14213a] px-3 py-2 font-mono text-[12.5px] text-[#e9edf5]">{o.code}</code>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </fieldset>
  );
}
