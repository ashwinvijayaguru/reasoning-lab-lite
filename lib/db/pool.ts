import "server-only";
import { Pool, type PoolClient } from "pg";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

declare global {
  var __rlPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!globalThis.__rlPool) {
    const e = env();
    globalThis.__rlPool = new Pool({
      connectionString: e.DATABASE_URL,
      max: e.DATABASE_POOL_MAX,
      ssl: e.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
      idleTimeoutMillis: 10_000,
      statement_timeout: 15_000,
    });
  }
  return globalThis.__rlPool;
}

export type Db = PoolClient;

/** Map the custom SQLstates raised by the migration to user-facing errors. */
export function mapDbError(err: unknown): unknown {
  switch ((err as { code?: string })?.code) {
    case "RL404": return new AppError(404, "not_found", "Attempt not found.");
    case "RL409": return new AppError(409, "already_locked", "This attempt is already submitted.");
    case "RL422":
    case "RL423": return new AppError(409, "immutable", "That change is not allowed.");
    case "23505": return new AppError(409, "duplicate", "That record already exists.");
    case "23514": return new AppError(400, "invalid_input", "Some input is outside the allowed limits.");
    default: return err;
  }
}

/**
 * Run work in one transaction. The server is the only database client, so every
 * query touching participant data must filter by the signed in participant id.
 */
export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw mapDbError(err);
  } finally {
    client.release();
  }
}
