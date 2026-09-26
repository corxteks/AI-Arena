import { query, tx } from './db.js';
import { HttpError, newCode, normCode, nameKey, normPhone, validPhone, rid, signToken, verifyToken } from './util.js';

export const publicUser = u => ({ id: u.id, name: u.name, phone: u.phone, role: u.role, level: u.level, elo: u.elo, photo: u.photo || null });

/** Buat kode yang belum dipakai di users, invites, maupun clubs. */
export async function freshCode(db) {
  for (let i = 0; i < 20; i++) {
    const c = newCode();
    const r = await db.query(
      `SELECT 1 FROM users WHERE code=$1 UNION ALL SELECT 1 FROM invites WHERE code=$1 UNION ALL SELECT 1 FROM clubs WHERE code=$1`, [c]);
    if (!r.rowCount) return c;
  }
  throw new HttpError(500, 'Gagal membuat kode unik.');
}

/** Middleware: wajib login. Mengisi req.user dari basis data supaya peran selalu terbaru. */
export function requireAuth(req, _res, next) {
  (async () => {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!t) throw new HttpError(401, 'Belum masuk.');
    let p;
    try { p = verifyToken(t); } catch { throw new HttpError(401, 'Sesi tidak valid. Masuk lagi.'); }
    const r = await query('SELECT * FROM users WHERE id=$1', [p.sub]);
    if (!r.rowCount) throw new HttpError(401, 'Akun tidak ditemukan.');
    req.user = r.rows[0];
    next();
  })().catch(next);
}

export const requireAdmin = (req, _res, next) =>
  req.user && req.user.role === 'superadmin' ? next() : next(new HttpError(403, 'Hanya Super User.'));

/** Apakah user ketua dari PB berstatus disetujui? Mengembalikan daftar id PB yang dipimpin. */
export async function ledClubs(userId, db = { query }) {
  const r = await db.query(`SELECT id FROM clubs WHERE leader_id=$1 AND status='approved'`, [userId]);
  return r.rows.map(x => x.id);
}

export async function roleOf(user) {
  if (user.role === 'superadmin') return 'super';
  return (await ledClubs(user.id)).length ? 'ketua' : 'anggota';
}

/* ---------- alur ---------- */

/** Pengelola dibuat sekali. Setelah itu endpoint ini ditolak. */
export async function setupAdmin({ name, phone }) {
  const nm = String(name || '').trim().slice(0, 40);
  const hp = String(phone || '').trim();
  if (!nm) throw new HttpError(400, 'Isi nama pengelola.');
  if (hp && !validPhone(hp)) throw new HttpError(400, 'Nomor HP tidak valid. Contoh: 081234567890.');
  return tx(async db => {
    // Kunci penasihat supaya dua permintaan bersamaan tidak membuat dua pengelola.
    await db.query('SELECT pg_advisory_xact_lock(4242)');
    const claimed = await db.query(`SELECT 1 FROM settings WHERE key='admin_claimed'`);
    if (claimed.rowCount) throw new HttpError(409, 'Aplikasi ini sudah punya pengelola.');
    const u = (await db.query(
      `INSERT INTO users (id,name,phone,role) VALUES ($1,$2,$3,'superadmin') RETURNING *`,
      ['ade', nm, hp ? normPhone(hp) : ''])).rows[0];
    await db.query(`INSERT INTO settings (key,value) VALUES ('admin_claimed','true'::jsonb)`);
    await db.query(`INSERT INTO audit_log (actor_id,action) VALUES ($1,'setup_admin')`, [u.id]);
    return { user: publicUser(u), token: signToken(u) };
  });
}

export async function adminClaimed() {
  return (await query(`SELECT 1 FROM settings WHERE key='admin_claimed'`)).rowCount > 0;
}

