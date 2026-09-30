// Titik masuk untuk Vercel (fungsi serverless). Membungkus app Express yang sama
// persis dipakai di server/src/app.js, supaya logikanya tidak perlu ditulis ulang.
import serverless from 'serverless-http';
import { config, assertConfig } from '../src/config.js';
import { migrate } from '../src/migrate.js';
import { createApp } from '../src/app.js';

assertConfig();

// Migrasi dijalankan sekali saat fungsi "dingin" (cold start), memakai variabel modul
// supaya panggilan berikutnya pada instans yang sama (warm) tidak mengulang migrasi.
let ready;
function ensureReady() {
  if (!ready) ready = migrate().catch(e => { ready = null; throw e; });
  return ready;
}

const app = createApp();
const handler = serverless(app);

export default async function (req, res) {
  await ensureReady();
  return handler(req, res);
}
