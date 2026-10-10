import { query } from './db.js';

/** Bagian dokumen yang hanya boleh diubah Super User. Perubahan dari akun lain diabaikan (nilai lama dipertahankan). */
export const ADMIN_ONLY_KEYS = ['announcements', 'announcement', 'tvs', 'tvTicker', 'quota', 'quotaLog', 'auditLog', 'courtSched', 'adminCode', 'adminClaimed', 'tabOpen', 'tourneys', 'leagues', 'payments'];

/** Bagian yang boleh diubah Super User atau ketua PB mana pun (moderasi). */
const MOD_KEYS = ['pins', 'mutes'];

const canon = v => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v);
const sameJson = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

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


const strip = (o, ...ks) => { const c = { ...o }; ks.forEach(k => delete c[k]); return c; };
const arr = v => (Array.isArray(v) ? v : []);
const onlyOwnToggle = (a, b, uid) => {
  const A = new Set(arr(a)), B = new Set(arr(b));
  return [...A].filter(x => !B.has(x)).concat([...B].filter(x => !A.has(x))).every(x => x === uid);
};

/** Pesan orang lain hanya boleh berubah di reaksi, suara jajak, dan peserta ajakan, serta pembersihan foto lama. */
function msgEditAllowed(prev, next, user) {
  if (!prev || !next) return false;
  if (prev.uid === user.id) return next.uid === user.id;
  if (next.uid !== prev.uid) return false;
  const base = m => {
    const c = strip(m, 'react', 'img');
    if (c.poll) c.poll = { ...c.poll, opts: arr(c.poll.opts).map(o => ({ ...o, v: undefined })) };
    if (c.find) c.find = strip(c.find, 'joins');
    return c;
  };
  if (!sameJson(base(prev), base(next))) return false;
  if (next.img && next.img !== prev.img) return false;
  const rk = new Set([...Object.keys(prev.react || {}), ...Object.keys(next.react || {})]);
  for (const k of rk) if (!onlyOwnToggle((prev.react || {})[k], (next.react || {})[k], user.id)) return false;
  if (prev.poll) {
    const pv = arr(prev.poll.opts), nv = arr(next.poll && next.poll.opts);
    if (pv.length !== nv.length) return false;
    for (let i = 0; i < pv.length; i++) {
      if (!sameJson(arr(pv[i].v).filter(x => x !== user.id), arr(nv[i].v).filter(x => x !== user.id))) return false;
    }
  }
  if (prev.find && !onlyOwnToggle(prev.find.joins, next.find && next.find.joins, user.id)) return false;
  return true;
}

function chatsFilter(out, stored, user, ctx, ignored) {
  if (!out.chats || typeof out.chats !== 'object') return;
  const prevAll = stored.chats || {};
  const result = {};
  let dropped = false;
  const keys = new Set([...Object.keys(out.chats), ...Object.keys(prevAll)]);
  for (const key of keys) {
    const prevList = arr(prevAll[key]), nextList = arr(out.chats[key]);
    if (sameJson(prevList, nextList)) { if (prevAll[key] !== undefined) result[key] = prevAll[key]; continue; }
    const clubId = key.startsWith('club:') ? key.slice(5) : null;
    const isMod = !!(clubId && ctx.leaderClubIds.has(clubId));
    const core = key === 'lounge' || key === 'ann' || clubId || key.startsWith('dm:');
    if (!core) { result[key] = out.chats[key]; if (out.chats[key] === undefined) delete result[key]; continue; } // ruang jadwal/siaran: dibersihkan otomatis oleh klien
    const canWrite = key === 'ann' ? false
      : key === 'lounge' ? true
      : key.startsWith('dm:') ? key.split(':').includes(user.id)
      : clubId ? (ctx.leaderClubIds.has(clubId) || ctx.memberClubIds.has(clubId))
      : true; // ruang jadwal/siaran: tiap pengguna masuk boleh ikut mengobrol
    if (!canWrite) { dropped = true; if (prevAll[key] !== undefined) result[key] = prevAll[key]; continue; }
    const prevById = new Map(prevList.map(m => [m.id, m]));
    const kept = [];
    for (const m of nextList) {
      const prev = prevById.get(m.id);
      if (!prev) { // pesan baru: harus atas nama sendiri (atau pesan sistem)
        if (m.uid === user.id || m.uid === 'sys' || m.kind === 'sys') kept.push(m); else dropped = true;
      } else if (sameJson(prev, m)) kept.push(m);
      else if (msgEditAllowed(prev, m, user) || (isMod && !prev.deleted && m.deleted && m.uid === prev.uid)) kept.push(m);
      else { kept.push(prev); dropped = true; }
    }
    for (const prev of prevList) { // pesan yang hilang = dihapus
      if (nextList.some(m => m.id === prev.id)) continue;
      if (prev.uid === user.id || isMod) continue;
      kept.push(prev); dropped = true;
    }
    result[key] = kept.sort((a, b) => (a.t || 0) - (b.t || 0));
  }
  out.chats = result;
  if (dropped) ignored.push('chats');
}

