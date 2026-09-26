import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Basis data terpisah untuk tes supaya data pengembangan tidak terhapus.
const base = process.env.DATABASE_URL || 'postgres://arena:arena_dev_password@localhost:5433/arena';
process.env.DATABASE_URL = base.replace(/\/[^/]+$/, '/arena_test');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'rahasia-uji-yang-cukup-panjang-untuk-jwt-1234567890';
process.env.TOKEN_ENC_KEY = process.env.TOKEN_ENC_KEY || 'a'.repeat(64);
process.env.AUTH_RATE_LIMIT = '100000';

const admin = new (await import('pg')).default.Client({ connectionString: base.replace(/\/[^/]+$/, '/postgres') });
await admin.connect();
if (!(await admin.query(`SELECT 1 FROM pg_database WHERE datname='arena_test'`)).rowCount) await admin.query('CREATE DATABASE arena_test');
await admin.end();

const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const { pool, query } = await import('../src/db.js');
const { config } = await import('../src/config.js');
const yt = await import('../src/youtube.js');
const { encrypt } = await import('../src/util.js');

let server, url;
before(async () => {
  await migrate();
  server = createApp().listen(0);
  url = `http://localhost:${server.address().port}`;
});
after(async () => { await new Promise(r => server.close(r)); await pool.end(); });
beforeEach(async () => {
  await query(`TRUNCATE settings, users, clubs, club_members, invites, streams, youtube_auth, youtube_quota, audit_log RESTART IDENTITY CASCADE`);
  await query(`UPDATE app_state SET doc='{}'::jsonb, version=0`);
  config.youtube.dailyQuota = 10000;
});

