# AI ARENA

Prototipe aplikasi komunitas bulutangkis untuk pengelola GOR dengan 3 lapangan. Seluruh aplikasi ada dalam satu berkas, `ai-arena.html`, tanpa server dan tanpa proses build. Tampilannya dirancang untuk HP (mobile first) dan mendukung mode terang dan gelap.

## Cara membuka

Buka `ai-arena.html` langsung di browser, atau jalankan server statis sederhana di folder ini:

```bash
python -m http.server 8080
```

lalu buka `http://localhost:8080/ai-arena.html`. Data disimpan di `localStorage` browser (kunci `ai-arena-v4`). Tombol **Kelola** di menu Obrolan (khusus pengelola) berisi **Isi data contoh** dan **Reset**.

## Fitur utama

- **Beranda** bersifat informatif. Pengelola melihat ringkasan lapangan, turnamen aktif, dan daftar hal yang perlu perhatian. Member melihat laga berikutnya, ringkasan 7 hari, turnamen, dan pengumuman.
- **Tanding**
  - Papan tiga lapangan (sedang main, berikutnya, panggil pemain, geser jadwal).
  - Penyaring laga, riwayat dan analisis.
  - Tantangan dengan taruhan ELO dan liga antar-PB.
- **Turnamen ganda seimbang**
  - Level A–E melekat pada pemain (A=5 … E=1). Pasangan dicampur lintas level dan harus mendekati nilai target dengan toleransi. Pasangan di luar toleransi ditolak sistem.
  - Pendaftaran hanya oleh pengelola. Pasangan bisa disusun otomatis atau manual, dengan unggulan, penanda veteran, dan BYE.
  - Sistem gugur, setengah kompetisi (fase grup lalu knockout, jumlah grup otomatis), atau full kompetisi.
  - Klasemen grup dan bagan knockout lengkap.
- **Penjadwalan 3 lapangan**
  - Hanya memakai tanggal yang ditentukan pengelola.
  - Jam buka Senin–Jumat 16.00 dan Sabtu–Minggu 10.00, tutup 00.00, dengan jeda ishoma.
  - Kalkulator kapasitas, papan lapangan × jam, tukar dan pindah laga, kunci dan umumkan jadwal.
  - Estimasi jam mulai otomatis bergeser mengikuti durasi laga sebenarnya.
- **Pengaturan pertandingan.** Wasit, panggilan 1–3, WO, dan mulai pertandingan langsung ke skor live dengan pilihan live streaming.
- **Mode wasit.** Skor kiri dan kanan, posisi servis otomatis, dan pertukaran posisi pemain otomatis. Pewaktu menghitung total waktu pertandingan.
- **Siaran, Peringkat, Obrolan, Galeri, Member, dan GOR.** Live streaming dan layar TV tiruan, peringkat ELO, obrolan, foto, data member dan PB, serta jadwal tetap.

## Catatan

Ini prototipe front-end: belum ada backend, autentikasi, atau penyimpanan di server. Beberapa fitur (misalnya siaran YouTube dan layar TV) berupa simulasi tampilan. Riwayat keputusan desain ada di `AI-ARENA-HANDOFF.md`.
