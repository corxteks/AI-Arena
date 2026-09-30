// Titik masuk untuk Vercel (fungsi serverless). Vercel memanggil ini persis seperti
// server Node.js biasa (req, res) — bukan format Lambda — jadi app Express dari
// server/src/app.js bisa dipakai langsung tanpa pembungkus tambahan.
import { assertConfig } from '../src/config.js';
import { migrate } from '../src/migrate.js';
import { createApp } from '../src/app.js';

assertConfig();

// Migrasi dijalankan sekali saat fungsi "dingin" (cold start); pada instans yang
// masih hangat, panggilan berikutnya memakai promise yang sama tanpa mengulang.
let ready;
function ensureReady() {
  if (!ready) ready = migrate().catch(e => { ready = null; throw e; });
  return ready;
}

const app = createApp();

export default async function handler(req, res) {
  await ensureReady();
  return app(req, res);
}
