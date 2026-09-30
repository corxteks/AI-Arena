// Cadangan otomatis harian (dipanggil oleh Vercel Cron, lihat vercel.json).
// Menyalin isi tabel penting sebagai satu berkas JSON, lalu menyimpannya ke repo GitHub
// sendiri (folder backups/) lewat GitHub API. Tidak menyentuh data produksi sama sekali (read-only).
import { query } from '../../src/db.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });

  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO;
  if (!token || !repo) return res.status(500).json({ error: 'GITHUB_TOKEN/GITHUB_REPO belum diatur.' });

  const tables = ['users', 'clubs', 'club_members', 'invites', 'app_state', 'streams', 'settings'];
  const dump = {};
  for (const t of tables) dump[t] = (await query(`SELECT * FROM ${t}`)).rows;

  const day = new Date().toISOString().slice(0, 10);
  const path = `backups/backup-${day}.json`;
  const content = Buffer.from(JSON.stringify(dump, null, 2)).toString('base64');

  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'ai-arena-backup' },
    body: JSON.stringify({ message: `Cadangan otomatis ${day}`, content }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(502).json({ error: 'Gagal menyimpan ke GitHub: ' + (body.message || r.status) });
  res.json({ ok: true, path, tables: Object.fromEntries(tables.map(t => [t, dump[t].length])) });
}