const api = async (method, path, body, token) => {
  const r = await fetch(url + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const setup = async () => (await api('POST', '/api/auth/setup-admin', { name: 'Pengelola Uji', phone: '081234567890' })).body.token;

/** Buat PB yang sudah disetujui beserta ketuanya yang sudah masuk. */
async function makeClub(adminToken, name = 'PB Uji', members = []) {
  const a = await api('POST', '/api/clubs/apply', { leaderName: 'Ketua ' + name, phone: '081200000001', clubName: name, memberNames: members });
  assert.equal(a.status, 201);
  const list = await api('GET', '/api/clubs', undefined, adminToken);
  const club = list.body.clubs.find(c => c.id === a.body.clubId);
  const leaderCode = club.members[0].code;
  assert.equal((await api('POST', `/api/clubs/${club.id}/approve`, {}, adminToken)).status, 200);
  const login = await api('POST', '/api/auth/login', { code: leaderCode });
  assert.equal(login.status, 200);
  return { clubId: club.id, leaderToken: login.body.token, leaderCode };
}

test('kesehatan dan status pengelola', async () => {
  const r = await api('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.adminClaimed, false);
});

test('setup pengelola: validasi, sekali saja', async () => {
  assert.equal((await api('POST', '/api/auth/setup-admin', { name: '' })).status, 400);
  assert.equal((await api('POST', '/api/auth/setup-admin', { name: 'A', phone: '123' })).status, 400);
  const ok = await api('POST', '/api/auth/setup-admin', { name: 'Ade', phone: '081234567890' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.user.role, 'superadmin');
  assert.equal((await api('POST', '/api/auth/setup-admin', { name: 'Penyusup' })).status, 409);
  const me = await api('GET', '/api/me', undefined, ok.body.token);
  assert.equal(me.body.role, 'super');
  assert.equal((await api('GET', '/api/health')).body.adminClaimed, true);
});

test('setup pengelola bersamaan hanya menghasilkan satu akun', async () => {
  const rs = await Promise.all([1, 2, 3, 4].map(i => api('POST', '/api/auth/setup-admin', { name: 'Pengelola ' + i })));
  assert.equal(rs.filter(r => r.status === 201).length, 1);
  assert.equal((await query(`SELECT count(*)::int n FROM users WHERE role='superadmin'`)).rows[0].n, 1);
});

test('endpoint terlindungi butuh token', async () => {
  assert.equal((await api('GET', '/api/me')).status, 401);
  assert.equal((await api('GET', '/api/state')).status, 401);
  assert.equal((await api('GET', '/api/clubs', undefined, 'salah')).status, 401);
});

test('pendaftaran PB: kode ketua ditolak sebelum disetujui, lalu sekali pakai', async () => {
  const adminToken = await setup();
  const a = await api('POST', '/api/clubs/apply', { leaderName: 'Budi', phone: '081200000002', clubName: 'PB Rajawali', memberNames: ['Citra', 'Dewi', 'citra'] });
  assert.equal(a.status, 201);
  assert.equal((await api('POST', '/api/clubs/apply', { leaderName: 'X', phone: '081200000003', clubName: 'pb rajawali' })).status, 409);
  const list = (await api('GET', '/api/clubs', undefined, adminToken)).body.clubs;
  const club = list[0];
  assert.equal(club.status, 'pending');
  assert.equal(club.invites.length, 2); // nama ganda digabung
  const leaderCode = club.members[0].code;

  const early = await api('POST', '/api/auth/login', { code: leaderCode });
  assert.equal(early.status, 403);
  assert.match(early.body.error, /belum dikonfirmasi/);

  assert.equal((await api('POST', `/api/clubs/${club.id}/approve`, {}, adminToken)).status, 200);
  assert.equal((await api('POST', `/api/clubs/${club.id}/approve`, {}, adminToken)).status, 409);
  const ok = await api('POST', '/api/auth/login', { code: leaderCode.toLowerCase() + ' ' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.role, 'ketua');
  const again = await api('POST', '/api/auth/login', { code: leaderCode });
  assert.equal(again.status, 409);
  assert.match(again.body.error, /sudah dipakai/);
});

test('hanya Super User yang boleh menyetujui PB', async () => {
  const adminToken = await setup();
  const { clubId, leaderToken } = await makeClub(adminToken);
  const a = await api('POST', '/api/clubs/apply', { leaderName: 'Lain', phone: '081200000009', clubName: 'PB Lain' });
  assert.equal((await api('POST', `/api/clubs/${a.body.clubId}/approve`, {}, leaderToken)).status, 403);
  assert.ok(clubId);
});

test('tambah anggota: kode dibagikan, anggota masuk otomatis dengan namanya', async () => {
  const adminToken = await setup();
  const { clubId, leaderToken } = await makeClub(adminToken);
  const add = await api('POST', `/api/clubs/${clubId}/members`, { name: 'Anggota Baru' }, leaderToken);
  assert.equal(add.status, 201);
  assert.match(add.body.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal((await api('POST', `/api/clubs/${clubId}/members`, { name: 'anggota baru' }, leaderToken)).status, 409);

  const login = await api('POST', '/api/auth/login', { code: add.body.code });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.name, 'Anggota Baru');
  assert.equal(login.body.role, 'anggota');
  const inClub = (await api('GET', '/api/clubs', undefined, adminToken)).body.clubs.find(c => c.id === clubId);
  assert.ok(inClub.members.some(m => m.name === 'Anggota Baru'));
  assert.equal(inClub.invites.length, 0);
  assert.equal((await api('POST', '/api/auth/login', { code: add.body.code })).status, 409);

  // anggota biasa tidak bisa menambah anggota, dan tidak melihat kode orang lain
  assert.equal((await api('POST', `/api/clubs/${clubId}/members`, { name: 'Lain' }, login.body.token)).status, 403);
  const seen = (await api('GET', '/api/clubs', undefined, login.body.token)).body.clubs[0];
  assert.equal(seen.code, undefined);
  assert.ok(seen.members.every(m => m.code === undefined));
  assert.deepEqual(seen.invites, []);
});

test('kode baru: ketua untuk anggotanya, bukan untuk orang lain', async () => {
  const adminToken = await setup();
  const A = await makeClub(adminToken, 'PB Satu');
  const B = await makeClub(adminToken, 'PB Dua');
  const add = await api('POST', `/api/clubs/${A.clubId}/members`, { name: 'Sari' }, A.leaderToken);
  const login = await api('POST', '/api/auth/login', { code: add.body.code });
  const uid = login.body.user.id;
  assert.equal((await api('POST', `/api/users/${uid}/reset-code`, {}, B.leaderToken)).status, 403);
  const reset = await api('POST', `/api/users/${uid}/reset-code`, {}, A.leaderToken);
  assert.equal(reset.status, 200);
  assert.notEqual(reset.body.code, add.body.code);
  assert.equal((await api('POST', '/api/auth/login', { code: reset.body.code })).status, 200);
  assert.equal((await api('POST', '/api/auth/login', { code: reset.body.code })).status, 409);
});

test('kode tidak dikenal dan kosong', async () => {
  assert.equal((await api('POST', '/api/auth/login', { code: 'ZZZZZZ' })).status, 404);
  assert.equal((await api('POST', '/api/auth/login', { code: '' })).status, 400);
});

test('data aplikasi: versi, konflik, dan siaran ke klien', async () => {
  const adminToken = await setup();
  const g = await api('GET', '/api/state', undefined, adminToken);
  assert.equal(g.body.version, 0);
  const p1 = await api('PUT', '/api/state', { doc: { matches: [{ id: 'm1' }] }, baseVersion: 0 }, adminToken);
  assert.equal(p1.status, 200);
  assert.equal(p1.body.version, 1);
  const stale = await api('PUT', '/api/state', { doc: { matches: [] }, baseVersion: 0 }, adminToken);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.version, 1);
  assert.equal((await api('PUT', '/api/state', { doc: [], baseVersion: 1 }, adminToken)).status, 400);
  assert.equal((await api('PUT', '/api/state', { doc: {}, baseVersion: 'x' }, adminToken)).status, 400);
  assert.deepEqual((await api('GET', '/api/state', undefined, adminToken)).body.doc, { matches: [{ id: 'm1' }] });

  // SSE menerima pemberitahuan perubahan
  const ctl = new AbortController();
  const es = await fetch(`${url}/api/events?token=${adminToken}`, { signal: ctl.signal });
  assert.equal(es.status, 200);
  const reader = es.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const readUntil = async re => { while (!re.test(buf)) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value); } };
  await readUntil(/hello/);
  await api('PUT', '/api/state', { doc: { matches: [] }, baseVersion: 1 }, adminToken);
  await readUntil(/"version":2/);
  assert.match(buf, /"type":"state"/);
  ctl.abort();
  assert.equal((await fetch(`${url}/api/events?token=salah`)).status, 401);
});

/* ---------- YouTube ---------- */

function fakeYouTube() {
  const calls = [];
  const svc = {
    liveBroadcasts: {
      insert: async a => { calls.push('broadcast.insert'); return { data: { id: 'BC' + calls.length } }; },
      bind: async () => { calls.push('broadcast.bind'); return { data: {} }; },
      transition: async a => { calls.push('transition:' + a.broadcastStatus); return { data: {} }; },
    },
    liveStreams: {
      insert: async () => { calls.push('stream.insert'); return { data: { id: 'ST1', cdn: { ingestionInfo: { ingestionAddress: 'rtmp://a.rtmp.youtube.com/live2', streamName: 'kunci-rahasia' } } } }; },
      list: async () => ({ data: { items: [{ cdn: { ingestionInfo: { ingestionAddress: 'rtmp://a.rtmp.youtube.com/live2', streamName: 'kunci-rahasia' } } }] } }),
    },
  };
  yt.setClientFactory(async () => svc);
  return calls;
}

test('YouTube: belum dikonfigurasi dan hanya untuk Super User', async () => {
  const adminToken = await setup();
  const { clubId, leaderToken } = await makeClub(adminToken);
  assert.ok(clubId);
  assert.equal((await api('GET', '/api/youtube/status', undefined, leaderToken)).status, 403);
  assert.equal((await api('GET', '/api/youtube/status')).status, 401);
  const st = await api('GET', '/api/youtube/status', undefined, adminToken);
  assert.equal(st.status, 200);
  assert.equal(st.body.connected, false);
  assert.equal(st.body.quota.used, 0);
  // tanpa client id/secret, auth-url ditolak dengan pesan jelas
  const saved = { ...config.youtube };
  config.youtube.clientId = ''; config.youtube.clientSecret = '';
  assert.equal((await api('GET', '/api/youtube/auth-url', undefined, adminToken)).status, 503);
  Object.assign(config.youtube, saved);
});

test('YouTube: satu lapangan satu siaran, alur status, dan kuota', async () => {
  const adminToken = await setup();
  const calls = fakeYouTube();
  const mk = (court, id) => api('POST', '/api/youtube/streams', { matchId: id, court, title: `Laga ${id}`, privacy: 'unlisted' }, adminToken);

  assert.equal((await api('POST', '/api/youtube/streams', { court: 'Lapangan 1', title: '' }, adminToken)).status, 400);
  const s1 = await mk('Lapangan 1', 'm1');
  assert.equal(s1.status, 201);
  assert.match(s1.body.watchUrl, /youtube\.com\/watch\?v=BC/);
  assert.equal(s1.body.ingestAddress, 'rtmp://a.rtmp.youtube.com/live2');
  assert.deepEqual(calls, ['broadcast.insert', 'stream.insert', 'broadcast.bind']);

  const dup = await mk('Lapangan 1', 'm2');
  assert.equal(dup.status, 409);
  assert.match(dup.body.error, /satu kamera/);
  assert.equal((await mk('Lapangan 2', 'm3')).status, 201);

  assert.equal((await api('POST', `/api/youtube/streams/${s1.body.id}/transition`, { status: 'live' }, adminToken)).status, 200);
  assert.equal((await api('POST', `/api/youtube/streams/${s1.body.id}/transition`, { status: 'testing' }, adminToken)).status, 409);
  assert.equal((await api('POST', `/api/youtube/streams/${s1.body.id}/transition`, { status: 'aneh' }, adminToken)).status, 400);
  assert.equal((await api('POST', `/api/youtube/streams/nope/transition`, { status: 'live' }, adminToken)).status, 404);

  const ing = await api('GET', `/api/youtube/streams/${s1.body.id}/ingest`, undefined, adminToken);
  assert.equal(ing.body.streamName, 'kunci-rahasia');

  assert.equal((await api('POST', `/api/youtube/streams/${s1.body.id}/transition`, { status: 'complete' }, adminToken)).status, 200);
  assert.equal((await mk('Lapangan 1', 'm4')).status, 201); // lapangan bebas lagi setelah selesai

  const list = await api('GET', '/api/youtube/streams?active=1', undefined, adminToken);
  assert.equal(list.body.streams.length, 2); // yang pertama sudah selesai
  assert.equal((await api('GET', '/api/youtube/streams', undefined, adminToken)).body.streams.length, 3);
  const q = (await api('GET', '/api/youtube/status', undefined, adminToken)).body.quota;
  // 3 siaran x 150 + 2 transisi x 50 + 1 ingest x 1
  assert.equal(q.used, 3 * 150 + 2 * 50 + 1);
});

test('YouTube: kuota habis ditolak dan lapangan tidak terkunci', async () => {
  const adminToken = await setup();
  fakeYouTube();
  config.youtube.dailyQuota = 100; // kurang dari 150 unit untuk satu siaran
  const r = await api('POST', '/api/youtube/streams', { matchId: 'm1', court: 'Lapangan 3', title: 'Uji' }, adminToken);
  assert.equal(r.status, 429);
  assert.equal((await query(`SELECT count(*)::int n FROM streams WHERE status IN ('created','testing','live')`)).rows[0].n, 0);
  config.youtube.dailyQuota = 10000;
  assert.equal((await api('POST', '/api/youtube/streams', { matchId: 'm1', court: 'Lapangan 3', title: 'Uji' }, adminToken)).status, 201);
});

test('YouTube: galat dari Google tidak meninggalkan lapangan terkunci', async () => {
  const adminToken = await setup();
  yt.setClientFactory(async () => ({
    liveBroadcasts: { insert: async () => { throw Object.assign(new Error('quota'), { errors: [{ message: 'liveStreamingNotEnabled' }] }); } },
    liveStreams: {},
  }));
  const r = await api('POST', '/api/youtube/streams', { matchId: 'm1', court: 'Lapangan 1', title: 'Uji' }, adminToken);
  assert.equal(r.status, 502);
  assert.match(r.body.error, /liveStreamingNotEnabled/);
  fakeYouTube();
  assert.equal((await api('POST', '/api/youtube/streams', { matchId: 'm1', court: 'Lapangan 1', title: 'Uji' }, adminToken)).status, 201);
});

test('YouTube: token disimpan terenkripsi', async () => {
  const adminToken = await setup();
  const enc = encrypt('token-rahasia-12345');
  assert.doesNotMatch(enc, /token-rahasia/);
  await query(`INSERT INTO youtube_auth (id,refresh_token,channel_id,channel_title) VALUES (1,$1,'UC1','Kanal GOR')`, [enc]);
  const st = await api('GET', '/api/youtube/status', undefined, adminToken);
  assert.equal(st.body.connected, true);
  assert.equal(st.body.channel.title, 'Kanal GOR');
  assert.equal((await api('DELETE', '/api/youtube/connection', undefined, adminToken)).status, 200);
  assert.equal((await api('GET', '/api/youtube/status', undefined, adminToken)).body.connected, false);
});

test('YouTube: callback OAuth menolak state palsu', async () => {
  assert.equal((await fetch(`${url}/api/youtube/oauth/callback?state=palsu&code=x`)).status, 400);
});
