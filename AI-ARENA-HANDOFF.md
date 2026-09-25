# AI ARENA — Catatan Serah Terima Proyek

Baca file ini dulu sebelum melanjutkan pekerjaan pada `ai-arena.html`.

## Ringkasan
AI ARENA adalah aplikasi komunitas bulutangkis untuk **satu GOR** (single-venue), dibangun dari PRD pemilik. Saat ini berupa **prototipe UI/UX + fungsi** dalam satu file HTML (HTML, CSS, dan JS jadi satu; semua gambar tertanam sebagai base64). Belum ada backend. Fokus saat ini: UI/UX dan fungsi, **bukan** persiapan produksi.

## Keputusan penting (jangan diubah tanpa konfirmasi)
- **Hanya permainan ganda.** Tidak ada mode tunggal di mana pun.
- **ELO dinilai per orang.** Rating efektif = 70% ELO sendiri + 30% ELO pasangan, dibandingkan dengan rata-rata ELO kedua lawan. K = 48 untuk 10 laga pertama (Provisional), lalu K = 32. Dua pemain di pasangan yang sama bisa mendapat perubahan ELO yang berbeda.
- **Fitur yang sengaja dihapus:** modul kas komunitas, fitur laporan kerusakan fasilitas, dan status iuran per anggota.
- **Nama aplikasi:** AI ARENA.
- **Tema:** langit biru dengan aksen gradasi jingga → pink → ungu. Latar bawaan dan 5 foto banner/kartu berasal dari pemilik.

## Fitur yang sudah ada
- **Onboarding:** pilih level awal, check-in QR, lalu gabung ke komunitas lewat kode. Pendaftaran komunitas baru harus disetujui pengelola.
- **Check-in:** QR dinamis di layar TV yang berganti setiap 30 detik, ditambah cek lokasi. Akun menjadi nonaktif jika lebih dari 30 hari tanpa check-in.
- **Panel wasit:** aturan servis ganda BWF (posisi kiri/kanan, server, penerima), interval di poin 11, deuce, batas 30 poin, dan Undo satu langkah.
- **Verifikasi skor:** skor diverifikasi tim yang kalah. Skor otomatis sah setelah 24 jam. Skor yang ditolak diputuskan ketua komunitas.
- **Mode menantang:** tantangan langsung atau terbuka (dengan rentang ELO), pratinjau taruhan ELO, kedaluwarsa 48 jam, dan penentuan wasit.
- **Siaran live (simulasi YouTube, unlisted):** meter kuota API, overlay skor ganda dengan jeda sinkron video, dan live chat.
- **Layar TV per lapangan:** skor besar format ganda dan QR check-in.
- **Peringkat:** internal klub dan umum GOR.
- **Profil:** grafik ELO, statistik, rekor bersama pasangan, dan head-to-head.
- **Obrolan:** Lounge GOR dan Match Chat (terbuka 1 jam sebelum mabar, dihapus 2 jam setelahnya), dengan moderasi (lapor, hapus, bisukan).
- **Galeri:** foto dan rekaman siaran.
- **Lain-lain:** notifikasi dan pengumuman. Banner tiap halaman, kartu pertandingan, dan latar aplikasi memakai foto bulutangkis (Unsplash, lisensi Unsplash). Tidak ada lagi menu pengelola untuk mengganti foto ini — sudah ditetapkan langsung di kode.

