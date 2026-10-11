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

const setup = async () => (await api('POST', '/api/auth/setup-admin', { name: 'Pengelola Uji', phone: '081234567890', password: 'sandi-kuat-123' })).body.token;
/** Simulasikan Super User lama (dibuat sebelum fitur kata sandi ada): tanpa password_hash. */
async function setup2NoPassword() {
  const r = await api('POST', '/api/auth/setup-admin', { name: 'Ade Lama', phone: '081234567890', password: 'sandi-sementara-123' });
  await query(`UPDATE users SET password_hash=NULL WHERE id=$1`, [r.body.user.id]);
  return r.body.token;
}

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
  assert.equal((await api('POST', '/api/auth/setup-admin', { name: 'A', phone: '081234567890', password: 'pendek' })).status, 400);
  const ok = await api('POST', '/api/auth/setup-admin', { name: 'Ade', phone: '081234567890', password: 'sandi-kuat-123' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.user.role, 'superadmin');
  assert.equal((await api('POST', '/api/auth/setup-admin', { name: 'Penyusup', password: 'sandi-kuat-123' })).status, 409);
  const me = await api('GET', '/api/me', undefined, ok.body.token);
  assert.equal(me.body.role, 'super');
  assert.equal((await api('GET', '/api/health')).body.adminClaimed, true);
});

test('setup pengelola bersamaan hanya menghasilkan satu akun', async () => {
  const rs = await Promise.all([1, 2, 3, 4].map(i => api('POST', '/api/auth/setup-admin', { name: 'Pengelola ' + i, password: 'sandi-kuat-123' })));
  assert.equal(rs.filter(r => r.status === 201).length, 1);
  assert.equal((await query(`SELECT count(*)::int n FROM users WHERE role='superadmin'`)).rows[0].n, 1);
});

