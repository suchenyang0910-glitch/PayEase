import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";

type Migration = { filename: string; sql: string; checksum: string };

const compatibleMigrationChecksums = new Map<string, ReadonlySet<string>>([
  [
    "V0040__repayment_plan_breakdown_and_payroll_reporting.sql",
    new Set([
      "3cf93d177614b0e5c9a09f222b7c6b0d33216ce05c8af7be5bd6793fc87e744e",
    ]),
  ],
]);

const migrationFile = /^V\d{4}__[a-z0-9_]+\.sql$/;
const legacyBaselineFinal = "V0009__protect_paid_repayment_installments.sql";

async function availableMigrations(): Promise<Migration[]> {
  const sourceDirectory = dirname(fileURLToPath(import.meta.url));
  const directory = join(
    sourceDirectory,
    "..",
    "..",
    "broker-platform",
    "db",
    "migrations",
  );
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

async function canAdoptLegacyBaseline(client: PoolClient): Promise<boolean> {
  const result = await client.query<{
    applications: string | null;
    sessions: string | null;
    installments: string | null;
    reconciliation: string | null;
    adminSessions: string | null;
    immutableInstallments: string | null;
  }>(
    `SELECT to_regclass('public.applications')::text AS applications,
            to_regclass('public.telegram_auth_sessions')::text AS sessions,
            to_regclass('public.repayment_installments')::text AS installments,
            to_regclass('public.reconciliation_work_items')::text AS reconciliation,
            to_regclass('public.admin_sessions')::text AS "adminSessions",
            to_regprocedure('deny_paid_repayment_installment_mutation()')::text AS "immutableInstallments"`,
  );
  const row = result.rows[0];
  return Boolean(
    row?.applications &&
    row.sessions &&
    row.installments &&
    row.reconciliation &&
    row.adminSessions &&
    row.immutableInstallments,
  );
}

// Apply immutable, ordered SQL migrations before the API accepts traffic.
// Existing preview databases created before this runner can be adopted only
// when the complete V0001-V0009 baseline is already demonstrably present.
export async function runDatabaseMigrations(pool: Pool): Promise<void> {
  const migrations = await availableMigrations();
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(7020010)");
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename text PRIMARY KEY,
         checksum text NOT NULL,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const applied = await client.query<{ filename: string; checksum: string }>(
      "SELECT filename, checksum FROM schema_migrations",
    );
    const appliedByName = new Map(
      applied.rows.map((migration) => [migration.filename, migration.checksum]),
    );

    if (appliedByName.size === 0 && (await canAdoptLegacyBaseline(client))) {
      for (const migration of migrations) {
        if (migration.filename > legacyBaselineFinal) break;
        await client.query(
          "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
          [migration.filename, migration.checksum],
        );
        appliedByName.set(migration.filename, migration.checksum);
      }
    }

    for (const migration of migrations) {
      const previousChecksum = appliedByName.get(migration.filename);
      if (previousChecksum) {
        const compatibleChecksums = compatibleMigrationChecksums.get(
          migration.filename,
        );
        if (
          previousChecksum !== migration.checksum &&
          !compatibleChecksums?.has(previousChecksum)
        ) {
          throw new Error(`Migration checksum mismatch: ${migration.filename}`);
        }
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
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
      .query("SELECT pg_advisory_unlock(7020010)")
      .catch(() => undefined);
    client.release();
  }
}
