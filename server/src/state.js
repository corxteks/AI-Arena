import { query } from './db.js';

/** Bagian dokumen yang hanya boleh diubah Super User. Perubahan dari akun lain diabaikan (nilai lama dipertahankan). */
export const ADMIN_ONLY_KEYS = ['announcements', 'announcement', 'tvs', 'tvTicker', 'quota', 'quotaLog', 'auditLog', 'courtSched', 'adminCode', 'adminClaimed'];

/**
 * Rapikan dokumen sebelum disimpan:
 * 1. Bagian khusus Super User dikembalikan ke nilai tersimpan bila pengirimnya bukan Super User.
 * 2. Identitas (peran, nama, ketua, status, dan keanggotaan PB) selalu mengikuti basis data, bukan kiriman klien.
 * Mengembalikan { doc, ignored } dengan ignored = kunci yang perubahannya ditolak.
 */
export async function sanitizeDoc(doc, user) {
  const out = { ...doc };
  const ignored = [];
  const isAdmin = user.role === 'superadmin';
  if (!isAdmin) {
    const stored = (await query('SELECT doc FROM app_state WHERE id=1')).rows[0].doc || {};
    for (const k of ADMIN_ONLY_KEYS) {
      if (JSON.stringify(out[k]) === JSON.stringify(stored[k])) continue;
      ignored.push(k);
      if (stored[k] === undefined) delete out[k]; else out[k] = stored[k];
    }
  }
  const users = new Map((await query('SELECT id,name,role FROM users')).rows.map(u => [u.id, u]));
  const clubs = new Map((await query('SELECT id,name,status,leader_id FROM clubs')).rows.map(c => [c.id, c]));
  const members = new Map();
  for (const r of (await query('SELECT club_id,user_id FROM club_members')).rows) {
    if (!members.has(r.club_id)) members.set(r.club_id, []);
    members.get(r.club_id).push(r.user_id);
  }
  if (Array.isArray(out.users)) {
    out.users = out.users.map(u => {
      const db = u && users.get(u.id);
      if (!db) return u && u.role === 'superadmin' ? { ...u, role: undefined } : u; // akun yang tidak ada di server tidak boleh jadi Super User
      const { role, ...rest } = u;
      return { ...rest, name: db.name, ...(db.role === 'superadmin' ? { role: 'superadmin' } : {}) };
    });
  }
  if (Array.isArray(out.clubs)) {
    out.clubs = out.clubs.map(c => {
      const db = c && clubs.get(c.id);
      if (!db) return c;
      return { ...c, name: db.name, status: db.status, leaderId: db.leader_id, members: members.get(c.id) || [] };
    });
  }
  return { doc: out, ignored };
}
