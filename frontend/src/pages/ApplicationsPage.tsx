import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, formatBytes, formatDate } from '../lib/api';
import { Application, ApiKey } from '../types';
import { Modal } from '../components/Modal';
import { 
  Plus, KeyRound, CheckCircle2, AlertTriangle, 
  Trash2, Copy, Check, Globe, Sliders, Clock, Server, X 
} from 'lucide-react';

export const ApplicationsPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Modals state
  const [isAddAppOpen, setIsAddAppOpen] = useState(false);
  const [activeAppKeys, setActiveAppKeys] = useState<Application | null>(null);
  const [isCreateKeyOpen, setIsCreateKeyOpen] = useState(false);
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Edit App state
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editRetentionDays, setEditRetentionDays] = useState(30);
  const [editMinKeep, setEditMinKeep] = useState(3);

  // Form states
  const [appName, setAppName] = useState('');
  const [appDisplayName, setAppDisplayName] = useState('');
  const [appDescription, setAppDescription] = useState('');
  const [appRetentionDays, setAppRetentionDays] = useState(30);
  const [appMinKeep, setAppMinKeep] = useState(3);

  const [keyName, setKeyName] = useState('Server Production Key');
  const [keyIPAllowlist, setKeyIPAllowlist] = useState('');

  // Fetch applications
  const { data: apps, isLoading } = useQuery<Application[]>({
    queryKey: ['apps'],
    queryFn: () => apiRequest<Application[]>('/api/v1/apps'),
  });

  // Fetch keys for selected app
  const { data: keys } = useQuery<ApiKey[]>({
    queryKey: ['app-keys', activeAppKeys?.id],
    queryFn: () => apiRequest<ApiKey[]>(`/api/v1/apps/${activeAppKeys?.id}/keys`),
    enabled: !!activeAppKeys,
  });

  // Create App Mutation
  const createAppMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/v1/apps', {
        method: 'POST',
        body: JSON.stringify({
          name: appName,
          display_name: appDisplayName,
          description: appDescription,
          retention_days: appRetentionDays,
          min_keep: appMinKeep,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      setIsAddAppOpen(false);
      setAppName('');
      setAppDisplayName('');
      setAppDescription('');
    },
    onError: (err: any) => {
      alert(`Gagal menambah aplikasi: ${err.message}`);
    },
  });

  // Update App Mutation
  const updateAppMutation = useMutation({
    mutationFn: async () => {
      if (!editingApp) return;
      return apiRequest(`/api/v1/apps/${editingApp.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          display_name: editDisplayName,
          description: editDescription,
          retention_days: editRetentionDays,
          min_keep: editMinKeep,
          is_active: true,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      setEditingApp(null);
    },
    onError: (err: any) => {
      alert(`Gagal memperbarui aplikasi: ${err.message}`);
    },
  });

  const handleOpenEdit = (app: Application) => {
    setEditingApp(app);
    setEditDisplayName(app.display_name);
    setEditDescription(app.description || '');
    setEditRetentionDays(app.retention_days || 30);
    setEditMinKeep(app.min_keep || 3);
  };

  // Create Key Mutation
  const createKeyMutation = useMutation({
    mutationFn: async () => {
      if (!activeAppKeys) return;
      return apiRequest<ApiKey>(`/api/v1/apps/${activeAppKeys.id}/keys`, {
        method: 'POST',
        body: JSON.stringify({
          name: keyName,
          ip_allowlist: keyIPAllowlist,
        }),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['app-keys', activeAppKeys?.id] });
      setIsCreateKeyOpen(false);
      setCreatedRawKey(data?.raw_key || null);
    },
    onError: (err: any) => {
      alert(`Gagal membuat API key: ${err.message}`);
    },
  });

  // Revoke Key Mutation
  const revokeKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      if (!activeAppKeys) return;
      return apiRequest(`/api/v1/apps/${activeAppKeys.id}/keys/${keyId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-keys', activeAppKeys?.id] });
    },
    onError: (err: any) => {
      alert(`Gagal mencabut API key: ${err.message}`);
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="space-y-6 pb-16 md:pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
            Aplikasi & API Keys
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Kelola aplikasi pengirim backup, aturan retensi, dan token akses upload-only
          </p>
        </div>

        <button
          onClick={() => setIsAddAppOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Tambah Aplikasi
        </button>
      </div>

      {/* Applications Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {isLoading ? (
          [1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-darkSurface space-y-4 animate-pulse flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-1.5">
                    <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                  </div>
                  <div className="h-5 w-20 rounded-full bg-slate-200 dark:bg-slate-800" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-900/60">
                  <div className="h-8 rounded bg-slate-200/60 dark:bg-slate-800/60" />
                  <div className="h-8 rounded bg-slate-200/60 dark:bg-slate-800/60" />
                </div>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-6 w-24 rounded bg-slate-200 dark:bg-slate-800" />
              </div>
            </div>
          ))
        ) : apps?.length === 0 ? (
          <div className="col-span-full py-16 text-center text-xs text-slate-400 bg-white dark:bg-darkSurface rounded-2xl border border-slate-200/80 dark:border-slate-800">
            Belum ada aplikasi yang terdaftar. Klik tombol Tambah Aplikasi di atas untuk memulai.
          </div>
        ) : (
          apps?.map((app) => (
            <div
              key={app.id}
              className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm hover:shadow-md transition-shadow dark:border-slate-800 dark:bg-darkSurface flex flex-col justify-between gap-5"
            >
              <div className="space-y-3.5">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 shrink-0 font-bold border border-indigo-100 dark:border-indigo-900/40">
                      <Server className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm tracking-tight truncate">
                        {app.display_name}
                      </h3>
                      <code className="text-[11px] font-mono text-slate-500 dark:text-slate-400 block truncate">
                        {app.name}
                      </code>
                    </div>
                  </div>

                  {app.has_today_backup ? (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/40 shrink-0">
                      <CheckCircle2 className="h-3 w-3" /> Hari Ini Ada
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/40 shrink-0">
                      <AlertTriangle className="h-3 w-3" /> Belum Masuk
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 min-h-[32px]">
                  {app.description || <span className="italic text-slate-400 dark:text-slate-500">Tidak ada deskripsi</span>}
                </p>

                <div className="grid grid-cols-2 gap-2 text-xs rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/80">
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 block text-[10px] font-medium">Total Backup:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">
                      {app.total_backups || 0} file
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      {formatBytes(app.total_bytes || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 block text-[10px] font-medium">Aturan Retensi:</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 block">
                      {app.retention_days} hari
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      Min. {app.min_keep} file keep
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons in Equal Grid */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleOpenEdit(app)}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors shadow-2xs"
                  title="Ubah Aturan Retensi"
                >
                  <Sliders className="h-3.5 w-3.5 text-indigo-500" />
                  Ubah Retensi
                </button>
                <button
                  onClick={() => setActiveAppKeys(app)}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 shadow-2xs transition-colors"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Kelola API Key
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Tambah Aplikasi */}
      <Modal
        isOpen={isAddAppOpen}
        onClose={() => setIsAddAppOpen(false)}
        title="Tambah Aplikasi Baru"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createAppMutation.mutate();
          }}
          className="space-y-4 text-xs"
        >
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nama Slug (ID Unik)
            </label>
            <input
              type="text"
              required
              pattern="[a-z0-9_-]+"
              placeholder="contoh: server-database-utama"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 font-mono"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Gunakan huruf kecil, angka, atau tanda minus (-). Tidak boleh spasi.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nama Tampilan (Display Name)
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: Database PostgreSQL Utama"
              value={appDisplayName}
              onChange={(e) => setAppDisplayName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Deskripsi (Opsional)
            </label>
            <textarea
              rows={2}
              placeholder="Deskripsi singkat server atau aplikasi ini..."
              value={appDescription}
              onChange={(e) => setAppDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5 pt-1">
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1 text-xs">
                Batas Retensi (Hari)
              </label>
              <input
                type="number"
                min={1}
                required
                value={appRetentionDays}
                onChange={(e) => setAppRetentionDays(parseInt(e.target.value) || 1)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-indigo-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-indigo-400"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Backup &gt; {appRetentionDays} hari dihapus otomatis.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1 text-xs">
                Minimum Keep (File)
              </label>
              <input
                type="number"
                min={1}
                required
                value={appMinKeep}
                onChange={(e) => setAppMinKeep(parseInt(e.target.value) || 1)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                File terbaru yang selalu dilindungi.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={() => setIsAddAppOpen(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={createAppMutation.isPending}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-50"
            >
              {createAppMutation.isPending ? 'Menyimpan...' : 'Simpan Aplikasi'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Ubah Aturan Retensi & Edit Aplikasi */}
      <Modal
        isOpen={!!editingApp}
        onClose={() => setEditingApp(null)}
        title={`Ubah Aturan Retensi — ${editingApp?.display_name}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateAppMutation.mutate();
          }}
          className="space-y-4 text-xs"
        >
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nama Tampilan Aplikasi
            </label>
            <input
              type="text"
              required
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Deskripsi
            </label>
            <textarea
              rows={2}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5 pt-1">
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1 text-xs">
                Batas Retensi (Hari)
              </label>
              <input
                type="number"
                min={1}
                required
                value={editRetentionDays}
                onChange={(e) => setEditRetentionDays(parseInt(e.target.value) || 1)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-indigo-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-indigo-400"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Backup &gt; {editRetentionDays} hari dibersihkan.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1 text-xs">
                Minimum Keep (File)
              </label>
              <input
                type="number"
                min={1}
                required
                value={editMinKeep}
                onChange={(e) => setEditMinKeep(parseInt(e.target.value) || 1)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                File terbaru selalu dilindungi.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/70 p-3.5 dark:border-indigo-900/50 dark:bg-indigo-950/30 text-indigo-950 dark:text-indigo-200 leading-relaxed">
            <span className="font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5 mb-1 text-xs">
              <Clock className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              Info Pembersihan Otomatis
            </span>
            Sistem cron berjalan otomatis setiap hari pada 23:30 WIB. File backup yang usianya melebihi {editRetentionDays} hari akan masuk masa karantina 7 hari sebelum dihapus permanen dari penyimpanan.
          </div>

          <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={() => setEditingApp(null)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={updateAppMutation.isPending}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-50"
            >
              {updateAppMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Kelola API Key */}
      <Modal
        isOpen={!!activeAppKeys}
        onClose={() => {
          setActiveAppKeys(null);
          setIsCreateKeyOpen(false);
        }}
        title={`API Key — ${activeAppKeys?.display_name}`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3.5 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400">
              API key hanya berhak upload file backup (scope: <strong className="font-semibold text-slate-800 dark:text-slate-200">upload-only</strong>).
            </span>
            {!isCreateKeyOpen && (
              <button
                onClick={() => setIsCreateKeyOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 shrink-0 shadow-2xs"
              >
                <Plus className="h-4 w-4" /> Buat Key Baru
              </button>
            )}
          </div>

          {/* Form Buat Key Baru */}
          {isCreateKeyOpen && (
            <div className="rounded-xl border border-indigo-200/90 bg-indigo-50/50 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30 space-y-3.5 animate-slide-down">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-1.5">
                  <KeyRound className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  Buat API Key Baru
                </h4>
                <button
                  type="button"
                  onClick={() => setIsCreateKeyOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Label / Nama Key
                </label>
                <input
                  type="text"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="Contoh: Server DB Production Utama"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  IP Allowlist (Opsional)
                </label>
                <input
                  type="text"
                  value={keyIPAllowlist}
                  onChange={(e) => setKeyIPAllowlist(e.target.value)}
                  placeholder="Contoh: 103.12.4.5, 10.0.0.0/16 (kosongkan jika dari IP mana saja)"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 font-mono"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Bisa berupa IP tunggal atau format CIDR, dipisahkan tanda koma.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateKeyOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => createKeyMutation.mutate()}
                  disabled={createKeyMutation.isPending || !keyName.trim()}
                  className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 shadow-2xs transition-colors disabled:opacity-50"
                >
                  {createKeyMutation.isPending ? 'Membuat...' : 'Generate 256-bit Key'}
                </button>
              </div>
            </div>
          )}

          {/* List existing keys */}
          <div className="space-y-2.5 mt-3">
            {(!keys || keys.length === 0) ? (
              <div className="py-8 text-center text-xs text-slate-400 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                Belum ada API Key untuk aplikasi ini. Klik tombol <span className="font-semibold text-indigo-600 dark:text-indigo-400">Buat Key Baru</span> di atas.
              </div>
            ) : (
              keys.map((k) => (
                <div
                  key={k.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5 dark:border-slate-800 dark:bg-darkSurface shadow-2xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate">
                        {k.name}
                      </span>
                      <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md border border-slate-200/80 dark:border-slate-700/80 font-medium">
                        {k.key_prefix}...
                      </span>
                      {k.revoked_at ? (
                        <span className="rounded-full bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/40 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400">
                          Dicabut
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          Aktif
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>Dibuat: {formatDate(k.created_at)}</span>
                      {k.last_used_at && <span>Terakhir dipakai: {formatDate(k.last_used_at)}</span>}
                      {k.ip_allowlist && (
                        <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-mono">
                          <Globe className="h-3 w-3" /> {k.ip_allowlist}
                        </span>
                      )}
                    </div>
                  </div>

                  {!k.revoked_at && (
                    <button
                      onClick={() => {
                        if (confirm('Yakin ingin mencabut API Key ini? Aplikasi tidak akan bisa upload dengan key ini.')) {
                          revokeKeyMutation.mutate(k.id);
                        }
                      }}
                      title="Cabut Akses Key"
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/60 transition-colors self-end sm:self-center"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Cabut</span>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* Modal Tampilan Raw API Key (Hanya Muncul Sekali) */}
      <Modal
        isOpen={!!createdRawKey}
        onClose={() => setCreatedRawKey(null)}
        title="Simpan API Key Baru Anda"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4 text-xs">
          <div className="rounded-xl border border-amber-300/80 bg-amber-50/80 p-3.5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-bold flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              PENTING: Kunci ini hanya ditampilkan sekali!
            </p>
            <p className="mt-1 text-[11px] leading-relaxed">
              Sistem hanya menyimpan hash kriptografis SHA-256 dari key ini di server demi keamanan. Salin dan simpan di file environment atau konfigurasi server klien Anda sekarang.
            </p>
          </div>

          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
              API Key 256-Bit Anda:
            </label>
            <div className="flex items-center justify-between rounded-xl bg-slate-900 p-3 font-mono text-emerald-400 text-xs border border-slate-800 shadow-inner gap-2">
              <span className="break-all select-all font-mono leading-relaxed">{createdRawKey}</span>
              <button
                onClick={() => copyToClipboard(createdRawKey || '')}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-sans text-xs transition-colors"
                title="Salin Key"
              >
                {copiedKey ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-semibold">Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Salin</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex justify-end">
            <button
              onClick={() => setCreatedRawKey(null)}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700 shadow-sm transition-colors"
            >
              Saya Sudah Menyimpan Key
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
