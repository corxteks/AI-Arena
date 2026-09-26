import { randomBytes, randomInt, createCipheriv, createDecipheriv } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const rid = (p = '') => p + randomBytes(5).toString('hex');

/** Kode masuk 6 karakter tanpa huruf yang mudah tertukar (I, O, 0, 1). */
export const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');

export const normCode = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const nameKey = v => String(v || '').trim().toLowerCase().replace(/^pb\s+/, '').replace(/\s+/g, ' ');
export const normPhone = v => {
  let d = String(v || '').replace(/[^0-9]/g, '');
  if (d.startsWith('62')) d = '0' + d.slice(2);
  return d;
};
export const validPhone = v => /^(\+62|62|0)8\d{7,12}$/.test(String(v || '').replace(/[\s-]/g, ''));

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const signToken = user => jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
export const verifyToken = t => jwt.verify(t, config.jwtSecret, { algorithms: ['HS256'] });

/** Enkripsi AES-256-GCM untuk token YouTube. Format: iv.tag.data (base64url). */
export function encrypt(plain) {
  if (!config.tokenEncKey) throw new HttpError(500, 'TOKEN_ENC_KEY belum diatur.');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', Buffer.from(config.tokenEncKey, 'hex'), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map(b => b.toString('base64url')).join('.');
}
export function decrypt(blob) {
  const [iv, tag, data] = String(blob).split('.').map(s => Buffer.from(s, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', Buffer.from(config.tokenEncKey, 'hex'), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

/** Tanggal (YYYY-MM-DD) menurut waktu Pasifik: kuota YouTube direset tengah malam di sana. */
export const pacificDay = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
