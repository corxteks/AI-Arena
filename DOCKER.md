# Mencoba AI ARENA dengan Docker

Menjalankan seluruh aplikasi di komputer sendiri, lengkap dengan database dan server, tanpa memasang Node atau PostgreSQL.

## Cara cepat (Windows)

1. Pasang [Docker Desktop](https://www.docker.com/products/docker-desktop) sekali saja.
2. Klik dua kali **`start.bat`**. Pertama kali ia akan membuat berkas `.env` berisi rahasia acak, membangun, dan menjalankan semuanya.
3. Browser terbuka di **http://localhost:8080**.
4. Berhenti: **`stop.bat`**. Data tetap tersimpan di volume Docker.

Perintah manual (semua sistem): salin `.env.docker.example` menjadi `.env`, isi tiga rahasia, lalu

```bash
docker compose up -d --build
```

## Yang berjalan

| Layanan | Alamat | Isi |
|---|---|---|
| `web` | http://localhost:8080 | Situs (`index.html`) lewat nginx |
| `api` | http://localhost:3000 | Server Node.js (`server/`) |
| `db` | tidak dibuka keluar | PostgreSQL 16, data di volume `ai-arena_arena_pgdata` |

Situs otomatis mengenali server dan masuk **mode server**. Kunjungan pertama menampilkan layar setup pengelola.

## Mencoba dari HP

HP dan komputer harus di Wi-Fi yang sama. Buka `http://<IP-komputer>:8080` (alamatnya dicetak oleh `start.bat`). Bila tidak terbuka, izinkan port **8080** dan **3000** di Windows Firewall.

## Perintah berguna

```bash
docker compose ps                 # status layanan
docker compose logs -f api        # log server
docker compose down               # berhenti (data aman)
docker compose down -v            # berhenti dan HAPUS semua data
docker compose up -d --build api  # bangun ulang server setelah mengubah kode
```

Berkas `index.html` dipasang langsung ke nginx: cukup muat ulang browser setelah mengubahnya, tidak perlu membangun ulang.

## YouTube

Isi `YOUTUBE_CLIENT_ID` dan `YOUTUBE_CLIENT_SECRET` di `.env` (langkahnya di `server/README.md`), lalu `docker compose up -d api`.

## Catatan

- Berkas `.env` berisi rahasia dan tidak ikut Git.
- Pengaturan ini untuk mencoba di komputer sendiri. Untuk internet, gunakan HTTPS, kata sandi database sendiri, dan `CORS_ALLOW_LAN` dimatikan.
