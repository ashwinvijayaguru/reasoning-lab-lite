import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env, sessionSecret } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { withTx } from "@/lib/db/pool";

const COOKIE = "rl_session";
const MAX_AGE = 60 * 60 * 24 * 30;
const key = () => new TextEncoder().encode(sessionSecret());

async function cookieUserId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"], issuer: "reasoning-lab" });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** The signed-in participant, or null (also null once their data was deleted). */
export async function currentParticipantId(): Promise<string | null> {
  const id = await cookieUserId();
  if (!id) return null;
  const r = await withTx((c) => c.query("select 1 from participants where id = $1", [id]));
  return r.rowCount ? id : null;
}

export async function requireParticipant(): Promise<string> {
  const id = await currentParticipantId();
  if (!id) throw new AppError(401, "no_session", "Please start a guest session first.");
  return id;
}

const ipHits = new Map<string, number[]>();
/** Best-effort, per-server-instance limit on new guest sessions per IP address. */
export function allowGuestCreation(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (hits.length >= env().MAX_GUESTS_PER_IP_PER_HOUR) return false;
  hits.push(now);
  ipHits.set(ip, hits);
  return true;
}

export async function startGuestSession(): Promise<string> {
  const e = env();
  const id = await withTx(async (c) => {
    const r = await c.query<{ id: string }>(
      "insert into participants (pseudonym, notice_version) values ($1, $2) returning id",
      [`guest-${crypto.randomBytes(3).toString("hex")}`, e.NOTICE_VERSION],
    );
    return r.rows[0].id;
  });
  const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(id).setIssuer("reasoning-lab").setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: e.NODE_ENV === "production", path: "/", maxAge: MAX_AGE });
  return id;
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

