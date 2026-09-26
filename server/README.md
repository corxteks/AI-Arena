# AI ARENA Server

Backend untuk aplikasi AI ARENA: **PostgreSQL** sebagai database, **API Node.js (Express)**, masuk dengan **kode sekali pakai**, sinkronisasi data berversi, dan **integrasi YouTube Live**.

Status: fondasi sudah jadi dan diuji (16 tes lolos). Aplikasi web (`index.html`) belum tersambung ke server ini; sambungannya adalah tahap berikutnya.

## Menjalankan di komputer sendiri

Butuh Node.js 20+ dan Docker (atau PostgreSQL biasa).

```bash
cd server
cp .env.example .env
```

Isi `JWT_SECRET` dan `TOKEN_ENC_KEY` di `.env` dengan nilai acak:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # TOKEN_ENC_KEY
```

Lalu:

```bash
docker compose up -d db     # PostgreSQL di port 5433
npm install
npm start                   # migrasi otomatis, server di http://localhost:3000
npm test                    # 16 tes (memakai basis data arena_test)
```

Tanpa Docker, arahkan `DATABASE_URL` ke PostgreSQL yang sudah ada. Tabel dibuat otomatis oleh `db/schema.sql`.

## Yang ada

| Bagian | Isi |
|---|---|
| Autentikasi | Setup pengelola sekali; masuk dengan kode sekali pakai; kode baru oleh ketua atau Super User |
| PB | Pengajuan tanpa login, konfirmasi Super User, tambah anggota lewat nama (menghasilkan kode) |
| Data aplikasi | Dokumen berversi `GET/PUT /api/state` dengan deteksi konflik (409), pemberitahuan langsung lewat SSE `/api/events` |
| YouTube | Hubungkan kanal (OAuth), buat siaran, ubah status, hitung kuota harian, satu lapangan satu siaran |
| Keamanan | Helmet, CORS terbatas, batas percobaan masuk, token JWT, token YouTube dienkripsi AES-256-GCM |

## Endpoint

Semua di bawah `/api`. `🔒` = perlu header `Authorization: Bearer <token>`.

| Metode | Path | Keterangan |
|---|---|---|
| GET | `/health` | Cek server dan apakah pengelola sudah ada |
| POST | `/auth/setup-admin` | `{name, phone?}` membuat Super User (hanya sekali) |
| POST | `/auth/login` | `{code}` masuk dengan kode sekali pakai |
| GET | `/me` 🔒 | Akun dan peran (`super`, `ketua`, `anggota`) |
| POST | `/clubs/apply` | Ajukan PB baru: `{leaderName, phone, clubName, memberNames[]}` |
| GET | `/clubs` 🔒 | Daftar PB. Kode hanya terlihat oleh Super User dan ketua PB itu |
| POST | `/clubs/:id/approve` 🔒 | Super User menyetujui PB (`/reject` untuk menolak) |
| POST | `/clubs/:id/members` 🔒 | Ketua atau Super User menambah anggota: `{name, phone?}`, hasilnya kode masuk |
| POST | `/users/:id/reset-code` 🔒 | Kode baru untuk anggota yang sudah masuk |
| GET/PUT | `/state` 🔒 | Data aplikasi berversi: `PUT {doc, baseVersion}` |
| GET | `/events?token=` | Aliran SSE untuk perubahan data dan siaran |
| GET | `/youtube/status` 🔒 Super User | Terhubung atau belum, kanal, sisa kuota |
| GET | `/youtube/auth-url` 🔒 Super User | Alamat persetujuan Google |
| POST | `/youtube/streams` 🔒 Super User | Buat siaran: `{matchId, court, title, description?, privacy?}` |
| POST | `/youtube/streams/:id/transition` 🔒 Super User | `{status: testing\|live\|complete}` |
| GET | `/youtube/streams/:id/ingest` 🔒 Super User | Alamat RTMP dan kunci siaran (rahasia) |

## Menyambungkan YouTube

Ini perlu dilakukan pemilik kanal YouTube GOR sendiri, karena melibatkan akun Google dan kunci rahasia. Jangan membagikan `Client Secret` ke siapa pun atau memasukkannya ke Git.

1. Buka [Google Cloud Console](https://console.cloud.google.com/), buat proyek.
2. **APIs & Services → Library → YouTube Data API v3 → Enable**.
3. **OAuth consent screen**: isi nama aplikasi; tambahkan akun Google pemilik kanal sebagai *Test user*.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorized redirect URI: `http://localhost:3000/api/youtube/oauth/callback` (ganti dengan alamat server sebenarnya saat di-deploy).
5. Salin *Client ID* dan *Client secret* ke `.env`: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`.
6. Di kanal YouTube, pastikan **live streaming sudah diaktifkan** (studio.youtube.com → Buat → Mulai siaran langsung; verifikasi kanal bisa memakan waktu sampai 24 jam).
7. Jalankan server, masuk sebagai Super User, lalu panggil `GET /api/youtube/auth-url` dan buka alamatnya di browser. Setelah menyetujui, token disimpan terenkripsi di database.

Kuota bawaan Google 10.000 unit per hari. Satu siaran memakai sekitar 150 unit saat dibuat ditambah 50 unit per perubahan status, jadi sekitar 40 siaran per hari. Server menolak (429) bila kuota tidak cukup, dan kuota direset tengah malam waktu Pasifik.

Video yang disiarkan tidak lewat server ini. Kamera atau aplikasi siaran (OBS, atau ponsel) mengirim video langsung ke YouTube lewat alamat RTMP dan kunci dari `/ingest`. Penonton di aplikasi memutar siaran YouTube.

## Struktur

```
server/
  db/schema.sql      Tabel: users, clubs, club_members, invites, app_state, streams, youtube_auth, youtube_quota, audit_log
  src/config.js      Pembacaan .env
  src/db.js          Koneksi dan transaksi
  src/migrate.js     Menjalankan schema.sql
  src/auth.js        Setup pengelola, kode masuk, PB, anggota
  src/youtube.js     Klien YouTube Live dan kuota
  src/app.js         Rute Express
  test/api.test.js   Tes API dan YouTube (dengan YouTube tiruan)
```

## Catatan keamanan

- Kode masuk tidak sekuat kata sandi: siapa pun yang tahu kodenya bisa masuk sebagai orang itu, sekali. Cocok untuk undangan, bukan untuk membatasi akses jangka panjang. Sesi berikutnya memakai token JWT yang tersimpan di perangkat.
- `PUT /state` menerima seluruh dokumen dari pengguna mana pun yang sudah masuk. Pembatasan per peran dan pemecahan ke tabel sendiri dikerjakan saat aplikasi web disambungkan.
- Wajib memakai HTTPS saat di-deploy, dan isi `CORS_ORIGINS` hanya dengan alamat situs sendiri.
