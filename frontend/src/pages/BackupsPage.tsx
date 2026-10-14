import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, formatBytes, formatDate } from '../lib/api';
import { Backup, Application } from '../types';
import { useAuth } from '../context/AuthContext';
import { Modal } from '../components/Modal';
import { 
  Search, Download, Trash2, Eye, 
  Copy, Check, FileText 
} from 'lucide-react';

export const BackupsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isViewer = user?.role === 'viewer';
  const canDownload = isAdmin || isViewer;
  const queryClient = useQueryClient();

  // Filters state
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedApp, setSelectedApp] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Modals state
  const [detailBackup, setDetailBackup] = useState<Backup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Backup | null>(null);
  const [twoFACode, setTwoFACode] = useState('');
  const [isPermanent, setIsPermanent] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [copiedSha, setCopiedSha] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Load apps for filter dropdown
  const { data: apps } = useQuery<Application[]>({
    queryKey: ['apps'],
    queryFn: () => apiRequest<Application[]>('/api/v1/apps'),
  });

  // Load backups list
  const { data: backupData, isLoading } = useQuery<{ backups: Backup[]; total: number }>({
    queryKey: ['backups', debouncedSearch, selectedApp, selectedStatus, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (selectedApp) params.set('app', selectedApp);
      if (selectedStatus) params.set('status', selectedStatus);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      return apiRequest(`/api/v1/backups?${params.toString()}`);
    },
  });

  // Handle Download (Generates tokenized short-lived link and triggers download)
  const handleDownload = async (backup: Backup) => {
    setDownloadingId(backup.id);
    try {
      const res = await apiRequest<{ download_url: string }>(
        `/api/v1/backups/${backup.id}/download-link`,
        { method: 'POST' }
      );
      // Native browser download
      const a = document.createElement('a');
      a.href = res.download_url;
      a.download = backup.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Gagal mengunduh: ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  // Delete mutation with 2FA code
  const deleteMutation = useMutation({
    mutationFn: async ({ id, code, permanent }: { id: string; code: string; permanent: boolean }) => {
      return apiRequest(`/api/v1/backups/${id}`, {
        method: 'DELETE',
        headers: { 'X-2FA-Code': code },
        body: JSON.stringify({ permanent }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setDeleteTarget(null);
      setTwoFACode('');
      setDeleteError(null);
    },
    onError: (err: any) => {
      setDeleteError(err.message || 'Gagal menghapus backup');
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 2000);
  };

  return (
    <div className="space-y-6 pb-16 md:pb-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            Daftar File Backup
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Semua snapshot backup terenkripsi yang tersimpan di InMeet Cloud
          </p>
        </div>
        {!isAdmin && (
          <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-[#FEA82F]/20 text-[#FF6701] dark:bg-[#1E3E62] dark:text-[#FEA82F] border border-[#FEA82F]/40 dark:border-[#1E3E62]">
            <Eye className="h-3.5 w-3.5" />
            <span>{isViewer ? 'Mode: Administrator Hanya-Lihat (Read-Only)' : 'Mode Akses: Hanya Lihat (Read-Only)'}</span>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-[#92B4EC]/70 bg-white p-4 shadow-sm dark:border-[#1E3E62] dark:bg-[#0B192C] space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Search Debounce */}
          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari file atau aplikasi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[#92B4EC]/80 bg-[#F3F6FD] pl-10 pr-4 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#FF6701] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6701]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100 dark:focus:border-[#FF6500]"
            />
          </div>

          {/* App filter */}
          <select
            value={selectedApp}
            onChange={(e) => setSelectedApp(e.target.value)}
            className="w-full rounded-xl border border-[#92B4EC]/80 bg-[#F3F6FD] px-3 py-2 text-xs text-slate-900 focus:border-[#FF6701] focus:bg-white focus:outline-none dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100 dark:focus:border-[#FF6500]"
          >
            <option value="">Semua Aplikasi</option>
            {apps?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name} ({a.name})
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full rounded-xl border border-[#92B4EC]/80 bg-[#F3F6FD] px-3 py-2 text-xs text-slate-900 focus:border-[#FF6701] focus:bg-white focus:outline-none dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100 dark:focus:border-[#FF6500]"
          >
            <option value="">Semua Status</option>
            <option value="verified">Verified</option>
            <option value="quarantined">Karantina</option>
            <option value="failed">Gagal</option>
          </select>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-[#92B4EC]/80 bg-[#F3F6FD] px-2 py-2 text-xs text-slate-900 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100"
              title="Dari Tanggal"
            />
            <span className="text-slate-400 text-xs">-</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-xl border border-[#92B4EC]/80 bg-[#F3F6FD] px-2 py-2 text-xs text-slate-900 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100"
              title="Sampai Tanggal"
            />
          </div>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block rounded-2xl border border-[#92B4EC]/70 bg-white shadow-sm overflow-hidden dark:border-[#1E3E62] dark:bg-[#0B192C]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#F3F6FD] text-slate-500 uppercase tracking-wider dark:bg-[#000000] dark:text-slate-400 border-b border-[#92B4EC]/40 dark:border-[#1E3E62]">
            <tr>
              <th className="px-5 py-3.5 font-semibold">Nama File</th>
              <th className="px-4 py-3.5 font-semibold">Aplikasi</th>
              <th className="px-4 py-3.5 font-semibold">Ukuran</th>
              <th className="px-4 py-3.5 font-semibold">Tanggal Backup</th>
              <th className="px-4 py-3.5 font-semibold">Status</th>
              <th className="px-5 py-3.5 font-semibold text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#92B4EC]/30 dark:divide-[#1E3E62]/80">
            {isLoading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded bg-slate-200 dark:bg-slate-800" />
                      <div className="h-4 w-44 rounded bg-slate-200 dark:bg-slate-800" />
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-800" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-800" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-800" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-800" />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="h-7 w-20 rounded-lg bg-slate-200 dark:bg-slate-800 inline-block" />
                  </td>
                </tr>
              ))
            ) : backupData?.backups?.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-400">
                  Tidak ada file backup yang cocok dengan filter
                </td>
              </tr>
            ) : (
              backupData?.backups?.map((b) => (
                <tr key={b.id} className="hover:bg-[#F3F6FD] dark:hover:bg-[#1E3E62]/30 transition-colors">
                  <td className="px-5 py-4 font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[#FF6701] dark:text-[#FF6500] shrink-0" />
                    <span className="truncate max-w-xs">{b.filename}</span>
                  </td>
                  <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                    {b.application_name}
                  </td>
                  <td className="px-4 py-4 text-slate-600 dark:text-slate-300 font-mono">
                    {formatBytes(b.size_bytes)}
                  </td>
                  <td className="px-4 py-4 text-slate-500 dark:text-slate-400">
                    {formatDate(b.uploaded_at)}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        b.status === 'verified'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400'
                          : b.status === 'quarantined'
                          ? 'bg-[#FEA82F]/20 text-[#FF6701] dark:bg-[#FEA82F]/10 dark:text-[#FEA82F]'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-400'
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right space-x-1">
                    <button
                      onClick={() => setDetailBackup(b)}
                      title="Lihat Detail & Checksum"
                      className="rounded-lg p-2 text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-900 dark:hover:bg-[#1E3E62] dark:hover:text-[#FF6500] transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {canDownload && (
                      <button
                        onClick={() => handleDownload(b)}
                        disabled={downloadingId === b.id}
                        title="Unduh File"
                        className="rounded-lg p-2 text-[#FF6701] hover:bg-[#FF6701]/10 dark:text-[#FF6500] dark:hover:bg-[#1E3E62] transition-colors"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => {
                          setDeleteTarget(b);
                          setDeleteError(null);
                        }}
                        title="Hapus Backup (Memerlukan 2FA)"
                        className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {isLoading ? (
          [1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-[#92B4EC]/60 bg-white p-4 dark:border-[#1E3E62] dark:bg-[#0B192C] space-y-3 animate-pulse"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-1.5">
                  <div className="h-4 w-40 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-800" />
                </div>
                <div className="h-5 w-14 rounded-full bg-slate-200 dark:bg-slate-800" />
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-8 w-16 rounded-xl bg-slate-200 dark:bg-slate-800" />
              </div>
            </div>
          ))
        ) : backupData?.backups?.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">Tidak ada backup ditemukan</div>
        ) : (
          backupData?.backups?.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl border border-[#92B4EC]/70 bg-white p-4 shadow-sm dark:border-[#1E3E62] dark:bg-[#0B192C] space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[#FF6701] dark:text-[#FF6500] shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
                      {b.filename}
                    </h4>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      {b.application_name} · {formatBytes(b.size_bytes)}
                    </span>
                  </div>
                </div>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    b.status === 'verified'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400'
                      : 'bg-[#FEA82F]/20 text-[#FF6701] dark:bg-[#FEA82F]/10 dark:text-[#FEA82F]'
                  }`}
                >
                  {b.status}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/80">
                <span className="text-[11px] text-slate-400">
                  {formatDate(b.uploaded_at)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setDetailBackup(b)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F3F6FD] text-slate-700 dark:bg-[#000000] dark:text-slate-300 border border-[#92B4EC]/40 dark:border-[#1E3E62]"
                  >
                    <Eye className="h-4.5 w-4.5" />
                  </button>
                  {canDownload && (
                    <button
                      onClick={() => handleDownload(b)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF6701] text-white hover:bg-[#FF6500] dark:bg-[#FF6500] dark:text-white shadow-2xs"
                    >
                      <Download className="h-4.5 w-4.5 text-white" />
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => setDeleteTarget(b)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
                    >
                      <Trash2 className="h-4.5 w-4.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Detail Backup */}
      <Modal
        isOpen={!!detailBackup}
        onClose={() => setDetailBackup(null)}
        title="Detail & Integritas Backup"
        maxWidth="max-w-lg"
      >
        {detailBackup && (
          <div className="space-y-4 text-xs">
            <div>
              <span className="font-semibold text-slate-500 dark:text-slate-400">Nama File</span>
              <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">{detailBackup.filename}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="font-semibold text-slate-500 dark:text-slate-400">Aplikasi</span>
                <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">{detailBackup.application_name}</p>
              </div>
              <div>
                <span className="font-semibold text-slate-500 dark:text-slate-400">Ukuran Asli</span>
                <p className="mt-0.5 font-mono text-slate-800 dark:text-slate-200">{formatBytes(detailBackup.size_bytes)}</p>
              </div>
            </div>

            <div>
              <span className="font-semibold text-slate-500 dark:text-slate-400">SHA-256 Checksum</span>
              <div className="mt-1 flex items-center justify-between rounded-xl bg-black p-2.5 font-mono text-[11px] text-[#FF6500] border border-[#1E3E62]">
                <span className="truncate mr-2">{detailBackup.sha256}</span>
                <button
                  onClick={() => copyToClipboard(detailBackup.sha256)}
                  className="shrink-0 p-1 hover:text-white text-slate-400"
                >
                  {copiedSha ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <span className="font-semibold text-slate-500 dark:text-slate-400">Tanggal Diunggah</span>
              <p className="mt-0.5 text-slate-800 dark:text-slate-200">{formatDate(detailBackup.uploaded_at)}</p>
            </div>

            <div className="pt-4 border-t border-[#92B4EC]/30 dark:border-[#1E3E62] flex justify-end">
              {canDownload ? (
                <button
                  onClick={() => handleDownload(detailBackup)}
                  className="flex items-center gap-2 rounded-xl bg-[#FF6701] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#FF6500] dark:bg-[#FF6500] dark:text-white transition-all shadow-sm"
                >
                  <Download className="h-4 w-4 text-white" /> Unduh File Sekarang
                </button>
              ) : (
                <span className="text-[11px] text-slate-400 italic">
                  Akun Anggota Tim dalam mode Hanya-Lihat (Read-Only). Pengunduhan arsip backup hanya dapat dilakukan oleh Administrator.
                </span>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Hapus dengan Proteksi Re-auth 2FA */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Konfirmasi Hapus Backup"
        maxWidth="max-w-md"
      >
        {deleteTarget && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              deleteMutation.mutate({
                id: deleteTarget.id,
                code: twoFACode,
                permanent: isPermanent,
              });
            }}
            className="space-y-4 text-xs"
          >
            <div className="rounded-xl border border-rose-300 bg-rose-50/80 p-3.5 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
              <p className="font-bold">Perlindungan Keamanan Tingkat Tinggi</p>
              <p className="mt-1 text-[11px] leading-relaxed">
                Untuk mencegah ransomware atau akses tidak sah, penghapusan manual backup memerlukan verifikasi ulang kode 2FA Admin.
              </p>
            </div>

            {deleteError && (
              <div className="rounded-xl bg-rose-100 p-2.5 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 font-semibold">
                {deleteError}
              </div>
            )}

            <div>
              <span className="font-medium text-slate-600 dark:text-slate-400">File yang akan dihapus:</span>
              <p className="font-bold text-slate-900 dark:text-white truncate mt-0.5">
                {deleteTarget.filename}
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Kode TOTP 2FA Anda (6 Angka)
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="123456"
                value={twoFACode}
                onChange={(e) => setTwoFACode(e.target.value)}
                className="w-full text-center tracking-widest font-mono text-base rounded-xl border border-[#92B4EC]/80 bg-white p-2.5 focus:border-[#FF6701] focus:ring-2 focus:ring-[#FF6701]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-white dark:focus:border-[#FF6500]"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="permCheck"
                checked={isPermanent}
                onChange={(e) => setIsPermanent(e.target.checked)}
                className="rounded border-[#92B4EC] text-[#FF6701] focus:ring-[#FF6701]"
              />
              <label htmlFor="permCheck" className="text-slate-600 dark:text-slate-400">
                Hapus permanen dari storage (bukan soft-delete karantina)
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-[#92B4EC]/80 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-[#F3F6FD] dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-300 dark:hover:bg-[#1E3E62] transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={deleteMutation.isPending}
                className="rounded-xl bg-rose-600 px-4 py-2 font-semibold text-white hover:bg-rose-500 disabled:opacity-50 transition-colors shadow-2xs"
              >
                {deleteMutation.isPending ? 'Menghapus...' : 'Konfirmasi Hapus'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
