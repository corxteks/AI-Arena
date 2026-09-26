-- Skema AI ARENA (PostgreSQL). Dijalankan berurutan oleh src/migrate.js dan aman diulang.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Pengaturan tunggal (mis. admin_claimed).
CREATE TABLE IF NOT EXISTS settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);

-- Akun. role: 'superadmin' atau 'member' (jabatan ketua diturunkan dari clubs.leader_id).
CREATE TABLE IF NOT EXISTS users (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  phone      text NOT NULL DEFAULT '',
  role       text NOT NULL DEFAULT 'member' CHECK (role IN ('superadmin','member')),
  level      text NOT NULL DEFAULT 'Intermediate',
  elo        integer NOT NULL DEFAULT 1200,
  photo      text,
  code       text UNIQUE,                       -- kode masuk sekali pakai
  code_used  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clubs (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  name_key   text NOT NULL UNIQUE,              -- nama dinormalkan agar tidak ganda
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended','inactive')),
  code       text UNIQUE,                       -- kode PB (dibuat saat disetujui)
  leader_id  text NOT NULL REFERENCES users(id),
  day        smallint NOT NULL DEFAULT 2,
  time       text NOT NULL DEFAULT '19:00',
  court      text,
  elo        integer NOT NULL DEFAULT 1200,
  played     integer NOT NULL DEFAULT 0,
  wins       integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);

CREATE TABLE IF NOT EXISTS club_members (
  club_id   text NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);

-- Calon anggota yang dicatat ketua; menjadi anggota saat kodenya dipakai.
CREATE TABLE IF NOT EXISTS invites (
  id         text PRIMARY KEY,
  club_id    text NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name       text NOT NULL,
  phone      text NOT NULL DEFAULT '',
  code       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seluruh data aplikasi lain (laga, turnamen, obrolan, galeri, dst.) sebagai satu dokumen
-- berversi. Dipecah menjadi tabel sendiri secara bertahap.
CREATE TABLE IF NOT EXISTS app_state (
  id         smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  doc        jsonb NOT NULL DEFAULT '{}'::jsonb,
  version    bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
INSERT INTO app_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Siaran YouTube per laga. Satu lapangan hanya boleh punya satu siaran aktif.
CREATE TABLE IF NOT EXISTS streams (
  id                   text PRIMARY KEY,
  match_id             text NOT NULL,
  court                text NOT NULL,
  title                text NOT NULL,
  privacy              text NOT NULL DEFAULT 'unlisted' CHECK (privacy IN ('public','unlisted','private')),
  youtube_broadcast_id text,
  youtube_stream_id    text,
  ingest_address       text,
  status               text NOT NULL DEFAULT 'created' CHECK (status IN ('created','testing','live','complete','error')),
  started_at           timestamptz,
  ended_at             timestamptz,
  created_by           text REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS streams_one_active_per_court
  ON streams (court) WHERE status IN ('created','testing','live');

-- Token OAuth kanal YouTube milik GOR (dienkripsi di aplikasi sebelum disimpan).
CREATE TABLE IF NOT EXISTS youtube_auth (
  id            smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  refresh_token text NOT NULL,
  channel_id    text,
  channel_title text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Pemakaian kuota YouTube per hari (waktu Pasifik, sesuai reset Google).
CREATE TABLE IF NOT EXISTS youtube_quota (
  day   date PRIMARY KEY,
  units integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  actor_id   text,
  action     text NOT NULL,
  detail     jsonb
);
CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log (at DESC);

INSERT INTO schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING;
