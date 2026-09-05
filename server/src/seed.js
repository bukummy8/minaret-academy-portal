import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { pool } from './db.js';

dotenv.config();

const name = process.env.ADMIN_NAME || 'Academy Admin';
const email = process.env.ADMIN_EMAIL || 'admin@minaret.local';
const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

const hash = await bcrypt.hash(password, 12);

await pool.query(
  `INSERT INTO users (name, email, password_hash, role)
   VALUES ($1::varchar, $2::varchar, $3::text, 'ADMIN')
   ON CONFLICT (email) DO NOTHING`,
  [name, email, hash]
);

const courses = [
  ['Quranic Studies & Tajweed', 'دراسات القرآن والتجويد'],
  ['Arabic Language Proficiency', 'إتقان اللغة العربية'],
  ['Islamic Studies', 'الدراسات الإسلامية']
];

for (const [en, ar] of courses) {
  await pool.query(
    `INSERT INTO courses (name, name_ar)
     SELECT $1::varchar, $2::varchar
     WHERE NOT EXISTS (
       SELECT 1 FROM courses WHERE name = $1::varchar
     )`,
    [en, ar]
  );
}

console.log(`Admin ready: ${email}`);

await pool.end();