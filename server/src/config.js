import 'dotenv/config';

const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  corsOrigins: (env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  databaseUrl: env.DATABASE_URL || 'postgres://arena:arena_dev_password@localhost:5433/arena',
  jwtSecret: env.JWT_SECRET || '',
  trustProxy: Number(env.TRUST_PROXY || 0),
  corsAllowLan: env.CORS_ALLOW_LAN === '1',
  authRateLimit: Number(env.AUTH_RATE_LIMIT || 30),
  jwtExpiresIn: env.JWT_EXPIRES_IN || '30d',
  tokenEncKey: env.TOKEN_ENC_KEY || '',
  youtube: {
    clientId: env.YOUTUBE_CLIENT_ID || '',
    clientSecret: env.YOUTUBE_CLIENT_SECRET || '',
    redirectUri: env.YOUTUBE_REDIRECT_URI || 'http://localhost:3000/api/youtube/oauth/callback',
    dailyQuota: Number(env.YOUTUBE_DAILY_QUOTA || 10000),
  },
};

export function assertConfig() {
  const problems = [];
  if (config.jwtSecret.length < 32) problems.push('JWT_SECRET wajib diisi (minimal 32 karakter).');
  if (config.tokenEncKey && !/^[0-9a-fA-F]{64}$/.test(config.tokenEncKey)) problems.push('TOKEN_ENC_KEY harus 64 karakter heksadesimal (32 byte).');
  if (problems.length) throw new Error('Konfigurasi tidak valid:\n- ' + problems.join('\n- '));
}
