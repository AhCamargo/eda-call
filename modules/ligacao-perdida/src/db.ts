import { Pool } from "pg";
import { DEFAULT_SETTINGS, Settings, validateSettings } from "./settings";

// O módulo guarda tudo num schema próprio do Postgres do EdaCall. Não lê nem
// escreve nas tabelas do núcleo: os fatos chegam pela API de eventos.
export const SCHEMA = "ligacao_perdida";

export const createPool = (databaseUrl: string) => new Pool({ connectionString: databaseUrl, max: 5 });

export const migrate = async (pool: Pool) => {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS ${SCHEMA};

    CREATE TABLE IF NOT EXISTS ${SCHEMA}.settings (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${SCHEMA}.state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ${SCHEMA}.missed_calls (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT UNIQUE,
      unique_id TEXT,
      phone_raw TEXT NOT NULL DEFAULT '',
      phone TEXT,
      is_mobile BOOLEAN NOT NULL DEFAULT FALSE,
      missed_at TIMESTAMPTZ NOT NULL,
      due_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reason TEXT,
      message TEXT,
      sent_at TIMESTAMPTZ,
      attempts INTEGER NOT NULL DEFAULT 0,
      is_test BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS missed_calls_pending ON ${SCHEMA}.missed_calls (status, due_at);
    CREATE INDEX IF NOT EXISTS missed_calls_phone_sent ON ${SCHEMA}.missed_calls (phone, sent_at);

    CREATE TABLE IF NOT EXISTS ${SCHEMA}.contacts (
      phone TEXT PRIMARY KEY,
      last_answered_at TIMESTAMPTZ NOT NULL
    );
  `);
};

export const getSettings = async (pool: Pool): Promise<Settings> => {
  const { rows } = await pool.query(`SELECT data FROM ${SCHEMA}.settings WHERE id = 1`);
  if (!rows.length) return DEFAULT_SETTINGS;
  try {
    return validateSettings(rows[0].data, DEFAULT_SETTINGS);
  } catch {
    return { ...DEFAULT_SETTINGS, ...rows[0].data };
  }
};

export const saveSettings = async (pool: Pool, settings: Settings) => {
  await pool.query(
    `INSERT INTO ${SCHEMA}.settings (id, data, updated_at) VALUES (1, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [JSON.stringify(settings)],
  );
};

export const getState = async (pool: Pool, key: string): Promise<string | null> => {
  const { rows } = await pool.query(`SELECT value FROM ${SCHEMA}.state WHERE key = $1`, [key]);
  return rows[0]?.value ?? null;
};

export const setState = async (pool: Pool | { query: Pool["query"] }, key: string, value: string) => {
  await pool.query(
    `INSERT INTO ${SCHEMA}.state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  );
};
