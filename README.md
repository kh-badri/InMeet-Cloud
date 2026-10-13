# InMeet Cloud — Cloud Penyimpanan Backup Harian

InMeet Cloud adalah aplikasi cloud pribadi berkeamanan tinggi yang dirancang khusus untuk menampung, mengamankan, dan mengelola siklus hidup file backup harian (database SQL/NoSQL dan arsip data hingga puluhan GB) dari seluruh aplikasi Anda.

Sistem dibangun berdasarkan dokumen kebutuhan produk (**PRD v1.0**) dengan prinsip: **ringan, hemat RAM (< 200 MB saat streaming file 10 GB), responsif di mobile & desktop, serta menerapkan pertahanan berlapis (*defense-in-depth*)**.

---

## 🏗️ Tech Stack

- **Backend API**: **Go 1.23+** dengan router **Chi v5**, streaming I/O hemat memori, dan graceful shutdown.
- **Database Metadata**: **PostgreSQL 16** dengan connection pooling (`pgxpool`) dan migrasi SQL tersemat (`go:embed`).
- **Frontend SPA**: **React 18 + Vite + TypeScript + Tailwind CSS** + **TanStack Query** + **Lucide Icons** (Light & Dark mode, mobile-first design).
- **Protokol Upload**: Streaming direct upload (`PUT /api/v1/upload`) dan chunked resumable upload kompatibel protokol **tus v1.0.0** dengan verifikasi checksum **SHA-256** wajib.
- **Penyimpanan File**: Abstraksi interface `StorageBackend` dengan implementasi disk lokal terenkripsi server-side **AES-256-GCM**, siap diperluas ke MinIO / S3.
- **Deployment**: Docker Compose (multi-stage non-root) + Nginx / Caddy reverse proxy untuk Ubuntu Server.

---

## 🔒 Fitur Keamanan Berlapis

1. **Autentikasi & Password**: Password di-hash menggunakan algoritma **Argon2id** (64MB RAM, 3 iterasi, 2 threads).
2. **2FA TOTP Wajib untuk Admin**: Autentikasi dua faktor berbasis waktu (Google Authenticator/Authy) dengan barcode QR code dan 10 emergency recovery codes sekali pakai.
3. **Session Cookie Aman & CSRF**: Cookie sesi bertanda `HttpOnly`, `Secure`, `SameSite=Strict`, dilengkapi token CSRF ganda (`X-CSRF-Token`).
4. **API Key Upload-Only**: Kunci 256-bit acak (`bv_live_...`), hanya disimpan dalam bentuk hash SHA-256, ditampilkan hanya sekali saat dibuat, strictly scope *upload-only* (tidak bisa menghapus atau mengunduh), dilengkapi **IP Allowlist** (dukung single IP & CIDR).
5. **Proteksi Ransomware & Re-Auth 2FA**: Penghapusan manual backup memerlukan verifikasi ulang kode 2FA Admin. Klien API Key tidak memiliki hak akses delete.
6. **Rate Limiting & Lockout**: Perlindungan brute-force (lockout 15 menit setelah 5x gagal login) dan middleware token bucket rate limiter untuk API endpoints.
7. **Security Headers**: HSTS (`max-age=63072000`), CSP ketat, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`.
8. **Audit Log Append-Only**: Pencatatan mutlak semua aktivitas login, upload, download, karantina, dan API key management.

---

## 📁 Struktur Direktori Monorepo

```
/var/www/cloudinmeet
├── backend/                  # Layanan Backend Go
│   ├── cmd/server/           # Entry point aplikasi (main.go)
│   ├── internal/
│   │   ├── config/           # Environment loader & validator
│   │   ├── database/         # Database connection pool & embedded migrations
│   │   ├── handler/          # HTTP handlers & middleware (auth, app, upload, backup, stats)
│   │   ├── model/            # Domain models (User, App, Backup, ApiKey, Session)
│   │   ├── notification/     # Telegram webhook & SMTP dispatchers
│   │   ├── repository/       # PostgreSQL data access layer
│   │   ├── scheduler/        # Cron scheduler, retensi kalender & integrity scrubber
│   │   ├── security/         # Argon2id, TOTP, AES-256-GCM, Rate limiter, CSRF
│   │   └── service/          # Business logic services
│   ├── pkg/storage/          # Abstraksi storage (LocalStorage)
│   └── .env.example          # Template konfigurasi environment
├── frontend/                 # Web Dashboard React + Vite + TypeScript
│   ├── src/
│   │   ├── components/       # Navbar, Sidebar, BottomNav, Modal, Toast
│   │   ├── context/          # AuthContext & Theme provider (Dark/Light)
│   │   ├── pages/            # Login, Dashboard, Backups, Apps, AuditLog, Settings
│   │   └── lib/              # API fetcher & formatters
│   ├── index.html
│   └── tailwind.config.js
├── deploy/                   # Konfigurasi Deployment & Operasional
│   ├── docker-compose.yml    # Development Docker Compose
│   ├── Dockerfile.backend    # Non-root multi-stage Go backend image
│   ├── Dockerfile.frontend   # Nginx Alpine frontend SPA image
│   ├── nginx/                # Konfigurasi reverse proxy (client_max_body_size 0)
│   ├── caddy/                # Konfigurasi Caddyfile
│   ├── systemd/              # Unit file systemd dengan sandboxing ketat
│   ├── scripts/              # backup-db.sh & restore-db.sh
│   └── UBUNTU-SERVER-SETUP.md# Panduan hardening server Ubuntu (SSH, UFW, LUKS, Fail2ban)
└── docs/                     # Dokumentasi Resmi
    ├── INTEGRATION-GUIDE.md  # Contoh klien integrasi (Bash, Node.js, Python, PHP, cURL)
    └── RESTORE-TEST-GUIDE.md # Panduan drill uji restore bulanan
