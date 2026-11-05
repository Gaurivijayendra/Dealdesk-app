import { randomUUID } from "node:crypto";
import pg from "pg";

// Never use the application's tables, migrations or seed. Every connection is
// restricted to this run's private schema (no public fallback in search_path).
if (!process.env.DATABASE_URL) {
  throw new Error("HTTP regression tests require DATABASE_URL for a development/test PostgreSQL database. Run test:unit for database-free tests.");
}
const schema = `dealdesk_test_${randomUUID().replaceAll("-", "")}`;
export const testPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  options: `-c search_path=${schema}`,
  max: 4,
  connectionTimeoutMillis: 10000,
});

export async function setupDatabase() {
  await testPool.query(`CREATE SCHEMA "${schema}"`);
  await testPool.query(`
    CREATE TABLE dealdesk_policy (id text PRIMARY KEY, data jsonb NOT NULL);
    CREATE TABLE dealdesk_quotes (id text PRIMARY KEY, data jsonb NOT NULL);
    CREATE TABLE dealdesk_sessions (
      token_hash text PRIMARY KEY, role text NOT NULL, expires_at timestamptz NOT NULL
    );
  `);
}

export async function resetDatabase(policy: unknown) {
  await testPool.query("TRUNCATE dealdesk_quotes, dealdesk_sessions, dealdesk_policy");
  await testPool.query("INSERT INTO dealdesk_policy (id, data) VALUES ('default', $1::jsonb)", [JSON.stringify(policy)]);
}

export async function cleanupDatabase() {
  try {
    await testPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await testPool.end();
  }
}
