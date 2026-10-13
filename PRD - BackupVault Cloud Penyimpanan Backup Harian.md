# PRD: BackupVault — Cloud Penyimpanan Backup Harian

**Versi:** 1.0 (Draft) · **Tanggal:** 12 Oktober 2026 · **Target deploy:** Ubuntu Server

---

## 1. Ringkasan

BackupVault adalah aplikasi cloud pribadi untuk menampung file backup harian (database SQL/NoSQL dan lainnya) dari semua aplikasi milik Anda. Ukuran backup bisa 1–10 GB per hari. Aplikasi menerima file lewat **API** dari aplikasi utama, menyimpannya dengan aman, menyediakan dashboard web untuk **mencari, memfilter, dan mengunduh** backup, serta **menghapus otomatis** backup lama sesuai aturan retensi.

**Prinsip utama:** ringan, cepat, responsif, dan **keamanan maksimal** karena menyangkut data sensitif.

## 2. Tujuan dan Non-Tujuan

**Tujuan**

- Menerima upload backup berukuran besar (hingga puluhan GB) dengan stabil, bisa dilanjutkan jika koneksi putus.
- Dashboard modern (light/dark mode), responsif di mobile dan desktop.
- Pencarian dan filter backup berdasarkan tanggal, aplikasi, tipe, dan status.
- Download aman dan cepat (mendukung resume).
- Retensi otomatis dan bisa dikonfigurasi.
- Keamanan berlapis: enkripsi, autentikasi kuat, audit log, perlindungan dari ransomware.

**Non-Tujuan (v1)**

- Bukan layanan file sharing umum atau pengganti Google Drive.
- Tidak ada fitur preview isi file backup.
- Tidak ada multi-tenant publik (hanya untuk Anda/tim kecil).

## 3. Pengguna

| Peran              | Deskripsi                       | Hak akses                                            |
| ------------------ | ------------------------------- | ---------------------------------------------------- |
| **Admin**          | Pemilik sistem                  | Semua fitur, kelola aplikasi, API key, retensi, user |
| **Viewer**         | Anggota tim (opsional)          | Lihat dan download saja                              |
| **Aplikasi klien** | Aplikasi utama Anda via API key | **Upload saja** (tidak bisa hapus/download)          |

## 4. Rekomendasi Tech Stack

Pemilihan berdasarkan kebutuhan: upload file besar secara streaming, hemat RAM, cepat, dan mudah dipasang di satu server Ubuntu.

| Lapisan               | Pilihan                                                                           | Alasan                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Backend API**       | **Go** (router Chi atau Fiber)                                                    | Streaming file besar tanpa memenuhi RAM, satu binary, sangat cepat dan ringan, konkuren                                 |
| **Frontend**          | **React + Vite + TypeScript** + **Tailwind CSS** + **shadcn/ui** + TanStack Query | Ekosistem terbesar, build cepat, UI modern, komponen siap pakai, dark mode mudah. _Alternatif lebih ringan: SvelteKit._ |
| **Database metadata** | **PostgreSQL 16**                                                                 | Andal, kuat untuk filter/search/index tanggal                                                                           |
| **Penyimpanan file**  | Disk lokal terenkripsi (**LUKS**) atau **MinIO** (S3-compatible)                  | MinIO memudahkan migrasi ke S3/Backblaze/Wasabi di masa depan                                                           |
| **Upload resumable**  | Protokol **tus** (atau chunked upload buatan sendiri)                             | Upload besar bisa dilanjutkan jika putus                                                                                |
| **Reverse proxy**     | **Nginx** atau **Caddy** (TLS otomatis)                                           | Terminasi HTTPS, rate limit, header keamanan                                                                            |
| **Job terjadwal**     | Scheduler internal Go (cron) + tabel job                                          | Retensi otomatis, verifikasi integritas                                                                                 |
| **Deploy**            | **Docker Compose** (rootless) atau systemd                                        | Reproducible, mudah update                                                                                              |
| **Monitoring**        | Prometheus + Grafana (ringan) atau Uptime Kuma                                    | Pantau disk, error upload, job retensi                                                                                  |

