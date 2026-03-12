/**
 * Validates that every migration SQL file in src/db/migrations/ is listed
 * in the Drizzle journal (_journal.json). Run this in CI to catch the case
 * where a migration file was created but the journal was not updated.
 */
import fs from "fs";
import path from "path";

const migrationsDir = path.join(process.cwd(), "src/db/migrations");
const journalPath = path.join(migrationsDir, "meta/_journal.json");

const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
const journalTags: Set<string> = new Set(
  journal.entries.map((e: { tag: string }) => e.tag)
);

const sqlFiles = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => path.basename(f, ".sql"));

const missing = sqlFiles.filter((tag) => !journalTags.has(tag));

if (missing.length > 0) {
  console.error("❌ Migration files not listed in _journal.json:");
  missing.forEach((f) => console.error(`   - ${f}.sql`));
  console.error(
    "\nRun `npm run db:generate` to generate migrations properly, or add the missing entries to _journal.json."
  );
  process.exit(1);
}

console.log(`✅ All ${sqlFiles.length} migration(s) are registered in the journal.`);
