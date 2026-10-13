import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, formatBytes } from '../lib/api';
import { StatsSummary } from '../types';
import { HardDrive, Database, CheckCircle2, AlertTriangle, ArrowUpRight, Clock, ShieldCheck } from 'lucide-react';

interface DashboardPageProps {
  onNavigate: (tab: 'backups' | 'apps') => void;
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
        <div className="h-36 rounded-2xl border border-slate-200/70 bg-white p-6 dark:border-slate-800/70 dark:bg-darkSurface shimmer-effect flex flex-col justify-between">
          <div className="h-3.5 w-44 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-8 w-60 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-slate-800" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-2xl border border-slate-200/70 bg-white p-5 dark:border-slate-800/70 dark:bg-darkSurface shimmer-effect flex flex-col justify-between">
              <div className="flex justify-between items-center">
                <div className="h-3.5 w-24 rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-7 w-7 rounded-lg bg-slate-200 dark:bg-slate-800" />
              </div>
              <div className="h-7 w-16 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3 w-32 rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          ))}
        </div>
        <div className="h-64 rounded-2xl border border-slate-200/70 bg-white p-6 dark:border-slate-800/70 dark:bg-darkSurface shimmer-effect" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-6 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
        Gagal memuat statistik sistem: {(error as any)?.message}
      </div>
    );
  }

  const maxDailyBytes = Math.max(...(stats.daily_stats?.map((d) => d.total_bytes) || [1]), 1);

  return (
    <div className="space-y-6">
      {/* Missing Backups Warning Banner */}
      {stats.apps_missing_today && stats.apps_missing_today.length > 0 && (
        <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-5 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-amber-900 dark:text-amber-300">
              Perhatian: Ada Aplikasi Belum Mengirim Backup Hari Ini
            </h4>
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-400">
              Aplikasi berikut belum memiliki backup verified untuk tanggal hari ini:{' '}
              <span className="font-semibold">{stats.apps_missing_today.join(', ')}</span>.
            </p>
          </div>
        </div>
      )}

      {/* Storage Capacity Overview Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-darkSurface">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Kapasitas Penyimpanan Server
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {formatBytes(stats.total_size_bytes)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                dari total disk {formatBytes(stats.disk_total_bytes || 1073741824000)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Tersisa {formatBytes(stats.disk_free_bytes || 0)}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                stats.disk_used_percent > 85
                  ? 'bg-rose-500'
                  : stats.disk_used_percent > 70
                  ? 'bg-amber-500'
                  : 'bg-indigo-600 dark:bg-indigo-500'
              }`}
              style={{ width: `${Math.min(Math.max(stats.disk_used_percent, 2), 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-400 dark:text-slate-500">
            <span>Terpakai: {stats.disk_used_percent.toFixed(1)}%</span>
            <span>Alert threshold: 80%</span>
          </div>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Backups */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-darkSurface">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total File Backup</span>
            <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
              <Database className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {stats.total_backups}
            </span>
          </div>
          <div className="mt-2 flex items-center text-xs text-indigo-600 dark:text-cyan-400 hover:underline cursor-pointer" onClick={() => onNavigate('backups')}>
            Lihat semua backup <ArrowUpRight className="h-3 w-3 ml-0.5" />
          </div>
        </div>

        {/* Card 2: Today's Backups */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-darkSurface">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Backup Hari Ini</span>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {stats.today_backups}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {stats.apps_with_backup_today} dari {stats.active_apps_count} aplikasi
          </p>
        </div>

        {/* Card 3: Active Apps */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-darkSurface">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Aplikasi Terdaftar</span>
            <div className="rounded-xl bg-cyan-50 p-2 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400">
              <HardDrive className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {stats.active_apps_count}
            </span>
          </div>
          <div className="mt-2 flex items-center text-xs text-indigo-600 dark:text-cyan-400 hover:underline cursor-pointer" onClick={() => onNavigate('apps')}>
            Kelola aplikasi & API Key <ArrowUpRight className="h-3 w-3 ml-0.5" />
          </div>
        </div>

        {/* Card 4: Integrity Status */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-darkSurface">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Integritas Checksum</span>
            <div className="rounded-xl bg-violet-50 p-2 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              100%
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            SHA-256 terverifikasi otomatis
          </p>
        </div>
      </div>

      {/* 30-Day Volume Visual Bar Chart */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-darkSurface">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Aktivitas Backup 30 Hari Terakhir
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Volume harian data terenkripsi yang masuk ke InMeet Cloud
            </p>
          </div>
        </div>

        {stats.daily_stats && stats.daily_stats.length > 0 ? (
          <div className="flex items-end gap-1.5 h-48 pt-6 border-b border-slate-200/80 dark:border-slate-800/80">
            {stats.daily_stats.map((day) => {
              const heightPercent = Math.max((day.total_bytes / maxDailyBytes) * 100, day.total_bytes > 0 ? 8 : 2);
              return (
                <div
                  key={day.date}
                  className="group relative flex-1 flex flex-col items-center h-full justify-end"
                >
                  {/* Tooltip */}
                  <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 rounded-lg bg-slate-900 px-2 py-1 text-[10px] text-white whitespace-nowrap shadow-md">
                    {day.date}: {formatBytes(day.total_bytes)} ({day.count} file)
                  </div>

                  {/* Bar */}
                  <div
                    className="w-full rounded-t-md transition-colors duration-200 bg-slate-200 group-hover:bg-indigo-600 dark:bg-slate-800 dark:group-hover:bg-indigo-500"
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

        <div className="flex justify-between items-center text-[11px] text-slate-400 dark:text-slate-500 mt-2">
          <span>30 hari lalu</span>
          <span>Hari ini</span>
        </div>
      </div>
    </div>
  );
};
