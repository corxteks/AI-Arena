import { google } from 'googleapis';
import { config } from './config.js';
import { query } from './db.js';
import { HttpError, rid, encrypt, decrypt, pacificDay } from './util.js';

/** Biaya kuota YouTube Data API v3 (unit). Sumber: dokumentasi kuota Google. */
export const COST = { list: 1, insertBroadcast: 50, insertStream: 50, bind: 50, transition: 50 };
export const SCOPES = ['https://www.googleapis.com/auth/youtube'];

export const isConfigured = () => !!(config.youtube.clientId && config.youtube.clientSecret && config.tokenEncKey);

const newOAuth = () => new google.auth.OAuth2(config.youtube.clientId, config.youtube.clientSecret, config.youtube.redirectUri);

// Untuk pengujian: ganti pembuat klien YouTube dengan tiruan.
let clientFactory = async () => {
  const row = (await query('SELECT refresh_token FROM youtube_auth WHERE id=1')).rows[0];
  if (!row) throw new HttpError(409, 'Kanal YouTube belum dihubungkan.');
  const auth = newOAuth();
  auth.setCredentials({ refresh_token: decrypt(row.refresh_token) });
  return google.youtube({ version: 'v3', auth });
};
export const setClientFactory = f => { clientFactory = f; };

/* ---------- kuota ---------- */

export async function quotaStatus() {
  const day = pacificDay();
  const r = await query('SELECT units FROM youtube_quota WHERE day=$1', [day]);
  const used = r.rows[0]?.units || 0;
  return { day, used, limit: config.youtube.dailyQuota, left: Math.max(0, config.youtube.dailyQuota - used) };
}

/** Cadangkan kuota sebelum memanggil YouTube; gagal bila tidak cukup. */
async function spend(units) {
  const day = pacificDay();
  await query('INSERT INTO youtube_quota (day,units) VALUES ($1,0) ON CONFLICT DO NOTHING', [day]);
  const r = await query(
    `UPDATE youtube_quota SET units=units+$2 WHERE day=$1 AND units+$2<=$3 RETURNING units`,
    [day, units, config.youtube.dailyQuota]);
  if (!r.rowCount) throw new HttpError(429, 'Kuota YouTube hari ini tidak cukup. Coba lagi besok (reset tengah malam waktu Pasifik).');
}

/* ---------- hubungan akun ---------- */

export async function status() {
  const configured = isConfigured();
  const row = (await query('SELECT channel_id,channel_title,updated_at FROM youtube_auth WHERE id=1')).rows[0];
  return { configured, connected: !!row, channel: row ? { id: row.channel_id, title: row.channel_title } : null, quota: await quotaStatus() };
}

export function authUrl(state) {
  if (!isConfigured()) throw new HttpError(503, 'YouTube belum dikonfigurasi (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, TOKEN_ENC_KEY).');
  return newOAuth().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES, state });
}

export async function handleCallback(code) {
  if (!isConfigured()) throw new HttpError(503, 'YouTube belum dikonfigurasi.');
  const oauth = newOAuth();
  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) throw new HttpError(400, 'Google tidak mengirim refresh token. Cabut akses aplikasi di akun Google lalu coba lagi.');
  oauth.setCredentials(tokens);
  let channel = null;
  try {
    const yt = google.youtube({ version: 'v3', auth: oauth });
    const r = await yt.channels.list({ part: ['snippet'], mine: true });
    channel = r.data.items?.[0] || null;
  } catch { /* kanal opsional untuk tampilan */ }
  await query(
    `INSERT INTO youtube_auth (id,refresh_token,channel_id,channel_title) VALUES (1,$1,$2,$3)
     ON CONFLICT (id) DO UPDATE SET refresh_token=$1, channel_id=$2, channel_title=$3, updated_at=now()`,
    [encrypt(tokens.refresh_token), channel?.id || null, channel?.snippet?.title || null]);
  return { channel: channel ? { id: channel.id, title: channel.snippet?.title } : null };
}

export async function disconnect() {
  await query('DELETE FROM youtube_auth WHERE id=1');
}

/* ---------- siaran ---------- */

export const watchUrl = id => `https://www.youtube.com/watch?v=${id}`;

