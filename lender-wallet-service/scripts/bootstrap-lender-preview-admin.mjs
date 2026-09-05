import { Pool } from "pg";
import { hashLenderOperatorPassword } from "../dist/operator-passwords.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
const loginName = process.env.PAYEASE_LENDER_BOOTSTRAP_LOGIN?.trim();
const password = process.env.PAYEASE_LENDER_BOOTSTRAP_PASSWORD;
const preferredLanguage =
  process.env.PAYEASE_LENDER_BOOTSTRAP_LANGUAGE?.trim() || "en";

if (process.env.PAYEASE_LENDER_DEPLOYMENT_MODE !== "controlled-preview") {
  throw new Error("Bootstrap is limited to controlled-preview mode.");
}
if (!databaseUrl || !loginName || !password) {
  throw new Error(
    "DATABASE_URL, PAYEASE_LENDER_BOOTSTRAP_LOGIN, and PAYEASE_LENDER_BOOTSTRAP_PASSWORD are required.",
  );
}
if (!/^[a-z0-9._-]{3,64}$/.test(loginName)) {
  throw new Error("Bootstrap login name is invalid.");
}
if (password.length < 12) {
  throw new Error("Bootstrap password must contain at least 12 characters.");
}
if (!new Set(["zh-CN", "en", "km"]).has(preferredLanguage)) {
  throw new Error("Bootstrap language must be zh-CN, en, or km.");
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const existing = await client.query(
    `SELECT 1
       FROM lender_operator_account_roles
      WHERE role_code = 'LENDER_WALLET_ADMIN'
      LIMIT 1
      FOR SHARE`,
  );
  if (existing.rowCount) {
    throw new Error(
      "A lender administrator already exists; bootstrap is closed.",
    );
  }
  const passwordHash = await hashLenderOperatorPassword(password);
  const account = await client.query(
    `INSERT INTO lender_operator_accounts
       (login_name, password_hash, preferred_language)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [loginName, passwordHash, preferredLanguage],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error("Failed to create bootstrap administrator.");
  await client.query(
    `INSERT INTO lender_operator_account_roles (account_id, role_code)
     VALUES ($1, 'LENDER_WALLET_ADMIN')`,
    [accountId],
  );
  await client.query(
    `INSERT INTO lender_operator_auth_audit_events
       (actor_ref, event_name, subject_ref, details)
     VALUES ($1, 'LENDER_OPERATOR_BOOTSTRAPPED', $2, $3::jsonb)`,
    [
      "controlled-preview-bootstrap",
      accountId,
      JSON.stringify({ loginName, preferredLanguage }),
    ],
  );
  await client.query("COMMIT");
  console.log(`Bootstrap administrator created: ${loginName}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