> Catatan: Next.js tidak diperlukan karena aplikasi ini dashboard internal (tanpa kebutuhan SEO). SPA statis + API Go lebih ringan dan cepat.

## 5. Arsitektur

```
[Aplikasi Anda] --HTTPS + API Key + checksum--> [Nginx/Caddy] --> [Go API] --> [Disk terenkripsi / MinIO]
                                                                 |--> [PostgreSQL: metadata, user, audit log]
[Browser Admin] --HTTPS + Login + 2FA--> [Nginx] --> [React SPA] + [Go API]
[Scheduler] --> hapus backup sesuai retensi, verifikasi checksum, kirim notifikasi
```

**Alur upload (dari aplikasi klien):**

1. Klien memanggil `POST /api/v1/uploads` (membuat sesi upload) dengan metadata: nama aplikasi, tipe backup, ukuran, SHA-256.
2. Klien mengirim data secara streaming/chunk (resumable).
3. Server menghitung SHA-256 saat menerima, lalu membandingkan dengan checksum klien.
4. Jika cocok, file ditandai `verified` dan metadata disimpan. Jika tidak, ditolak dan dihapus.
5. Server mengirim notifikasi jika upload gagal atau tidak ada backup masuk pada hari tertentu.

## 6. Fitur dan Kebutuhan Fungsional

### 6.1 Penerimaan Backup (API)

- Autentikasi dengan **API key per aplikasi** (scope: _upload-only_).
- Upload streaming tanpa batas ukuran buatan (dibatasi kuota disk), resumable.
- Verifikasi integritas SHA-256 wajib.
- Penamaan otomatis: `{app}/{YYYY}/{MM}/{DD}/{timestamp}_{nama}.{ext}`.
- Dukungan tipe: `.sql`, `.sql.gz`, `.dump`, `.bak`, `.tar.gz`, `.zip`, `.bson`, `.rdb`, dan lainnya (whitelist yang bisa diatur).
- Idempotensi: upload ulang dengan checksum sama tidak membuat duplikat.

### 6.2 Dashboard

- **Beranda:** total storage terpakai, sisa kapasitas, jumlah backup hari ini, status tiap aplikasi (ada/tidak ada backup hari ini), grafik ukuran backup 30 hari.
- **Daftar backup:** tabel (desktop) dan kartu (mobile) dengan infinite scroll atau pagination.
- **Filter:** rentang tanggal (date picker), aplikasi, tipe file, status (verified/gagal), rentang ukuran.
- **Pencarian:** nama file, nama aplikasi, tag; hasil instan (debounce).
- **Download:** tombol unduh dengan link bertoken sekali pakai berumur pendek (±5 menit), mendukung HTTP Range/resume.
- **Kelola aplikasi:** tambah aplikasi, buat/rotasi/cabut API key, atur retensi per aplikasi.
- **Audit log:** siapa mengakses/mengunduh/menghapus apa, kapan, dari IP mana.
- **Pengaturan:** keamanan akun, 2FA, notifikasi, tema.

### 6.3 Retensi dan Hapus Otomatis

**Interpretasi dari contoh Anda:** pada tanggal 30 Oktober, backup 1–30 September (bulan sebelumnya) dihapus otomatis. Artinya retensi berbasis **bulan kalender**: data bulan lalu dihapus pada hari ke-N bulan berjalan.

**Aturan default v1:**

- Scheduler berjalan setiap hari pukul 23:00 - 23: 59.
- Pada hari ke-**30** tiap bulan (jika bulan tidak punya hari 30, misalnya Februari, gunakan hari terakhir bulan itu), hapus semua backup **bulan sebelumnya**.
- Hari pemicu dapat diubah di pengaturan (`retention_trigger_day`).

