#!/usr/bin/env node
/**
 * Creates .env.local from .env.example (if it doesn't exist yet) and fills in a random
 * SESSION_SECRET. Works on Windows, macOS and Linux — no openssl or shell tricks needed.
 *
 *   node scripts/setup-env.mjs          # safe to re-run: never overwrites an existing secret
 *   node scripts/setup-env.mjs --rotate # replace SESSION_SECRET (signs every guest out)
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const example = path.join(repo, ".env.example");
const target = path.join(repo, ".env.local");
const rotate = process.argv.includes("--rotate");

if (!fs.existsSync(target)) {
  fs.copyFileSync(example, target);
  console.log("created .env.local from .env.example");
}

const eol = /\r\n/.test(fs.readFileSync(target, "utf8")) ? "\r\n" : "\n";
let lines = fs.readFileSync(target, "utf8").split(/\r?\n/);

// A .env.local copied from the full Reasoning Lab points at that app's local database
// (port 54329, reasoning_lab). The lite app has its own (port 54330, reasoning_lite).
const LITE_URL = "postgresql://postgres@localhost:54330/reasoning_lite";
lines = lines.map((l) => {
  if (/^\s*DATABASE_URL\s*=\s*postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1):54329\//.test(l)) {
    console.log("updated DATABASE_URL in .env.local to the lite app's own local database (port 54330)");
    return `DATABASE_URL=${LITE_URL}`;
  }
  return l;
});
fs.writeFileSync(target, lines.join(eol));
const secretLines = lines.map((l, i) => [l, i]).filter(([l]) => /^\s*SESSION_SECRET\s*=/.test(l));
const hasValue = secretLines.some(([l]) => l.split("=").slice(1).join("=").trim().length >= 32);

if (hasValue && !rotate) {
  console.log(".env.local already has a SESSION_SECRET — left unchanged");
} else {
  const secret = crypto.randomBytes(32).toString("hex");
  // Keep exactly one SESSION_SECRET line.
  lines = lines.filter((l) => !/^\s*SESSION_SECRET\s*=/.test(l));
  const at = secretLines.length ? Math.min(secretLines[0][1], lines.length) : lines.length;
  lines.splice(at, 0, `SESSION_SECRET=${secret}`);
  fs.writeFileSync(target, lines.join(eol));
  console.log(`${rotate && hasValue ? "rotated" : "set"} SESSION_SECRET in .env.local (value not printed)`);
}

