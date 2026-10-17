/**
 * Local PostgreSQL for development and tests
 * using trust auth bound to localhost only.
 *
 *   node scripts/local-db.mjs start   # create (first time) and start; create app/test databases
 *   node scripts/local-db.mjs stop
 *   node scripts/local-db.mjs reset   # stop, delete the cluster, start fresh
 *   node scripts/local-db.mjs status
 *
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const isWin = process.platform === "win32";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.LOCAL_DB_PORT ?? 54330);
const DATA_DIR =
  process.env.LOCAL_DB_DIR ??
  (isWin ? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "reasoning-lab-lite", "pgdata") : path.join(repo, ".local-db"));
const DATABASES = ["reasoning_lite", "reasoning_lite_test", "reasoning_lite_e2e"];
const exe = (name) => (isWin ? `${name}.exe` : name);

function versionDirs(base, sub = "bin") {
  try {
    return fs
      .readdirSync(base)
      .filter((d) => /^\d+(\.\d+)?$/.test(d))
      .sort((a, b) => parseFloat(b) - parseFloat(a))
      .map((d) => path.join(base, d, sub));
  } catch {
    return [];
  }
}

function findBinDir() {
  const candidates = [];
  if (process.env.PGBIN) candidates.push(process.env.PGBIN);
  candidates.push(...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean));
  if (isWin) {
    for (const pf of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], "C:\\Program Files"].filter(Boolean)) {
      candidates.push(...versionDirs(path.join(pf, "PostgreSQL")));
    }
  } else if (process.platform === "darwin") {
    candidates.push(
      "/opt/homebrew/opt/postgresql@16/bin",
      "/usr/local/opt/postgresql@16/bin",
      "/Applications/Postgres.app/Contents/Versions/latest/bin",
    );
  } else {
    candidates.push(...versionDirs("/usr/lib/postgresql"));
  }
  return candidates.find((dir) => fs.existsSync(path.join(dir, exe("pg_ctl"))) && fs.existsSync(path.join(dir, exe("initdb"))));
}

const BIN = findBinDir();
if (!BIN) {
  console.error(
    [
      "Could not find PostgreSQL server tools (initdb / pg_ctl).",
      isWin
        ? "Install PostgreSQL 16 for Windows (https://www.postgresql.org/download/windows/ — keep 'Command Line Tools' and 'PostgreSQL Server' ticked),\nor run:  winget install -e --id PostgreSQL.PostgreSQL.16\nThen open a NEW terminal, or set PGBIN, e.g.  $env:PGBIN = 'C:\\Program Files\\PostgreSQL\\16\\bin'"
        : "Install PostgreSQL 16 (macOS: brew install postgresql@16; Ubuntu: sudo apt install postgresql-16) or set PGBIN to its bin folder.",
    ].join("\n"),
  );
  process.exit(1);
}

// PostgreSQL refuses to run as root on Unix (e.g. inside containers); drop to an unprivileged user.
const runAsUser = !isWin && process.getuid?.() === 0 ? (process.env.LOCAL_DB_USER ?? (spawnSync("id", ["claude"]).status === 0 ? "claude" : "postgres")) : null;

function run(tool, args, { quiet = false } = {}) {
  const bin = path.join(BIN, exe(tool));
  const [cmd, cmdArgs] = runAsUser ? ["runuser", ["-u", runAsUser, "--", bin, ...args]] : [bin, args];
  // stdio must not be piped for pg_ctl start: the server inherits the handles and a pipe would never close.
  const r = spawnSync(cmd, cmdArgs, { stdio: quiet ? "ignore" : "inherit", windowsHide: true });
  if (r.error) throw r.error;
  return r.status ?? 1;
}

function isRunning() {
  return fs.existsSync(path.join(DATA_DIR, "PG_VERSION")) && run("pg_ctl", ["-D", DATA_DIR, "status"], { quiet: true }) === 0;
}

async function ensureDatabases() {
  const client = new pg.Client({ connectionString: `postgresql://postgres@localhost:${PORT}/postgres` });
  await client.connect();
  try {
    for (const db of DATABASES) {
      const exists = await client.query("select 1 from pg_database where datname = $1", [db]);
      if (!exists.rowCount) {
        await client.query(`create database ${db}`);
        console.log(`created database ${db}`);
      }
    }
  } finally {
    await client.end();
  }
}

async function start() {
  if (!fs.existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (runAsUser) spawnSync("chown", ["-R", runAsUser, DATA_DIR]);
    console.log(`Creating local database cluster in ${DATA_DIR}`);
    const code = run("initdb", ["-D", DATA_DIR, "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--no-locale"], { quiet: false });
    if (code !== 0) throw new Error("initdb failed (see messages above)");
  }
  if (isRunning()) {
    console.log(`Local Postgres already running on port ${PORT}`);
  } else {
    const serverOpts = [`-p ${PORT}`, "-c listen_addresses=localhost"];
    if (!isWin) serverOpts.push("-c unix_socket_directories=/tmp");
    const code = run("pg_ctl", ["-D", DATA_DIR, "-l", path.join(DATA_DIR, "server.log"), "-o", serverOpts.join(" "), "-w", "start"]);
    if (code !== 0) throw new Error(`pg_ctl start failed — see ${path.join(DATA_DIR, "server.log")}`);
    console.log(`Local Postgres started on port ${PORT}`);
  }
  await ensureDatabases();
}

function stop() {
  if (!isRunning()) {
    console.log("Local Postgres is not running");
    return;
  }
  run("pg_ctl", ["-D", DATA_DIR, "-m", "fast", "-w", "stop"]);
}

const cmd = process.argv[2] ?? "start";
try {
  if (cmd === "start") await start();
  else if (cmd === "stop") stop();
  else if (cmd === "status") console.log(isRunning() ? `running on port ${PORT} (data: ${DATA_DIR})` : `stopped (data: ${DATA_DIR})`);
  else if (cmd === "reset") {
    stop();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    await start();
  } else {
    console.error("usage: node scripts/local-db.mjs start|stop|status|reset");
    process.exit(1);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
