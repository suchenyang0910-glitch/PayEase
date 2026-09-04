const value = process.env.PAYEASE_TEST_DATABASE_URL;

if (!value) {
  console.error(
    "PAYEASE_TEST_DATABASE_URL is required for destructive lender-wallet-service integration tests.",
  );
  console.error(
    "Use the isolated PostgreSQL service database named payease_test; never point this command at DATABASE_URL.",
  );
  process.exit(1);
}

let databaseUrl;
try {
  databaseUrl = new URL(value);
} catch {
  console.error("PAYEASE_TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  process.exit(1);
}

const databaseName = databaseUrl.pathname.replace(/^\/+/, "");
if (
  !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
  databaseName !== "payease_test"
) {
  console.error(
    "Integration tests only accept a PostgreSQL database named payease_test because they create and destroy isolated schemas inside that service.",
  );
  process.exit(1);
}