/** Masuk dengan kode sekali pakai. */
export async function loginWithCode(rawCode) {
  const code = normCode(rawCode);
  if (!code) throw new HttpError(400, 'Masukkan kode terlebih dahulu.');
  return tx(async db => {
    const found = await db.query(`SELECT * FROM users WHERE code=$1 AND role<>'superadmin' FOR UPDATE`, [code]);
    if (found.rowCount) {
      const u = found.rows[0];
      if (u.code_used) throw new HttpError(409, 'Kode ini sudah dipakai. Minta kode baru ke ketua PB atau pengelola GOR.');
      const pend = await db.query(`SELECT name FROM clubs WHERE leader_id=$1 AND status<>'approved'`, [u.id]);
      const ok = await db.query(`SELECT 1 FROM clubs WHERE leader_id=$1 AND status='approved'`, [u.id]);
      if (pend.rowCount && !ok.rowCount) throw new HttpError(403, `PB ${pend.rows[0].name} belum dikonfirmasi pengelola GOR. Kode bisa dipakai setelah disetujui.`);
      await db.query(`UPDATE users SET code_used=true WHERE id=$1`, [u.id]);
      return { user: publicUser({ ...u, code_used: true }), token: signToken(u), role: await roleOf(u) };
    }
    const inv = await db.query(`SELECT * FROM invites WHERE code=$1 FOR UPDATE`, [code]);
    if (inv.rowCount) {
      const i = inv.rows[0];
      const u = (await db.query(
        `INSERT INTO users (id,name,phone,code,code_used) VALUES ($1,$2,$3,$4,true) RETURNING *`,
        [rid('u'), i.name, i.phone, i.code])).rows[0];
      await db.query(`INSERT INTO club_members (club_id,user_id) VALUES ($1,$2)`, [i.club_id, u.id]);
      await db.query(`DELETE FROM invites WHERE id=$1`, [i.id]);
      await db.query(`INSERT INTO audit_log (actor_id,action,detail) VALUES ($1,'join_by_code',$2)`, [u.id, { club: i.club_id }]);
      return { user: publicUser(u), token: signToken(u), role: 'anggota', clubId: i.club_id };
    }
    throw new HttpError(404, 'Kode tidak dikenali. Periksa lagi dengan ketua PB atau pengelola GOR.');
  });
}

/** Pengajuan PB baru (tanpa login). Ketua dibuat sebagai akun tertunda. */
export async function applyClub({ leaderName, phone, clubName, memberNames }) {
  const kn = String(leaderName || '').trim().slice(0, 40);
  const pb = String(clubName || '').trim().slice(0, 40);
  if (!kn) throw new HttpError(400, 'Isi nama ketua.');
  if (!pb) throw new HttpError(400, 'Isi nama PB.');
  if (!validPhone(phone)) throw new HttpError(400, 'Isi nomor HP yang valid. Contoh: 081234567890.');
  const seen = new Set([kn.toLowerCase()]);
  const names = (Array.isArray(memberNames) ? memberNames : []).map(x => String(x).trim().slice(0, 30)).filter(Boolean)
    .filter(n => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 60);
  return tx(async db => {
    const dup = (await db.query('SELECT id,status,leader_id FROM clubs WHERE name_key=$1 FOR UPDATE', [nameKey(pb)])).rows[0];
    if (dup && dup.status !== 'rejected') throw new HttpError(409, 'Nama PB itu sudah terdaftar.');
    if (dup) {
      // Pengajuan lama yang ditolak dibersihkan supaya nama bisa didaftarkan lagi.
      await db.query('DELETE FROM clubs WHERE id=$1', [dup.id]);
      await db.query(`DELETE FROM users u WHERE u.id=$1 AND u.code_used=false AND NOT EXISTS (SELECT 1 FROM clubs WHERE leader_id=u.id) AND NOT EXISTS (SELECT 1 FROM club_members WHERE user_id=u.id)`, [dup.leader_id]);
    }
    const leader = (await db.query(
      `INSERT INTO users (id,name,phone,code) VALUES ($1,$2,$3,$4) RETURNING *`,
      [rid('u'), kn, normPhone(phone), await freshCode(db)])).rows[0];
    const club = (await db.query(
      `INSERT INTO clubs (id,name,name_key,leader_id) VALUES ($1,$2,$3,$4) RETURNING *`,
      [rid('c'), pb, nameKey(pb), leader.id])).rows[0];
    await db.query(`INSERT INTO club_members (club_id,user_id) VALUES ($1,$2)`, [club.id, leader.id]);
    for (const n of names) {
      await db.query(`INSERT INTO invites (id,club_id,name,code) VALUES ($1,$2,$3,$4)`, [rid('i'), club.id, n, await freshCode(db)]);
    }
    await db.query(`INSERT INTO audit_log (actor_id,action,detail) VALUES ($1,'club_apply',$2)`, [leader.id, { club: club.id }]);
    return { clubId: club.id, status: club.status };
  });
}

