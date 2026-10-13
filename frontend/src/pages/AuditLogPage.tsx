import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, formatDate, formatBytes } from '../lib/api';
import { AuditLog } from '../types';
import { Modal } from '../components/Modal';
import {
  Shield, Globe, User, Terminal, Search,
  RefreshCw, FolderPlus, Upload, Download,
  Edit3, Trash2, RotateCcw, FolderSymlink, LogIn, LogOut,
  Key, AlertTriangle, Info, ChevronLeft, ChevronRight,
  X, Clock, Layers, HardDrive, Eye
} from 'lucide-react';

interface ActionMeta {
  label: string;
  category: 'drive' | 'auth' | 'app' | 'backup' | 'system';
  categoryLabel: string;
  badgeClass: string;
  icon: React.ElementType;
}

function getActionMeta(action: string): ActionMeta {
  switch (action) {
    // InMeet Drive
    case 'drive_file_uploaded':
      return {
        label: 'Unggah Berkas Drive',
        category: 'drive',
        categoryLabel: 'InMeet Drive',
        badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        icon: Upload,
      };
    case 'drive_folder_created':
      return {
        label: 'Buat Folder Baru',
        category: 'drive',
        categoryLabel: 'InMeet Drive',
        badgeClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
        icon: FolderPlus,
      };
    case 'drive_item_moved':
      return {
        label: 'Pindahkan Berkas/Folder',
        category: 'drive',
        categoryLabel: 'InMeet Drive',
        badgeClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
        icon: FolderSymlink,
      };
    case 'drive_item_renamed':
      return {
        label: 'Ganti Nama Berkas/Folder',
        category: 'drive',
        categoryLabel: 'InMeet Drive',
        badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
        icon: Edit3,
      };
    case 'drive_item_trashed':
      return {
        label: 'Pindah ke Kotak Sampah',
        category: 'drive',
        categoryLabel: 'InMeet Drive',
        badgeClass: 'bg-[#FF6701]/15 text-[#FF6701] dark:bg-[#1E3E62] dark:text-[#FEA82F] border-[#FF6701]/30',
        icon: Trash2,
      };
    case 'drive_item_restored':
      return {
        label: 'Pulihkan dari Sampah',
        category: 'drive',
        categoryLabel: 'InMeet Drive',
        badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        icon: RotateCcw,
      };
    case 'drive_item_permanently_deleted':
      return {
        label: 'Hapus Permanen Drive',
        category: 'drive',
        categoryLabel: 'InMeet Drive',
        badgeClass: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
        icon: Trash2,
      };
    case 'drive_trash_emptied':
      return {
        label: 'Kosongkan Kotak Sampah',
        category: 'drive',
        categoryLabel: 'InMeet Drive',
        badgeClass: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
        icon: Trash2,
      };
    case 'drive_item_downloaded':
      return {
        label: 'Unduh Berkas Drive',
        category: 'drive',
        categoryLabel: 'InMeet Drive',
        badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
        icon: Download,
      };
    case 'drive_trash_purged':
      return {
        label: 'Auto-Purge Sampah (7 Hari)',
        category: 'drive',
        categoryLabel: 'InMeet Drive',
        badgeClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
        icon: Clock,
      };

    // Autentikasi & Akun
    case 'login_success':
      return {
        label: 'Login Berhasil',
        category: 'auth',
        categoryLabel: 'Autentikasi',
        badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        icon: LogIn,
      };
    case 'login_failed':
      return {
        label: 'Login Gagal',
        category: 'auth',
        categoryLabel: 'Autentikasi',
        badgeClass: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
        icon: AlertTriangle,
      };
    case 'login_step1_success':
      return {
        label: 'Password Valid (Menunggu 2FA)',
        category: 'auth',
        categoryLabel: 'Autentikasi',
        badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
        icon: Key,
      };
    case 'login_2fa_success':
      return {
        label: 'Verifikasi 2FA Berhasil',
        category: 'auth',
        categoryLabel: 'Autentikasi',
        badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        icon: Shield,
      };
    case '2fa_verify_failed':
      return {
        label: 'Verifikasi 2FA Gagal',
        category: 'auth',
        categoryLabel: 'Autentikasi',
        badgeClass: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
        icon: AlertTriangle,
      };
    case 'logout':
      return {
        label: 'Logout Pengguna',
        category: 'auth',
        categoryLabel: 'Autentikasi',
        badgeClass: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30',
        icon: LogOut,
      };
    case 'totp_enabled':
      return {
        label: 'Aktifkan 2FA / TOTP',
        category: 'auth',
        categoryLabel: 'Autentikasi',
        badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        icon: Shield,
      };
    case 'totp_disabled':
      return {
        label: 'Nonaktifkan 2FA / TOTP',
        category: 'auth',
        categoryLabel: 'Autentikasi',
        badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
        icon: Shield,
      };
    case 'change_password':
      return {
        label: 'Ubah Kata Sandi',
        category: 'auth',
        categoryLabel: 'Autentikasi',
        badgeClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
        icon: Key,
      };
    case 'change_email':
      return {
        label: 'Ubah Alamat Email',
        category: 'auth',
        categoryLabel: 'Autentikasi',
        badgeClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
        icon: User,
      };
    case 'recovery_code_used':
      return {
        label: 'Kode Pemulihan Digunakan',
        category: 'auth',
        categoryLabel: 'Autentikasi',
        badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
        icon: AlertTriangle,
      };

    // Aplikasi & API Key
    case 'app_created':
      return {
        label: 'Tambah Aplikasi Baru',
        category: 'app',
        categoryLabel: 'Aplikasi',
        badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        icon: Layers,
      };
    case 'app_updated':
      return {
        label: 'Perbarui Pengaturan App',
        category: 'app',
        categoryLabel: 'Aplikasi',
        badgeClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
        icon: RefreshCw,
      };
    case 'api_key_created':
      return {
        label: 'Buat API Key Baru',
        category: 'app',
        categoryLabel: 'API Key',
        badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        icon: Key,
      };
    case 'api_key_revoked':
      return {
        label: 'Cabut / Hapus API Key',
        category: 'app',
        categoryLabel: 'API Key',
        badgeClass: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
        icon: Trash2,
      };

    // Backup & Retensi
    case 'backup_uploaded':
      return {
        label: 'Unggah Berkas Backup',
        category: 'backup',
        categoryLabel: 'Backup Vault',
        badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        icon: Upload,
      };
    case 'upload_checksum_mismatch':
      return {
        label: 'Checksum Backup Gagal',
        category: 'backup',
        categoryLabel: 'Backup Vault',
        badgeClass: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
        icon: AlertTriangle,
      };
    case 'backup_downloaded':
      return {
        label: 'Unduh Berkas Backup',
        category: 'backup',
        categoryLabel: 'Backup Vault',
        badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
        icon: Download,
      };
    case 'download_link_generated':
      return {
        label: 'Buat Tautan Unduh Backup',
        category: 'backup',
        categoryLabel: 'Backup Vault',
        badgeClass: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30',
        icon: Download,
      };
    case 'backup_quarantined':
      return {
        label: 'Karantina Berkas Backup',
        category: 'backup',
        categoryLabel: 'Backup Vault',
        badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
        icon: Trash2,
      };
    case 'backup_permanently_deleted':
      return {
        label: 'Hapus Permanen Backup',
        category: 'backup',
        categoryLabel: 'Backup Vault',
        badgeClass: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
        icon: Trash2,
      };
    case 'retention_run_completed':
      return {
        label: 'Jadwal Retensi Selesai',
        category: 'system',
        categoryLabel: 'Sistem',
        badgeClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
        icon: RefreshCw,
      };

    default:
      return {
        label: action.replace(/_/g, ' '),
        category: 'system',
        categoryLabel: 'Lainnya',
        badgeClass: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30',
        icon: Info,
      };
  }
}

