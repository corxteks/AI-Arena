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
import { sanitizeDoc } from './state.js';

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Di belakang reverse proxy (nginx, dsb.) isi TRUST_PROXY=1 agar batas percobaan dihitung per alamat asli, bukan per proxy.
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
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

  // Daftar akun demo (kode bisa dipakai berkali-kali) untuk pengunjung mencoba. Tanpa data pribadi.
  app.get('/api/demo', wrap(async (_req, res) => {
    const rows = (await query(`SELECT u.name, u.code, CASE WHEN c.leader_id=u.id THEN 'ketua' ELSE 'anggota' END AS peran, c.name AS club
      FROM users u LEFT JOIN club_members m ON m.user_id=u.id LEFT JOIN clubs c ON c.id=m.club_id
      WHERE u.is_demo=true AND u.code IS NOT NULL ORDER BY peran DESC, u.name`)).rows;
    res.json({ demo: rows });
  }));

  // Papan skor publik (tanpa login): hanya laga berlangsung dan hasil beberapa jam terakhir, nama pemain dan skor saja.
  app.get('/api/public/live', wrap(async (_req, res) => {
    const doc = (await query('SELECT doc FROM app_state WHERE id=1')).rows[0]?.doc || {};
    const name = new Map((doc.users || []).map(u => [u.id, u.name]));
    const names = ids => (ids || []).map(i => name.get(i) || '?').join(' & ');
    const club = new Map((doc.clubs || []).map(c => [c.id, c.name]));
    const since = Date.now() - 6 * 3600 * 1000;
    const out = (doc.matches || [])
      // laga 'berlangsung' yang tidak bergerak lebih dari 8 jam dianggap tertahan dan tidak ditampilkan
      .filter(m => (m.status === 'playing' && Date.now() - (m.startedAt || m.t || 0) < 8 * 3600 * 1000) || (['verified', 'pending'].includes(m.status) && (m.t || 0) >= since))
      .map(m => ({
        id: m.id, status: m.status, court: m.court, club: club.get(m.clubId) || '',
        a: names(m.teamA), b: names(m.teamB), games: m.games || [], draw: !!m.draw,
        cur: m.cur ? { a: m.cur.a, b: m.cur.b } : null, t: m.t || 0,
        video: !!(m.stream && !m.stream.ended && (m.stream.mode !== 'phone' || Date.now() - (m.stream.beat || m.stream.started || 0) < 60000)),
        peer: m.stream && m.stream.mode === 'phone' && !m.stream.ended ? String(m.stream.peerId || '').slice(0, 80) : null,
        yt: m.stream && m.stream.mode === 'youtube' && !m.stream.ended && /^[\w-]{6,20}$/.test(String(m.stream.broadcastId || '')) ? m.stream.broadcastId : null,
      }))
      .sort((x, y) => (x.status === 'playing' ? 0 : 1) - (y.status === 'playing' ? 0 : 1) || y.t - x.t)
      .slice(0, 30);
    res.set('Cache-Control', 'no-store').json({ matches: out, at: Date.now() });
  }));

  // Daftar server ICE untuk WebRTC: STUN publik, plus TURN (relay) bila TURN_URLS/TURN_USERNAME/TURN_CREDENTIAL diisi.
  app.get('/api/webrtc-ice', (_req, res) => {
    const ice = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
    const urls = String(process.env.TURN_URLS || '').split(',').map(x => x.trim()).filter(Boolean);
    if (urls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) ice.push({ urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
    res.set('Cache-Control', 'no-store').json({ iceServers: ice, relay: ice.length > 1 });
  });

  // Beranda publik (tanpa login): skor langsung, peringkat 10 besar, laga berikutnya, dan daftar PB. Nama dipendekkan (nama depan + inisial).
  app.get('/api/public/home', wrap(async (_req, res) => {
    const doc = (await query('SELECT doc FROM app_state WHERE id=1')).rows[0]?.doc || {};
    const demo = new Set((await query('SELECT id FROM users WHERE is_demo=true')).rows.map(r => r.id));
    const users = new Map((doc.users || []).map(u => [u.id, u]));
    const sh = n => { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[1][0].toUpperCase() + '.' : (p[0] || '?'); };
    const pair = ids => (ids || []).map(i => sh((users.get(i) || {}).name)).join(' & ');
    const clubs = (doc.clubs || []).filter(c => c.status === 'approved' && !demo.has(c.leaderId));
    const clubOf = id => (clubs.find(c => (c.members || []).includes(id)) || {}).name || '';
    const now = Date.now();
    const live = (doc.matches || [])
      .filter(m => (m.status === 'playing' && now - (m.startedAt || m.t || 0) < 8 * 3600 * 1000) || (['verified', 'pending'].includes(m.status) && (m.t || 0) >= now - 6 * 3600 * 1000))
      .map(m => ({ id: m.id, status: m.status, court: m.court, a: pair(m.teamA), b: pair(m.teamB), games: m.games || [], draw: !!m.draw, cur: m.cur ? { a: m.cur.a, b: m.cur.b } : null, t: m.t || 0,
        video: !!(m.stream && !m.stream.ended && (m.stream.mode !== 'phone' || now - (m.stream.beat || m.stream.started || 0) < 60000)),
        peer: m.stream && m.stream.mode === 'phone' && !m.stream.ended ? String(m.stream.peerId || '').slice(0, 80) : null,
        yt: m.stream && m.stream.mode === 'youtube' && !m.stream.ended && /^[\w-]{6,20}$/.test(String(m.stream.broadcastId || '')) ? m.stream.broadcastId : null }))
      .sort((x, y) => (x.status === 'playing' ? 0 : 1) - (y.status === 'playing' ? 0 : 1) || y.t - x.t).slice(0, 8);
    const rank = (doc.users || [])
      .filter(u => !u.role && !u.guest && !demo.has(u.id) && (u.played || 0) > 0)
      .sort((a, b) => (b.elo || 0) - (a.elo || 0)).slice(0, 10)
      .map(u => ({ n: sh(u.name), c: clubOf(u.id), elo: u.elo || 0, p: u.played || 0, w: u.wins || 0 }));
    const next = (doc.matches || [])
      .filter(m => m.status === 'scheduled' && (m.when || m.t || 0) >= now - 3600 * 1000)
      .sort((a, b) => (a.when || a.t || 0) - (b.when || b.t || 0)).slice(0, 5)
      .map(m => ({ a: pair(m.teamA), b: pair(m.teamB), court: m.court, when: m.when || m.t || 0 }));
    res.set('Cache-Control', 'no-store').json({ live, rank, next, clubs: clubs.map(c => ({ name: c.name, n: (c.members || []).length })).slice(0, 30), at: now });
  }));

  /* ---------- autentikasi ---------- */
  app.post('/api/auth/setup-admin', strict, wrap(async (req, res) => res.status(201).json(await auth.setupAdmin(req.body || {}))));
  app.post('/api/auth/login-admin', strict, wrap(async (req, res) => res.json(await auth.loginAdmin((req.body || {}).password))));
  app.post('/api/auth/set-admin-password', auth.requireAuth, wrap(async (req, res) => res.json(await auth.setAdminPassword(req.user, (req.body || {}).password))));
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
    const mem = (await query(`SELECT m.club_id,u.id,u.name,u.elo,u.level,u.code_used,u.code FROM club_members m JOIN users u ON u.id=m.user_id ORDER BY u.name`)).rows;
    const inv = (await query('SELECT id,club_id,name,phone,code FROM invites ORDER BY created_at')).rows;
    const out = clubs.map(c => {
      const canSee = admin || (led && led.includes(c.id));
      const members = mem.filter(m => m.club_id === c.id).map(({ club_id, code, ...m }) => (canSee ? { ...m, code } : m));
      const invites = canSee ? inv.filter(i => i.club_id === c.id).map(({ club_id, ...i }) => i) : [];
      return { id: c.id, name: c.name, status: c.status, leaderId: c.leader_id, leaderName: c.leader_name, code: canSee ? c.code : undefined, elo: c.elo, played: c.played, wins: c.wins, members, invites };
    });
    res.json({ clubs: out });
  }));
  app.post('/api/clubs/:id/approve', auth.requireAuth, auth.requireAdmin, wrap(async (req, res) => { const r = await auth.approveClub(req.user.id, req.params.id, true); broadcast({ type: 'identity' }); res.json(r); }));
  app.post('/api/clubs/:id/reject', auth.requireAuth, auth.requireAdmin, wrap(async (req, res) => { const r = await auth.approveClub(req.user.id, req.params.id, false); broadcast({ type: 'identity' }); res.json(r); }));
  app.post('/api/clubs/:id/members', auth.requireAuth, wrap(async (req, res) => { const r = await auth.addMember(req.user, req.params.id, req.body || {}); broadcast({ type: 'identity' }); res.status(201).json(r); }));
  app.post('/api/clubs/:id/members/:uid/kick', auth.requireAuth, wrap(async (req, res) => { const r = await auth.kickMember(req.user, req.params.id, req.params.uid, (req.body || {}).reason); broadcast({ type: 'identity' }); res.json(r); }));
  app.post('/api/clubs/:id/members/:uid/move', auth.requireAuth, wrap(async (req, res) => { const r = await auth.moveMember(req.user, req.params.id, req.params.uid, (req.body || {}).toClubId); broadcast({ type: 'identity' }); res.json(r); }));
  app.post('/api/clubs/:id/leader', auth.requireAuth, wrap(async (req, res) => { const r = await auth.changeLeader(req.user, req.params.id, (req.body || {}).userId); broadcast({ type: 'identity' }); res.json(r); }));
  app.delete('/api/invites/:id', auth.requireAuth, wrap(async (req, res) => { const r = await auth.deleteInvite(req.user, req.params.id); broadcast({ type: 'identity' }); res.json(r); }));
  app.delete('/api/users/:id', auth.requireAuth, wrap(async (req, res) => { const r = await auth.deleteUser(req.user, req.params.id); broadcast({ type: 'identity' }); res.json(r); }));
  app.post('/api/admin/reset-unused-codes', auth.requireAuth, wrap(async (req, res) => { const r = await auth.resetUnusedCodes(req.user); broadcast({ type: 'identity' }); res.json(r); }));
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
    const clean = await sanitizeDoc(doc, req.user);
    const r = await query(
      `UPDATE app_state SET doc=$1, version=version+1, updated_at=now(), updated_by=$2 WHERE id=1 AND version=$3 RETURNING version`,
      [JSON.stringify(clean.doc), req.user.id, baseVersion]);
    if (!r.rowCount) {
      const cur = (await query('SELECT version FROM app_state WHERE id=1')).rows[0];
      return res.status(409).json({ error: 'Data sudah diubah pihak lain. Muat ulang lalu coba lagi.', version: Number(cur.version) });
    }
    const version = Number(r.rows[0].version);
    broadcast({ type: 'state', version, by: req.user.id });
    if (clean.ignored.length) {
      // Percobaan mengubah bagian yang bukan haknya dicatat untuk jejak audit (bukan tiap penyimpanan biasa).
      query(`INSERT INTO audit_log (actor_id,action,detail) VALUES ($1,'state_write_denied',$2)`, [req.user.id, { keys: clean.ignored, version }]).catch(() => {});
    }
    res.json({ version, ...(clean.ignored.length ? { ignored: clean.ignored } : {}) });
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
    // Di hosting tanpa proses yang menyala terus-menerus (mis. fungsi serverless), koneksi
    // ditutup rapi sebelum batas waktu fungsi habis, supaya EventSource di klien otomatis
    // menyambung ulang alih-alih dianggap galat. SSE_MAX_MS=0 menonaktifkan ini (server biasa).
    const maxMs = Number(process.env.SSE_MAX_MS || 0);
    const closer = maxMs > 0 ? setTimeout(() => res.end(), maxMs) : null;
    const cleanup = () => { clearInterval(ping); if (closer) clearTimeout(closer); clients.delete(res); };
    req.on('close', cleanup);
    res.on('finish', cleanup);
  }));

  /* ---------- YouTube (khusus Super User) ---------- */
  // Callback OAuth: dipanggil browser oleh Google tanpa header Authorization, jadi diamankan lewat parameter state bertanda tangan.
  app.get('/api/youtube/oauth/callback', wrap(async (req, res) => {
    let st;
    try { st = jwt.verify(String(req.query.state || ''), config.jwtSecret, { algorithms: ['HS256'] }); } catch { throw new HttpError(400, 'State tidak valid atau kedaluwarsa.'); }
    if (st.purpose !== 'youtube') throw new HttpError(400, 'State tidak valid.');
    if (req.query.error) throw new HttpError(400, 'Akses ditolak di Google: ' + String(req.query.error));
    const r = await yt.handleCallback(String(req.query.code || ''));
    res.type('html').send(`<!doctype html><meta charset="utf-8"><title>YouTube terhubung</title><body style="font-family:system-ui;padding:2rem"><h2>YouTube terhubung</h2><p>${r.channel ? 'Kanal: ' + String(r.channel.title).replace(/[<>&]/g, '') : 'Kanal terhubung.'}</p><p>Kamu bisa menutup halaman ini.</p>`);
  }));

  // Ketua PB dan wasit laga itu boleh mengelola siaran laganya; selain itu hanya Super User.
  const canStream = async (user, matchId) => {
    if (user.role === 'superadmin') return true;
    const doc = (await query('SELECT doc FROM app_state WHERE id=1')).rows[0]?.doc || {};
    const m = (doc.matches || []).find(x => x.id === matchId);
    if (!m) return false;
    if (m.umpireId === user.id) return true;
    return (await query(`SELECT 1 FROM clubs WHERE id=$1 AND leader_id=$2 AND status='approved'`, [m.clubId, user.id])).rowCount > 0;
  };
  const streamGuard = async (req, _res, next) => {
    try {
      let matchId = (req.body || {}).matchId;
      if (req.params.id) matchId = (await query('SELECT match_id FROM streams WHERE id=$1', [req.params.id])).rows[0]?.match_id;
      if (req.user.role !== 'superadmin' && !(await canStream(req.user, matchId))) throw new HttpError(403, 'Hanya Super User, ketua PB, atau wasit laga ini.');
      next();
    } catch (e) { next(e); }
  };
  const yts = express.Router();
  yts.use(auth.requireAuth);
  yts.get('/ready', wrap(async (_req, res) => { const st = await yt.status(); res.json({ ready: st.configured && st.connected, quotaLeft: st.quota.left }); }));
  yts.get('/status', auth.requireAdmin, wrap(async (_req, res) => res.json(await yt.status())));
  yts.get('/auth-url', auth.requireAdmin, wrap(async (req, res) => {
    const state = jwt.sign({ purpose: 'youtube', sub: req.user.id }, config.jwtSecret, { expiresIn: '10m' });
    res.json({ url: yt.authUrl(state) });
  }));
  yts.delete('/connection', auth.requireAdmin, wrap(async (_req, res) => { await yt.disconnect(); res.json({ ok: true }); }));
  yts.get('/streams', auth.requireAdmin, wrap(async (req, res) => res.json({ streams: await yt.listStreams(req.query.active === '1') })));
  yts.post('/streams', streamGuard, wrap(async (req, res) => {
    const b = req.body || {};
    const r = await yt.createStream({ matchId: b.matchId, court: b.court, title: b.title, description: b.description, privacy: b.privacy, userId: req.user.id });
    broadcast({ type: 'stream', id: r.id, status: 'created', court: b.court });
    res.status(201).json(r);
  }));
  yts.post('/streams/:id/transition', streamGuard, wrap(async (req, res) => {
    const r = await yt.transition(req.params.id, (req.body || {}).status);
    broadcast({ type: 'stream', id: r.id, status: r.status });
    res.json(r);
  }));
  yts.get('/streams/:id/ingest', streamGuard, wrap(async (req, res) => res.json(await yt.ingestInfo(req.params.id))));
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