export async function approveClub(adminId, clubId, approve = true) {
  return tx(async db => {
    const c = (await db.query('SELECT * FROM clubs WHERE id=$1 FOR UPDATE', [clubId])).rows[0];
    if (!c) throw new HttpError(404, 'PB tidak ditemukan.');
    if (c.status !== 'pending') throw new HttpError(409, 'PB ini sudah diproses.');
    if (!approve) {
      await db.query(`UPDATE clubs SET status='rejected' WHERE id=$1`, [clubId]);
      return { status: 'rejected' };
    }
    const code = await freshCode(db);
    await db.query(`UPDATE clubs SET status='approved', code=$2, approved_at=now() WHERE id=$1`, [clubId, code]);
    await db.query(`INSERT INTO audit_log (actor_id,action,detail) VALUES ($1,'club_approve',$2)`, [adminId, { club: clubId }]);
    return { status: 'approved', clubCode: code };
  });
}

/** Ketua PB tersebut atau Super User. */
async function assertCanManage(db, user, clubId) {
  const c = (await db.query('SELECT * FROM clubs WHERE id=$1', [clubId])).rows[0];
  if (!c) throw new HttpError(404, 'PB tidak ditemukan.');
  if (user.role !== 'superadmin' && !(c.leader_id === user.id && c.status === 'approved')) throw new HttpError(403, 'Hanya ketua PB atau Super User.');
  return c;
}

