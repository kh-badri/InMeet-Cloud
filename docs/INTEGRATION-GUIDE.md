# Panduan Integrasi Klien BackupVault

Panduan lengkap untuk mengintegrasikan aplikasi utama Anda dengan BackupVault via REST API.

---

## 1. Prinsip Keamanan Integrasi Klien

1. **Scope Upload-Only**: API Key Anda hanya memiliki izin untuk mengunggah backup (`upload_only`). Jika server aplikasi klien Anda diretas, pelaku peretasan **TIDAK BISA** menghapus atau mengunduh backup yang sudah tersimpan di BackupVault.
2. **IP Allowlist**: Sangat disarankan mengatur IP Allowlist saat membuat API key di dashboard admin BackupVault (misal IP statis server aplikasi Anda).
3. **Verifikasi Checksum SHA-256**: Setiap pengiriman wajib menyertakan checksum SHA-256. Server akan menolak dan menghapus file jika terjadi kerusakan transmisi.
4. **Enkripsi Sisi Klien (Client-Side Encryption)**: Enkripsi file sebelum dikirim menggunakan tool modern seperti `age` agar BackupVault hanya menyimpan data sandi (zero-knowledge).

---

## 2. Format Penamaan & Tipe File yang Didukung

Ekstensi yang diizinkan (whitelist):
- Database dumps: `.sql`, `.sql.gz`, `.dump`, `.bak`, `.bson`, `.rdb`
- Arsip terkompresi: `.tar.gz`, `.zip`, `.tar`, `.7z`, `.gz`, `.zst`, `.bz2`
- File terenkripsi age: `.age` (misal `backup.sql.gz.age`)

---

## 3. Contoh Implementasi per Bahasa

### A. Bash Script (Produksi Harian untuk PostgreSQL / MySQL)

Simpan skrip ini sebagai `/usr/local/bin/backupvault-agent.sh` di server Anda:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Konfigurasi
BACKUPVAULT_URL="https://backup.domainanda.com"
API_KEY="bv_live_your_secret_api_key_here"
APP_NAME="toko-online"
TEMP_DIR="/tmp/backupvault"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="${APP_NAME}_${TIMESTAMP}.sql.gz"
FILEPATH="${TEMP_DIR}/${FILENAME}"

mkdir -p "${TEMP_DIR}"
chmod 700 "${TEMP_DIR}"

echo "[$(date)] Memulai dump database..."
# Contoh PostgreSQL:
pg_dump -U postgres -h 127.0.0.1 mydb | gzip -9 > "${FILEPATH}"
# Atau MySQL:
# mysqldump -u root -p'password' mydb | gzip -9 > "${FILEPATH}"

echo "[$(date)] Menghitung checksum SHA-256..."
CHECKSUM=$(sha256sum "${FILEPATH}" | cut -d' ' -f1)

echo "[$(date)] Mengunggah ke BackupVault (Streaming Direct)..."
HTTP_STATUS=$(curl -s -o /tmp/bv_response.json -w "%{http_code}" -X PUT "${BACKUPVAULT_URL}/api/v1/upload" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "X-App-Name: ${APP_NAME}" \
  -H "X-Filename: ${FILENAME}" \
  -H "X-Checksum-SHA256: ${CHECKSUM}" \
  --data-binary @"${FILEPATH}")

if [ "${HTTP_STATUS}" -eq 201 ] || [ "${HTTP_STATUS}" -eq 200 ]; then
  echo "[$(date)] Upload sukses! Respon: $(cat /tmp/bv_response.json)"
  rm -f "${FILEPATH}" /tmp/bv_response.json
  exit 0
else
  echo "[$(date)] Upload GAGAL dengan HTTP code: ${HTTP_STATUS}"
  cat /tmp/bv_response.json
  exit 1
fi
```

Jadwalkan di cron server klien (`crontab -e`):
```cron
# Jalankan setiap hari pukul 02:00 pagi
0 2 * * * /usr/local/bin/backupvault-agent.sh >> /var/log/backupvault-agent.log 2>&1
```

---

### B. Node.js / TypeScript (Streaming Tanpa Memenuhi RAM)

```typescript
import * as fs from 'fs';
import * as crypto from 'crypto';
import { pipeline } from 'stream/promises';

