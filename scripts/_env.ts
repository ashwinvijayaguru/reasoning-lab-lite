/** Loads .env.local then .env (if present) for CLI scripts; real environment variables win. */
import fs from "node:fs";
for (const file of [".env.local", ".env"]) {
  if (fs.existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* malformed file: ignore and rely on the real environment */
    }
  }
}
