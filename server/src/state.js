import { query } from './db.js';

/** Bagian dokumen yang hanya boleh diubah Super User. Perubahan dari akun lain diabaikan (nilai lama dipertahankan). */
export const ADMIN_ONLY_KEYS = ['announcements', 'announcement', 'tvs', 'tvTicker', 'quota', 'quotaLog', 'auditLog', 'courtSched', 'adminCode', 'adminClaimed', 'tabOpen', 'tourneys', 'leagues'];

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Ketua PB terkait (approved), pemain, atau wasit laga itu boleh mengubahnya; selain itu ditolak. */
function matchAllowed(m, user, leaderClubIds) {
  if (!m) return false;
  const ids = [...(m.teamA || []), ...(m.teamB || [])];
  return ids.includes(user.id) || m.umpireId === user.id || (m.clubId && leaderClubIds.has(m.clubId));
}
function challengeAllowed(c, user) {
  if (!c) return false;
  return [...(c.from || []), ...(c.to || [])].includes(user.id);
}

/** Saring larik `key` dari `out`: tiap butir dicek terhadap versi tersimpan (fallback ke butir baru bila memang baru). */
function filterList(out, stored, key, allowedFn, ignored) {
  if (!Array.isArray(out[key])) return;
  const storedById = new Map((Array.isArray(stored[key]) ? stored[key] : []).map(x => [x.id, x]));
  let dropped = false;
  out[key] = out[key].filter(item => {
    const prev = storedById.get(item.id);
    if (prev && sameJson(prev, item)) return true; // tidak berubah, selalu boleh
    if (allowedFn(prev || item)) return true;
    dropped = true;
    return false;
  });
  // Butir yang ada di tersimpan tapi hilang dari kiriman (dihapus) juga perlu izin.
  for (const prev of storedById.values()) {
    if (!out[key].some(x => x.id === prev.id) && !allowedFn(prev)) { out[key].push(prev); dropped = true; }
  }
  if (dropped) ignored.push(key);
}

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
  const clubs = new Map((await query('SELECT id,name,status,leader_id FROM clubs')).rows.map(c => [c.id, c]));
  if (!isAdmin) {
    const stored = (await query('SELECT doc FROM app_state WHERE id=1')).rows[0].doc || {};
    for (const k of ADMIN_ONLY_KEYS) {
      if (JSON.stringify(out[k]) === JSON.stringify(stored[k])) continue;
      ignored.push(k);
      if (stored[k] === undefined) delete out[k]; else out[k] = stored[k];
    }
    const leaderClubIds = new Set([...clubs.values()].filter(c => c.status === 'approved' && c.leader_id === user.id).map(c => c.id));
    filterList(out, stored, 'matches', m => matchAllowed(m, user, leaderClubIds), ignored);
    filterList(out, stored, 'challenges', c => challengeAllowed(c, user), ignored);
  }
  const users = new Map((await query('SELECT id,name,role FROM users')).rows.map(u => [u.id, u]));
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
