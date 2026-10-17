import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { AppError, isAppError } from "@/lib/errors";
import { log } from "@/lib/log";

export const MAX_BODY_BYTES = 16 * 1024;

/** Every API response is private and uncached: results are per-user. */
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } });
}

export async function readJson<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new AppError(413, "too_large", "That submission is too long.");
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new AppError(413, "too_large", "That submission is too long.");
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new AppError(400, "invalid_json", "The request could not be read.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError(400, "invalid_input", firstIssue(parsed.error));
  return parsed.data;
}

function firstIssue(e: ZodError): string {
  const i = e.issues[0];
  return i ? `${i.path.join(".") || "input"}: ${i.message}` : "Invalid input.";
}

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (isAppError(err)) return json({ error: { code: err.code, message: err.userMessage } }, err.status);
      log.error("api_unhandled", err);
      return json({ error: { code: "server_error", message: "Something went wrong on our side. Your saved work is not affected." } }, 500);
    }
  };
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

