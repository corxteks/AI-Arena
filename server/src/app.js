import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { query } from './db.js';
import * as auth from './auth.js';
import * as yt from './youtube.js';
import { HttpError, verifyToken } from './util.js';

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: false }));
  // Jaringan lokal (localhost dan IP pribadi) hanya diizinkan bila CORS_ALLOW_LAN=1, untuk mencoba dari HP di Wi-Fi yang sama.
  const LAN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;
  app.use(cors({
    origin(origin, cb) {
      if (!origin || config.corsOrigins.includes(origin) || (config.corsAllowLan && LAN.test(origin))) return cb(null, true);
      cb(new HttpError(403, 'Asal tidak diizinkan.'));
    },
  }));
  app.use(express.json({ limit: '8mb' }));

  const strict = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.authRateLimit, standardHeaders: true, legacyHeaders: false, message: { error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' } });

  const clients = new Set();
  const broadcast = ev => { const line = `data: ${JSON.stringify(ev)}\n\n`; for (const r of clients) r.write(line); };
  /* ---------- kesehatan ---------- */
  app.get('/api/health', wrap(async (_req, res) => {
    await query('SELECT 1');
    res.json({ ok: true, adminClaimed: await auth.adminClaimed() });
  }));

  /* ---------- autentikasi ---------- */
  app.post('/api/auth/setup-admin', strict, wrap(async (req, res) => res.status(201).json(await auth.setupAdmin(req.body || {}))));
  app.post('/api/auth/login', strict, wrap(async (req, res) => { const r = await auth.loginWithCode((req.body || {}).code); broadcast({ type: 'identity' }); res.json(r); }));
  app.get('/api/me', auth.requireAuth, wrap(async (req, res) => {
    res.json({ user: auth.publicUser(req.user), role: await auth.roleOf(req.user) });
  }));
  app.post('/api/clubs/apply', strict, wrap(async (req, res) => { const r = await auth.applyClub(req.body || {}); broadcast({ type: 'identity' }); res.status(201).json(r); }));

  /* ---------- PB ---------- */
  app.get('/api/clubs', auth.requireAuth, wrap(async (req, res) => {
    const admin = req.user.role === 'superadmin';
    const led = admin ? null : await auth.ledClubs(req.user.id);
    const clubs = (await query(`SELECT c.*, u.name AS leader_name FROM clubs c JOIN users u ON u.id=c.leader_id ORDER BY c.created_at`)).rows;
    const out = [];
    for (const c of clubs) {
      const canSee = admin || (led && led.includes(c.id));
      const members = (await query(
        `SELECT u.id,u.name,u.elo,u.level,u.code_used${canSee ? ',u.code' : ''} FROM club_members m JOIN users u ON u.id=m.user_id WHERE m.club_id=$1 ORDER BY u.name`, [c.id])).rows;
      const invites = canSee ? (await query('SELECT id,name,phone,code FROM invites WHERE club_id=$1 ORDER BY created_at', [c.id])).rows : [];
      out.push({ id: c.id, name: c.name, status: c.status, leaderId: c.leader_id, leaderName: c.leader_name, code: canSee ? c.code : undefined, elo: c.elo, played: c.played, wins: c.wins, members, invites });
    }
    res.json({ clubs: out });
  }));
  app.post('/api/clubs/:id/approve', auth.requireAuth, auth.requireAdmin, wrap(async (req, res) => { const r = await auth.approveClub(req.user.id, req.params.id, true); broadcast({ type: 'identity' }); res.json(r); }));
  app.post('/api/clubs/:id/reject', auth.requireAuth, auth.requireAdmin, wrap(async (req, res) => { const r = await auth.approveClub(req.user.id, req.params.id, false); broadcast({ type: 'identity' }); res.json(r); }));
  app.post('/api/clubs/:id/members', auth.requireAuth, wrap(async (req, res) => { const r = await auth.addMember(req.user, req.params.id, req.body || {}); broadcast({ type: 'identity' }); res.status(201).json(r); }));
  app.delete('/api/invites/:id', auth.requireAuth, wrap(async (req, res) => { const r = await auth.deleteInvite(req.user, req.params.id); broadcast({ type: 'identity' }); res.json(r); }));
  app.post('/api/users/:id/reset-code', auth.requireAuth, wrap(async (req, res) => { const r = await auth.resetUserCode(req.user, req.params.id); broadcast({ type: 'identity' }); res.json(r); }));

  /* ---------- data aplikasi (dokumen berversi) + siaran langsung ke klien ---------- */

  app.get('/api/state', auth.requireAuth, wrap(async (_req, res) => {
    const r = (await query('SELECT doc,version,updated_at FROM app_state WHERE id=1')).rows[0];
    res.json({ doc: r.doc, version: Number(r.version), updatedAt: r.updated_at });
  }));
  app.put('/api/state', auth.requireAuth, wrap(async (req, res) => {
    const { doc, baseVersion } = req.body || {};
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new HttpError(400, 'doc harus berupa objek.');
    if (!Number.isInteger(baseVersion)) throw new HttpError(400, 'baseVersion wajib berupa bilangan bulat.');
    const r = await query(
      `UPDATE app_state SET doc=$1, version=version+1, updated_at=now(), updated_by=$2 WHERE id=1 AND version=$3 RETURNING version`,
      [JSON.stringify(doc), req.user.id, baseVersion]);
    if (!r.rowCount) {
      const cur = (await query('SELECT version FROM app_state WHERE id=1')).rows[0];
      return res.status(409).json({ error: 'Data sudah diubah pihak lain. Muat ulang lalu coba lagi.', version: Number(cur.version) });
    }
    const version = Number(r.rows[0].version);
    broadcast({ type: 'state', version, by: req.user.id });
    res.json({ version });
  }));

  // EventSource tidak bisa mengirim header, jadi token boleh lewat query khusus untuk endpoint ini.
  app.get('/api/events', wrap(async (req, res) => {
    let user;
    try { user = verifyToken(String(req.query.token || '')); } catch { throw new HttpError(401, 'Sesi tidak valid.'); }
    if (!(await query('SELECT 1 FROM users WHERE id=$1', [user.sub])).rowCount) throw new HttpError(401, 'Akun tidak ditemukan.');
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
  }));

  /* ---------- YouTube (khusus Super User) ---------- */
  // Callback OAuth: dipanggil browser oleh Google tanpa header Authorization, jadi diamankan lewat parameter state bertanda tangan.
  app.get('/api/youtube/oauth/callback', wrap(async (req, res) => {
    let st;
    try { st = jwt.verify(String(req.query.state || ''), config.jwtSecret); } catch { throw new HttpError(400, 'State tidak valid atau kedaluwarsa.'); }
    if (st.purpose !== 'youtube') throw new HttpError(400, 'State tidak valid.');
    if (req.query.error) throw new HttpError(400, 'Akses ditolak di Google: ' + String(req.query.error));
    const r = await yt.handleCallback(String(req.query.code || ''));
    res.type('html').send(`<!doctype html><meta charset="utf-8"><title>YouTube terhubung</title><body style="font-family:system-ui;padding:2rem"><h2>YouTube terhubung</h2><p>${r.channel ? 'Kanal: ' + String(r.channel.title).replace(/[<>&]/g, '') : 'Kanal terhubung.'}</p><p>Kamu bisa menutup halaman ini.</p>`);
  }));

  const yts = express.Router();
  yts.use(auth.requireAuth, auth.requireAdmin);
  yts.get('/status', wrap(async (_req, res) => res.json(await yt.status())));
  yts.get('/auth-url', wrap(async (req, res) => {
    const state = jwt.sign({ purpose: 'youtube', sub: req.user.id }, config.jwtSecret, { expiresIn: '10m' });
    res.json({ url: yt.authUrl(state) });
  }));
  yts.delete('/connection', wrap(async (_req, res) => { await yt.disconnect(); res.json({ ok: true }); }));
  yts.get('/streams', wrap(async (req, res) => res.json({ streams: await yt.listStreams(req.query.active === '1') })));
  yts.post('/streams', wrap(async (req, res) => {
    const b = req.body || {};
    const r = await yt.createStream({ matchId: b.matchId, court: b.court, title: b.title, description: b.description, privacy: b.privacy, userId: req.user.id });
    broadcast({ type: 'stream', id: r.id, status: 'created', court: b.court });
    res.status(201).json(r);
  }));
  yts.post('/streams/:id/transition', wrap(async (req, res) => {
    const r = await yt.transition(req.params.id, (req.body || {}).status);
    broadcast({ type: 'stream', id: r.id, status: r.status });
    res.json(r);
  }));
  yts.get('/streams/:id/ingest', wrap(async (req, res) => res.json(await yt.ingestInfo(req.params.id))));
  app.use('/api/youtube', yts);

  /* ---------- galat ---------- */
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Endpoint tidak ada.')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 && !err.status ? 'Terjadi kesalahan pada server.' : err.message });
  });

  return app;
}
