import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, formatBytes } from '../lib/api';
import { StatsSummary, DriveListResponse, DriveItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { 
  Database, CheckCircle2, AlertTriangle, ArrowUpRight, 
  ShieldCheck, Server, Plus, BookOpen, Activity, Lock,
  HardDrive, Folder, FileText, Trash2, Clock, Sparkles,
  Shield, User as UserIcon, AlertCircle
} from 'lucide-react';

interface DashboardPageProps {
  onNavigate: (tab: 'dashboard' | 'drive' | 'backups' | 'apps' | 'audit' | 'docs' | 'settings') => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isReadOnlyAdmin = isAdmin && (!user?.can_edit && !user?.can_delete);
  const isUser = user?.role === 'user';
  const canAdminEdit = isAdmin && user?.can_edit !== false;

  // General system stats query
  const { data: stats, isLoading, error } = useQuery<StatsSummary>({
    queryKey: ['stats'],
    queryFn: () => apiRequest<StatsSummary>('/api/v1/stats'),
    refetchInterval: 30000,
  });

  // User personal drive summary query (for Anggota Tim / role: user)
  const { data: userDrive } = useQuery<DriveListResponse>({
    queryKey: ['drive-items-user-summary'],
    queryFn: () => apiRequest<DriveListResponse>('/api/v1/drive/items'),
    enabled: isUser,
    refetchInterval: 30000,
  });

  // User personal trash query (for Anggota Tim / role: user)
  const { data: userTrash } = useQuery<{ items: DriveItem[] }>({
    queryKey: ['drive-trash-user-summary'],
    queryFn: () => apiRequest<{ items: DriveItem[] }>('/api/v1/drive/trash'),
    enabled: isUser,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-44 rounded-2xl border border-[#92B4EC]/60 bg-white p-6 dark:border-[#1E3E62] dark:bg-[#0B192C] animate-pulse flex flex-col justify-between" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 rounded-2xl border border-[#92B4EC]/60 bg-white p-5 dark:border-[#1E3E62] dark:bg-[#0B192C] animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-2xl border border-[#92B4EC]/60 bg-white p-5 dark:border-[#1E3E62] dark:bg-[#0B192C] animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-2xl border border-[#92B4EC]/60 bg-white p-6 dark:border-[#1E3E62] dark:bg-[#0B192C] animate-pulse" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-2xl border border-rose-300 bg-rose-50 p-6 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-400">
        Gagal memuat statistik sistem: {(error as any)?.message}
      </div>
    );
  }

  // --- Calculations for Team Member (User Role) ---
  const userItems = userDrive?.items || [];
  const userFilesCount = userItems.filter((i) => i.type === 'file').length;
  const userFoldersCount = userItems.filter((i) => i.type === 'folder').length;
  const userUsedBytes = userDrive?.storage_used_bytes ?? userDrive?.total_bytes ?? user?.storage_used_bytes ?? 0;
  const userQuotaBytes = userDrive?.storage_quota_bytes || user?.storage_quota_bytes || 16106127360;
  const userQuotaPercent = userQuotaBytes > 0 ? (userUsedBytes / userQuotaBytes) * 100 : 0;
  const remainingUserQuotaBytes = Math.max(userQuotaBytes - userUsedBytes, 0);
  const remainingUserPercent = Math.max(100 - userQuotaPercent, 0);
  const userTrashItems = userTrash?.items || [];
  const userTrashCount = userTrashItems.length;
  const userTrashBytes = userTrashItems.reduce((acc, i) => acc + (i.size_bytes || 0), 0);

  const getUserQuotaProgressColor = (percent: number) => {
    if (percent >= 90) return 'bg-rose-500';
    if (percent >= 75) return 'bg-[#FEA82F]';
    return 'bg-[#FF6701] dark:bg-[#FF6500]';
  };

  // --- Calculations for Server / Admin View ---
  const driveBytes = stats.drive_size_bytes || 0;
  const backupBytes = stats.backup_size_bytes || 0;
  const totalInMeetBytes = stats.total_size_bytes || (driveBytes + backupBytes);
  const diskTotal = stats.disk_total_bytes || 1073741824000;
  const diskFree = stats.disk_free_bytes || 0;

  const driveDiskPercent = diskTotal > 0 ? (driveBytes / diskTotal) * 100 : 0;
  const backupDiskPercent = diskTotal > 0 ? (backupBytes / diskTotal) * 100 : 0;
  const freeDiskPercent = diskTotal > 0 ? (diskFree / diskTotal) * 100 : 0;

  const driveOfTotalPercent = totalInMeetBytes > 0 ? (driveBytes / totalInMeetBytes) * 100 : 0;
  const backupOfTotalPercent = totalInMeetBytes > 0 ? (backupBytes / totalInMeetBytes) * 100 : 0;

  const maxDailyBytes = Math.max(...(stats.daily_stats?.map((d) => d.total_bytes) || [1]), 1);

  // =========================================================================
  // RENDER: DASHBOARD ANGGOTA TIM (ROLE: USER)
  // =========================================================================
  if (isUser) {
    return (
      <div className="space-y-6 pb-12 md:pb-6">
        {/* Top Header & Team Action Hub */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                Ruang Kerja Saya
              </h2>
              <span className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold bg-[#FEA82F]/15 text-[#FF6701] dark:bg-[#1E3E62] dark:text-[#FEA82F] border border-[#FEA82F]/30 dark:border-[#FEA82F]/40">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                ANGGOTA TIM
              </span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-mono font-bold bg-[#92B4EC]/20 text-slate-700 dark:bg-[#000000] dark:text-slate-300 border border-[#92B4EC]/40 dark:border-[#1E3E62]">
                KUOTA {formatBytes(userQuotaBytes)}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Selamat datang kembali, <strong className="text-slate-700 dark:text-slate-200">{user?.email}</strong>. Kelola dokumen kerja Anda di InMeet Drive dan akses riwayat backup sistem.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onNavigate('drive')}
              className="flex items-center gap-1.5 rounded-xl bg-[#FF6701] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#FF6500] dark:bg-[#FF6500] dark:text-white transition-all"
            >
              <HardDrive className="h-3.5 w-3.5 text-white" /> Buka InMeet Drive
            </button>
            <button
              onClick={() => onNavigate('backups')}
              className="flex items-center gap-1.5 rounded-xl border border-[#92B4EC] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F0F4FC] dark:border-[#1E3E62] dark:bg-[#0B192C] dark:text-slate-200 dark:hover:bg-[#1E3E62] transition-colors"
            >
              <Database className="h-3.5 w-3.5 text-[#FF6701] dark:text-[#FF6500]" /> Daftar Backup
            </button>
            <button
              onClick={() => onNavigate('settings')}
              className="flex items-center gap-1.5 rounded-xl border border-[#92B4EC] bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F0F4FC] dark:border-[#1E3E62] dark:bg-[#0B192C] dark:text-slate-200 dark:hover:bg-[#1E3E62] transition-colors"
              title="Profil dan Keamanan Akun"
            >
              <UserIcon className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" /> Profil Akun
            </button>
          </div>
        </div>

        {/* Hero Bento: Dedicated Drive Quota Card for Team Member */}
        <div className="rounded-2xl border border-[#92B4EC]/70 bg-white p-5 sm:p-6 shadow-sm dark:border-[#1E3E62] dark:bg-[#0B192C]">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                  Kapasitas Kuota InMeet Drive Saya
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-[#92B4EC]/25 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-700 dark:bg-[#1E3E62] dark:text-slate-300">
                  <Lock className="h-2.5 w-2.5 text-[#FF6701] dark:text-[#FF6500]" />
                  ENKRIPSI AES-256
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="h-2.5 w-2.5" />
                  DRIVE TERISOLASI
                </span>
              </div>

              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span className="text-3xl font-black tracking-tight text-slate-900 dark:text-white font-mono">
                  {formatBytes(userUsedBytes)}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  terpakai dari alokasi kuota <strong className="text-[#FF6701] dark:text-[#FEA82F]">{formatBytes(userQuotaBytes)}</strong>
                </span>
              </div>
            </div>

            {/* Quick Metrics Badges for User */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="rounded-xl border border-[#92B4EC]/60 bg-[#F3F6FD] px-3.5 py-2 dark:border-[#1E3E62] dark:bg-[#000000]">
                <span className="text-[10px] font-semibold text-slate-400 block">Sisa Kuota Bebas</span>
                <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {formatBytes(remainingUserQuotaBytes)} ({remainingUserPercent.toFixed(1)}%)
                </span>
              </div>
              <div className="rounded-xl border border-[#92B4EC]/60 bg-[#F3F6FD] px-3.5 py-2 dark:border-[#1E3E62] dark:bg-[#000000]">
                <span className="text-[10px] font-semibold text-slate-400 block">Persentase Terpakai</span>
                <span className="text-xs font-bold font-mono text-[#FF6701] dark:text-[#FF6500]">
                  {userQuotaPercent.toFixed(1)}%
                </span>
              </div>
              <div 
                title="Data di InMeet Drive Anda bersifat permanen dan tidak akan pernah dihapus oleh pembersihan retensi berkas backup harian"
                className="rounded-xl border border-[#92B4EC]/60 bg-[#F3F6FD] px-3.5 py-2 dark:border-[#1E3E62] dark:bg-[#000000] cursor-help"
              >
                <span className="text-[10px] font-semibold text-slate-400 block">Status Data</span>
                <span className="text-xs font-bold font-mono text-slate-800 dark:text-slate-200">
                  Permanen (Non-Retensi)
                </span>
              </div>
            </div>
          </div>

          {/* Clean Progress Bar for User Quota */}
          <div className="mt-5 space-y-2">
            <div className="h-3.5 w-full overflow-hidden rounded-full bg-[#92B4EC]/25 dark:bg-[#000000] p-0.5 border border-[#92B4EC]/40 dark:border-[#1E3E62]">
              <div
                title={`Kapasitas Terpakai: ${formatBytes(userUsedBytes)} dari ${formatBytes(userQuotaBytes)} (${userQuotaPercent.toFixed(1)}%)`}
                className={`h-full rounded-full transition-all duration-500 ${getUserQuotaProgressColor(userQuotaPercent)}`}
                style={{ width: `${Math.min(Math.max(userQuotaPercent, userUsedBytes > 0 ? 1 : 0), 100)}%` }}
              />
            </div>

            {/* Visual Legend Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono pt-1">
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-semibold">
                  <span className="h-2.5 w-2.5 rounded-xs bg-[#FF6701] dark:bg-[#FF6500]" />
                  Drive Saya: <strong className="font-bold text-[#FF6701] dark:text-[#FEA82F]">{formatBytes(userUsedBytes)}</strong> ({userQuotaPercent.toFixed(1)}%)
                </span>
              </div>
              <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" />
                Sisa Kuota: <strong>{formatBytes(remainingUserQuotaBytes)}</strong>
              </span>
            </div>
          </div>

          {/* User Clarification Note */}
          <div className="mt-4 pt-3 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/80 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>
              Berkas Anda tersimpan aman dan privat. Berkas yang Anda hapus masuk ke <strong>Kotak Sampah</strong> selama <strong>7 hari</strong> sebelum dihapus permanen.
            </span>
          </div>
        </div>

        {/* Dual Focus Cards for Team Member */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Card 1: InMeet Drive */}
          <div 
            onClick={() => onNavigate('drive')}
            className="group cursor-pointer rounded-2xl border border-[#92B4EC]/70 bg-white p-5 shadow-2xs hover:shadow-md transition-all dark:border-[#1E3E62] dark:bg-[#0B192C] flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF6701] text-white dark:bg-[#FF6500]">
                    <HardDrive className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      InMeet Drive Saya
                    </h4>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Penyimpanan berkas dokumen dan folder kerja Anda
                    </span>
                  </div>
                </div>
                <span className="rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold bg-[#FEA82F]/15 text-[#FF6701] dark:bg-[#FF6500]/20 dark:text-[#FEA82F] border border-[#FEA82F]/30 dark:border-[#FF6500]/30">
                  {userQuotaPercent.toFixed(1)}% KUOTA
                </span>
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono tracking-tight text-slate-900 dark:text-white">
                  {formatBytes(userUsedBytes)}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  dari {formatBytes(userQuotaBytes)}
                </span>
              </div>

              <div className="mt-3 space-y-1.5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#92B4EC]/20 dark:bg-[#000000]">
                  <div 
                    className={`h-full rounded-full ${getUserQuotaProgressColor(userQuotaPercent)}`}
                    style={{ width: `${Math.min(Math.max(userQuotaPercent, userUsedBytes > 0 ? 2 : 0), 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>{userFilesCount} berkas • {userFoldersCount} folder</span>
                  <span className="font-mono">{formatBytes(remainingUserQuotaBytes)} tersisa</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/80 flex items-center justify-between text-xs font-bold text-[#FF6701] dark:text-[#FEA82F]">
              <span>Buka & Kelola Berkas Drive</span>
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>

          {/* Card 2: Backup Vault Archive Access */}
          <div 
            onClick={() => onNavigate('backups')}
            className="group cursor-pointer rounded-2xl border border-[#92B4EC]/70 bg-white p-5 shadow-2xs hover:shadow-md transition-all dark:border-[#1E3E62] dark:bg-[#0B192C] flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1E3E62] text-white dark:bg-[#1E3E62]">
                    <Database className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Arsip Backup CloudInMeet
                    </h4>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Riwayat snapshot backup sistem (Akses Lihat)
                    </span>
                  </div>
                </div>
                <span className="rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold bg-[#92B4EC]/20 text-[#1E3E62] dark:bg-[#1E3E62] dark:text-[#92B4EC] border border-[#92B4EC]/40 dark:border-[#1E3E62]">
                  LIHAT & UNDUH
                </span>
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono tracking-tight text-slate-900 dark:text-white">
                  {stats.total_backups}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  arsip backup tersedia ({formatBytes(backupBytes)})
                </span>
              </div>

              <div className="mt-3 space-y-1.5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#92B4EC]/20 dark:bg-[#000000]">
                  <div 
                    className="h-full rounded-full bg-[#1E3E62] dark:bg-[#92B4EC]"
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>{stats.today_backups} backup baru hari ini</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">Tervalidasi SHA-256</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/80 flex items-center justify-between text-xs font-bold text-[#1E3E62] dark:text-[#92B4EC]">
              <span>Lihat Daftar Backup Sistem</span>
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>
        </div>

        {/* 4 Micro-Bento Stat Cards for Team Member */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: User Files */}
          <div 
            onClick={() => onNavigate('drive')}
            className="group cursor-pointer rounded-2xl border border-[#92B4EC]/70 bg-white p-5 shadow-2xs hover:shadow-md transition-all dark:border-[#1E3E62] dark:bg-[#0B192C] flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Berkas di Drive Saya</span>
              <div className="rounded-xl bg-[#FEA82F]/15 p-2 text-[#FF6701] dark:bg-[#1E3E62] dark:text-[#FF6500] border border-[#FEA82F]/30 dark:border-[#FF6500]/30">
                <FileText className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                {userFilesCount}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/80 text-[#FF6701] dark:text-[#FF6500] font-semibold">
              <span>Buka berkas saya</span>
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>

          {/* Card 2: User Folders */}
          <div 
            onClick={() => onNavigate('drive')}
            className="group cursor-pointer rounded-2xl border border-[#92B4EC]/70 bg-white p-5 shadow-2xs hover:shadow-md transition-all dark:border-[#1E3E62] dark:bg-[#0B192C] flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Folder di Drive Saya</span>
              <div className="rounded-xl bg-[#92B4EC]/20 p-2 text-[#FF6701] dark:bg-[#1E3E62] dark:text-[#FEA82F] border border-[#92B4EC]/40 dark:border-[#1E3E62]">
                <Folder className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                {userFoldersCount}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/80 text-[#FF6701] dark:text-[#FF6500] font-semibold">
              <span>Kelola struktur folder</span>
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>

          {/* Card 3: Kotak Sampah / Karantina */}
          <div 
            onClick={() => onNavigate('drive')}
            className="group cursor-pointer rounded-2xl border border-[#92B4EC]/70 bg-white p-5 shadow-2xs hover:shadow-md transition-all dark:border-[#1E3E62] dark:bg-[#0B192C] flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Kotak Sampah Drive</span>
              <div className="rounded-xl bg-amber-500/10 p-2 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-500/20">
                <Trash2 className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                {userTrashCount}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/80 text-slate-600 dark:text-slate-300 font-semibold">
              <span>{userTrashCount > 0 ? `${formatBytes(userTrashBytes)} (Karantina 7 hari)` : 'Kotak sampah bersih'}</span>
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>

          {/* Card 4: Integrity / Security */}
          <div className="rounded-2xl border border-[#92B4EC]/70 bg-white p-5 shadow-2xs dark:border-[#1E3E62] dark:bg-[#0B192C] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Keamanan Penyimpanan</span>
              <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                100%
              </span>
              <span className="text-xs text-slate-400 font-mono">AMAN</span>
            </div>
            <div className="mt-3 text-xs pt-2.5 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/80 text-slate-500 dark:text-slate-400">
              Enkripsi data & isolasi akun aktif
            </div>
          </div>
        </div>

        {/* Informational Guidance Bento for Team Members */}
        <div className="rounded-2xl border border-[#92B4EC]/70 bg-white p-5 sm:p-6 shadow-sm dark:border-[#1E3E62] dark:bg-[#0B192C]">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-[#FF6701] dark:text-[#FF6500]" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Panduan Penting Penggunaan InMeet Drive
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-[#92B4EC]/40 bg-[#F8FAFC] dark:border-[#1E3E62] dark:bg-[#000000]/40 space-y-2">
              <div className="flex items-center gap-2 text-[#FF6701] dark:text-[#FF6500] font-bold text-xs">
                <HardDrive className="h-4 w-4" />
                <span>Penyimpanan Permanen</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Berkas di InMeet Drive tidak akan pernah dihapus oleh pembersihan retensi berkas backup harian. Data Anda tersimpan aman sampai Anda sendiri yang menghapusnya.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-[#92B4EC]/40 bg-[#F8FAFC] dark:border-[#1E3E62] dark:bg-[#000000]/40 space-y-2">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-xs">
                <Clock className="h-4 w-4" />
                <span>Karantina Sampah 7 Hari</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Berkas yang tidak sengaja terhapus dapat dipulihkan sewaktu-waktu dari <strong>Kotak Sampah</strong> ke Drive Saya dalam kurun waktu 7 hari.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-[#92B4EC]/40 bg-[#F8FAFC] dark:border-[#1E3E62] dark:bg-[#000000]/40 space-y-2">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                <Sparkles className="h-4 w-4" />
                <span>Upload Berkas & Folder</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Mendukung drag-and-drop berkas berukuran besar dan upload seluruh hierarki folder dokumen sekaligus secara bertahap (*chunked*) tanpa risiko gagal koneksi.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-[#92B4EC]/40 bg-[#F8FAFC] dark:border-[#1E3E62] dark:bg-[#000000]/40 space-y-2">
              <div className="flex items-center gap-2 text-[#1E3E62] dark:text-[#92B4EC] font-bold text-xs">
                <Shield className="h-4 w-4" />
                <span>Privasi Terisolasi</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Ruang penyimpanan Drive Anda terpisah dari anggota tim lain. Berkas kerja Anda bersifat rahasia dan aman.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // RENDER: DASHBOARD ADMINISTRATOR (ROLE: ADMIN)
  // =========================================================================
  return (
    <div className="space-y-6 pb-12 md:pb-6">
      {/* Top Header & Quick Action Hub */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Pusat Kontrol Penyimpanan
            </h2>
            <span className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-mono font-bold bg-[#FEA82F]/15 text-[#FF6701] dark:bg-[#1E3E62] dark:text-[#FF6500] border border-[#FEA82F]/30 dark:border-[#FF6500]/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE TELEMETRY
            </span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-mono font-bold bg-[#FF6701]/10 text-[#FF6701] dark:bg-[#FF6500]/20 dark:text-[#FEA82F] border border-[#FF6701]/30 dark:border-[#FF6500]/30">
              {isReadOnlyAdmin ? 'ADMINISTRATOR (HANYA LIHAT)' : 'ADMINISTRATOR'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Status kapasitas disk server, alokasi drive vs backup, dan verifikasi integritas berkas.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onNavigate('drive')}
            className="flex items-center gap-1.5 rounded-xl bg-[#FF6701] px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#FF6500] dark:bg-[#FF6500] dark:text-white transition-all"
          >
            <HardDrive className="h-3.5 w-3.5 text-white" /> Buka Drive
          </button>
          {canAdminEdit && (
            <button
              onClick={() => onNavigate('apps')}
              className="flex items-center gap-1.5 rounded-xl border border-[#92B4EC] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F0F4FC] dark:border-[#1E3E62] dark:bg-[#0B192C] dark:text-slate-200 dark:hover:bg-[#1E3E62] transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-[#FF6701] dark:text-[#FF6500]" /> Tambah Aplikasi
            </button>
          )}
          {isReadOnlyAdmin && (
            <button
              onClick={() => onNavigate('apps')}
              className="flex items-center gap-1.5 rounded-xl border border-[#92B4EC] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F0F4FC] dark:border-[#1E3E62] dark:bg-[#0B192C] dark:text-slate-200 dark:hover:bg-[#1E3E62] transition-colors"
            >
              <Server className="h-3.5 w-3.5 text-[#FF6701] dark:text-[#FF6500]" /> Daftar Aplikasi
            </button>
          )}
          <button
            onClick={() => onNavigate('docs')}
            className="flex items-center gap-1.5 rounded-xl border border-[#92B4EC] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F0F4FC] dark:border-[#1E3E62] dark:bg-[#0B192C] dark:text-slate-200 dark:hover:bg-[#1E3E62] transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5 text-[#FF6701] dark:text-[#FF6500]" /> Panduan API
          </button>
        </div>
      </div>

      {/* Read-Only Admin Notification Banner */}
      {isReadOnlyAdmin && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-blue-300 bg-blue-50/80 p-3.5 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 text-xs shadow-xs animate-fade-in">
          <AlertCircle className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <span>
            <strong>Mode Administrator Hanya-Lihat (Read-Only):</strong> Anda memiliki hak akses penuh untuk memantau seluruh telemetri server, berkas drive semua anggota tim, dan arsip backup tanpa izin edit atau hapus data.
          </span>
        </div>
      )}

      {/* Warning Banner: Missing Backups (Admin Only) */}
      {stats.apps_missing_today && stats.apps_missing_today.length > 0 && (
        <div className="flex items-start gap-3.5 rounded-2xl border border-[#FEA82F] bg-[#FEA82F]/10 p-4 dark:border-[#FF6500]/50 dark:bg-[#FF6500]/10">
          <AlertTriangle className="h-5 w-5 shrink-0 text-[#FF6701] dark:text-[#FF6500] mt-0.5" />
          <div className="flex-1">
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Perhatian: Ada Aplikasi Belum Mengirim Backup Hari Ini
            </h4>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
              Aplikasi berikut belum memiliki backup verified hari ini:{' '}
              <span className="font-bold text-[#FF6701] dark:text-[#FF6500]">
                {stats.apps_missing_today.join(', ')}
              </span>. Pastikan cron job aplikasi utama aktif berjalan.
            </p>
          </div>
        </div>
      )}

      {/* Hero Bento: Storage Capacity Telemetry Card */}
      <div className="rounded-2xl border border-[#92B4EC]/70 bg-white p-5 sm:p-6 shadow-sm dark:border-[#1E3E62] dark:bg-[#0B192C]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                Total Penyimpanan InMeet Cloud
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-[#92B4EC]/25 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-700 dark:bg-[#1E3E62] dark:text-slate-300">
                <Lock className="h-2.5 w-2.5 text-[#FF6701] dark:text-[#FF6500]" />
                AES-256-GCM
              </span>
            </div>

            <div className="flex items-baseline gap-2.5">
              <span className="text-3xl font-black tracking-tight text-slate-900 dark:text-white font-mono">
                {formatBytes(totalInMeetBytes)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                data InMeet dari total kapasitas disk {formatBytes(diskTotal)}
              </span>
            </div>
          </div>

          {/* Quick Metrics Badges */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="rounded-xl border border-[#92B4EC]/60 bg-[#F3F6FD] px-3.5 py-2 dark:border-[#1E3E62] dark:bg-[#000000]">
              <span className="text-[10px] font-semibold text-slate-400 block">Ruang Bebas Disk</span>
              <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {formatBytes(diskFree)} ({freeDiskPercent.toFixed(1)}%)
              </span>
            </div>
            <div className="rounded-xl border border-[#92B4EC]/60 bg-[#F3F6FD] px-3.5 py-2 dark:border-[#1E3E62] dark:bg-[#000000]">
              <span className="text-[10px] font-semibold text-slate-400 block">Total Disk Terpakai</span>
              <span className="text-xs font-bold font-mono text-[#FF6701] dark:text-[#FF6500]">
                {stats.disk_used_percent.toFixed(1)}%
              </span>
            </div>
            <div 
              title="Jadwal pembersihan otomatis berkas backup lama yang sudah kadaluarsa (khusus arsip snapshot backup, berkas InMeet Drive aman dan tidak disentuh)"
              className="rounded-xl border border-[#92B4EC]/60 bg-[#F3F6FD] px-3.5 py-2 dark:border-[#1E3E62] dark:bg-[#000000] cursor-help"
            >
              <span className="text-[10px] font-semibold text-slate-400 block">Retensi Backup</span>
              <span className="text-xs font-bold font-mono text-slate-800 dark:text-slate-200">
                23:30 WIB
              </span>
            </div>
          </div>
        </div>

        {/* Multi-Segmented Storage Bar (Drive vs Backup vs Free) */}
        <div className="mt-5 space-y-2">
          <div className="h-3.5 w-full overflow-hidden rounded-full bg-[#92B4EC]/25 dark:bg-[#000000] p-0.5 border border-[#92B4EC]/40 dark:border-[#1E3E62] flex gap-0.5">
            {driveDiskPercent > 0 && (
              <div
                title={`InMeet Drive: ${formatBytes(driveBytes)} (${driveDiskPercent.toFixed(1)}% disk)`}
                className="h-full bg-[#FF6701] dark:bg-[#FF6500] first:rounded-l-full last:rounded-r-full transition-all duration-500"
                style={{ width: `${Math.max(driveDiskPercent, 0.8)}%` }}
              />
            )}
            {backupDiskPercent > 0 && (
              <div
                title={`Backup Vault: ${formatBytes(backupBytes)} (${backupDiskPercent.toFixed(1)}% disk)`}
                className="h-full bg-[#1E3E62] dark:bg-[#92B4EC] first:rounded-l-full last:rounded-r-full transition-all duration-500"
                style={{ width: `${Math.max(backupDiskPercent, 0.8)}%` }}
              />
            )}
          </div>

          {/* Visual Legend Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono pt-1">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-semibold">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#FF6701] dark:bg-[#FF6500]" />
                InMeet Drive: <strong className="font-bold text-[#FF6701] dark:text-[#FEA82F]">{formatBytes(driveBytes)}</strong> ({driveOfTotalPercent.toFixed(1)}%)
              </span>
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-semibold">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#1E3E62] dark:bg-[#92B4EC]" />
                Backup Vault: <strong className="font-bold text-[#1E3E62] dark:text-[#92B4EC]">{formatBytes(backupBytes)}</strong> ({backupOfTotalPercent.toFixed(1)}%)
              </span>
            </div>
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" />
              Ruang Bebas: <strong>{formatBytes(diskFree)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Storage Breakdown Dual Cards: InMeet Drive vs Backup Vault */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Card 1: InMeet Drive */}
        <div 
          onClick={() => onNavigate('drive')}
          className="group cursor-pointer rounded-2xl border border-[#92B4EC]/70 bg-white p-5 shadow-2xs hover:shadow-md transition-all dark:border-[#1E3E62] dark:bg-[#0B192C] flex flex-col justify-between"
        >
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF6701] text-white dark:bg-[#FF6500]">
                  <HardDrive className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Penyimpanan InMeet Drive
                  </h4>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Cloud drive berkas & folder dokumen semua pengguna
                  </span>
                </div>
              </div>
              <span className="rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold bg-[#FEA82F]/15 text-[#FF6701] dark:bg-[#FF6500]/20 dark:text-[#FEA82F] border border-[#FEA82F]/30 dark:border-[#FF6500]/30">
                {driveOfTotalPercent.toFixed(1)}% DATA
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono tracking-tight text-slate-900 dark:text-white">
                {formatBytes(driveBytes)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                terpakai
              </span>
            </div>

            <div className="mt-3 space-y-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#92B4EC]/20 dark:bg-[#000000]">
                <div 
                  className="h-full rounded-full bg-[#FF6701] dark:bg-[#FF6500]"
                  style={{ width: `${Math.min(Math.max(driveOfTotalPercent, 2), 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>{stats.drive_files_count || 0} berkas • {stats.drive_folders_count || 0} folder</span>
                <span className="font-mono">{formatBytes(driveBytes)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/80 flex items-center justify-between text-xs font-bold text-[#FF6701] dark:text-[#FEA82F]">
            <span>Buka & Kelola Drive</span>
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </div>

        {/* Card 2: Backup Vault */}
        <div 
          onClick={() => onNavigate('backups')}
          className="group cursor-pointer rounded-2xl border border-[#92B4EC]/70 bg-white p-5 shadow-2xs hover:shadow-md transition-all dark:border-[#1E3E62] dark:bg-[#0B192C] flex flex-col justify-between"
        >
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1E3E62] text-white dark:bg-[#1E3E62]">
                  <Database className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Penyimpanan Backup Vault
                  </h4>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Arsip snapshot database & sistem
                  </span>
                </div>
              </div>
              <span className="rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold bg-[#92B4EC]/20 text-[#1E3E62] dark:bg-[#1E3E62] dark:text-[#92B4EC] border border-[#92B4EC]/40 dark:border-[#1E3E62]">
                {backupOfTotalPercent.toFixed(1)}% DATA
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono tracking-tight text-slate-900 dark:text-white">
                {formatBytes(backupBytes)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                terpakai
              </span>
            </div>

            <div className="mt-3 space-y-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#92B4EC]/20 dark:bg-[#000000]">
                <div 
                  className="h-full rounded-full bg-[#1E3E62] dark:bg-[#92B4EC]"
                  style={{ width: `${Math.min(Math.max(backupOfTotalPercent, 2), 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>{stats.total_backups} snapshot berkas backup</span>
                <span className="font-mono">{formatBytes(backupBytes)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/80 flex items-center justify-between text-xs font-bold text-[#1E3E62] dark:text-[#92B4EC]">
            <span>Buka & Kelola Backup</span>
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </div>
      </div>

      {/* 4 Micro-Bento Stat Cards for Admin */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Backups */}
        <div 
          onClick={() => onNavigate('backups')}
          className="group cursor-pointer rounded-2xl border border-[#92B4EC]/70 bg-white p-5 shadow-2xs hover:shadow-md transition-all dark:border-[#1E3E62] dark:bg-[#0B192C] flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total File Backup</span>
            <div className="rounded-xl bg-[#FEA82F]/15 p-2 text-[#FF6701] dark:bg-[#1E3E62] dark:text-[#FF6500] border border-[#FEA82F]/30 dark:border-[#FF6500]/30">
              <Database className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              {stats.total_backups}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/80 text-[#FF6701] dark:text-[#FF6500] font-semibold">
            <span>Buka daftar backup</span>
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </div>

        {/* Card 2: Today's Backups */}
        <div className="rounded-2xl border border-[#92B4EC]/70 bg-white p-5 shadow-2xs dark:border-[#1E3E62] dark:bg-[#0B192C] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Backup Hari Ini</span>
            <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              {stats.today_backups}
            </span>
          </div>
          <div className="mt-3 text-xs pt-2.5 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/80 text-slate-500 dark:text-slate-400">
            <span className="font-bold text-slate-800 dark:text-slate-200">{stats.apps_with_backup_today}</span> dari {stats.active_apps_count} aplikasi aktif
          </div>
        </div>

        {/* Card 3: Active Apps */}
        <div 
          onClick={() => onNavigate('apps')}
          className="group cursor-pointer rounded-2xl border border-[#92B4EC]/70 bg-white p-5 shadow-2xs hover:shadow-md transition-all dark:border-[#1E3E62] dark:bg-[#0B192C] flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Aplikasi Terdaftar</span>
            <div className="rounded-xl bg-[#92B4EC]/20 p-2 text-[#FF6701] dark:bg-[#1E3E62] dark:text-[#FEA82F] border border-[#92B4EC]/40 dark:border-[#1E3E62]">
              <Server className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              {stats.active_apps_count}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/80 text-[#FF6701] dark:text-[#FF6500] font-semibold">
            <span>{canAdminEdit ? 'Kelola API Keys' : 'Lihat Aplikasi'}</span>
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </div>

        {/* Card 4: Integrity Status */}
        <div className="rounded-2xl border border-[#92B4EC]/70 bg-white p-5 shadow-2xs dark:border-[#1E3E62] dark:bg-[#0B192C] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Verifikasi Integritas</span>
            <div className="rounded-xl bg-[#FF6701]/10 p-2 text-[#FF6701] dark:bg-[#1E3E62] dark:text-[#FF6500] border border-[#FF6701]/20 dark:border-[#FF6500]/30">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              100%
            </span>
            <span className="text-xs text-slate-400 font-mono">OK</span>
          </div>
          <div className="mt-3 text-xs pt-2.5 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/80 text-slate-500 dark:text-slate-400">
            Hash SHA-256 tervalidasi
          </div>
        </div>
      </div>

      {/* 30-Day Volume Bar Chart (Admin Only) */}
      <div className="rounded-2xl border border-[#92B4EC]/70 bg-white p-5 sm:p-6 shadow-sm dark:border-[#1E3E62] dark:bg-[#0B192C]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#FF6701] dark:text-[#FF6500]" />
              Aktivitas Ingestion 30 Hari Terakhir
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Volume harian data terenkripsi yang masuk ke InMeet Cloud
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#92B4EC] dark:bg-[#1E3E62]" /> Rendah
            </span>
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#FF6701] dark:bg-[#FF6500]" /> Aktif
            </span>
          </div>
        </div>

        {stats.daily_stats && stats.daily_stats.length > 0 ? (
          <div className="flex items-end gap-1.5 h-44 pt-6 border-b border-[#92B4EC]/40 dark:border-[#1E3E62]">
            {stats.daily_stats.map((day) => {
              const heightPercent = Math.max((day.total_bytes / maxDailyBytes) * 100, day.total_bytes > 0 ? 10 : 3);
              return (
                <div
                  key={day.date}
                  className="group relative flex-1 flex flex-col items-center h-full justify-end"
                >
                  {/* Tooltip */}
                  <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 rounded-lg bg-black px-2 py-1 text-[10px] text-white whitespace-nowrap shadow-md border border-[#1E3E62] font-mono">
                    {day.date}: {formatBytes(day.total_bytes)} ({day.count} file)
                  </div>

                  {/* Bar */}
                  <div
                    className={`w-full rounded-t-md transition-all duration-200 ${
                      day.count > 0 
                        ? 'bg-[#FF6701] group-hover:bg-[#FEA82F] dark:bg-[#FF6500] dark:group-hover:bg-[#FEA82F]' 
                        : 'bg-[#92B4EC]/30 group-hover:bg-[#92B4EC]/60 dark:bg-[#1E3E62]/40 dark:group-hover:bg-[#1E3E62]'
                    }`}
                    style={{
                      height: `${heightPercent}%`,
                    }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center text-xs text-slate-400">
            Belum ada aktivitas dalam 30 hari terakhir
          </div>
        )}

        <div className="flex justify-between items-center text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-2.5">
          <span>30 hari lalu</span>
          <span>Hari ini</span>
        </div>
      </div>
    </div>
  );
};
