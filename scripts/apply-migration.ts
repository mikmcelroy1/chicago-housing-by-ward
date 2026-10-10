/**
 * Apply one SQL migration file to the live DB. House rule:
 * migrations in supabase/migrations/ are applied via DATABASE_URL AND
 * committed as files — keep both in sync.
 *
 *   npm run migrate -- 013_matters_canonical.sql
 *
 * The file is sent as a single multi-statement query, which Postgres runs in
 * one implicit transaction (all-or-nothing) as long as the file itself has no
 * explicit BEGIN/COMMIT. Prints per-statement command tags + row counts as the
 * receipt.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

async function main() {
  const name = process.argv[2];
  if (!name) throw new Error("usage: npm run migrate -- <file name in supabase/migrations/>");
  const path = join(import.meta.dirname, "..", "supabase", "migrations", name);
  const sql = readFileSync(path, "utf8");
  // BEGIN inside a dollar-quoted body (a DO block or plpgsql function) is a block opener, not a
  // transaction. Only a top-level BEGIN/COMMIT is the problem.
  const outsideDollarQuotes = sql.replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1\$/g, "");
  if (/^\s*(begin|commit)\b/im.test(outsideDollarQuotes)) {
    throw new Error(`${name} contains explicit BEGIN/COMMIT — remove them; the runner provides the transaction`);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Run via: npm run migrate (loads .env.local)");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log(`Applying ${name} ...`);
    const result = await client.query(sql);
    const results = Array.isArray(result) ? result : [result];
    for (const r of results) {
      console.log(`  ${r.command ?? "?"}${r.rowCount !== null && r.rowCount !== undefined ? ` (${r.rowCount} rows)` : ""}`);
    }
    console.log(`${name} applied: ${results.length} statements.`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
