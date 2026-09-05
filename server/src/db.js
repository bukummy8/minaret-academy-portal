import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The .env file is in the project root, one level above server/
const envPath = path.resolve(__dirname, '../../.env');

dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
  throw new Error(`DATABASE_URL was not loaded from ${envPath}`);
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query(text, params) {
  return pool.query(text, params);
}