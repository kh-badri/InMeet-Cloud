import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, formatDate } from '../lib/api';
import { AuditLog } from '../types';
import { Globe, User, Terminal, Shield } from 'lucide-react';

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
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            Audit Log Keamanan
          </h2>
          <span className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold bg-[#FEA82F]/15 text-[#FF6701] dark:bg-[#1E3E62] dark:text-[#FF6500] border border-[#FEA82F]/30 dark:border-[#FF6500]/30">
            <Shield className="h-3 w-3" />
            APPEND-ONLY
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Catatan mutlak yang tidak dapat diubah untuk seluruh aktivitas autentikasi, API, dan pengelolaan data
        </p>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl border border-[#92B4EC]/70 bg-white p-4 shadow-sm dark:border-[#1E3E62] dark:bg-[#0B192C] space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full rounded-xl border border-[#92B4EC]/80 bg-[#F3F6FD] px-3 py-2 text-xs text-slate-900 focus:border-[#FF6701] focus:bg-white focus:outline-none dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100 dark:focus:border-[#FF6500]"
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
            className="w-full rounded-xl border border-[#92B4EC]/80 bg-[#F3F6FD] px-3 py-2 text-xs text-slate-900 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100"
            title="Dari Tanggal"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-xl border border-[#92B4EC]/80 bg-[#F3F6FD] px-3 py-2 text-xs text-slate-900 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100"
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
              className="rounded-2xl border border-[#92B4EC]/60 bg-white p-4 dark:border-[#1E3E62] dark:bg-[#0B192C] space-y-2 text-xs animate-pulse"
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
              className="rounded-2xl border border-[#92B4EC]/70 bg-white p-4 shadow-2xs dark:border-[#1E3E62] dark:bg-[#0B192C] space-y-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex rounded-md bg-[#F3F6FD] px-2 py-0.5 font-mono text-[11px] font-bold text-[#FF6701] border border-[#92B4EC]/50 dark:bg-[#000000] dark:text-[#FF6500] dark:border-[#1E3E62]">
                  {l.action}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {formatDate(l.created_at)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                {l.actor_type === 'api_key' ? (
                  <Terminal className="h-3.5 w-3.5 text-[#FEA82F] shrink-0" />
                ) : (
                  <User className="h-3.5 w-3.5 text-[#FF6701] dark:text-[#FF6500] shrink-0" />
                )}
                <span className="font-semibold truncate">{l.actor_email || l.actor_id}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1.5 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/80 font-mono">
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
      <div className="hidden md:block rounded-2xl border border-[#92B4EC]/70 bg-white shadow-sm overflow-hidden dark:border-[#1E3E62] dark:bg-[#0B192C]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F3F6FD] text-slate-500 uppercase tracking-wider dark:bg-[#000000] dark:text-slate-400 border-b border-[#92B4EC]/40 dark:border-[#1E3E62]">
              <tr>
                <th className="px-4 py-3.5 font-semibold">Waktu</th>
                <th className="px-4 py-3.5 font-semibold">Aktor</th>
                <th className="px-4 py-3.5 font-semibold">Aksi</th>
                <th className="px-4 py-3.5 font-semibold">Target</th>
                <th className="px-4 py-3.5 font-semibold">IP Address</th>
                <th className="px-4 py-3.5 font-semibold">Detail Parameter</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#92B4EC]/30 dark:divide-[#1E3E62]/80">
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
                  <tr key={l.id} className="hover:bg-[#F3F6FD] dark:hover:bg-[#1E3E62]/30 transition-colors">
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono text-[11px]">
                      {formatDate(l.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                      <div className="flex items-center gap-1.5">
                        {l.actor_type === 'api_key' ? (
                          <Terminal className="h-3.5 w-3.5 text-[#FEA82F] shrink-0" />
                        ) : (
                          <User className="h-3.5 w-3.5 text-[#FF6701] dark:text-[#FF6500] shrink-0" />
                        )}
                        <span className="truncate max-w-[140px] font-semibold">{l.actor_email || l.actor_id}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-md bg-[#F3F6FD] px-2 py-0.5 font-mono text-[11px] font-bold text-[#FF6701] border border-[#92B4EC]/50 dark:bg-[#000000] dark:text-[#FF6500] dark:border-[#1E3E62]">
                        {l.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                      {l.target_type && `${l.target_type}`}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400 text-[11px]">
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