function photoAllowed(prev, next, user, leaderClubIds) {
  if (!prev || !next) return false;
  const owner = prev.by === user.id, mod = prev.clubId && leaderClubIds.has(prev.clubId);
  if (owner || mod) return next.by === prev.by;
  if (next.by !== prev.by || next.clubId !== prev.clubId) return false;
  const base = p => strip(p, 'likes', 'comments', 'reports', 'tags');
  if (!sameJson(base(prev), base(next))) return false;
  if (!onlyOwnToggle(prev.likes, next.likes, user.id)) return false;
  if (!onlyOwnToggle(prev.reports, next.reports, user.id)) return false;
  if (!onlyOwnToggle(prev.tags, next.tags, user.id)) return false;
  const pc = new Map(arr(prev.comments).map(c => [c.id, c])), nc = new Map(arr(next.comments).map(c => [c.id, c]));
  for (const [id, c] of nc) { const o = pc.get(id); if (!o ? c.by !== user.id : !(sameJson(o, c) || (o.by !== user.id && sameJson(strip(o, 'likes'), strip(c, 'likes')) && onlyOwnToggle(o.likes, c.likes, user.id)) || (o.by === user.id && c.by === user.id))) return false; }
  for (const [id, o] of pc) if (!nc.has(id) && o.by !== user.id) return false;
  return true;
}

function galleryFilter(out, stored, user, ctx, ignored) {
  if (!Array.isArray(out.gallery)) return;
  const prevById = new Map(arr(stored.gallery).map(p => [p.id, p]));
  let dropped = false;
  const kept = [];
  for (const p of out.gallery) {
    const prev = prevById.get(p.id);
    if (!prev) { if (p.by === user.id) kept.push(p); else dropped = true; }
    else if (sameJson(prev, p)) kept.push(p);
    else if (photoAllowed(prev, p, user, ctx.leaderClubIds)) kept.push(p);
    else { kept.push(prev); dropped = true; }
  }
  for (const prev of prevById.values()) {
    if (out.gallery.some(p => p.id === prev.id)) continue;
    if (prev.by === user.id || (prev.clubId && ctx.leaderClubIds.has(prev.clubId))) continue;
    kept.push(prev); dropped = true;
  }
  out.gallery = kept;
  if (dropped) ignored.push('gallery');
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
      if (sameJson(out[k], stored[k])) continue;
      ignored.push(k);
      if (stored[k] === undefined) delete out[k]; else out[k] = stored[k];
    }
    for (const k of ['matches', 'challenges', 'chats', 'gallery']) if (out[k] === undefined && stored[k] !== undefined) { out[k] = stored[k]; ignored.push(k); }
    const leaderClubIds = new Set([...clubs.values()].filter(c => c.status === 'approved' && c.leader_id === user.id).map(c => c.id));
    filterList(out, stored, 'matches', m => matchAllowed(m, user, leaderClubIds), ignored);
    filterList(out, stored, 'challenges', c => challengeAllowed(c, user), ignored);
    const memberClubIds = new Set((await query('SELECT club_id FROM club_members WHERE user_id=$1', [user.id])).rows.map(r => r.club_id));
    const ctx = { leaderClubIds, memberClubIds };
    if (leaderClubIds.size === 0) {
      for (const k of MOD_KEYS) {
        if (sameJson(out[k], stored[k])) continue;
        ignored.push(k);
        if (stored[k] === undefined) delete out[k]; else out[k] = stored[k];
      }
    }
    chatsFilter(out, stored, user, ctx, ignored);
    galleryFilter(out, stored, user, ctx, ignored);
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
