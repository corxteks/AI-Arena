import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './db.js';

const dir = dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const sql = readFileSync(join(dir, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
}

// Jalankan langsung: npm run migrate
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  migrate()
    .then(() => { console.log('Migrasi selesai.'); return pool.end(); })
    .catch(e => { console.error('Migrasi gagal:', e.message); process.exit(1); });
}
