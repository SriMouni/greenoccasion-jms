import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;

export const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || undefined,
  database: process.env.DB_NAME || 'library',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number.parseInt(process.env.DB_PORT || '5432', 10),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

export async function ensureLibrarySchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      abstract TEXT NOT NULL,
      topic TEXT NOT NULL,
      file_path TEXT NOT NULL,
      doi TEXT,
      license_url TEXT,
      status TEXT DEFAULT 'pending',
      downloads INTEGER DEFAULT 0,
      citations INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS authors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      institution TEXT NOT NULL,
      email TEXT NOT NULL,
      research_fields TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS paper_authors (
      paper_id TEXT REFERENCES papers(id),
      author_id TEXT REFERENCES authors(id),
      PRIMARY KEY (paper_id, author_id)
    );

    ALTER TABLE papers ADD COLUMN IF NOT EXISTS doi TEXT;
    ALTER TABLE papers ADD COLUMN IF NOT EXISTS license_url TEXT;
    ALTER TABLE papers ADD COLUMN IF NOT EXISTS downloads INTEGER DEFAULT 0;
    ALTER TABLE papers ADD COLUMN IF NOT EXISTS citations INTEGER DEFAULT 0;
    ALTER TABLE papers ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
    ALTER TABLE papers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE authors ADD COLUMN IF NOT EXISTS research_fields TEXT;
  `);
}

export async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
