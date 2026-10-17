/**
 * Operational logging. Deliberately accepts only small structured metadata —
 * never participant free text, prompts, model outputs, or keys. Values longer
 * than 80 characters are truncated as an extra guard.
 */
type Meta = Record<string, string | number | boolean | null | undefined>;

function clean(meta: Meta): Meta {
  const out: Meta = {};
  for (const [k, v] of Object.entries(meta)) {
    if (/key|secret|token|password|text|explanation|answer|prompt/i.test(k) && k !== "token_total") continue;
    out[k] = typeof v === "string" && v.length > 80 ? v.slice(0, 80) + "…" : v;
  }
  return out;
}

export const log = {
  info(event: string, meta: Meta = {}) {
    if (process.env.NODE_ENV === "test") return;
    console.log(JSON.stringify({ level: "info", event, ...clean(meta), at: new Date().toISOString() }));
  },
  warn(event: string, meta: Meta = {}) {
    if (process.env.NODE_ENV === "test") return;
    console.warn(JSON.stringify({ level: "warn", event, ...clean(meta), at: new Date().toISOString() }));
  },
  error(event: string, err: unknown, meta: Meta = {}) {
    const name = err instanceof Error ? err.name : "unknown";
    const code = (err as { code?: string })?.code;
    // Messages of our own and pg errors don't contain participant text; still truncate defensively.
    const message = err instanceof Error ? err.message.slice(0, 160) : null;
    if (process.env.NODE_ENV === "test") return;
    console.error(JSON.stringify({ level: "error", event, error: name, code: code ?? null, message, ...clean(meta), at: new Date().toISOString() }));
  },
};

