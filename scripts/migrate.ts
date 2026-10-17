import "./_env";
/**
 * Applies db/migrations/*.sql in filename order, once each, recording them in
 * schema_migrations. Works against any PostgreSQL 14+ (local, Neon, Supabase, Render, …).
 *
 *   npm run db:migrate                 # uses DATABASE_URL
 *   npm run db:migrate -- --reset      # localhost only: drop everything and re-apply
 */
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const DEFAULT_URL = "postgresql://postgres@localhost:54330/reasoning_lite";

/**
 * Refuse to run on a database that already holds another app's tables (for example the
 * full Reasoning Lab, which tracks migrations elsewhere). Without this check the first
 * create fails with a confusing "already exists" error.
 */
async function assertNotForeignDatabase(client: Client, url: string) {
  const r = await client.query<{ ours: boolean; tables: string[] }>(
    `select to_regclass('public.schema_migrations') is not null as ours,
            coalesce(array_agg(table_name::text order by table_name) filter (where table_name <> 'schema_migrations'), '{}') as tables
       from information_schema.tables where table_schema = 'public'`,
  );
  const { ours, tables } = r.rows[0];
  if (!ours && tables.length) {
    const db = url.replace(/^.*\//, "").replace(/\?.*$/, "");
    throw new Error(
      [
        `Database "${db}" already contains tables from another app (${tables.slice(0, 4).join(", ")}${tables.length > 4 ? ", …" : ""}),`,
        "so Reasoning Lab (lite) won't touch it.",
        "Fix: point DATABASE_URL in .env.local at an empty database. The local default is",
        "  DATABASE_URL=postgresql://postgres@localhost:54330/reasoning_lite",
        "(run `npm run setup:env` to repair .env.local automatically, then `npm run setup:local`).",
      ].join("\n"),
    );
  }
}

export async function migrate(databaseUrl = process.env.DATABASE_URL ?? DEFAULT_URL, opts: { reset?: boolean; quiet?: boolean } = {}) {
  const local = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(databaseUrl);
  if (opts.reset && !local) throw new Error("--reset is only allowed against a localhost database");
  const ssl = process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined;
  const client = new Client({ connectionString: databaseUrl, ssl });
  await client.connect();
  try {
    if (opts.reset) await client.query("drop schema if exists public cascade; create schema public;");
    await assertNotForeignDatabase(client, databaseUrl);
    await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      const done = await client.query("select 1 from schema_migrations where name = $1", [file]);
      if (done.rowCount) continue;
      await client.query("begin");
      try {
        await client.query(fs.readFileSync(path.join(dir, file), "utf8"));
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        if (!opts.quiet) console.log(`applied ${file}`);
      } catch (e) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  migrate(undefined, { reset: process.argv.includes("--reset") })
    .then(() => console.log("migrations up to date"))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