## Struktur kode (`ai-arena.html`)
- **State** disimpan di `localStorage` dengan key `ai-arena-v4`. Naikkan versi key ini jika struktur data seed berubah (baru saja dinaikkan dari v3 ke v4 saat data dummy dikosongkan, supaya data lama di browser tidak terpakai lagi).
- **Pengguna aktif demo** disimpan di `sessionStorage`, dan diganti lewat menu "Masuk sebagai".
- **`seed()`** saat ini **kosong dari data dummy** — hanya berisi satu akun **ADE RAHMATULLAH** (`role:'superadmin'`, tanpa klub/level, murni pengelola GOR, bukan pemain). Semua klub, laga, tantangan, chat, pengumuman, galeri, dan laporan mulai dari array kosong. Helper `admins()` mengembalikan semua id user `role==='superadmin'` — dipakai untuk notifikasi ke pengelola (pendaftaran komunitas baru, laporan pesan) supaya tidak hardcode ke satu id. Fungsi lama untuk membangkitkan data dummy (`genGames`, `art`, `seedGallery`, generator 40 laga historis) masih ada di file tapi **sudah tidak dipanggil** — tinggal dihapus kalau tidak akan dipakai lagi, atau panggil ulang dari `seed()` kalau ingin data demo penuh kembali.
- **`tick()`** menjalankan aturan berkala: verifikasi otomatis, kedaluwarsa tantangan, pembukaan/penghapusan Match Chat, dan pengingat check-in.
- **Tampilan** dibuat oleh fungsi `v*()` (`vHome`, `vMatches`, `vChallenges`, `vRank`, `vProfile`, `vClub`, `vGallery`, `vTV`, `vUmpire`, dan seterusnya). **Aksi** ada di objek `A` dan dipanggil lewat atribut `data-act`.
- **Foto:** `--img1`…`--img9` (satu foto berbeda per banner halaman lewat `.banner.b1`–`.b9`; hero beranda dan kartu tantangan/pertandingan pakai subset yang sama) dan `--photo`/`--bg-default` (latar aplikasi penuh) semuanya foto bulutangkis dari Unsplash, tertanam langsung sebagai base64 di CSS. Tidak ada lagi state atau menu pengelola untuk menggantinya — kalau mau ganti, edit langsung nilai variabel di `<style>`. Hanya Onboarding dan Komunitas yang sengaja berbagi `--img1` (audiens beda, jarang dilihat berurutan).
- **Menu superadmin (`role:'superadmin'`) selalu penuh 8 tab**, sama seperti menu pemain (Beranda, Tanding, Komunitas, Siaran, Peringkat, Obrolan, Galeri, Klub), terlepas dia tergabung klub atau tidak — logikanya di `render()`: `const fullMenu=admin`. Beranda/Komunitas/Siaran tetap pakai tampilan admin (`vAdminHome`/`vAdminClubs`/`vAdminLive`), sedangkan Tanding/Obrolan/Klub/Peringkat/Galeri dipetakan ke tampilan yang sama seperti pemain (`vMatches`/`vChatList`/`vClub`/`vRank`/`vGallery`) tapi dengan cakupan data **semua klub terverifikasi**, bukan cuma klub sendiri. Ini lewat helper baru `visibleClubs()` (`isAdmin()?semua klub approved:myClubs()`), dipakai di `vMatches`, `vChatList`, `vClub`, `vRank`, `vGallery` menggantikan `myClubs()` langsung. Aksi yang butuh status ketua (buat pertandingan, kode komunitas, terima anggota) tetap memakai `myClubs()`/`isLeader()` asli, jadi superadmin bisa **melihat** semua data tapi tidak otomatis jadi ketua klub manapun.
- **CSS** tersusun berlapis: CSS dasar, lalu blok override berturut-turut (Vivid, Badminton theme, Sky theme, Photo banners). Blok yang **paling bawah** menang.

## Cara menguji
Buka `ai-arena.html` di browser (atau jalankan `python -m http.server 8080` di folder ini lalu buka `http://localhost:8080/ai-arena.html`). Satu-satunya akun yang ada sekarang adalah **ADE RAHMATULLAH** (pengelola GOR, `role:'superadmin'`, otomatis login saat pertama dibuka), dengan menu bawah lengkap 8 tab meski dia tidak tergabung di klub mana pun — lihat data semua komunitas begitu ada yang terverifikasi.

Menu "Masuk sebagai" hanya menampilkan user yang ada di `S.users`, dan aplikasi ini tidak punya form "tambah pengguna" — member baru biasanya masuk lewat alur onboarding (pilih level, check-in, gabung komunitas pakai kode), tapi alur itu perlu sebuah akun yang belum tergabung klub mana pun untuk disimulasikan. Untuk mencoba peran lain (ketua komunitas, wasit, verifikasi skor, dst.), tambahkan user baru langsung di `seed()` seperti pola lama (lihat riwayat git/versi sebelumnya untuk contoh lengkapnya), lalu reset data demo atau naikkan lagi versi `KEY`.

Buka dua tab (misalnya layar TV dan panel wasit) untuk melihat sinkronisasi, setelah ada laga berjalan.

## Ide langkah berikutnya (belum diminta)
- Merapikan CSS berlapis menjadi satu tema.
- Memecah file menjadi komponen jika akan dipindah ke Flutter atau React Native.