async function uploadBackup(filePath: string, filename: string) {
  const BACKUPVAULT_URL = 'https://backup.domainanda.com';
  const API_KEY = 'bv_live_your_secret_api_key_here';

  console.log('Menghitung SHA-256 secara streaming...');
  const hash = crypto.createHash('sha256');
  const fileStreamForHash = fs.createReadStream(filePath);
  await pipeline(fileStreamForHash, hash);
  const checksum = hash.digest('hex');

  console.log(`Mengunggah file: ${filename} (SHA256: ${checksum})...`);
  const uploadStream = fs.createReadStream(filePath);

  const response = await fetch(`${BACKUPVAULT_URL}/api/v1/upload`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'X-Filename': filename,
      'X-Checksum-SHA256': checksum,
      'Content-Type': 'application/octet-stream',
    },
    body: uploadStream as any,
    duplex: 'half',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload gagal (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  console.log('Upload berhasil:', result);
  return result;
}

// Eksekusi:
uploadBackup('/backups/mongodb_dump.tar.gz', 'mongodb_dump.tar.gz')
  .catch(console.error);
```

---

### C. Python 3 (Streaming Upload dengan Requests / Urllib)

```python
import hashlib
import os
import requests

BACKUPVAULT_URL = "https://backup.domainanda.com"
API_KEY = "bv_live_your_secret_api_key_here"

def calculate_sha256(filepath: str) -> str:
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(64 * 1024):
            hasher.update(chunk)
    return hasher.hexdigest()

def upload_backup(filepath: str, filename: str):
    checksum = calculate_sha256(filepath)
    print(f"Mengunggah {filename} (SHA-256: {checksum})...")

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "X-Filename": filename,
        "X-Checksum-SHA256": checksum,
        "Content-Type": "application/octet-stream",
    }

    # Streaming file reader generator agar RAM tetap hemat
    def file_stream():
        with open(filepath, "rb") as f:
            while chunk := f.read(1024 * 1024): # 1 MB buffer
                yield chunk

    response = requests.put(
        f"{BACKUPVAULT_URL}/api/v1/upload",
        headers=headers,
        data=file_stream()
    )

    if response.status_code in (200, 201):
        print("Upload berhasil:", response.json())
    else:
        print(f"Gagal ({response.status_code}): {response.text}")
        response.raise_for_status()

if __name__ == "__main__":
    upload_backup("/var/backups/redis_dump.rdb", "redis_dump.rdb")
```

---

### D. PHP (cURL Streaming)

```php
<?php
$backupvaultUrl = 'https://backup.domainanda.com';
$apiKey = 'bv_live_your_secret_api_key_here';
$filePath = '/var/backups/app_db.sql.gz';
$filename = 'app_db.sql.gz';

$checksum = hash_file('sha256', $filePath);
$fileSize = filesize($filePath);
$fileHandle = fopen($filePath, 'rb');

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, "{$backupvaultUrl}/api/v1/upload");
curl_setopt($ch, CURLOPT_PUT, true);
curl_setopt($ch, CURLOPT_INFILE, $fileHandle);
curl_setopt($ch, CURLOPT_INFILESIZE, $fileSize);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer {$apiKey}",
    "X-Filename: {$filename}",
    "X-Checksum-SHA256: {$checksum}",
    "Content-Type: application/octet-stream"
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
fclose($fileHandle);
curl_close($ch);

if ($httpCode === 200 || $httpCode === 201) {
    echo "Upload berhasil: " . $response . PHP_EOL;
} else {
    echo "Upload gagal (HTTP {$httpCode}): " . $response . PHP_EOL;
    exit(1);
}
```

---

## 4. Protokol Resumable Chunked Upload (Tus Compatible)

Untuk file yang sangat besar (10–50 GB) dengan koneksi yang rawan terputus:

1. **Inisiasi Sesi Upload**:
   ```http
   POST /api/v1/uploads HTTP/1.1
   Host: backup.domainanda.com
   Authorization: Bearer $API_KEY
   Content-Type: application/json

   {
     "filename": "database_large.dump",
     "size": 10737418240,
     "sha256": "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a"
   }
   ```
   *Respon*: `201 Created` dengan `Location: /api/v1/uploads/<UPLOAD_ID>` dan `upload_id`.

2. **Cek Offset yang Sudah Diterima Server (Resume)**:
   ```http
   HEAD /api/v1/uploads/<UPLOAD_ID> HTTP/1.1
   Authorization: Bearer $API_KEY
   ```
   *Respon*: `Upload-Offset: 524288000` (500 MB sudah diterima).

3. **Kirim Chunk Data Secara Streaming**:
   ```http
   PATCH /api/v1/uploads/<UPLOAD_ID> HTTP/1.1
   Authorization: Bearer $API_KEY
   Upload-Offset: 524288000
   Content-Type: application/offset+octet-stream

   <binary chunk payload>
   ```
   *Respon*: `204 No Content` dengan header `Upload-Offset: 1048576000`.

4. **Selesaikan & Verifikasi Integritas SHA-256**:
   ```http
   POST /api/v1/uploads/<UPLOAD_ID>/complete HTTP/1.1
   Authorization: Bearer $API_KEY
   ```
   *Respon*: `200 OK` dengan metadata backup yang telah ditandai `verified`.
