import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, formatBytes } from '../lib/api';
import { StatsSummary } from '../types';
import { 
  Database, CheckCircle2, AlertTriangle, ArrowUpRight, 
  ShieldCheck, Server, Plus, BookOpen, Activity, Lock,
  HardDrive
} from 'lucide-react';

interface DashboardPageProps {
  onNavigate: (tab: 'dashboard' | 'drive' | 'backups' | 'apps' | 'audit' | 'docs' | 'settings') => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { data: stats, isLoading, error } = useQuery<StatsSummary>({
    queryKey: ['stats'],
    queryFn: () => apiRequest<StatsSummary>('/api/v1/stats'),
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

  const driveBytes = stats.drive_size_bytes || 0;
  const backupBytes = stats.backup_size_bytes || 0;
  const totalInMeetBytes = stats.total_size_bytes || (driveBytes + backupBytes);
  const diskTotal = stats.disk_total_bytes || 1073741824000;
  const diskFree = stats.disk_free_bytes || 0;

  // Percentage calculations
  const driveDiskPercent = diskTotal > 0 ? (driveBytes / diskTotal) * 100 : 0;
  const backupDiskPercent = diskTotal > 0 ? (backupBytes / diskTotal) * 100 : 0;
  const freeDiskPercent = diskTotal > 0 ? (diskFree / diskTotal) * 100 : 0;

  const driveOfTotalPercent = totalInMeetBytes > 0 ? (driveBytes / totalInMeetBytes) * 100 : 0;
  const backupOfTotalPercent = totalInMeetBytes > 0 ? (backupBytes / totalInMeetBytes) * 100 : 0;

  const maxDailyBytes = Math.max(...(stats.daily_stats?.map((d) => d.total_bytes) || [1]), 1);

  return (
    <div className="space-y-6 pb-12 md:pb-6">
      {/* Top Header & Quick Action Hub */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Pusat Kontrol Penyimpanan
            </h2>
            <span className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-mono font-bold bg-[#FEA82F]/15 text-[#FF6701] dark:bg-[#1E3E62] dark:text-[#FF6500] border border-[#FEA82F]/30 dark:border-[#FF6500]/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE TELEMETRY
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Status kapasitas disk server, alokasi drive vs backup, dan verifikasi integritas berkas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('drive')}
            className="flex items-center gap-1.5 rounded-xl bg-[#FF6701] px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#FF6500] dark:bg-[#FF6500] dark:text-white transition-all"
          >
            <HardDrive className="h-3.5 w-3.5 text-white" /> Buka Drive
          </button>
          <button
            onClick={() => onNavigate('apps')}
            className="flex items-center gap-1.5 rounded-xl border border-[#92B4EC] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F0F4FC] dark:border-[#1E3E62] dark:bg-[#0B192C] dark:text-slate-200 dark:hover:bg-[#1E3E62] transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-[#FF6701] dark:text-[#FF6500]" /> Tambah Aplikasi
          </button>
          <button
            onClick={() => onNavigate('docs')}
            className="flex items-center gap-1.5 rounded-xl border border-[#92B4EC] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F0F4FC] dark:border-[#1E3E62] dark:bg-[#0B192C] dark:text-slate-200 dark:hover:bg-[#1E3E62] transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5 text-[#FF6701] dark:text-[#FF6500]" /> Panduan API
          </button>
        </div>
      </div>

      {/* Warning Banner: Missing Backups */}
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
                    Cloud drive berkas & folder dokumen
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

      {/* 4 Micro-Bento Stat Cards */}
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
            <span>Kelola API Keys</span>
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

      {/* 30-Day Volume Bar Chart */}
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
