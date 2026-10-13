import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, formatDate } from '../lib/api';
import { AuditLog } from '../types';
import { Globe, User, Terminal } from 'lucide-react';

export const AuditLogPage: React.FC = () => {
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading } = useQuery<{ logs: AuditLog[]; total: number }>({
    queryKey: ['audit-logs', actionFilter, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (actionFilter) params.set('action', actionFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      return apiRequest(`/api/v1/audit?${params.toString()}`);
    },
  });

  return (
    <div className="space-y-6 pb-16 md:pb-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
          Audit Log Keamanan
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Catatan append-only yang tidak dapat diubah untuk semua aktivitas sensitif sistem
        </p>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-darkSurface space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">Semua Aksi</option>
            <option value="login_success">login_success</option>
            <option value="login_2fa_success">login_2fa_success</option>
            <option value="login_failed">login_failed</option>
            <option value="backup_uploaded">backup_uploaded</option>
            <option value="backup_downloaded">backup_downloaded</option>
            <option value="backup_quarantined">backup_quarantined</option>
            <option value="backup_permanently_deleted">backup_permanently_deleted</option>
            <option value="api_key_created">api_key_created</option>
            <option value="api_key_revoked">api_key_revoked</option>
            <option value="totp_enabled">totp_enabled</option>
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            title="Dari Tanggal"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            title="Sampai Tanggal"
          />
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {isLoading ? (
          [1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-darkSurface space-y-2 text-xs animate-pulse"
            >
              <div className="flex justify-between items-center">
                <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800" />
              </div>
              <div className="h-4 w-36 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="flex justify-between pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-800" />
              </div>
            </div>
          ))
        ) : data?.logs?.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">Tidak ada aktivitas tercatat</div>
        ) : (
          data?.logs?.map((l) => (
            <div
              key={l.id}
              className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-darkSurface space-y-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                  {l.action}
                </span>
                <span className="text-[11px] text-slate-400">
                  {formatDate(l.created_at)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                {l.actor_type === 'api_key' ? (
                  <Terminal className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                ) : (
                  <User className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                )}
                <span className="font-medium truncate">{l.actor_email || l.actor_id}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/80 font-mono">
                <span className="flex items-center gap-1">
                  <Globe className="h-3 w-3" /> {l.ip_address}
                </span>
                {l.target_type && <span>Target: {l.target_type}</span>}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table view */}
      <div className="hidden md:block rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-darkSurface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider dark:bg-slate-900/60 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3.5 font-semibold">Waktu</th>
                <th className="px-4 py-3.5 font-semibold">Aktor</th>
                <th className="px-4 py-3.5 font-semibold">Aksi</th>
                <th className="px-4 py-3.5 font-semibold">Target</th>
                <th className="px-4 py-3.5 font-semibold">IP & UA</th>
                <th className="px-4 py-3.5 font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {isLoading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3.5"><div className="h-3.5 w-24 rounded bg-slate-200 dark:bg-slate-800" /></td>
                    <td className="px-4 py-3.5"><div className="h-3.5 w-32 rounded bg-slate-200 dark:bg-slate-800" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-800" /></td>
                    <td className="px-4 py-3.5"><div className="h-3.5 w-16 rounded bg-slate-200 dark:bg-slate-800" /></td>
                    <td className="px-4 py-3.5"><div className="h-3.5 w-24 rounded bg-slate-200 dark:bg-slate-800" /></td>
                    <td className="px-4 py-3.5"><div className="h-3.5 w-32 rounded bg-slate-200 dark:bg-slate-800" /></td>
                  </tr>
                ))
              ) : data?.logs?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    Tidak ada aktivitas tercatat
                  </td>
                </tr>
              ) : (
                data?.logs?.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDate(l.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                      <div className="flex items-center gap-1.5">
                        {l.actor_type === 'api_key' ? (
                          <Terminal className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
                        ) : (
                          <User className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                        )}
                        <span className="truncate max-w-[140px]">{l.actor_email || l.actor_id}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {l.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {l.target_type && `${l.target_type}`}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" /> {l.ip_address}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono text-[10px] max-w-xs truncate">
                      {JSON.stringify(l.details)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
