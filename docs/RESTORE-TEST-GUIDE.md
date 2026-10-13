# Panduan Prosedur Uji Restore Backup (Drill Bulanan)

Sesuai instruksi PRD Bagian 13.2 item 12: *"Rencana pemulihan: dokumentasikan dan uji restore minimal sebulan sekali"*. Backup yang belum pernah diuji restore tidak dapat dianggap sebagai backup yang valid.

---

## 1. Siklus Uji Restore Bulanan

Lakukan latihan pemulihan data (restore drill) pada server staging atau container terisolasi setiap **tanggal 1 tiap bulan**:

```
[Dashboard BackupVault]
       │
       ▼ (1. Dapatkan link unduh bertoken berumur 5 menit)
[Download File Backup]
       │
       ▼ (2. Verifikasi Checksum SHA-256)
[Decryption (age/gpg jika client-side)]
       │
       ▼ (3. Decompress gzip/zstd)
[Staging Database (PostgreSQL / MySQL)]
       │
       ▼ (4. Uji Sanity Data & Row Count)
[Selesai & Catat Hasil Latihan]
```

---

## 2. Langkah-Langkah Teknis

### Langkah 1: Unduh Backup dari Dashboard
1. Buka dashboard BackupVault pada menu **Daftar Backup**.
2. Pilih backup terbaru yang berstatus `verified`.
3. Klik tombol **Unduh** atau buat link unduh bertoken.
4. Salin link download sementara (link otomatis kedaluwarsa dalam 5 menit dan hanya bisa diunduh sekali).

```bash
# Unduh via curl di server staging:
curl -o backup_restore_test.sql.gz.age "https://backup.domainanda.com/api/v1/download/<SHORT_LIVED_TOKEN>"
```

### Langkah 2: Verifikasi Checksum SHA-256
Cocokkan checksum file yang diunduh dengan checksum yang tertera pada detail backup di dashboard:

```bash
sha256sum backup_restore_test.sql.gz.age
```
> Pastikan 64 karakter hex sama persis dengan kolom SHA-256 di dashboard!

### Langkah 3: Dekripsi Sisi Klien (Jika Menggunakan `age`)
Jika file dienkripsi dengan `age`:
```bash
age -d -i ~/.age/backup_private_key.txt backup_restore_test.sql.gz.age > backup_restore_test.sql.gz
```

### Langkah 4: Restore ke Database Staging
Siapkan database kosong di lingkungan pengujian:

#### Untuk PostgreSQL:
```bash
# Buat database pengujian
sudo -u postgres createdb restore_test_db

# Restore data secara streaming:
gunzip -c backup_restore_test.sql.gz | sudo -u postgres psql -d restore_test_db
```

#### Untuk MySQL:
```bash
# Buat database pengujian
mysql -u root -p -e "CREATE DATABASE restore_test_db;"

# Restore data:
gunzip -c backup_restore_test.sql.gz | mysql -u root -p restore_test_db
```

### Langkah 5: Sanity Verification & Validasi Integritas
Jalankan kueri validasi untuk memastikan data utuh dan tidak terpotong:

```sql
-- Cek jumlah tabel yang berhasil terbuat:
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';

-- Cek baris data tabel-tabel utama:
SELECT count(*) FROM users;
SELECT count(*) FROM orders;
SELECT max(created_at) FROM transactions;
```

### Langkah 6: Bersihkan Lingkungan Pengujian
Setelah verifikasi selesai:
```bash
sudo -u postgres dropdb restore_test_db
rm -f backup_restore_test.sql.gz*
```

Catat tanggal pelaksanaan uji restore, nama file yang diuji, dan hasil pemeriksaan ke dalam log operasional tim Anda.
