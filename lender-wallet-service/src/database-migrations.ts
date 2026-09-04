import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

type Migration = Readonly<{
  filename: string;
  sql: string;
  checksum: string;
}>;

const migrationFile = /^V\d{4}__[a-z0-9_]+\.sql$/;

async function availableMigrations(): Promise<Migration[]> {
  const sourceDirectory = dirname(fileURLToPath(import.meta.url));
  const directory = join(sourceDirectory, "..", "db", "migrations");
  const filenames = (await readdir(directory))
    .filter((filename) => migrationFile.test(filename))
    .sort();
  return Promise.all(
    filenames.map(async (filename) => {
      const sql = await readFile(join(directory, filename), "utf8");
      return {
        filename,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

export async function runDatabaseMigrations(pool: Pool): Promise<void> {
  const migrations = await availableMigrations();
  const client = await pool.connect();
  try {
    // The lender service has an independent database authority. A dedicated
    // migration ledger and lock prevent its V0001 baseline from colliding with
    // Broker migrations when an isolated integration database hosts both
    // domains for transport verification.
    await client.query("SELECT pg_advisory_lock(7020013)");
    await client.query(
      `CREATE TABLE IF NOT EXISTS lender_wallet_schema_migrations (
         filename text PRIMARY KEY,
         checksum text NOT NULL,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const applied = await client.query<{ filename: string; checksum: string }>(
      "SELECT filename, checksum FROM lender_wallet_schema_migrations",
    );
    const appliedByName = new Map(
      applied.rows.map((migration: { filename: string; checksum: string }) => [
        migration.filename,
        migration.checksum,
      ]),
    );
    for (const migration of migrations) {
      if (appliedByName.get(migration.filename) === migration.checksum) {
        continue;
      }
      if (appliedByName.has(migration.filename)) {
        throw new Error(`Migration checksum mismatch: ${migration.filename}`);
      }
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO lender_wallet_schema_migrations (filename, checksum) VALUES ($1, $2)",
          [migration.filename, migration.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(7020013)")
      .catch(() => undefined);
    client.release();
  }
}