**Pengaman wajib (sangat disarankan):**

1. **Minimum keep:** selalu sisakan minimal N backup terbaru yang `verified` per aplikasi (default 3), agar tidak pernah kosong jika backup baru gagal.
2. **Soft delete / karantina 3–7 hari** sebelum hapus permanen (bisa dipulihkan).
3. **Dry-run:** pratinjau daftar yang akan dihapus; notifikasi ke email/Telegram sebelum eksekusi.
4. **Retensi per aplikasi** bisa berbeda; opsi "pertahankan 1 backup bulanan" (misal tanggal 1) sebagai arsip jangka panjang.
5. Hapus hanya dijalankan oleh job sistem atau admin dengan 2FA, bukan oleh API key klien.

> Catatan: dengan aturan ini, di awal bulan data tersimpan hingga ±2 bulan. Hitung kapasitas disk untuk skenario terburuk (lihat bagian 10).

### 6.4 Notifikasi

- Email/Telegram/Discord webhook: backup gagal, backup tidak masuk hari ini, disk > 80%, login mencurigakan, job retensi selesai.

## 7. Desain UI/UX

- **Gaya:** modern, bersih, _glassmorphism_ halus + kartu dengan sudut membulat, tipografi **Inter** atau **Geist**, ikon **Lucide**.
- **Mode:** Light dan Dark, otomatis mengikuti sistem, ada toggle manual dan tersimpan.
- **Palet (usulan):**
  - Dark: latar `#0B0F1A`, permukaan `#131A2A`, aksen `#6366F1` (indigo) dan `#22D3EE` (cyan), sukses `#10B981`, peringatan `#F59E0B`, bahaya `#EF4444`.
  - Light: latar `#F8FAFC`, permukaan `#FFFFFF`, aksen sama, teks `#0F172A`.
- **Responsif:** mobile-first. Desktop memakai sidebar dan tabel; mobile memakai bottom navigation dan kartu. Target tombol sentuh minimal 44px.
- **Interaksi:** skeleton loading, transisi halus, toast, empty state yang jelas, progress bar untuk download.
- **Aksesibilitas:** kontras WCAG AA, navigasi keyboard.
- **Halaman:** Login (+2FA), Dashboard, Backups, Detail Backup, Aplikasi & API Key, Audit Log, Pengaturan.

## 8. Keamanan (Prioritas Tertinggi)

### 8.1 Aplikasi

- **Autentikasi admin:** password **Argon2id** + wajib **2FA (TOTP)**, dukungan **Passkey/WebAuthn**. Kode pemulihan disimpan aman.
- **Sesi:** cookie `HttpOnly`, `Secure`, `SameSite=Strict`, masa berlaku pendek, perlindungan CSRF.
- **API key:** acak 256-bit, hanya disimpan dalam bentuk **hash**, ditampilkan sekali saat dibuat, bisa dirotasi/dicabut, **scope upload-only**, opsional **IP allowlist** per key.
- **Pencegahan ransomware/penyalahgunaan:** API key klien tidak bisa menghapus atau mengunduh. Jika server aplikasi klien diretas, backup lama tetap aman.
- **Rate limiting** dan lockout bertahap pada login dan API.
- **Header keamanan:** HSTS, CSP ketat, X-Content-Type-Options, X-Frame-Options/frame-ancestors, Referrer-Policy.
- **Validasi input** ketat, query terparameter (anti SQL injection), sanitasi nama file (anti path traversal).
- **Audit log tak bisa diubah** (append-only) untuk semua aksi sensitif.
- Dependensi dipindai rutin (Dependabot/`govulncheck`/`npm audit`/Trivy).

### 8.2 Data