function formatAuditDetails(log: AuditLog): { summary: string; extra?: string } {
  const d = log.details || {};
  switch (log.action) {
    case 'drive_file_uploaded':
      return {
        summary: d.name ? `Berkas: ${d.name}` : 'Unggah berkas berhasil',
        extra: d.size_bytes ? formatBytes(d.size_bytes) : undefined,
      };
    case 'drive_folder_created':
      return { summary: `Folder: "${d.name || '-'}"` };
    case 'drive_item_moved':
      return {
        summary: `Pindahkan "${d.name || '-'}" ke ${
          d.target_parent_id === 'root' ? 'Drive Saya (Folder Utama)' : 'Subfolder'
        }`,
      };
    case 'drive_item_renamed':
      return { summary: `Ganti nama: "${d.old_name || '-'}" ➔ "${d.new_name || '-'}"` };
    case 'drive_item_trashed':
      return {
        summary: `Dipindahkan ke kotak sampah: "${d.name || '-'}"`,
        extra: 'Karantina 7 hari',
      };
    case 'drive_item_restored':
      return { summary: `Dipulihkan ke Drive: "${d.name || '-'}"` };
    case 'drive_item_permanently_deleted':
      return { summary: `Dihapus selamanya: "${d.name || '-'}"` };
    case 'drive_trash_emptied':
      return { summary: `Mengosongkan kotak sampah (${d.items_count || 0} item dimusnahkan)` };
    case 'drive_item_downloaded':
      return {
        summary: `Unduh: "${d.name || '-'}"`,
        extra: d.size_bytes ? formatBytes(d.size_bytes) : undefined,
      };
    case 'drive_trash_purged':
      return { summary: `Auto-Purge 7 hari: ${d.purged_count || 0} berkas kadaluarsa dibersihkan` };

    case 'login_failed':
      return {
        summary: `Gagal: ${
          d.reason === 'invalid password'
            ? 'Kata sandi salah'
            : d.reason === 'user not found'
            ? 'Akun tidak terdaftar'
            : d.reason || 'Kredensial tidak valid'
        }`,
      };
    case 'login_success':
      return { summary: 'Berhasil masuk ke aplikasi' };
    case 'login_step1_success':
      return { summary: 'Verifikasi langkah 1 kata sandi berhasil' };
    case 'login_2fa_success':
      return { summary: 'Kode verifikasi 2FA TOTP valid' };
    case '2fa_verify_failed':
      return { summary: 'Kode verifikasi 2FA tidak cocok' };
    case 'logout':
      return { summary: 'Sesi akun ditutup' };
    case 'totp_enabled':
      return { summary: 'Pengamanan dua langkah (2FA) diaktifkan' };
    case 'totp_disabled':
      return { summary: 'Pengamanan dua langkah (2FA) dinonaktifkan' };
    case 'change_password':
      return { summary: 'Kata sandi akun berhasil diperbarui' };
    case 'change_email':
      return { summary: `Email diubah menjadi: ${d.new_email || '-'}` };

    case 'app_created':
      return { summary: `Aplikasi baru: "${d.name || '-'}"` };
    case 'app_updated':
      return { summary: `Status aktif: ${d.is_active ? 'Aktif' : 'Nonaktif'}` };
    case 'api_key_created':
      return { summary: `App: ${d.app_name || '-'} | Prefix: ${d.prefix || '-'}` };
    case 'api_key_revoked':
      return { summary: 'Kunci API dicabut secara permanen' };

    case 'backup_uploaded':
      return {
        summary: d.filename ? `Berkas: ${d.filename}` : 'Unggah backup berhasil',
        extra: d.size_bytes ? formatBytes(d.size_bytes) : undefined,
      };
    case 'upload_checksum_mismatch':
      return { summary: `Checksum SHA256 berkas tidak cocok` };
    case 'backup_downloaded':
      return { summary: `Unduh berkas: "${d.filename || '-'}"` };
    case 'backup_quarantined':
      return { summary: `Masuk karantina: "${d.filename || '-'}"` };
    case 'backup_permanently_deleted':
      return { summary: `Dihapus selamanya: "${d.filename || '-'}"` };
    case 'retention_run_completed':
      return {
        summary: `Retensi: ${d.items_quarantined || 0} dikarantina, ${d.items_deleted || 0} dihapus`,
        extra: d.bytes_freed ? `Ruang: ${formatBytes(d.bytes_freed)}` : undefined,
      };

    default:
      if (!d || Object.keys(d).length === 0) return { summary: '-' };
      return { summary: Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(', ') };
  }
}

