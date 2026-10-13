import React, { useState } from 'react';
import { 
  BookOpen, Copy, Check, Terminal, Code2, Sparkles, 
  Layers, ShieldCheck, CheckCircle2, RefreshCw 
} from 'lucide-react';

export const DocsPage: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'quickstart' | 'direct' | 'chunked' | 'agent' | 'examples'>('agent');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Dynamic Base URL based on current browser origin
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080';

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(key);
    setTimeout(() => setCopiedSection(null), 2500);
  };

  // Structured prompt for AI Agent in the user's main application folder
  const aiAgentPrompt = `# Panduan Integrasi InMeet Cloud Storage untuk AI Agent
Anda adalah AI Coding Assistant untuk aplikasi ini. Ikuti panduan integrasi ini untuk mengimplementasikan fitur otomatisasi pengiriman backup data/database ke InMeet Cloud.

## 1. Konfigurasi Environment (.env)
Tambahkan variabel berikut ke file environment aplikasi utama:
\`\`\`env
INMEET_CLOUD_URL=${baseUrl}
INMEET_API_KEY=your_256bit_api_key_here
INMEET_APP_SLUG=your_app_slug
\`\`\`

## 2. Cara Kerja & Protokol Keamanan
- Autentikasi: Menggunakan Bearer token (API Key).
- Header Wajib:
  * Authorization: Bearer <INMEET_API_KEY>
  * X-Filename: <nama_file_backup.ext>
  * X-Checksum-SHA256: <hash sha256 64-karakter hex dari file lokal>
- Enkripsi: InMeet Cloud secara otomatis mengenkripsi file yang diterima menggunakan AES-256-GCM.
- Verifikasi Integritas: Server membandingkan checksum yang dikirim dengan hasil hash di server. Jika tidak cocok, upload ditolak (400 Bad Request).

## 3. Endpoint API

### A. Metode Langsung (Direct Upload - File < 500MB)
Endpoint: PUT \${INMEET_CLOUD_URL}/api/v1/upload
Content-Type: application/octet-stream
Request Body: Binary stream dari file backup

Contoh Implementasi Shell/Bash:
\`\`\`bash
FILE="backup_\$(date +%Y%m%d_%H%M%S).sql.gz"
# Buat dump database (contoh: PostgreSQL atau MySQL)
pg_dump db_name | gzip > "\$FILE"

# Hitung SHA-256
CHECKSUM=\$(sha256sum "\$FILE" | awk '{print \$1}')

# Upload ke InMeet Cloud
curl -s -X PUT "\${INMEET_CLOUD_URL}/api/v1/upload" \\
  -H "Authorization: Bearer \${INMEET_API_KEY}" \\
  -H "X-Filename: \$FILE" \\
  -H "X-Checksum-SHA256: \$CHECKSUM" \\
  --data-binary "@\$FILE"
\`\`\`

Response Sukses (HTTP 201 Created):
\`\`\`json
{
  "id": "uuid-v4",
  "filename": "backup_20261013.sql.gz",
  "file_size": 15420000,
  "sha256_checksum": "a9f4c3e8...",
  "status": "stored",
  "created_at": "2026-10-13T05:00:00Z"
}
\`\`\`

### B. Metode Resumable / Chunked (File Besar s/d 10GB+)
Untuk file besar (> 500MB s/d 10GB), gunakan protokol chunked 4 tahap:
1. Inisiasi Sesi:
   POST \${INMEET_CLOUD_URL}/api/v1/uploads
   Body JSON: { "filename": "...", "size": <bytes>, "sha256": "<hex>" }
   Response JSON: { "upload_id": "...", "upload_url": "/api/v1/uploads/..." }

2. Kirim Potongan (Chunk):
   PATCH \${INMEET_CLOUD_URL}/api/v1/uploads/<upload_id>
   Header: Upload-Offset: <offset_saat_ini>
   Body: Raw bytes pecahan chunk (contoh: 20MB per chunk)

3. Selesaikan & Verifikasi:
   POST \${INMEET_CLOUD_URL}/api/v1/uploads/<upload_id>/complete
   Response: 200 OK dengan metadata backup

## 4. Tugas Agent AI di Aplikasi Utama
1. Buat scheduler/cron job harian (misal setiap jam 01:00 dini hari).
2. Lakukan dump data (database / uploaded assets) ke format tar.gz atau sql.gz.
3. Hitung SHA256 dari file tersebut.
4. Stream file ke endpoint InMeet Cloud dengan menyertakan header autentikasi.
5. Tangani logging & hapus file dump lokal sementara setelah status 201/200 dikonfirmasi.
`;

  return (
    <div className="space-y-6 pb-16 md:pb-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            Dokumentasi & Integrasi API
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Panduan menghubungkan aplikasi utama Anda ke InMeet Cloud untuk pengiriman backup otomatis
          </p>
        </div>

        <button
          onClick={() => copyText('agent-prompt-header', aiAgentPrompt)}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors shrink-0"
        >
          {copiedSection === 'agent-prompt-header' ? (
            <>
              <Check className="h-4 w-4 text-emerald-300" />
              <span>Prompt AI Tersalin!</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              <span>Salin Panduan untuk AI Agent</span>
            </>
          )}
        </button>
      </div>

      {/* Quick Info Banner */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 dark:border-slate-800 dark:bg-darkSurface shadow-2xs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 font-bold shrink-0">
              <Terminal className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 block">Base URL API</span>
              <code className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 block truncate">
                {baseUrl}
              </code>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 font-bold shrink-0">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 block">Autentikasi & Keamanan</span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">
                Bearer 256-bit + AES-GCM
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 font-bold shrink-0">
              <Layers className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 block">Metode Pengiriman</span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">
                Direct Stream & Resumable (10GB)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200/80 dark:border-slate-800">
        <button
          onClick={() => setActiveSubTab('agent')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
            activeSubTab === 'agent'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Prompt untuk AI Agent
        </button>

        <button
          onClick={() => setActiveSubTab('quickstart')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
            activeSubTab === 'quickstart'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60'
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Alur & Prasyarat
        </button>

        <button
          onClick={() => setActiveSubTab('direct')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
            activeSubTab === 'direct'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60'
          }`}
        >
          <Terminal className="h-3.5 w-3.5" />
          Direct Upload (PUT)
        </button>

        <button
          onClick={() => setActiveSubTab('chunked')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
            activeSubTab === 'chunked'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          Resumable Chunk (10GB)
        </button>

        <button
          onClick={() => setActiveSubTab('examples')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
            activeSubTab === 'examples'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60'
          }`}
        >
          <Code2 className="h-3.5 w-3.5" />
          Contoh Kode Aplikasi
        </button>
      </div>

      {/* Tab 1: AI Agent Prompt Box */}
      {activeSubTab === 'agent' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-indigo-200/90 bg-indigo-50/50 p-4 sm:p-5 dark:border-indigo-900/60 dark:bg-indigo-950/30 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  Format Acuan untuk AI Coding Assistant
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Salin teks di bawah ini dan tempelkan langsung ke prompt AI (Cursor, Claude, ChatGPT, Antigravity) di proyek aplikasi utama Anda.
                </p>
              </div>

              <button
                onClick={() => copyText('agent-prompt-box', aiAgentPrompt)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700 transition-colors shrink-0"
              >
                {copiedSection === 'agent-prompt-box' ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-300" />
                    <span>Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>Salin Seluruh Panduan</span>
                  </>
                )}
              </button>
            </div>

            <div className="relative rounded-xl bg-slate-950 p-4 border border-slate-800 font-mono text-[11px] leading-relaxed text-slate-200 overflow-x-auto max-h-[500px]">
              <pre className="whitespace-pre-wrap selection:bg-indigo-500 selection:text-white">
                {aiAgentPrompt}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Quickstart & Prerequisites */}
      {activeSubTab === 'quickstart' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 dark:border-slate-800 dark:bg-darkSurface space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              3 Langkah Mudah Menghubungkan Aplikasi
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-xs">
                  1
                </div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs">Daftarkan Aplikasi</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Buka menu <strong>Aplikasi & API Key</strong> di sidebar InMeet Cloud. Klik <strong>Tambah Aplikasi</strong> dan masukkan nama slug (contoh: <code>inmeet-backend</code>).
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-xs">
                  2
                </div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs">Generate API Key</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Pada kartu aplikasi, klik <strong>Kelola API Key</strong> lalu klik <strong>Buat Key Baru</strong>. Salin token 256-bit yang diberikan (hanya muncul sekali).
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-xs">
                  3
                </div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs">Pasang di Aplikasi</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Simpan key di environment aplikasi Anda dan kirim file dump database melalui cron job harian dengan header <code>Authorization: Bearer &lt;KEY&gt;</code>.
                </p>
              </div>
            </div>
          </div>

          {/* Retention & Security Policy */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 dark:border-slate-800 dark:bg-darkSurface space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                Standar Keamanan InMeet Cloud
              </h4>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
                <li><strong>Scope Upload-Only:</strong> API Key hanya memiliki izin mengunggah file baru. Tidak dapat membaca, menghapus, atau melihat backup lainnya.</li>
                <li><strong>Enkripsi Otomatis:</strong> Setiap byte data dienkripsi dengan <code>AES-256-GCM</code> sebelum disimpan ke disk.</li>
                <li><strong>Verifikasi SHA-256:</strong> Server memastikan file yang tersimpan 100% utuh dan tidak rusak/korup saat transmisi.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 dark:border-slate-800 dark:bg-darkSurface space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-indigo-500" />
                Aturan Retensi Fleksibel
              </h4>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
                <li><strong>Custom Hari:</strong> Anda dapat mengatur batas retensi (misal 5 hari, 7 hari, 30 hari) per aplikasi.</li>
                <li><strong>Minimum Keep Proteksi:</strong> Cadangan terbaru (misal 3 file) dilindungi dari penghapusan meskipun usianya lewat.</li>
                <li><strong>Karantina 7 Hari:</strong> File yang kadaluarsa masuk masa karantina sebelum dihapus permanen.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Direct Upload (PUT) */}
      {activeSubTab === 'direct' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 dark:border-slate-800 dark:bg-darkSurface space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span className="rounded-md bg-emerald-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">PUT</span>
                  <code>/api/v1/upload</code>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Upload streaming sekali kirim. Ideal untuk dump database harian (&lt; 500MB) atau pipe langsung dari tool database.
                </p>
              </div>

              <button
                onClick={() => copyText('direct-curl', `FILE="backup_$(date +%Y%m%d_%H%M%S).sql.gz"
# Buat file backup database
pg_dump -h localhost -U postgres dbname | gzip > "$FILE"

# Hitung checksum sha256
SHA256=$(sha256sum "$FILE" | awk '{print $1}')

# Stream upload ke InMeet Cloud
curl -X PUT "${baseUrl}/api/v1/upload" \\
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \\
  -H "X-Filename: $FILE" \\
  -H "X-Checksum-SHA256: $SHA256" \\
  --data-binary "@$FILE"`)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                {copiedSection === 'direct-curl' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>Salin Script Bash</span>
              </button>
            </div>

            {/* Header table */}
            <div className="rounded-xl border border-slate-200/80 overflow-hidden dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 font-semibold border-b border-slate-200/80 dark:border-slate-800">
                  <tr>
                    <th className="p-3">Header Request</th>
                    <th className="p-3">Tipe</th>
                    <th className="p-3">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  <tr>
                    <td className="p-3 font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">Authorization</td>
                    <td className="p-3 text-[11px] text-slate-400">Wajib</td>
                    <td className="p-3"><code>Bearer &lt;API_KEY_256_BIT&gt;</code></td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">X-Filename</td>
                    <td className="p-3 text-[11px] text-slate-400">Wajib</td>
                    <td className="p-3">Nama berkas yang akan disimpan, misal: <code>production_db_20261013.sql.gz</code></td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">X-Checksum-SHA256</td>
                    <td className="p-3 text-[11px] text-slate-400">Wajib</td>
                    <td className="p-3">Hash SHA-256 (64 hex lowercase) dari isi berkas untuk verifikasi integritas</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Code Snippet */}
            <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 font-mono text-[11px] text-slate-200 space-y-2">
              <span className="text-slate-400 text-[10px] block font-sans font-semibold">Contoh Perintah cURL:</span>
              <pre className="overflow-x-auto selection:bg-indigo-500 selection:text-white">
{`curl -X PUT "${baseUrl}/api/v1/upload" \\
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \\
  -H "X-Filename: backup_database_20261013.sql.gz" \\
  -H "X-Checksum-SHA256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" \\
  --data-binary "@backup_database_20261013.sql.gz"`}
              </pre>
            </div>

            {/* Response Example */}
            <div className="space-y-2">
              <span className="text-slate-600 dark:text-slate-400 text-xs font-semibold block">
                Contoh Respons Berhasil (HTTP 201 Created):
              </span>
              <div className="rounded-xl bg-slate-900 p-4 font-mono text-[11px] text-emerald-400 overflow-x-auto border border-slate-800">
                <pre>{`{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "app_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "backup_database_20261013.sql.gz",
  "file_size": 15420000,
  "sha256_checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "status": "stored",
  "created_at": "2026-10-13T05:00:00Z"
}`}</pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Resumable Chunked (10GB) */}
      {activeSubTab === 'chunked' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 dark:border-slate-800 dark:bg-darkSurface space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                Resumable Chunked Upload Protocol (Tus-Compatible)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Gunakan metode ini untuk file berukuran besar hingga <strong>10 GB</strong> atau kondisi jaringan yang rentan terputus. Jika koneksi terputus di tengah jalan, proses dapat dilanjutkan tanpa mengulang dari awal.
              </p>
            </div>

            {/* 4 Step Workflow */}
            <div className="space-y-3 pt-2">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">LANGKAH 1</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">Inisiasi Sesi Upload</span>
                </div>
                <code className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 block">
                  POST {baseUrl}/api/v1/uploads
                </code>
                <div className="rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-300">
                  <pre>{`// Request Body (JSON)
{
  "filename": "database_production_10gb.dump.gz",
  "size": 10737418240,
  "sha256": "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a"
}

// Response (HTTP 201 Created)
{
  "upload_id": "c1f8e4e7-40b9-4a92-bf39-446655440000",
  "upload_url": "/api/v1/uploads/c1f8e4e7-40b9-4a92-bf39-446655440000",
  "expected_size": 10737418240,
  "expires_at": "2026-10-14T05:00:00Z"
}`}</pre>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">LANGKAH 2</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">Kirim Pecahan File (Chunk Streaming)</span>
                </div>
                <code className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 block">
                  PATCH {baseUrl}/api/v1/uploads/&#123;upload_id&#125;
                </code>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Kirim pecahan berkas (misal per 20MB) dengan menyertakan header <code>Upload-Offset</code>. Server merespons dengan <strong>HTTP 204 No Content</strong> dan mengembalikan offset terkini di header.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">LANGKAH 3</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">Finalisasi & Verifikasi Integritas</span>
                </div>
                <code className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 block">
                  POST {baseUrl}/api/v1/uploads/&#123;upload_id&#125;/complete
                </code>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Setelah seluruh chunk terkirim, panggil endpoint ini. Server akan otomatis memverifikasi total ukuran dan checksum SHA-256, lalu menyimpan berkas secara terenkripsi AES-256-GCM (<strong>HTTP 200 OK</strong>).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Code Examples */}
      {activeSubTab === 'examples' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 dark:border-slate-800 dark:bg-darkSurface space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Code2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              Contoh Implementasi di Berbagai Bahasa Pemrograman
            </h3>

            {/* Node.js / TypeScript */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                  Node.js / TypeScript (Streaming Upload)
                </span>
                <button
                  onClick={() => copyText('code-node', `import fs from 'fs';
import crypto from 'crypto';
import http from 'http'; // or axios/got

async function uploadToInMeet(filePath: string, apiKey: string) {
  // 1. Hitung SHA-256
  const fileBuffer = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const filename = filePath.split('/').pop() || 'backup.dump';

  // 2. Stream upload via fetch (Node 18+)
  const response = await fetch('${baseUrl}/api/v1/upload', {
    method: 'PUT',
    headers: {
      'Authorization': \`Bearer \${apiKey}\`,
      'X-Filename': filename,
      'X-Checksum-SHA256': sha256,
      'Content-Type': 'application/octet-stream',
    },
    body: fs.createReadStream(filePath) as any,
    duplex: 'half' as any,
  });

  if (!response.ok) {
    throw new Error(\`Upload failed: \${response.status} \${await response.text()}\`);
  }

  const result = await response.json();
  console.log('Backup berhasil disimpan:', result);
}`)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                >
                  {copiedSection === 'code-node' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>Salin Node.js</span>
                </button>
              </div>
              <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 font-mono text-[11px] text-slate-200 overflow-x-auto">
                <pre>{`import fs from 'fs';
import crypto from 'crypto';

async function uploadBackup(filePath: string, apiKey: string) {
  // Hitung hash SHA-256
  const fileBuffer = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const filename = filePath.split('/').pop() || 'backup.sql.gz';

  // Stream upload langsung ke InMeet Cloud
  const res = await fetch('${baseUrl}/api/v1/upload', {
    method: 'PUT',
    headers: {
      'Authorization': \`Bearer \${apiKey}\`,
      'X-Filename': filename,
      'X-Checksum-SHA256': sha256,
    },
    body: fs.createReadStream(filePath) as any,
    duplex: 'half' as any,
  });

  return await res.json();
}`}</pre>
              </div>
            </div>

            {/* Python Example */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                  Python (Requests Streaming)
                </span>
                <button
                  onClick={() => copyText('code-python', `import hashlib
import requests

def upload_backup(file_path: str, api_key: str):
    # Hitung SHA-256
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            sha256.update(chunk)
    checksum = sha256.hexdigest()

    # Stream upload
    headers = {
        "Authorization": f"Bearer {api_key}",
        "X-Filename": file_path.split("/")[-1],
        "X-Checksum-SHA256": checksum,
    }
    with open(file_path, "rb") as f:
        r = requests.put("${baseUrl}/api/v1/upload", headers=headers, data=f)
        r.raise_for_status()
        return r.json()`)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                >
                  {copiedSection === 'code-python' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>Salin Python</span>
                </button>
              </div>
              <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 font-mono text-[11px] text-slate-200 overflow-x-auto">
                <pre>{`import hashlib, requests

def upload_backup(file_path: str, api_key: str):
    # Hitung SHA-256
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
            
    headers = {
        "Authorization": f"Bearer {api_key}",
        "X-Filename": file_path.split("/")[-1],
        "X-Checksum-SHA256": sha256.hexdigest(),
    }
    with open(file_path, "rb") as f:
        res = requests.put("${baseUrl}/api/v1/upload", headers=headers, data=f)
        return res.json()`}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