- **TLS 1.3** untuk semua koneksi (Let's Encrypt).
- **Enkripsi saat disimpan:** disk **LUKS (full-disk)** dan/atau enkripsi per file **AES-256-GCM** di server dengan kunci disimpan terpisah.
- **Rekomendasi terkuat:** **enkripsi sisi klien** (misal dengan `age` atau GPG) sebelum upload, sehingga server tidak pernah memegang data mentah.
- **Checksum SHA-256** untuk deteksi korupsi, diverifikasi berkala (scrub mingguan).
- **Backup dari backup (3-2-1):** replikasi terenkripsi ke lokasi lain (misal Backblaze B2/Wasabi/server kedua) dengan opsi _object lock_/immutable.
- Link download bertoken, berumur pendek, terikat pada user dan IP.

### 8.3 Server Ubuntu

- Login SSH hanya dengan **key** (nonaktifkan password dan root login), ganti port atau batasi dengan firewall.
- **UFW:** buka hanya 80/443 dan SSH (idealnya dibatasi IP atau lewat VPN seperti **WireGuard/Tailscale**).
- **Fail2ban** atau **CrowdSec** untuk memblokir brute force.
- **Cloudflare** (proxy + WAF) di depan domain, atau minimal Cloudflare DNS + rate limit.
- Database PostgreSQL hanya listen di `localhost`/jaringan Docker internal, bukan publik.
- Aplikasi berjalan sebagai **user non-root**, container _rootless_, `read-only` filesystem bila memungkinkan, hardening systemd (`NoNewPrivileges`, `ProtectSystem`).
- **Unattended-upgrades** untuk patch keamanan, **AppArmor** aktif.
- Opsi tambahan: panel admin hanya bisa diakses lewat VPN/IP allowlist, sedangkan endpoint upload tetap publik dengan API key.

## 9. Kebutuhan Non-Fungsional

| Aspek          | Target                                                                     |
| -------------- | -------------------------------------------------------------------------- |
| Upload         | Streaming, RAM server tetap < 200 MB meskipun file 10 GB                   |
| Download       | Mendukung Range/resume, kecepatan mendekati bandwidth server               |
| Dashboard      | Load awal < 2 detik, respon filter/search < 300 ms (daftar 10.000+ backup) |
| Ketersediaan   | 99,5% (single server), restart otomatis                                    |
| Integritas     | 100% file diverifikasi checksum                                            |
| Skalabilitas   | Bisa pindah ke S3-compatible tanpa ubah arsitektur                         |
| Observabilitas | Log terstruktur, metrik, alert                                             |

## 10. Perencanaan Kapasitas

- Asumsi: 10 GB/hari × 30 hari = **±300 GB per bulan**.
- Skenario terburuk (menjelang penghapusan bulan lalu): ±2 bulan = **±600 GB**, ditambah karantina soft-delete.
- **Rekomendasi disk data: minimal 1 TB (ideal 1,5–2 TB SSD/NVMe)**, plus cadangan 20–30%.
- Jika banyak aplikasi mengirim 10 GB masing-masing, kalikan sesuai jumlah aplikasi.
- Kompresi (gzip/zstd) di sisi klien sangat disarankan untuk menghemat ruang dan bandwidth.
- Bandwidth: upload 10 GB dengan 100 Mbps ≈ 14 menit. Pastikan upstream server memadai.

## 11. Model Data (Ringkas)

- **users**: id, email, password_hash, role, totp_secret (terenkripsi), created_at
- **applications**: id, nama, deskripsi, retention_policy, aktif
- **api_keys**: id, application_id, key_hash, scope, ip_allowlist, last_used_at, revoked_at
- **backups**: id, application_id, filename, path, size_bytes, sha256, tipe, status (`uploading/verified/failed/quarantined/deleted`), backup_date, uploaded_at, deleted_at, tags
- **upload_sessions**: id, backup_id, offset, expires_at
- **audit_logs**: id, actor, aksi, target, ip, user_agent, timestamp
- **retention_runs**: id, dijalankan_pada, jumlah_dihapus, ruang_dibebaskan, status
- Index: `(application_id, backup_date)`, `(backup_date)`, pencarian teks pada `filename`/`tags` (trigram/GIN).

## 12. Rancangan API (v1)

| Method    | Endpoint                                 | Fungsi                                                       | Auth                |
| --------- | ---------------------------------------- | ------------------------------------------------------------ | ------------------- |
| POST      | `/api/v1/uploads`                        | Buat sesi upload                                             | API key             |
| PATCH/PUT | `/api/v1/uploads/{id}`                   | Kirim chunk/stream                                           | API key             |
| POST      | `/api/v1/uploads/{id}/complete`          | Selesaikan + verifikasi checksum                             | API key             |
| GET       | `/api/v1/backups`                        | List + filter (`date_from`, `date_to`, `app`, `q`, `status`) | Sesi + 2FA          |
| GET       | `/api/v1/backups/{id}`                   | Detail                                                       | Sesi                |
| POST      | `/api/v1/backups/{id}/download-link`     | Buat link download sementara                                 | Sesi                |
| GET       | `/api/v1/download/{token}`               | Unduh file                                                   | Token               |
| DELETE    | `/api/v1/backups/{id}`                   | Hapus manual                                                 | Admin + re-auth 2FA |
| GET/POST  | `/api/v1/apps`, `/api/v1/apps/{id}/keys` | Kelola aplikasi dan API key                                  | Admin               |
| GET       | `/api/v1/stats`                          | Statistik dashboard                                          | Sesi                |
| GET       | `/api/v1/audit`                          | Audit log                                                    | Admin               |

**Contoh upload dari aplikasi Anda (curl):**

```bash
# 1. Kompres + (opsional) enkripsi di sisi klien
pg_dump mydb | gzip | age -r <PUBLIC_KEY> > backup.sql.gz.age

# 2. Kirim
curl -X PUT https://backup.domainanda.com/api/v1/upload \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-App-Name: toko-online" \
  -H "X-Checksum-SHA256: $(sha256sum backup.sql.gz.age | cut -d' ' -f1)" \
  --data-binary @backup.sql.gz.age
```

Disediakan juga **skrip siap pakai** (bash dan contoh PHP/Node/Python) agar integrasi dari aplikasi utama mudah.

## 13. Persiapan Ubuntu Server

### 13.1 Spesifikasi minimum

| Komponen      | Minimum                    | Direkomendasikan                        |
| ------------- | -------------------------- | --------------------------------------- |
| OS            | Ubuntu 22.04 LTS           | **Ubuntu 24.04 LTS**                    |
| CPU           | 2 vCPU                     | 4 vCPU                                  |
| RAM           | 4 GB                       | 8 GB                                    |
| Disk OS       | 40 GB SSD                  | 80 GB SSD                               |
| **Disk data** | 1 TB                       | 1,5–2 TB (volume terpisah, terenkripsi) |
| Jaringan      | IP publik statis, 100 Mbps | 1 Gbps                                  |

### 13.2 Yang perlu disiapkan

1. **Domain/subdomain** (misal `backup.domainanda.com`) + akses DNS.
2. **Akses SSH** dengan key, user non-root dengan sudo.
3. **Paket:** Docker + Docker Compose, Nginx/Caddy, PostgreSQL (atau via Docker), UFW, Fail2ban/CrowdSec, Certbot (jika Nginx), `unattended-upgrades`, `cryptsetup` (LUKS), `rclone` (untuk replikasi offsite).
4. **Volume data terpisah**, di-_mount_ misalnya di `/srv/backupvault`, terenkripsi LUKS.
5. **Firewall:** izinkan 80/443 dan SSH saja.
6. **Nginx untuk file besar:** `client_max_body_size 0;`, `proxy_request_buffering off;`, `proxy_read_timeout`/`proxy_send_timeout` panjang (misal 3600s).
7. **Layanan SMTP/Telegram bot** untuk notifikasi.
8. **Penyimpanan offsite** (Backblaze B2/Wasabi/S3/server kedua) untuk replikasi.
9. **Manajemen rahasia:** file `.env` dengan izin `600`, kunci enkripsi disimpan terpisah dari data.
10. **Monitoring:** Uptime Kuma atau Prometheus + Grafana, alert disk > 80%.
11. **Sinkronisasi waktu** (`chrony`) agar token/TOTP/jadwal akurat; atur timezone `Asia/Jakarta`.
12. **Rencana pemulihan:** dokumentasikan dan uji restore minimal sebulan sekali.

## 14. Rencana Pengerjaan (Milestone)

| Fase                        | Durasi (estimasi) | Isi                                                                 |
| --------------------------- | ----------------- | ------------------------------------------------------------------- |
| **0. Persiapan**            | 2–3 hari          | Finalisasi PRD, desain sistem, siapkan server, domain               |
| **1. Core backend**         | 1,5–2 minggu      | Auth, API key, upload resumable + checksum, penyimpanan, metadata   |
| **2. Dashboard**            | 1,5–2 minggu      | UI list, filter, search, download, aplikasi & API key, light/dark   |
| **3. Retensi & notifikasi** | 4–5 hari          | Scheduler, soft delete, dry-run, notifikasi                         |
| **4. Hardening keamanan**   | 1 minggu          | 2FA/passkey, audit log, rate limit, header, pentest dasar, enkripsi |
| **5. Deploy & uji**         | 3–5 hari          | Deploy Ubuntu, uji upload 10 GB, uji restore, monitoring            |
| **6. Rilis v1**             | —                 | Dokumentasi + skrip integrasi                                       |

Total estimasi: **±5–7 minggu** untuk satu developer.

## 15. Kriteria Keberhasilan (Acceptance)

- Upload 10 GB berhasil, checksum cocok, RAM server stabil, bisa dilanjutkan setelah koneksi diputus.
- Cari/filter backup pada tanggal tertentu dan download berhasil, termasuk resume.
- Retensi otomatis berjalan sesuai aturan, aman (minimum keep + karantina) dan tercatat di log.
- Tampilan nyaman di mobile (≥ 360px) dan desktop, light/dark mode berfungsi.
- Lulus checklist keamanan (bagian 8) dan uji restore berhasil.

## 16. Risiko dan Mitigasi

| Risiko                                    | Mitigasi                                                              |
| ----------------------------------------- | --------------------------------------------------------------------- |
| Disk penuh                                | Alert 80%, estimasi kapasitas, kompresi klien, replikasi/pindah ke S3 |
| Backup terhapus padahal backup baru gagal | Minimum keep, soft delete, notifikasi                                 |
| API key bocor                             | Scope upload-only, IP allowlist, rotasi mudah                         |
| Server diretas                            | Enkripsi sisi klien, hardening, replikasi offsite immutable           |
| Upload besar gagal di tengah              | Resumable upload, verifikasi checksum                                 |
| Single point of failure                   | Replikasi offsite, dokumentasi restore                                |

## 17. Pertanyaan Terbuka (Perlu Keputusan Anda)

1. Berapa **jumlah aplikasi** yang akan mengirim backup, dan berapa total GB per hari sebenarnya?
2. Apakah aturan hapus otomatis ingin tepat seperti contoh (bulan lalu dihapus pada tanggal 30), atau lebih aman memakai **rolling 30 hari**?
3. Apakah mau **enkripsi sisi klien** (paling aman) atau cukup enkripsi di server?
4. Berapa **jumlah pengguna dashboard** (hanya Anda atau tim)?
5. Apakah ada anggaran untuk **penyimpanan offsite** sebagai salinan kedua?
6. Pilihan stack: **React + Vite** (ekosistem terbesar) atau **SvelteKit** (lebih ringan)?