export const AuditLogPage: React.FC = () => {
  // Filters state
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Modal details state
  const [inspectedLog, setInspectedLog] = useState<AuditLog | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch Audit logs from API
  const { data, isLoading, isFetching, refetch } = useQuery<{
    logs: AuditLog[];
    total: number;
    limit: number;
    offset: number;
  }>({
    queryKey: ['audit-logs', selectedCategory, actionFilter, debouncedSearch, dateFrom, dateTo, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedCategory !== 'all') {
        params.set('target_type', selectedCategory);
      }
      if (actionFilter) {
        params.set('action', actionFilter);
      }
      if (debouncedSearch) {
        params.set('q', debouncedSearch);
      }
      if (dateFrom) {
        params.set('date_from', dateFrom);
      }
      if (dateTo) {
        params.set('date_to', dateTo);
      }
      params.set('limit', String(pageSize));
      params.set('offset', String((page - 1) * pageSize));

      return apiRequest(`/api/v1/audit?${params.toString()}`);
    },
  });

  const totalLogs = data?.total || 0;
  const totalPages = Math.ceil(totalLogs / pageSize) || 1;

  const handleResetFilter = () => {
    setSelectedCategory('all');
    setActionFilter('');
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const hasActiveFilter =
    selectedCategory !== 'all' || actionFilter !== '' || searchQuery !== '' || dateFrom !== '' || dateTo !== '';

  return (
    <div className="space-y-6 pb-16 md:pb-6">
      {/* Header Bento Box */}
      <div className="rounded-2xl border border-[#92B4EC] bg-white p-5 shadow-xs dark:border-[#1E3E62] dark:bg-[#0B192C]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start sm:items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#FF6701] text-white dark:bg-[#FF6500] dark:text-white">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Audit Log Aktivitas
                </h1>
                <span className="flex items-center gap-1 rounded-md border border-[#92B4EC]/50 bg-[#92B4EC]/20 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-[#FEA82F]">
                  <Shield className="h-3 w-3" />
                  APPEND-ONLY RECORD
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Mencatat seluruh rekam jejak aktivitas aplikasi: InMeet Drive, autentikasi login, API Key, aplikasi, hingga backup vault.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              title="Perbarui log"
              disabled={isFetching}
              className="flex items-center gap-1.5 rounded-xl border border-[#92B4EC] bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-[#92B4EC]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-200 dark:hover:bg-[#1E3E62] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-[#FF6701] dark:text-[#FF6500] ${isFetching ? 'animate-spin' : ''}`} />
              <span>Segarkan</span>
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="mt-5 pt-4 border-t border-[#92B4EC]/40 dark:border-[#1E3E62] flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: 'all', label: 'Semua Kegiatan', icon: Layers },
            { id: 'drive', label: 'InMeet Drive', icon: HardDrive },
            { id: 'auth', label: 'Autentikasi & Akun', icon: User },
            { id: 'application', label: 'Aplikasi', icon: Layers },
            { id: 'api_key', label: 'API Key', icon: Key },
            { id: 'backup', label: 'Penyimpanan Backup', icon: Upload },
            { id: 'retention', label: 'Sistem & Retensi', icon: Clock },
          ].map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setActionFilter('');
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                  isSelected
                    ? 'bg-[#FF6701] text-white dark:bg-[#FF6500] dark:text-white'
                    : 'border border-[#92B4EC]/60 bg-[#F3F6FD] text-slate-700 hover:bg-[#92B4EC]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-300 dark:hover:bg-[#1E3E62]/40'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isSelected ? 'text-white' : 'text-[#FF6701] dark:text-[#FF6500]'}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-[#92B4EC] bg-white p-4 shadow-xs dark:border-[#1E3E62] dark:bg-[#0B192C]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Live Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama berkas, email, IP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[#92B4EC] bg-[#F3F6FD] pl-8 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#FF6701] focus:bg-white focus:outline-none dark:border-[#1E3E62] dark:bg-[#000000] dark:text-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Date From */}
          <div className="relative">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-[#92B4EC] bg-[#F3F6FD] px-3 py-2 text-xs text-slate-900 focus:border-[#FF6701] focus:bg-white focus:outline-none dark:border-[#1E3E62] dark:bg-[#000000] dark:text-white"
              title="Dari Tanggal"
            />
          </div>

          {/* Date To */}
          <div className="relative">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-[#92B4EC] bg-[#F3F6FD] px-3 py-2 text-xs text-slate-900 focus:border-[#FF6701] focus:bg-white focus:outline-none dark:border-[#1E3E62] dark:bg-[#000000] dark:text-white"
              title="Sampai Tanggal"
            />
          </div>

          {/* Reset Filters Button */}
          <div className="flex items-center gap-2">
            {hasActiveFilter && (
              <button
                onClick={handleResetFilter}
                className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                <span>Reset Filter</span>
              </button>
            )}
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 ml-auto whitespace-nowrap">
              Total: <strong className="text-slate-900 dark:text-white">{totalLogs}</strong> log
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-2xl border border-[#92B4EC]/50 bg-[#92B4EC]/10 dark:border-[#1E3E62] dark:bg-[#0B192C] animate-pulse"
            />
          ))}
        </div>
      ) : data?.logs?.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-[#92B4EC] dark:border-[#1E3E62] bg-white/50 dark:bg-[#0B192C]/50">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#92B4EC]/20 dark:bg-[#1E3E62] text-slate-400 dark:text-slate-500 mb-4">
            <Search className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Tidak ada aktivitas log yang ditemukan
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
            {hasActiveFilter
              ? 'Tidak ada catatan audit yang cocok dengan filter atau kata kunci pencarian Anda.'
              : 'Belum ada aktivitas yang dicatat di dalam sistem.'}
          </p>
          {hasActiveFilter && (
            <button
              onClick={handleResetFilter}
              className="mt-4 flex items-center gap-1.5 rounded-xl bg-[#FF6701] px-4 py-2 text-xs font-bold text-white hover:bg-[#FF6500] dark:bg-[#FF6500] dark:text-white transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5 text-white" />
              <span>Tampilkan Semua Log</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* DESKTOP TABLE VIEW */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-[#92B4EC] bg-white dark:border-[#1E3E62] dark:bg-[#0B192C] shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#92B4EC]/40 bg-slate-50/50 dark:border-[#1E3E62] dark:bg-[#000000] text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="px-4 py-3.5">Waktu</th>
                    <th className="px-4 py-3.5">Kategori & Aksi</th>
                    <th className="px-4 py-3.5">Detail Aktivitas</th>
                    <th className="px-4 py-3.5">Aktor / Pengguna</th>
                    <th className="px-4 py-3.5">IP Address</th>
                    <th className="px-4 py-3.5 text-right">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#92B4EC]/30 dark:divide-[#1E3E62]/60">
                  {data?.logs.map((log) => {
                    const meta = getActionMeta(log.action);
                    const Icon = meta.icon;
                    const details = formatAuditDetails(log);

                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-[#92B4EC]/10 dark:hover:bg-[#1E3E62]/30 transition-colors"
                      >
                        {/* Waktu */}
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono text-[11px]">
                          {formatDate(log.created_at)}
                        </td>

                        {/* Kategori & Aksi */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${meta.badgeClass}`}
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0" />
                              <span>{meta.label}</span>
                            </span>
                          </div>
                          <span className="block mt-0.5 text-[10px] font-mono text-slate-400 dark:text-slate-500 pl-1">
                            {log.action}
                          </span>
                        </td>

                        {/* Detail Aktivitas */}
                        <td className="px-4 py-3 max-w-sm">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate" title={details.summary}>
                            {details.summary}
                          </p>
                          {details.extra && (
                            <span className="inline-block mt-0.5 text-[10px] font-mono rounded bg-slate-100 px-1.5 py-0.2 text-slate-600 dark:bg-[#000000] dark:text-slate-400">
                              {details.extra}
                            </span>
                          )}
                        </td>

                        {/* Aktor / Pengguna */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {log.actor_type === 'api_key' ? (
                              <Terminal className="h-3.5 w-3.5 text-[#FEA82F] shrink-0" />
                            ) : log.actor_type === 'system' ? (
                              <Clock className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                            ) : (
                              <User className="h-3.5 w-3.5 text-[#FF6701] dark:text-[#FF6500] shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[160px]">
                                {log.actor_email || log.actor_id || 'System'}
                              </p>
                              <span className="text-[10px] font-mono uppercase text-slate-400">
                                {log.actor_type}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* IP Address */}
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono text-[11px] whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Globe className="h-3 w-3 shrink-0" />
                            <span>{log.ip_address || '-'}</span>
                          </div>
                        </td>

                        {/* Tombol Raw JSON */}
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setInspectedLog(log)}
                            title="Lihat rincian data teknis JSON"
                            className="inline-flex items-center gap-1 rounded-lg border border-[#92B4EC]/60 bg-[#F3F6FD] px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-[#92B4EC]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-300 dark:hover:bg-[#1E3E62] transition-colors"
                          >
                            <Eye className="h-3 w-3 text-[#FF6701] dark:text-[#FF6500]" />
                            <span>Detail</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* MOBILE CARD VIEW */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {data?.logs.map((log) => {
              const meta = getActionMeta(log.action);
              const Icon = meta.icon;
              const details = formatAuditDetails(log);

              return (
                <div
                  key={log.id}
                  className="rounded-2xl border border-[#92B4EC] bg-white p-4 shadow-xs dark:border-[#1E3E62] dark:bg-[#0B192C] space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${meta.badgeClass}`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{meta.label}</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {formatDate(log.created_at)}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {details.summary}
                    </p>
                    {details.extra && (
                      <span className="inline-block mt-1 text-[10px] font-mono rounded bg-slate-100 px-1.5 py-0.2 text-slate-600 dark:bg-[#000000] dark:text-slate-400">
                        {details.extra}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/60 text-[11px] text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5 truncate max-w-[180px]">
                      <User className="h-3.5 w-3.5 text-[#FF6701] dark:text-[#FF6500] shrink-0" />
                      <span className="truncate font-semibold">{log.actor_email || log.actor_id}</span>
                    </div>
                    <button
                      onClick={() => setInspectedLog(log)}
                      className="text-[11px] font-bold text-[#FF6701] dark:text-[#FF6500] hover:underline"
                    >
                      Lihat JSON
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Menampilkan <strong className="text-slate-900 dark:text-white">{(page - 1) * pageSize + 1}</strong> -{' '}
              <strong className="text-slate-900 dark:text-white">
                {Math.min(page * pageSize, totalLogs)}
              </strong>{' '}
              dari <strong className="text-slate-900 dark:text-white">{totalLogs}</strong> aktivitas
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex items-center gap-1 rounded-xl border border-[#92B4EC] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-[#92B4EC]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Sebelumnya</span>
              </button>

              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 px-2 font-mono">
                {page} / {totalPages}
              </span>

              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="flex items-center gap-1 rounded-xl border border-[#92B4EC] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-[#92B4EC]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span>Selanjutnya</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* MODAL: Detail Teknis JSON */}
      <Modal
        isOpen={inspectedLog !== null}
        onClose={() => setInspectedLog(null)}
        title="Detail Teknis Catatan Audit"
        maxWidth="max-w-2xl"
      >
        {inspectedLog && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs rounded-xl border border-[#92B4EC]/50 bg-[#F3F6FD] p-3.5 dark:border-[#1E3E62] dark:bg-[#000000]">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Aksi Sistem</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{inspectedLog.action}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Waktu Eksekusi</span>
                <span className="font-mono text-slate-900 dark:text-white">{formatDate(inspectedLog.created_at)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Aktor / Email</span>
                <span className="font-semibold text-slate-900 dark:text-white truncate block">
                  {inspectedLog.actor_email || inspectedLog.actor_id}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">IP Address</span>
                <span className="font-mono text-slate-900 dark:text-white">{inspectedLog.ip_address || '-'}</span>
              </div>
              {inspectedLog.target_id && (
                <div className="col-span-2">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Target ID</span>
                  <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 break-all">
                    {inspectedLog.target_type}: {inspectedLog.target_id}
                  </span>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Parameter Tambahan (JSON Payload)
              </p>
              <pre className="max-h-60 overflow-auto rounded-xl border border-[#92B4EC]/50 bg-slate-950 p-3 text-[11px] font-mono text-emerald-400">
                {JSON.stringify(inspectedLog.details || {}, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setInspectedLog(null)}
                className="rounded-xl bg-[#FF6701] px-4 py-2 text-xs font-bold text-white hover:bg-[#FF6500] dark:bg-[#FF6500] dark:text-white transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
