/**
 * Server configuration, validated once with Zod. Import only from server code.
 * Nothing here reaches the browser.
 */
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NOTICE_VERSION: z.string().min(1).max(40).default("lite-notice-2026-10-11"),
  DATABASE_URL: z.string().url().default("postgresql://postgres@localhost:54330/reasoning_lite"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  DATABASE_SSL: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  SESSION_SECRET: z.string().min(32).optional(),
  MAX_ATTEMPTS_PER_DAY: z.coerce.number().int().min(1).max(500).default(30),
  MAX_GUESTS_PER_IP_PER_HOUR: z.coerce.number().int().min(1).max(1000).default(20),
});

export type Env = z.infer<typeof EnvSchema>;
let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  // Treat empty values (e.g. `SESSION_SECRET=` copied from .env.example) as unset.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    // Report variable names only — never values, which may be secrets.
    throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache() {
  cached = null;
}

const DEV_SESSION_SECRET = "dev-only-insecure-session-secret-change-me-0000";
/** Checked when a session is signed/verified, so `next build` doesn't need runtime secrets. */
export function sessionSecret(): string {
  const e = env();
  if (e.SESSION_SECRET) return e.SESSION_SECRET;
  if (e.NODE_ENV === "production") throw new Error("SESSION_SECRET (32+ chars) is required in production");
  return DEV_SESSION_SECRET;
}