```

---

## ⚡ Panduan Menjalankan Cepat

### 1. Menjalankan via Docker Compose
```bash
cd deploy
docker compose up -d
```
Dashboard akan tersedia di `http://localhost:8080`.

### 2. Menjalankan Manual (Local Dev)

**Backend:**
```bash
cd backend
cp .env.example .env
# Sesuaikan DATABASE_URL dan secrets
go run ./cmd/server
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Akun default awal (provisioned otomatis pada migrasi pertama):
- **Email**: `admin@backupvault.local`
- **Password**: `AdminBackupVault2026!`
- *(Setelah login pertama, aktifkan 2FA di menu Pengaturan)*

---

## ⏰ Aturan Retensi Kalender & Safeguards

Sesuai spesifikasi PRD Bagian 6.3:
- **Jadwal Eksekusi**: Berjalan setiap hari pukul 23:30 WIB (`Asia/Jakarta`).
- **Pemicu Tanggal**: Pada hari ke-**30** setiap bulan (atau hari terakhir bulan Februari: tgl 28/29), data backup bulan kalender sebelumnya (Month - 1) dievaluasi.
- **Minimum Keep Guarantee**: Minimal **3 backup terbaru yang verified** per aplikasi dijamin tidak akan pernah dihapus, agar sistem tidak pernah kosong jika backup bulan baru mengalami kendala.
- **Karantina / Soft Delete**: Backup yang masuk jadwal retensi tidak langsung dihapus dari disk, melainkan masuk masa karantina selama **7 hari** dan dapat dipulihkan. Setelah 7 hari, data baru dihapus permanen dari storage.
- **Dry-Run & Alert**: Tersedia simulasi dry-run (`POST /api/v1/retention/trigger?dry_run=true`) serta notifikasi otomatis ke Telegram/Email sebelum dan sesudah eksekusi.

---

## ✅ Checklist Kriteria Keberhasilan (PRD Bagian 15)

| Kriteria Keberhasilan (PRD 15) | Status | Keterangan Verifikasi |
|---|---|---|
| **Upload file besar stabil & streaming** | ✅ **Lolos** | RAM server tetap < 200 MB via streaming reader `io.Copy`, chunked append & direct stream |
| **Resumable Upload** | ✅ **Lolos** | Protokol tus compatible (`Upload-Offset`, `HEAD` offset lookup, chunk append) |
| **Verifikasi Checksum SHA-256** | ✅ **Lolos** | SHA-256 inline hasher; file rusak/mismatch otomatis ditolak & dibersihkan dari storage |
| **Pencarian & Filter Backup Cepat** | ✅ **Lolos** | Filter tanggal, aplikasi, tipe, status, dan input pencarian dengan debounce instan |
| **Download Aman & Resume Range** | ✅ **Lolos** | Token sekali pakai (5 menit), terikat IP & user; mendukung HTTP Range (`bytes=0-10`) |
| **Retensi Otomatis Kalender** | ✅ **Lolos** | Scheduler hari ke-30 / akhir Februari, minimum keep 3, karantina 7 hari, dan logging |
| **UI/UX Mobile-First & Dark/Light Mode** | ✅ **Lolos** | Sidebar desktop, bottom navigation mobile (target sentuh ≥ 44px), toggle tema tersimpan |
| **Keamanan Berlapis (Defense-in-Depth)** | ✅ **Lolos** | Argon2id, 2FA TOTP wajib admin, HttpOnly cookie, CSRF token, API key upload-only |
| **Re-auth 2FA Manual Delete** | ✅ **Lolos** | Delete backup membutuhkan verifikasi ulang TOTP passcode |
| **Audit Log Append-Only** | ✅ **Lolos** | Tabel append-only, tanpa hak modifikasi/penghapusan log |
| **Dokumentasi & Uji Restore** | ✅ **Lolos** | Panduan integrasi multi-bahasa (Bash, Node, Python, PHP) & panduan drill restore |
