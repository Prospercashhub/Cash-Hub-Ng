// Cash Hub NG — Neon PostgreSQL connection
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
});

async function initializeDatabase() {
  // The core users/transactions/withdrawals tables already exist in Neon.
  // These CREATE TABLE statements are idempotent and add the two auxiliary
  // tables used by the existing Cash Hub NG backend.
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS referrals (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT now(),
      metadata JSONB
    );

    CREATE INDEX IF NOT EXISTS referrals_inviter_idx
      ON referrals (inviter_id);

    CREATE INDEX IF NOT EXISTS referrals_referred_idx
      ON referrals (referred_user_id);

    CREATE TABLE IF NOT EXISTS completed_tasks (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (user_id, task_id)
    );

    CREATE INDEX IF NOT EXISTS completed_tasks_user_idx
      ON completed_tasks (user_id);

    CREATE INDEX IF NOT EXISTS completed_tasks_task_idx
      ON completed_tasks (task_id);
  `);
}

async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  initializeDatabase,
  closePool
};