/** Tambah anggota lewat nama. Hasilnya kode masuk sekali pakai untuk dibagikan ke orangnya. */
export async function addMember(user, clubId, { name, phone }) {
  const nm = String(name || '').trim().slice(0, 30);
  if (!nm) throw new HttpError(400, 'Isi nama anggota.');
  const hp = phone ? (validPhone(phone) ? normPhone(phone) : null) : '';
  if (hp === null) throw new HttpError(400, 'Nomor HP tidak valid.');
  return tx(async db => {
    const c = await assertCanManage(db, user, clubId);
    if (c.status !== 'approved') throw new HttpError(409, 'PB belum disetujui.');
    const dup = await db.query(
      `SELECT 1 FROM invites WHERE club_id=$1 AND lower(name)=lower($2)
       UNION ALL SELECT 1 FROM club_members m JOIN users u ON u.id=m.user_id WHERE m.club_id=$1 AND lower(u.name)=lower($2)`, [clubId, nm]);
    if (dup.rowCount) throw new HttpError(409, 'Anggota dengan nama itu sudah ada di ' + c.name + '.');
    const code = await freshCode(db);
    const i = (await db.query(`INSERT INTO invites (id,club_id,name,phone,code) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [rid('i'), clubId, nm, hp, code])).rows[0];
    await db.query(`INSERT INTO audit_log (actor_id,action,detail) VALUES ($1,'member_add',$2)`, [user.id, { club: clubId, invite: i.id }]);
    return { inviteId: i.id, name: i.name, code };
  });
}

/** Kode baru untuk anggota yang sudah masuk (mis. ganti HP). */
export async function resetUserCode(user, targetId) {
  return tx(async db => {
    const t = (await db.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [targetId])).rows[0];
    if (!t || t.role === 'superadmin') throw new HttpError(404, 'Akun tidak ditemukan.');
    if (user.role !== 'superadmin') {
      const own = await db.query(
        `SELECT 1 FROM clubs c JOIN club_members m ON m.club_id=c.id WHERE c.leader_id=$1 AND c.status='approved' AND m.user_id=$2`, [user.id, targetId]);
      if (!own.rowCount) throw new HttpError(403, 'Hanya ketua PB anggota itu atau Super User.');
    }
    const code = await freshCode(db);
    await db.query('UPDATE users SET code=$2, code_used=false WHERE id=$1', [targetId, code]);
    await db.query(`INSERT INTO audit_log (actor_id,action,detail) VALUES ($1,'code_reset',$2)`, [user.id, { user: targetId }]);
    return { userId: targetId, code };
  });
}

/** Hapus calon anggota (ketua PB terkait atau Super User). */
export async function deleteInvite(user, inviteId) {
  return tx(async db => {
    const i = (await db.query('SELECT * FROM invites WHERE id=$1 FOR UPDATE', [inviteId])).rows[0];
    if (!i) throw new HttpError(404, 'Calon anggota tidak ditemukan.');
    await assertCanManage(db, user, i.club_id);
    await db.query('DELETE FROM invites WHERE id=$1', [inviteId]);
    return { deleted: inviteId };
  });
}

/** Keluarkan anggota dari PB (bukan ketua). Ketua PB itu atau Super User. */
export async function kickMember(user, clubId, targetId, reason = '') {
  return tx(async db => {
    const c = await assertCanManage(db, user, clubId);
    if (c.leader_id === targetId) throw new HttpError(409, 'Ketua tidak bisa dikeluarkan. Ganti ketua dulu.');
    const r = await db.query('DELETE FROM club_members WHERE club_id=$1 AND user_id=$2', [clubId, targetId]);
    if (!r.rowCount) throw new HttpError(404, 'Anggota tidak ada di PB ini.');
    await db.query(`INSERT INTO audit_log (actor_id,action,detail) VALUES ($1,'member_kick',$2)`, [user.id, { club: clubId, user: targetId, reason: String(reason).slice(0, 200) }]);
    return { clubId, userId: targetId, clubName: c.name };
  });
}

/** Pindahkan anggota ke PB lain yang sudah disetujui. Hanya Super User. */
export async function moveMember(user, clubId, targetId, toClubId) {
  if (user.role !== 'superadmin') throw new HttpError(403, 'Hanya Super User.');
  if (!toClubId || toClubId === clubId) throw new HttpError(400, 'Pilih PB tujuan yang berbeda.');
  return tx(async db => {
    const from = (await db.query('SELECT * FROM clubs WHERE id=$1 FOR UPDATE', [clubId])).rows[0];
    const to = (await db.query('SELECT * FROM clubs WHERE id=$1 FOR UPDATE', [toClubId])).rows[0];
    if (!from || !to) throw new HttpError(404, 'PB tidak ditemukan.');
    if (to.status !== 'approved') throw new HttpError(409, 'PB tujuan belum disetujui.');
    if (from.leader_id === targetId) throw new HttpError(409, 'Ketua tidak bisa dipindahkan. Ganti ketua dulu.');
    const r = await db.query('DELETE FROM club_members WHERE club_id=$1 AND user_id=$2', [clubId, targetId]);
    if (!r.rowCount) throw new HttpError(404, 'Anggota tidak ada di PB asal.');
    await db.query('INSERT INTO club_members (club_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [toClubId, targetId]);
    await db.query(`INSERT INTO audit_log (actor_id,action,detail) VALUES ($1,'member_move',$2)`, [user.id, { from: clubId, to: toClubId, user: targetId }]);
    return { userId: targetId, from: { id: from.id, name: from.name }, to: { id: to.id, name: to.name } };
  });
}

/** Ganti ketua PB ke salah satu anggotanya. Hanya Super User. Ketua lama tetap anggota. */
export async function changeLeader(user, clubId, newLeaderId) {
  if (user.role !== 'superadmin') throw new HttpError(403, 'Hanya Super User.');
  return tx(async db => {
    const c = (await db.query('SELECT * FROM clubs WHERE id=$1 FOR UPDATE', [clubId])).rows[0];
    if (!c) throw new HttpError(404, 'PB tidak ditemukan.');
    if (c.status !== 'approved') throw new HttpError(409, 'PB belum disetujui.');
    if (c.leader_id === newLeaderId) throw new HttpError(409, 'Orang itu sudah menjadi ketua.');
    const m = await db.query('SELECT 1 FROM club_members WHERE club_id=$1 AND user_id=$2', [clubId, newLeaderId]);
    if (!m.rowCount) throw new HttpError(400, 'Ketua baru harus anggota PB ini.');
    await db.query('UPDATE clubs SET leader_id=$2 WHERE id=$1', [clubId, newLeaderId]);
    await db.query(`INSERT INTO audit_log (actor_id,action,detail) VALUES ($1,'leader_change',$2)`, [user.id, { club: clubId, from: c.leader_id, to: newLeaderId }]);
    return { clubId, oldLeaderId: c.leader_id, newLeaderId };
  });
}