/** Buat siaran untuk sebuah lapangan: broadcast + stream + bind. Satu lapangan satu siaran aktif. */
export async function createStream({ matchId, court, title, description = '', privacy = 'unlisted', userId }) {
  if (!['public', 'unlisted', 'private'].includes(privacy)) throw new HttpError(400, 'Privasi tidak valid.');
  const ttl = String(title || '').trim().slice(0, 100);
  if (!ttl) throw new HttpError(400, 'Judul siaran wajib diisi.');
  if (!court || !matchId) throw new HttpError(400, 'Lapangan dan laga wajib diisi.');
  const busy = await query(`SELECT id FROM streams WHERE court=$1 AND status IN ('created','testing','live')`, [court]);
  if (busy.rowCount) throw new HttpError(409, `${court} sudah punya siaran aktif. Satu lapangan hanya satu kamera live.`);

  const yt = await clientFactory();
  const id = rid('s');
  // Tempati lapangan lebih dulu; indeks unik menolak siaran ganda walau ada dua permintaan bersamaan.
  try {
    await query(`INSERT INTO streams (id,match_id,court,title,privacy,created_by) VALUES ($1,$2,$3,$4,$5,$6)`, [id, matchId, court, ttl, privacy, userId]);
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, `${court} sudah punya siaran aktif.`);
    throw e;
  }
  try {
    await spend(COST.insertBroadcast + COST.insertStream + COST.bind);
    const b = await yt.liveBroadcasts.insert({
      part: ['snippet', 'status', 'contentDetails'],
      requestBody: {
        snippet: { title: ttl, description, scheduledStartTime: new Date().toISOString() },
        status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
        contentDetails: { enableAutoStart: false, enableAutoStop: false, monitorStream: { enableMonitorStream: true } },
      },
    });
    const s = await yt.liveStreams.insert({
      part: ['snippet', 'cdn', 'contentDetails'],
      requestBody: {
        snippet: { title: `${court} - ${ttl}`.slice(0, 100) },
        cdn: { ingestionType: 'rtmp', resolution: 'variable', frameRate: 'variable' },
        contentDetails: { isReusable: false },
      },
    });
    await yt.liveBroadcasts.bind({ part: ['id', 'contentDetails'], id: b.data.id, streamId: s.data.id });
    const ing = s.data.cdn?.ingestionInfo || {};
    await query(`UPDATE streams SET youtube_broadcast_id=$2, youtube_stream_id=$3, ingest_address=$4 WHERE id=$1`, [id, b.data.id, s.data.id, ing.ingestionAddress || null]);
    return { id, broadcastId: b.data.id, watchUrl: watchUrl(b.data.id), ingestAddress: ing.ingestionAddress || null, streamName: ing.streamName || null, status: 'created' };
  } catch (e) {
    await query(`UPDATE streams SET status='error', ended_at=now() WHERE id=$1`, [id]);
    throw e instanceof HttpError ? e : new HttpError(502, 'YouTube menolak permintaan: ' + (e.errors?.[0]?.message || e.message));
  }
}

const NEXT = { created: ['testing', 'live', 'complete'], testing: ['live', 'complete'], live: ['complete'] };

export async function transition(streamId, target) {
  if (!['testing', 'live', 'complete'].includes(target)) throw new HttpError(400, 'Status tujuan tidak valid.');
  const s = (await query('SELECT * FROM streams WHERE id=$1', [streamId])).rows[0];
  if (!s) throw new HttpError(404, 'Siaran tidak ditemukan.');
  if (!(NEXT[s.status] || []).includes(target)) throw new HttpError(409, `Siaran berstatus ${s.status} tidak bisa diubah ke ${target}.`);
  const yt = await clientFactory();
  await spend(COST.transition);
  try {
    await yt.liveBroadcasts.transition({ part: ['status'], id: s.youtube_broadcast_id, broadcastStatus: target });
  } catch (e) {
    throw new HttpError(502, 'YouTube menolak perubahan status: ' + (e.errors?.[0]?.message || e.message));
  }
  await query(
    `UPDATE streams SET status=$2, started_at=CASE WHEN $2='live' THEN now() ELSE started_at END, ended_at=CASE WHEN $2='complete' THEN now() ELSE ended_at END WHERE id=$1`,
    [streamId, target]);
  return { id: streamId, status: target };
}

/** Kunci siaran (rahasia): hanya untuk admin, diambil dari YouTube bila perlu. */
export async function ingestInfo(streamId) {
  const s = (await query('SELECT * FROM streams WHERE id=$1', [streamId])).rows[0];
  if (!s) throw new HttpError(404, 'Siaran tidak ditemukan.');
  const yt = await clientFactory();
  await spend(COST.list);
  const r = await yt.liveStreams.list({ part: ['cdn'], id: [s.youtube_stream_id] });
  const ing = r.data.items?.[0]?.cdn?.ingestionInfo || {};
  return { ingestAddress: ing.ingestionAddress || s.ingest_address, streamName: ing.streamName || null };
}

export async function listStreams(activeOnly = false) {
  const r = await query(`SELECT * FROM streams ${activeOnly ? `WHERE status IN ('created','testing','live')` : ''} ORDER BY created_at DESC LIMIT 100`);
  return r.rows.map(s => ({ ...s, watchUrl: s.youtube_broadcast_id ? watchUrl(s.youtube_broadcast_id) : null }));
}