test('masuk sebagai Super User dengan kata sandi', async () => {
  await api('POST', '/api/auth/setup-admin', { name: 'Ade', phone: '081234567890', password: 'sandi-kuat-123' });
  assert.equal((await api('POST', '/api/auth/login-admin', { password: 'salah-sandi' })).status, 401);
  const ok = await api('POST', '/api/auth/login-admin', { password: 'sandi-kuat-123' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.role, 'superadmin');
});

test('akun Super User lama tanpa kata sandi wajib mengaturnya dulu, lalu bisa dipakai masuk', async () => {
  const adminToken = await setup2NoPassword();
  assert.equal((await api('POST', '/api/auth/login-admin', { password: 'apa-saja' })).status, 409);
  assert.equal((await api('POST', '/api/auth/set-admin-password', { password: 'pendek' }, adminToken)).status, 400);
  assert.equal((await api('POST', '/api/auth/set-admin-password', { password: 'sandi-baru-123' }, adminToken)).status, 200);
  assert.equal((await api('POST', '/api/auth/login-admin', { password: 'salah' })).status, 401);
  assert.equal((await api('POST', '/api/auth/login-admin', { password: 'sandi-baru-123' })).status, 200);
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

test('keluarkan, pindahkan, dan ganti ketua', async () => {
  const adminToken = await setup();
  const A = await makeClub(adminToken, 'PB Satu');
  const B = await makeClub(adminToken, 'PB Dua');
  const join = async (club, name) => {
    const add = await api('POST', `/api/clubs/${club.clubId}/members`, { name }, club.leaderToken);
    const lg = await api('POST', '/api/auth/login', { code: add.body.code });
    return { id: lg.body.user.id, token: lg.body.token };
  };
  const m1 = await join(A, 'Anggota Satu');
  const m2 = await join(A, 'Anggota Dua');
  const m3 = await join(A, 'Anggota Tiga');
  const members = async cid => (await api('GET', '/api/clubs', undefined, adminToken)).body.clubs.find(c => c.id === cid).members.map(m => m.id);
  const leaderA = (await api('GET', '/api/me', undefined, A.leaderToken)).body.user.id;

  // keluarkan: anggota biasa dan ketua PB lain ditolak; ketua tidak bisa dikeluarkan
  assert.equal((await api('POST', `/api/clubs/${A.clubId}/members/${m1.id}/kick`, {}, m2.token)).status, 403);
  assert.equal((await api('POST', `/api/clubs/${A.clubId}/members/${m1.id}/kick`, {}, B.leaderToken)).status, 403);
  assert.equal((await api('POST', `/api/clubs/${A.clubId}/members/${leaderA}/kick`, {}, adminToken)).status, 409);
  assert.equal((await api('POST', `/api/clubs/${A.clubId}/members/${m1.id}/kick`, { reason: 'Tidak aktif' }, A.leaderToken)).status, 200);
  assert.ok(!(await members(A.clubId)).includes(m1.id));
  assert.equal((await api('POST', `/api/clubs/${A.clubId}/members/${m1.id}/kick`, {}, A.leaderToken)).status, 404);

  // pindah: hanya Super User; PB tujuan harus disetujui; ketua tidak bisa dipindah
  assert.equal((await api('POST', `/api/clubs/${A.clubId}/members/${m2.id}/move`, { toClubId: B.clubId }, A.leaderToken)).status, 403);
  assert.equal((await api('POST', `/api/clubs/${A.clubId}/members/${m2.id}/move`, { toClubId: A.clubId }, adminToken)).status, 400);
  const pend = await api('POST', '/api/clubs/apply', { leaderName: 'Calon', phone: '081200000077', clubName: 'PB Belum' });
  assert.equal((await api('POST', `/api/clubs/${A.clubId}/members/${m2.id}/move`, { toClubId: pend.body.clubId }, adminToken)).status, 409);
  assert.equal((await api('POST', `/api/clubs/${A.clubId}/members/${leaderA}/move`, { toClubId: B.clubId }, adminToken)).status, 409);
  const mv = await api('POST', `/api/clubs/${A.clubId}/members/${m2.id}/move`, { toClubId: B.clubId }, adminToken);
  assert.equal(mv.status, 200);
  assert.ok((await members(B.clubId)).includes(m2.id));
  assert.ok(!(await members(A.clubId)).includes(m2.id));

  // ganti ketua: hanya Super User; calon harus anggota PB itu
  assert.equal((await api('POST', `/api/clubs/${A.clubId}/leader`, { userId: m3.id }, A.leaderToken)).status, 403);
  assert.equal((await api('POST', `/api/clubs/${A.clubId}/leader`, { userId: m2.id }, adminToken)).status, 400);
  assert.equal((await api('POST', `/api/clubs/${A.clubId}/leader`, { userId: leaderA }, adminToken)).status, 409);
  assert.equal((await api('POST', `/api/clubs/${A.clubId}/leader`, { userId: m3.id }, adminToken)).status, 200);
  assert.equal((await api('GET', '/api/me', undefined, m3.token)).body.role, 'ketua');
  assert.equal((await api('GET', '/api/me', undefined, A.leaderToken)).body.role, 'anggota');
  assert.ok((await members(A.clubId)).includes(leaderA)); // ketua lama tetap anggota
  // ketua baru kini boleh mengelola, ketua lama tidak lagi
  assert.equal((await api('POST', `/api/clubs/${A.clubId}/members`, { name: 'Baru Lagi' }, m3.token)).status, 201);
  assert.equal((await api('POST', `/api/clubs/${A.clubId}/members`, { name: 'Ditolak' }, A.leaderToken)).status, 403);
});

test('nama PB yang ditolak bisa didaftarkan lagi', async () => {
  const adminToken = await setup();
  const a = await api('POST', '/api/clubs/apply', { leaderName: 'Calon Satu', phone: '081200000010', clubName: 'PB Ulang' });
  assert.equal(a.status, 201);
  assert.equal((await api('POST', `/api/clubs/${a.body.clubId}/reject`, {}, adminToken)).status, 200);
  const b = await api('POST', '/api/clubs/apply', { leaderName: 'Calon Dua', phone: '081200000011', clubName: 'PB Ulang' });
  assert.equal(b.status, 201);
  assert.equal((await api('POST', '/api/clubs/apply', { leaderName: 'Calon Tiga', phone: '081200000012', clubName: 'PB Ulang' })).status, 409);
  const names = (await api('GET', '/api/clubs', undefined, adminToken)).body.clubs.map(c => c.name);
  assert.deepEqual(names, ['PB Ulang']);
});

test('PUT /state: bagian Super User dan identitas dijaga server', async () => {
  const adminToken = await setup();
  const A = await makeClub(adminToken, 'PB Satu');
  const get = async tok => (await api('GET', '/api/state', undefined, tok)).body;
  let st = await get(adminToken);
  // Super User boleh mengubah pengumuman
  let r = await api('PUT', '/api/state', { doc: { announcements: [{ id: 1 }], matches: [] }, baseVersion: st.version }, adminToken);
  assert.equal(r.status, 200);
  assert.equal(r.body.ignored, undefined);
  // Ketua tidak: pengumuman dikembalikan, laga tetap tersimpan, peran dan keanggotaan mengikuti server
  const ids = (await api('GET', '/api/clubs', undefined, adminToken)).body.clubs[0];
  const leader = ids.leaderId;
  r = await api('PUT', '/api/state', { baseVersion: r.body.version, doc: {
    announcements: [], matches: [{ id: 'm1', clubId: A.clubId }],
    users: [{ id: leader, name: 'Diubah', role: 'superadmin' }, { id: 'ghost', name: 'Hantu', role: 'superadmin' }],
    clubs: [{ id: ids.id, name: 'Nama Palsu', status: 'pending', leaderId: 'ghost', members: [] }],
  } }, A.leaderToken);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.ignored, ['announcements']);
  st = await get(adminToken);
  assert.deepEqual(st.doc.announcements, [{ id: 1 }]);
  assert.deepEqual(st.doc.matches, [{ id: 'm1', clubId: A.clubId }]);
  assert.equal(st.doc.users.find(u => u.id === leader).name, 'Ketua PB Satu');
  assert.equal(st.doc.users.find(u => u.id === leader).role, undefined);
  assert.equal(st.doc.users.find(u => u.id === 'ghost').role, undefined);
  const c = st.doc.clubs[0];
  assert.deepEqual([c.name, c.status, c.leaderId, c.members], ['PB Satu', 'approved', leader, [leader]]);
});

test('PUT /state: laga dan tantangan hanya bisa diubah pihak yang terlibat', async () => {
  const adminToken = await setup();
  const A = await makeClub(adminToken, 'PB Ketua');
  const B = await makeClub(adminToken, 'PB Lain');
  const outsiderToken = B.leaderToken; // ketua PB lain, tidak terlibat sama sekali
  const get = async tok => (await api('GET', '/api/state', undefined, tok)).body;
  const add = await api('POST', `/api/clubs/${A.clubId}/members`, { name: 'Pemain X' }, A.leaderToken);
  const memberLogin = await api('POST', '/api/auth/login', { code: add.body.code });
  const memberId = memberLogin.body.user.id, memberToken = memberLogin.body.token;
  let st = await get(adminToken);
  // Pemain X membuat laga dan tantangan yang melibatkan dirinya sendiri: diterima.
  let r = await api('PUT', '/api/state', { baseVersion: st.version, doc: {
    matches: [{ id: 'm1', clubId: A.clubId, teamA: [memberId], teamB: ['y'] }],
    challenges: [{ id: 'c1', from: [memberId], to: ['y'], status: 'pending' }],
  } }, memberToken);
  assert.equal(r.status, 200);
  assert.equal(r.body.ignored, undefined);
  // Ketua PB lain (tidak terlibat sama sekali) mencoba mengubah laga dan tantangan itu: ditolak, tetap versi lama.
  r = await api('PUT', '/api/state', { baseVersion: r.body.version, doc: {
    matches: [{ id: 'm1', clubId: A.clubId, teamA: [memberId], teamB: ['y'], status: 'verified' }],
    challenges: [{ id: 'c1', from: [memberId], to: ['y'], status: 'accepted' }],
  } }, outsiderToken);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.ignored, ['matches', 'challenges']);
  st = await get(adminToken);
  assert.equal(st.doc.matches[0].status, undefined);
  assert.equal(st.doc.challenges[0].status, 'pending');
  // Pemain X sendiri (bukan ketua, bukan admin, sekadar salah satu pemain di laga itu) boleh mengubahnya.
  r = await api('PUT', '/api/state', { baseVersion: st.version, doc: {
    matches: [{ id: 'm1', clubId: A.clubId, teamA: [memberId], teamB: ['y'], status: 'verified' }],
    challenges: st.doc.challenges,
  } }, memberToken);
  assert.equal(r.status, 200);
  assert.equal(r.body.ignored, undefined);
  // Super User boleh mengubah apa saja, termasuk turnamen (khusus admin).
  st = await get(adminToken);
  r = await api('PUT', '/api/state', { baseVersion: st.version, doc: { ...st.doc, tourneys: [{ id: 't1' }] } }, adminToken);
  assert.equal(r.status, 200);
  assert.equal(r.body.ignored, undefined);
  // Ketua (bukan admin) tidak boleh membuat/mengubah turnamen.
  r = await api('PUT', '/api/state', { baseVersion: r.body.version, doc: { tourneys: [{ id: 't1' }, { id: 't2' }] } }, A.leaderToken);
  assert.equal(r.status, 200);
  assert.ok(r.body.ignored.includes('tourneys'));
});

test('akun demo: kode bisa dipakai berkali-kali dan muncul di /api/demo', async () => {
  const adminToken = await setup();
  const A = await makeClub(adminToken, 'PB Demo');
  const demo = (await query(
    `INSERT INTO users (id,name,phone,code,code_used,is_demo) VALUES ('udemo1','Anggota Demo','','DEMO01',false,true) RETURNING *`)).rows[0];
  await query('INSERT INTO club_members (club_id,user_id) VALUES ($1,$2)', [A.clubId, demo.id]);
  const list = await api('GET', '/api/demo');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.demo, [{ name: 'Anggota Demo', code: 'DEMO01', peran: 'anggota', club: 'PB Demo' }]);
  const l1 = await api('POST', '/api/auth/login', { code: 'DEMO01' });
  assert.equal(l1.status, 200);
  assert.equal(l1.body.user.id, 'udemo1');
  const l2 = await api('POST', '/api/auth/login', { code: 'DEMO01' });
  assert.equal(l2.status, 200, 'kode demo tidak boleh habis setelah satu kali pakai');
  assert.equal(l2.body.user.id, 'udemo1');
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

test('hapus akun: hanya Super User, ketua PB tidak bisa dihapus, anggota hilang dari PB', async () => {
  const adminToken = await setup();
  const A = await makeClub(adminToken, 'PB Satu');
  const add = await api('POST', `/api/clubs/${A.clubId}/members`, { name: 'Sari' }, A.leaderToken);
  const login = await api('POST', '/api/auth/login', { code: add.body.code });
  const uid = login.body.user.id;
  assert.equal((await api('DELETE', `/api/users/${uid}`, undefined, A.leaderToken)).status, 403);
  const me = await api('GET', '/api/me', undefined, A.leaderToken);
  assert.equal((await api('DELETE', `/api/users/${me.body.user.id}`, undefined, adminToken)).status, 409);
  assert.equal((await api('DELETE', `/api/users/${uid}`, undefined, adminToken)).status, 200);
  assert.equal((await api('GET', '/api/me', undefined, login.body.token)).status, 401);
  const club = (await api('GET', '/api/clubs', undefined, adminToken)).body.clubs[0];
  assert.ok(!club.members.some(m => m.id === uid));
  assert.equal((await api('DELETE', `/api/users/${uid}`, undefined, adminToken)).status, 404);
});

test('reset semua kode belum terpakai: hanya Super User, kode lama mati, akun demo dan yang sudah masuk aman', async () => {
  const adminToken = await setup();
  const A = await makeClub(adminToken, 'PB Satu');
  const add = await api('POST', `/api/clubs/${A.clubId}/members`, { name: 'Sari' }, A.leaderToken);
  const add2 = await api('POST', `/api/clubs/${A.clubId}/members`, { name: 'Budi' }, A.leaderToken);
  const used = await api('POST', '/api/auth/login', { code: add2.body.code });
  assert.equal(used.status, 200);
  assert.equal((await api('POST', '/api/admin/reset-unused-codes', {}, A.leaderToken)).status, 403);
  const r = await api('POST', '/api/admin/reset-unused-codes', {}, adminToken);
  assert.equal(r.status, 200);
  assert.ok(r.body.invites >= 1);
  assert.equal((await api('POST', '/api/auth/login', { code: add.body.code })).status, 404);
  assert.equal((await api('GET', '/api/me', undefined, used.body.token)).status, 200);
});

test('PUT /state: obrolan, galeri, pembayaran, dan moderasi dijaga per peran', async () => {
  const adminToken = await setup();
  const A = await makeClub(adminToken, 'PB Satu');
  const B = await makeClub(adminToken, 'PB Dua');
  const mk = async name => { const a = await api('POST', `/api/clubs/${A.clubId}/members`, { name }, A.leaderToken); const l = await api('POST', '/api/auth/login', { code: a.body.code }); return { id: l.body.user.id, token: l.body.token }; };
  const sari = await mk('Sari'), budi = await mk('Budi');
  const get = async tok => (await api('GET', '/api/state', undefined, tok)).body;
  const put = async (tok, doc) => { const st = await get(adminToken); return api('PUT', '/api/state', { baseVersion: st.version, doc: { ...st.doc, ...doc } }, tok); };
  let st = await get(adminToken);
  const msg = (id, uid, text, extra = {}) => ({ id, uid, text, t: Date.now(), ...extra });
  // Sari menulis di lounge atas namanya sendiri: diterima. Atas nama Budi: ditolak.
  let r = await put(sari.token, { chats: { lounge: [msg('c1', sari.id, 'halo'), msg('c2', budi.id, 'palsu')] } });
  assert.deepEqual(r.body.ignored, ['chats']);
  st = await get(adminToken);
  assert.deepEqual(st.doc.chats.lounge.map(m => m.id), ['c1']);
  // Budi tidak boleh mengubah isi pesan Sari, tapi boleh memberi reaksi.
  r = await put(budi.token, { chats: { lounge: [msg('c1', sari.id, 'diubah', { t: st.doc.chats.lounge[0].t })] } });
  assert.ok(r.body.ignored.includes('chats'));
  st = await get(adminToken);
  assert.equal(st.doc.chats.lounge[0].text, 'halo');
  r = await put(budi.token, { chats: { lounge: [{ ...st.doc.chats.lounge[0], react: { '👍': [budi.id] } }] } });
  assert.equal(r.body.ignored, undefined);
  // Budi tidak boleh menghapus pesan Sari; Sari boleh menghapus pesannya sendiri.
  r = await put(budi.token, { chats: { lounge: [] } });
  assert.ok(r.body.ignored.includes('chats'));
  st = await get(adminToken);
  assert.equal(st.doc.chats.lounge.length, 1);
  r = await put(sari.token, { chats: { lounge: [] } });
  assert.equal(r.body.ignored, undefined);
  // Pengumuman GOR hanya Super User; ruang PB lain hanya anggotanya.
  r = await put(sari.token, { chats: { ann: [msg('a1', sari.id, 'x')] } });
  assert.ok(r.body.ignored.includes('chats'));
  r = await put(B.leaderToken, { chats: { ['club:' + A.clubId]: [msg('k1', 'x', 'masuk')] } });
  assert.ok(r.body.ignored.includes('chats'));
  r = await put(sari.token, { chats: { ['club:' + A.clubId]: [msg('k2', sari.id, 'anggota boleh')] } });
  assert.equal(r.body.ignored, undefined);
  // Mengirim dokumen tanpa kunci chats tidak menghapus obrolan.
  st = await get(adminToken);
  const { chats, ...noChats } = st.doc;
  r = await api('PUT', '/api/state', { baseVersion: st.version, doc: noChats }, budi.token);
  assert.ok(r.body.ignored.includes('chats'));
  assert.ok((await get(adminToken)).doc.chats['club:' + A.clubId]);
  // Galeri: Sari mengunggah; Budi boleh like, tidak boleh ubah/hapus; ketua PB-nya boleh menyembunyikan.
  const photo = { id: 'p1', by: sari.id, clubId: A.clubId, caption: 'asli', t: Date.now(), likes: [], comments: [] };
  r = await put(sari.token, { gallery: [photo] });
  assert.equal(r.body.ignored, undefined);
  r = await put(budi.token, { gallery: [{ ...photo, likes: [budi.id] }] });
  assert.equal(r.body.ignored, undefined);
  r = await put(budi.token, { gallery: [{ ...photo, likes: [budi.id], caption: 'diubah' }] });
  assert.ok(r.body.ignored.includes('gallery'));
  r = await put(budi.token, { gallery: [] });
  assert.ok(r.body.ignored.includes('gallery'));
  r = await put(B.leaderToken, { gallery: [{ ...photo, hidden: true }] });
  assert.ok(r.body.ignored.includes('gallery'));
  r = await put(A.leaderToken, { gallery: [{ ...photo, likes: [budi.id], hidden: true }] });
  assert.equal(r.body.ignored, undefined);
  // Pembayaran hanya Super User; pembisuan hanya ketua PB atau Super User.
  r = await put(sari.token, { payments: [{ id: 'pay1' }], mutes: [{ uid: budi.id }] });
  assert.ok(r.body.ignored.includes('payments') && r.body.ignored.includes('mutes'));
  r = await put(A.leaderToken, { mutes: [{ uid: budi.id, scope: 'lounge', until: Date.now() + 1000 }] });
  assert.ok(!(r.body.ignored || []).includes('mutes'));
});

test('papan skor publik: tanpa login, hanya nama dan skor laga berlangsung/terbaru', async () => {
  const adminToken = await setup();
  const st = await api('GET', '/api/state', undefined, adminToken);
  const doc = { ...st.body.doc, users: [...(st.body.doc.users || []), { id: 'p1', name: 'Andi' }, { id: 'p2', name: 'Budi', phone: '0811' }], matches: [
    { id: 'm1', status: 'playing', court: 'Lapangan 1', teamA: ['p1'], teamB: ['p2'], games: [[21, 15]], cur: { a: 3, b: 4, pos: { secret: 1 } }, t: Date.now() },
    { id: 'm2', status: 'scheduled', teamA: ['p1'], teamB: ['p2'], games: [], t: Date.now() },
  ] };
  assert.equal((await api('PUT', '/api/state', { baseVersion: st.body.version, doc }, adminToken)).status, 200);
  const r = await api('GET', '/api/public/live');
  assert.equal(r.status, 200);
  assert.equal(r.body.matches.length, 1);
  assert.deepEqual(r.body.matches[0].cur, { a: 3, b: 4 });
  assert.equal(r.body.matches[0].a, 'Andi');
  assert.ok(!JSON.stringify(r.body).includes('0811'));
});

test('papan skor publik: siaran HP hanya muncul bila masih segar dan membawa peerId', async () => {
  const adminToken = await setup();
  const st = await api('GET', '/api/state', undefined, adminToken);
  const now = Date.now();
  const mk = (id, beat) => ({ id, status: 'playing', court: 'L1', teamA: [], teamB: [], games: [], cur: { a: 1, b: 1 }, t: now, stream: { mode: 'phone', peerId: 'aiarena-' + id, started: now - 99999, beat, ended: false } });
  const doc = { ...(st.body.doc || {}), matches: [mk('fresh', now), mk('stale', now - 120000)] };
  assert.equal((await api('PUT', '/api/state', { baseVersion: st.body.version, doc }, adminToken)).status, 200);
  const r = (await api('GET', '/api/public/live')).body.matches;
  const by = id => r.find(m => m.id === id);
  assert.equal(by('fresh').video, true);
  assert.equal(by('fresh').peer, 'aiarena-fresh');
  assert.equal(by('stale').video, false);
});


test('YouTube: ketua dan wasit laga boleh mengelola siaran lagannya, orang lain tidak', async () => {
  const adminToken = await setup();
  const A = await makeClub(adminToken, 'PB Satu');
  const B = await makeClub(adminToken, 'PB Dua');
  fakeYouTube();
  const add = await api('POST', `/api/clubs/${A.clubId}/members`, { name: 'Wasit' }, A.leaderToken);
  const w = await api('POST', '/api/auth/login', { code: add.body.code });
  const st = await api('GET', '/api/state', undefined, adminToken);
  const doc = { ...(st.body.doc || {}), matches: [{ id: 'mx', clubId: A.clubId, umpireId: w.body.user.id, teamA: [], teamB: [], games: [], status: 'playing' }] };
  assert.equal((await api('PUT', '/api/state', { baseVersion: st.body.version, doc }, adminToken)).status, 200);
  const mk = (tok, court) => api('POST', '/api/youtube/streams', { matchId: 'mx', court, title: 'Laga X' }, tok);
  assert.equal((await mk(B.leaderToken, 'Lapangan 1')).status, 403);
  const s1 = await mk(A.leaderToken, 'Lapangan 1');
  assert.equal(s1.status, 201);
  assert.equal((await api('POST', `/api/youtube/streams/${s1.body.id}/transition`, { status: 'live' }, B.leaderToken)).status, 403);
  assert.equal((await api('POST', `/api/youtube/streams/${s1.body.id}/transition`, { status: 'live' }, w.body.token)).status, 200);
  assert.equal((await api('GET', `/api/youtube/streams/${s1.body.id}/ingest`, undefined, w.body.token)).status, 200);
  assert.equal((await api('GET', '/api/youtube/streams', undefined, w.body.token)).status, 403);
  assert.equal((await api('GET', '/api/youtube/status', undefined, w.body.token)).status, 403);
  const rd = await api('GET', '/api/youtube/ready', undefined, w.body.token);
  assert.equal(rd.status, 200);
  assert.equal(typeof rd.body.ready, 'boolean');
});

test('papan skor publik: laga berlangsung yang tertahan lebih dari 8 jam tidak ditampilkan', async () => {
  const adminToken = await setup();
  const st = await api('GET', '/api/state', undefined, adminToken);
  const now = Date.now();
  const mk = (id, t) => ({ id, status: 'playing', court: 'L1', teamA: [], teamB: [], games: [], cur: { a: 0, b: 0 }, t, startedAt: t });
  const doc = { ...(st.body.doc || {}), matches: [mk('baru', now - 1000), mk('macet', now - 100 * 3600 * 1000)] };
  assert.equal((await api('PUT', '/api/state', { baseVersion: st.body.version, doc }, adminToken)).status, 200);
  const ids = (await api('GET', '/api/public/live')).body.matches.map(m => m.id);
  assert.deepEqual(ids, ['baru']);
});


test('beranda publik: nama dipendekkan, tanpa akun demo, tanpa data pribadi', async () => {
  const adminToken = await setup();
  const A = await makeClub(adminToken, 'PB Satu');
  const me = await api('GET', '/api/me', undefined, A.leaderToken);
  const st = await api('GET', '/api/state', undefined, adminToken);
  const now = Date.now();
  const doc = { ...(st.body.doc || {}),
    users: [{ id: 'p1', name: 'Andi Wijaya Putra', elo: 1400, played: 5, wins: 4, phone: '0811' }, { id: 'p2', name: 'Budi', elo: 1300, played: 2, wins: 1 }, { id: 'p3', name: 'Tanpa Main', elo: 1500, played: 0, wins: 0 }, { id: me.body.user.id, name: 'Ketua Demo', elo: 1600, played: 9, wins: 9 }],
    clubs: [{ id: 'c1', name: 'PB Satu', status: 'approved', leaderId: 'p1', members: ['p1', 'p2'] }, { id: 'c2', name: 'PB Demo', status: 'approved', leaderId: me.body.user.id, members: [me.body.user.id] }],
    matches: [{ id: 'm1', status: 'scheduled', court: 'Lapangan 1', teamA: ['p1'], teamB: ['p2'], games: [], when: now + 3600000 }] };
  assert.equal((await api('PUT', '/api/state', { baseVersion: st.body.version, doc }, adminToken)).status, 200);
  const q = await import('../src/db.js');
  await q.query('UPDATE users SET is_demo=true WHERE id=$1', [me.body.user.id]);
  const r = await api('GET', '/api/public/home');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.rank.map(x => x.n), ['Andi W.', 'Budi']);
  assert.equal(r.body.rank[0].c, 'PB Satu');
  assert.deepEqual(r.body.clubs, [{ name: 'PB Satu', n: 2 }]);
  assert.equal(r.body.next[0].a, 'Andi W.');
  assert.ok(!JSON.stringify(r.body).includes('0811'));
});


test('beranda publik: laga disiarkan membawa data video (peer atau YouTube) agar pengunjung bisa menonton', async () => {
  const adminToken = await setup();
  const st = await api('GET', '/api/state', undefined, adminToken);
  const now = Date.now();
  const mk = (id, stream) => ({ id, status: 'playing', court: 'L1', teamA: [], teamB: [], games: [], cur: { a: 1, b: 0 }, t: now, startedAt: now, stream });
  const doc = { ...(st.body.doc || {}), matches: [
    mk('hp', { mode: 'phone', peerId: 'aiarena-hp', started: now, beat: now, ended: false }),
    mk('yt', { mode: 'youtube', broadcastId: 'BCdemo12345', started: now, ended: false }),
    mk('none', null)] };
  assert.equal((await api('PUT', '/api/state', { baseVersion: st.body.version, doc }, adminToken)).status, 200);
  const live = (await api('GET', '/api/public/home')).body.live;
  const by = id => live.find(m => m.id === id);
  assert.equal(by('hp').peer, 'aiarena-hp');
  assert.equal(by('hp').video, true);
  assert.equal(by('yt').yt, 'BCdemo12345');
  assert.equal(by('none').video, false);
  assert.equal(by('none').peer, null);
});


test('WebRTC: server ICE selalu memuat STUN, dan TURN hanya bila dikonfigurasi', async () => {
  const saved = { u: process.env.TURN_URLS, n: process.env.TURN_USERNAME, c: process.env.TURN_CREDENTIAL };
  delete process.env.TURN_URLS; delete process.env.TURN_USERNAME; delete process.env.TURN_CREDENTIAL;
  let r = await api('GET', '/api/webrtc-ice');
  assert.equal(r.status, 200);
  assert.equal(r.body.relay, false);
  assert.equal(r.body.iceServers.length, 1);
  process.env.TURN_URLS = 'turn:relay.example.com:80,turns:relay.example.com:443?transport=tcp'; process.env.TURN_USERNAME = 'u'; process.env.TURN_CREDENTIAL = 'p';
  r = await api('GET', '/api/webrtc-ice');
  assert.equal(r.body.relay, true);
  assert.deepEqual(r.body.iceServers[1].urls, ['turn:relay.example.com:80', 'turns:relay.example.com:443?transport=tcp']);
  for (const [k, v] of [['TURN_URLS', saved.u], ['TURN_USERNAME', saved.n], ['TURN_CREDENTIAL', saved.c]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});
