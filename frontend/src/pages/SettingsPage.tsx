import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { apiRequest, formatBytes, formatDate } from '../lib/api';
import { Application, User as UserModel } from '../types';
import { Modal } from '../components/Modal';
import { 
  Shield, KeyRound, 
  Copy, Check, AlertTriangle, Terminal,
  User, Lock, CheckCircle2, Clock, Play,
  Sliders, CheckSquare, History,
  Users, UserPlus, Key, Trash2, Eye
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const isReadOnlyAdmin = isAdmin && (!user?.can_edit && !user?.can_delete);
  const canAdminEdit = isAdmin && user?.can_edit !== false;
  const canAdminDelete = isAdmin && user?.can_delete !== false;
  const isAdminOrViewer = isAdmin;

  // Retention query & mutations
  const { data: apps } = useQuery<Application[]>({
    queryKey: ['apps'],
    queryFn: () => apiRequest<Application[]>('/api/v1/apps'),
    enabled: isAdminOrViewer,
  });

  const { data: retentionRuns, refetch: refetchRuns } = useQuery<any[]>({
    queryKey: ['retention-runs'],
    queryFn: () => apiRequest<any[]>('/api/v1/retention/runs'),
    enabled: isAdminOrViewer,
  });

  const [retentionRunResult, setRetentionRunResult] = useState<any | null>(null);

  const runRetentionMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      return apiRequest<any>(`/api/v1/retention/trigger?dry_run=${dryRun ? 'true' : 'false'}`, {
        method: 'POST',
      });
    },
    onSuccess: (data) => {
      setRetentionRunResult(data);
      refetchRuns();
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: (err: any) => {
      alert(`Gagal mengeksekusi retensi: ${err.message}`);
    },
  });

  // Profile / Email update state
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [profilePassword, setProfilePassword] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Password update state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // 2FA Setup state
  const [setupStep, setSetupStep] = useState<'idle' | 'setup' | 'confirm'>('idle');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [confirmCode, setConfirmCode] = useState('');
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Disable 2FA state
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  // Team users query & states (Admin and Viewer can view)
  const { data: teamUsers, refetch: refetchUsers, isLoading: isLoadingUsers } = useQuery<UserModel[]>({
    queryKey: ['team-users'],
    queryFn: () => apiRequest<UserModel[]>('/api/v1/users'),
    enabled: isAdminOrViewer,
  });

  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addRole, setAddRole] = useState<'user' | 'admin'>('user');
  const [addCanView, setAddCanView] = useState(true);
  const [addCanEdit, setAddCanEdit] = useState(true);
  const [addCanDelete, setAddCanDelete] = useState(true);
  const [addQuotaGB, setAddQuotaGB] = useState(15);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [addUserError, setAddUserError] = useState<string | null>(null);

  const [permissionTarget, setPermissionTarget] = useState<UserModel | null>(null);
  const [editCanView, setEditCanView] = useState(true);
  const [editCanEdit, setEditCanEdit] = useState(true);
  const [editCanDelete, setEditCanDelete] = useState(true);
  const [editQuotaGB, setEditQuotaGB] = useState(15);
  const [isUpdatingPermissions, setIsUpdatingPermissions] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const [resetTarget, setResetTarget] = useState<UserModel | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<UserModel | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [userActionMsg, setUserActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const openEditPermissions = (u: UserModel) => {
    setPermissionError(null);
    setEditCanView(u.can_view !== false);
    setEditCanEdit(u.can_edit !== false);
    setEditCanDelete(u.can_delete !== false);
    const gb = Math.round((u.storage_quota_bytes || 16106127360) / (1024 * 1024 * 1024));
    setEditQuotaGB(gb > 0 ? gb : 15);
    setPermissionTarget(u);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddUserError(null);
    if (!addEmail || !addPassword) {
      setAddUserError('Email dan password wajib diisi');
      return;
    }
    if (addPassword.length < 8) {
      setAddUserError('Password minimal 8 karakter');
      return;
    }

    setIsSubmittingUser(true);
    try {
      const quotaBytes = addRole === 'user' ? addQuotaGB * 1024 * 1024 * 1024 : 0;
      await apiRequest('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify({
          email: addEmail,
          password: addPassword,
          role: addRole,
          can_view: addCanView,
          can_edit: addCanEdit,
          can_delete: addCanDelete,
          storage_quota_bytes: quotaBytes,
        }),
      });
      setIsAddUserOpen(false);
      setAddEmail('');
      setAddPassword('');
      setAddRole('user');
      setAddCanView(true);
      setAddCanEdit(true);
      setAddCanDelete(true);
      setAddQuotaGB(15);
      refetchUsers();
      setUserActionMsg({
        type: 'success',
        text: `Pengguna "${addEmail}" berhasil ditambahkan sebagai ${
          addRole === 'admin'
            ? (!addCanEdit && !addCanDelete ? 'Administrator (Hanya-Lihat)' : 'Administrator')
            : `Anggota Tim (${addQuotaGB} GB)`
        }!`,
      });
      setTimeout(() => setUserActionMsg(null), 4000);
    } catch (err: any) {
      setAddUserError(err.message || 'Gagal menambahkan anggota tim');
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleUpdatePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissionTarget) return;
    setPermissionError(null);
    if (permissionTarget.role === 'user' && editQuotaGB <= 0) {
      setPermissionError('Kuota harus lebih besar dari 0 GB');
      return;
    }

    setIsUpdatingPermissions(true);
    try {
      const quotaBytes = permissionTarget.role === 'user' ? editQuotaGB * 1024 * 1024 * 1024 : 0;
      await apiRequest(`/api/v1/users/${permissionTarget.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({
          can_view: editCanView,
          can_edit: editCanEdit,
          can_delete: editCanDelete,
          storage_quota_bytes: quotaBytes,
        }),
      });
      setPermissionTarget(null);
      refetchUsers();
      setUserActionMsg({
        type: 'success',
        text: `Izin dan kuota untuk "${permissionTarget.email}" berhasil diperbarui!`,
      });
      setTimeout(() => setUserActionMsg(null), 4000);
    } catch (err: any) {
      setPermissionError(err.message || 'Gagal memperbarui izin pengguna');
    } finally {
      setIsUpdatingPermissions(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError(null);
    if (resetNewPassword.length < 8) {
      setResetError('Password baru minimal 8 karakter');
      return;
    }

    setIsResetting(true);
    try {
      await apiRequest(`/api/v1/users/${resetTarget.id}/password`, {
        method: 'PUT',
        body: JSON.stringify({ new_password: resetNewPassword }),
      });
      setResetTarget(null);
      setResetNewPassword('');
      setUserActionMsg({ type: 'success', text: `Password untuk ${resetTarget.email} berhasil direset!` });
      setTimeout(() => setUserActionMsg(null), 4000);
    } catch (err: any) {
      setResetError(err.message || 'Gagal mereset password');
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await apiRequest(`/api/v1/users/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      setDeleteTarget(null);
      refetchUsers();
      setUserActionMsg({ type: 'success', text: `Pengguna ${deleteTarget.email} berhasil dihapus!` });
      setTimeout(() => setUserActionMsg(null), 4000);
    } catch (err: any) {
      setDeleteError(err.message || 'Gagal menghapus pengguna');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    if (!newEmail || !profilePassword) {
      setProfileMsg({ type: 'error', text: 'Email dan password saat ini wajib diisi' });
      return;
    }
    setIsUpdatingProfile(true);
    try {
      await apiRequest('/api/v1/auth/profile', {
        method: 'POST',
        body: JSON.stringify({ email: newEmail, current_password: profilePassword }),
      });
      await refreshUser();
      setProfilePassword('');
      setProfileMsg({ type: 'success', text: 'Email login berhasil diperbarui!' });
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: err.message || 'Gagal memperbarui email' });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'error', text: 'Password baru minimal 8 karakter' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Konfirmasi password baru tidak cocok' });
      return;
    }
    setIsUpdatingPassword(true);
    try {
      await apiRequest('/api/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg({ type: 'success', text: 'Password login berhasil diubah!' });
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.message || 'Gagal mengubah password' });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleStartSetup = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await apiRequest<{
        secret: string;
        qr_code_url: string;
        recovery_codes: string[];
      }>('/api/v1/auth/totp/setup', { method: 'POST' });

      setTotpSecret(res.secret);
      setQrCodeUrl(res.qr_code_url);
      setRecoveryCodes(res.recovery_codes);
      setSetupStep('setup');
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memulai setup 2FA');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await apiRequest('/api/v1/auth/totp/confirm', {
        method: 'POST',
        body: JSON.stringify({
          passcode: confirmCode,
          recovery_codes: recoveryCodes,
        }),
      });

      await refreshUser();
      setSetupStep('idle');
      alert('2FA berhasil diaktifkan dan akun Anda sekarang terlindungi!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Kode verifikasi tidak cocok');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await apiRequest('/api/v1/auth/totp/disable', {
        method: 'POST',
        body: JSON.stringify({ passcode: disableCode }),
      });

      await refreshUser();
      setIsDisabling(false);
      setDisableCode('');
      alert('2FA berhasil dinonaktifkan.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Kode verifikasi salah');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl pb-16 md:pb-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
          Pengaturan Akun & Keamanan
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Konfigurasi autentikasi dua faktor (2FA), tampilan, dan instruksi enkripsi
        </p>
      </div>

      {/* Ubah Email / Akun Card */}
      <div className="rounded-2xl border border-[#92B4EC]/70 bg-white p-6 shadow-sm dark:border-[#1E3E62] dark:bg-[#0B192C] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-[#FF6701] dark:text-[#FF6500]" />
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Profil Akun & Email Login</h3>
          </div>
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#FEA82F]/15 text-[#FF6701] dark:bg-[#FF6500]/15 dark:text-[#FF6500]">
            Peran: {user?.role}
          </span>
        </div>

        {profileMsg && (
          <div
            className={`rounded-xl border p-3 text-xs flex items-center gap-2 ${
              profileMsg.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-400'
                : 'border-rose-200 bg-rose-50/60 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400'
            }`}
          >
            {profileMsg.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {profileMsg.text}
          </div>
        )}

        <form onSubmit={handleUpdateEmail} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email Login Saat Ini / Baru
              </label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="admin@domain.com"
                className="w-full rounded-xl border border-[#92B4EC]/80 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#FF6701] focus:ring-2 focus:ring-[#FF6701]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100 dark:focus:border-[#FF6500] dark:focus:ring-[#FF6500]/25"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Password Saat Ini (Konfirmasi)
              </label>
              <input
                type="password"
                required
                value={profilePassword}
                onChange={(e) => setProfilePassword(e.target.value)}
                placeholder="Masukkan password saat ini"
                className="w-full rounded-xl border border-[#92B4EC]/80 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#FF6701] focus:ring-2 focus:ring-[#FF6701]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100 dark:focus:border-[#FF6500] dark:focus:ring-[#FF6500]/25"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isUpdatingProfile}
              className="flex items-center gap-1.5 rounded-xl bg-[#FF6701] hover:bg-[#FF6500] px-4 py-2 text-xs font-bold text-white shadow-md shadow-[#FF6701]/20 disabled:opacity-50 dark:bg-[#FF6500] dark:text-white dark:shadow-[#FF6500]/20 transition-all"
            >
              {isUpdatingProfile ? 'Menyimpan...' : 'Simpan Perubahan Email'}
            </button>
          </div>
        </form>
      </div>

      {/* Ubah Password Card */}
      <div className="rounded-2xl border border-[#92B4EC]/70 bg-white p-6 shadow-sm dark:border-[#1E3E62] dark:bg-[#0B192C] space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-[#FF6701] dark:text-[#FF6500]" />
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Ganti Password Login</h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Gunakan password yang kuat dengan minimal 8 karakter, kombinasi huruf besar, angka, dan simbol.
        </p>

        {passwordMsg && (
          <div
            className={`rounded-xl border p-3 text-xs flex items-center gap-2 ${
              passwordMsg.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-400'
                : 'border-rose-200 bg-rose-50/60 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400'
            }`}
          >
            {passwordMsg.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {passwordMsg.text}
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Password Saat Ini
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Password lama"
                className="w-full rounded-xl border border-[#92B4EC]/80 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#FF6701] focus:ring-2 focus:ring-[#FF6701]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100 dark:focus:border-[#FF6500] dark:focus:ring-[#FF6500]/25"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Password Baru
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 karakter"
                className="w-full rounded-xl border border-[#92B4EC]/80 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#FF6701] focus:ring-2 focus:ring-[#FF6701]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100 dark:focus:border-[#FF6500] dark:focus:ring-[#FF6500]/25"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Konfirmasi Password Baru
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi password baru"
                className="w-full rounded-xl border border-[#92B4EC]/80 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#FF6701] focus:ring-2 focus:ring-[#FF6701]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100 dark:focus:border-[#FF6500] dark:focus:ring-[#FF6500]/25"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isUpdatingPassword}
              className="flex items-center gap-1.5 rounded-xl bg-[#FF6701] hover:bg-[#FF6500] px-4 py-2 text-xs font-bold text-white transition-all shadow-md shadow-[#FF6701]/20 disabled:opacity-50 dark:bg-[#FF6500] dark:text-white dark:shadow-[#FF6500]/20"
            >
              {isUpdatingPassword ? 'Memperbarui...' : 'Perbarui Password'}
            </button>
          </div>
        </form>
      </div>

      {/* 2FA Card */}
      <div className="rounded-2xl border border-[#92B4EC]/70 bg-white p-6 shadow-sm dark:border-[#1E3E62] dark:bg-[#0B192C] space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#FF6701] dark:text-[#FF6500]" />
              Autentikasi Dua Faktor (2FA TOTP)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Melindungi akun Anda menggunakan Google Authenticator, Authy, atau 1Password
            </p>
          </div>

          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
              user?.totp_enabled
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400'
            }`}
          >
            {user?.totp_enabled ? 'Aktif' : 'Belum Aktif'}
          </span>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
            {errorMessage}
          </div>
        )}

        {!user?.totp_enabled ? (
          <div>
            {setupStep === 'idle' ? (
              <button
                onClick={handleStartSetup}
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded-xl bg-[#FF6701] hover:bg-[#FF6500] px-4 py-2.5 text-xs font-bold text-white transition-all shadow-md shadow-[#FF6701]/20 disabled:opacity-50 dark:bg-[#FF6500] dark:text-white dark:shadow-[#FF6500]/20"
              >
                <KeyRound className="h-4 w-4" /> Aktifkan 2FA Sekarang
              </button>
            ) : (
              <form onSubmit={handleConfirmSetup} className="space-y-4 pt-2 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="flex flex-col items-center p-4 bg-slate-50 dark:bg-[#000000] rounded-2xl border border-[#92B4EC]/60 dark:border-[#1E3E62]">
                    <img src={qrCodeUrl} alt="QR Code TOTP" className="h-44 w-44 rounded-lg bg-white p-2 shadow-sm border border-[#92B4EC]/30 dark:border-[#1E3E62]" />
                    <span className="text-[11px] text-slate-400 mt-2">Scan dengan aplikasi Authenticator Anda</span>
                    <div className="mt-2 text-center">
                      <span className="text-[10px] text-slate-400 block">Atau masukkan secret key manual:</span>
                      <code className="text-xs font-mono font-bold text-[#FF6701] dark:text-[#FF6500]">{totpSecret}</code>
                    </div>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="rounded-xl border border-[#FEA82F]/40 bg-[#FEA82F]/10 p-3 text-slate-800 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-200">
                      <p className="font-bold flex items-center gap-1.5 text-[#FF6701] dark:text-[#FF6500]">
                        <AlertTriangle className="h-4 w-4" /> Simpan Kode Pemulihan (Emergency Codes)
                      </p>
                      <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                        Jika ponsel Anda hilang, kode-kode ini adalah satu-satunya cara masuk ke akun:
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-[11px] bg-white dark:bg-[#0B192C] p-2 rounded-lg border border-[#FEA82F]/30 dark:border-[#1E3E62]">
                        {recoveryCodes.map((c, i) => (
                          <div key={i} className="text-slate-800 dark:text-slate-200">{c}</div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={copyCodes}
                        className="mt-2 flex items-center gap-1 text-[11px] font-bold text-[#FF6701] dark:text-[#FF6500] hover:underline"
                      >
                        {copiedCodes ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                        Salin semua kode pemulihan
                      </button>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Masukkan 6 digit kode dari aplikasi Authenticator untuk konfirmasi:
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="123456"
                        value={confirmCode}
                        onChange={(e) => setConfirmCode(e.target.value)}
                        className="w-full text-center tracking-widest font-mono text-base font-bold rounded-xl border border-[#92B4EC]/80 bg-white p-2.5 outline-none focus:border-[#FF6701] focus:ring-2 focus:ring-[#FF6701]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100 dark:focus:border-[#FF6500] dark:focus:ring-[#FF6500]/25"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setSetupStep('idle')}
                        className="rounded-xl px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="rounded-xl bg-[#FF6701] hover:bg-[#FF6500] px-4 py-2 font-bold text-white transition-all shadow-md shadow-[#FF6701]/20 disabled:opacity-50 dark:bg-[#FF6500] dark:text-white dark:shadow-[#FF6500]/20"
                      >
                        {isSubmitting ? 'Mengaktifkan...' : 'Konfirmasi & Aktifkan'}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            )}
          </div>
        ) : (
          <div>
            {!isDisabling ? (
              <button
                onClick={() => setIsDisabling(true)}
                className="text-xs text-rose-500 hover:underline font-medium"
              >
                Nonaktifkan 2FA
              </button>
            ) : (
              <form onSubmit={handleDisable2FA} className="space-y-3 pt-2 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Masukkan kode 2FA untuk menonaktifkan:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="123456"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value)}
                    className="w-48 font-mono text-sm rounded-xl border border-[#92B4EC]/80 bg-white p-2 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100 outline-none focus:border-[#FF6701] dark:focus:border-[#FF6500]"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDisabling(false)}
                    className="rounded-lg px-3 py-1.5 text-slate-600 dark:text-slate-400"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-rose-700"
                  >
                    Konfirmasi Nonaktifkan
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Manajemen Anggota Tim & Kuota Storage (Admin and Viewer) */}
      {isAdminOrViewer && (
        <div className="rounded-2xl border border-[#92B4EC]/70 bg-white p-6 shadow-sm dark:border-[#1E3E62] dark:bg-[#0B192C] space-y-5 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF6701] text-white dark:bg-[#FF6500]">
                <Users className="h-4.5 w-4.5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Manajemen Anggota Tim & Kuota Storage
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Kelola akun tim, peran administrator akses penuh vs hanya-lihat, dan kuota penyimpanan InMeet Drive
                </p>
              </div>
            </div>

            {canAdminEdit && (
              <button
                onClick={() => {
                  setAddUserError(null);
                  setAddEmail('');
                  setAddPassword('');
                  setAddRole('user');
                  setAddCanView(true);
                  setAddCanEdit(true);
                  setAddCanDelete(true);
                  setAddQuotaGB(15);
                  setIsAddUserOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-[#FF6701] hover:bg-[#FF6500] px-3.5 py-2 text-xs font-bold text-white transition-all shadow-md shadow-[#FF6701]/20 dark:bg-[#FF6500] dark:text-white dark:shadow-[#FF6500]/20 shrink-0"
              >
                <UserPlus className="h-4 w-4 text-white" />
                <span>+ Tambah Anggota Tim</span>
              </button>
            )}
          </div>

          {isReadOnlyAdmin && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300 flex items-center gap-2">
              <Eye className="h-4 w-4 shrink-0" />
              <span>Mode Administrator Hanya-Lihat: Anda dapat melihat seluruh daftar anggota tim dan pemakaian kuota, namun tidak memiliki izin menambah pengguna, mengubah izin/kuota, atau menghapus akun.</span>
            </div>
          )}

          {userActionMsg && (
            <div
              className={`rounded-xl border p-3 text-xs flex items-center gap-2 ${
                userActionMsg.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-400'
                  : 'border-rose-200 bg-rose-50/60 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400'
              }`}
            >
              {userActionMsg.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
              {userActionMsg.text}
            </div>
          )}

          {/* Table of Team Users */}
          <div className="overflow-x-auto rounded-xl border border-[#92B4EC]/60 dark:border-[#1E3E62]">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-[#92B4EC]/15 dark:bg-[#000000] text-slate-700 dark:text-slate-300 border-b border-[#92B4EC]/40 dark:border-[#1E3E62]">
                <tr>
                  <th className="px-3.5 py-2.5 font-bold">Email Login</th>
                  <th className="px-3 py-2.5 font-bold">Peran (Role)</th>
                  <th className="px-3 py-2.5 font-bold">Kotak Izin Akses</th>
                  <th className="px-3 py-2.5 font-bold">Kuota InMeet Drive</th>
                  <th className="px-3 py-2.5 font-bold">Tanggal Dibuat</th>
                  <th className="px-3.5 py-2.5 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#92B4EC]/20 dark:divide-[#1E3E62]">
                {isLoadingUsers ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-slate-400">
                      Memuat daftar anggota tim...
                    </td>
                  </tr>
                ) : teamUsers?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-slate-400">
                      Belum ada anggota tim terdaftar.
                    </td>
                  </tr>
                ) : (
                  teamUsers?.map((u) => {
                    const isSelf = u.id === user?.id;
                    const isUserRole = u.role === 'user';
                    const quotaBytes = u.storage_quota_bytes || (isUserRole ? 16106127360 : 0);
                    const usedBytes = u.storage_used_bytes || 0;
                    const percent = quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;
                    const isReadOnlyAdminUser = u.role === 'admin' && (u.can_view !== false && !u.can_edit && !u.can_delete);

                    return (
                      <tr key={u.id} className="hover:bg-[#92B4EC]/5 dark:hover:bg-[#1E3E62]/20">
                        <td className="px-3.5 py-3 font-semibold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            <span>{u.email}</span>
                            {isSelf && (
                              <span className="rounded bg-slate-200 dark:bg-slate-800 px-1.5 py-0.2 text-[9px] font-bold text-slate-600 dark:text-slate-300">
                                Anda
                              </span>
                            )}
                            {u.email === 'admin@inmeet' && (
                              <span className="rounded bg-[#FF6701]/10 text-[#FF6701] dark:bg-[#FF6500]/20 dark:text-[#FF6500] px-1.5 py-0.2 text-[9px] font-bold">
                                Utama
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              u.role === 'admin'
                                ? isReadOnlyAdminUser
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                                  : 'bg-[#FF6701]/15 text-[#FF6701] dark:bg-[#FF6500]/20 dark:text-[#FF6500]'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                            }`}
                          >
                            {u.role === 'admin' ? (isReadOnlyAdminUser ? 'Admin (Hanya Lihat)' : 'Administrator') : 'Anggota Tim'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              u.can_view !== false
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 line-through'
                            }`}>
                              {u.can_view !== false ? '✓' : '✗'} Lihat
                            </span>
                            <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              u.can_edit !== false
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 line-through'
                            }`}>
                              {u.can_edit !== false ? '✓' : '✗'} Edit
                            </span>
                            <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              u.can_delete !== false
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
                                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 line-through'
                            }`}>
                              {u.can_delete !== false ? '✓' : '✗'} Hapus
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {u.role === 'admin' ? (
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Unlimited (Admin)</span>
                          ) : (
                            <div className="space-y-1 min-w-[130px]">
                              <div className="flex justify-between text-[10px] font-mono text-slate-600 dark:text-slate-300">
                                <span>{formatBytes(usedBytes)}</span>
                                <span className="text-slate-400">/ {formatBytes(quotaBytes)} ({percent}%)</span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-[#92B4EC]/30 dark:bg-[#000000] overflow-hidden">
                                <div
                                  className={`h-full ${percent > 90 ? 'bg-rose-500' : 'bg-[#FF6701] dark:bg-[#FF6500]'}`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-slate-500 dark:text-slate-400">
                          {formatDate(u.created_at)}
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          {canAdminEdit ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEditPermissions(u)}
                                title="Ubah Izin Akses & Kuota"
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-800 dark:hover:bg-[#1E3E62] dark:hover:text-[#FF6500] transition-colors"
                              >
                                <Sliders className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setResetError(null);
                                  setResetNewPassword('');
                                  setResetTarget(u);
                                }}
                                title="Reset Password"
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-800 dark:hover:bg-[#1E3E62] dark:hover:text-[#FF6500] transition-colors"
                              >
                                <Key className="h-3.5 w-3.5" />
                              </button>
                              {canAdminDelete && !isSelf && u.email !== 'admin@inmeet' && (
                                <button
                                  onClick={() => {
                                    setDeleteError(null);
                                    setDeleteTarget(u);
                                  }}
                                  title="Hapus Pengguna"
                                  className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Hanya Lihat</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Kebijakan Retensi Otomatis & Pembersihan Storage (Admin) */}
      {isAdmin && (
        <div className="rounded-2xl border border-[#92B4EC]/70 bg-white p-6 shadow-sm dark:border-[#1E3E62] dark:bg-[#0B192C] space-y-5 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#FF6701] dark:text-[#FF6500]" />
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Kebijakan Retensi Otomatis & Pembersihan Storage
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Setiap hari pada 23:30 WIB, sistem memeriksa umur backup untuk tiap aplikasi dan membersihkan data kadaluarsa
                </p>
              </div>
            </div>

            {isAdmin ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => runRetentionMutation.mutate(true)}
                  disabled={runRetentionMutation.isPending}
                  className="flex items-center gap-1.5 rounded-xl border border-[#92B4EC] bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-[#92B4EC]/15 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-200 dark:hover:bg-[#1E3E62]/40 transition-all disabled:opacity-50"
                >
                  <CheckSquare className="h-3.5 w-3.5 text-[#FF6701] dark:text-[#FF6500]" />
                  Simulasi (Dry-Run)
                </button>
                <button
                  onClick={() => {
                    if (confirm('Jalankan pembersihan retensi sekarang? Backup yang melebihi batas hari retensi akan langsung dipindahkan ke masa karantina.')) {
                      runRetentionMutation.mutate(false);
                    }
                  }}
                  disabled={runRetentionMutation.isPending}
                  className="flex items-center gap-1.5 rounded-xl bg-[#FF6701] hover:bg-[#FF6500] px-3.5 py-2 text-xs font-bold text-white transition-all disabled:opacity-50 shadow-md shadow-[#FF6701]/20 dark:bg-[#FF6500] dark:text-white dark:shadow-[#FF6500]/20"
                >
                  <Play className="h-3.5 w-3.5 fill-current text-white" />
                  Jalankan Retensi Sekarang
                </button>
              </div>
            ) : (
              <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 dark:bg-[#000000] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#1E3E62] italic">
                Mode Hanya-Lihat: Eksekusi retensi hanya dapat dipicu oleh Administrator Penuh
              </span>
            )}
          </div>

          {/* Retention Result Banner */}
          {retentionRunResult && (
            <div className="rounded-xl border border-[#92B4EC]/60 bg-[#92B4EC]/10 p-4 dark:border-[#1E3E62] dark:bg-[#000000] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Hasil Eksekusi Retensi ({retentionRunResult.is_dry_run ? 'Simulasi / Dry-Run' : 'Live Execution'})
                </span>
                <span className="text-[10px] text-slate-400">
                  {formatDate(retentionRunResult.triggered_at)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
                <div className="bg-white dark:bg-[#0B192C] p-2 rounded-lg border border-[#92B4EC]/40 dark:border-[#1E3E62]">
                  <span className="text-[10px] text-slate-400 block font-sans">Dikarantina</span>
                  <span className="text-base font-bold text-[#FF6701] dark:text-[#FF6500]">
                    {retentionRunResult.items_quarantined || 0} file
                  </span>
                </div>
                <div className="bg-white dark:bg-[#0B192C] p-2 rounded-lg border border-[#92B4EC]/40 dark:border-[#1E3E62]">
                  <span className="text-[10px] text-slate-400 block font-sans">Dihapus Permanen</span>
                  <span className="text-base font-bold text-rose-500">
                    {retentionRunResult.items_deleted || 0} file
                  </span>
                </div>
                <div className="bg-white dark:bg-[#0B192C] p-2 rounded-lg border border-[#92B4EC]/40 dark:border-[#1E3E62]">
                  <span className="text-[10px] text-slate-400 block font-sans">Ruang Dibebaskan</span>
                  <span className="text-base font-bold text-emerald-500">
                    {formatBytes(retentionRunResult.bytes_freed || 0)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Aturan Retensi Aktif per Aplikasi */}
          <div className="space-y-2">
            <h4 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-[#FF6701] dark:text-[#FF6500]" />
              Aturan Retensi per Aplikasi Saat Ini:
            </h4>
            <div className="divide-y divide-[#92B4EC]/30 dark:divide-[#1E3E62] rounded-xl border border-[#92B4EC]/60 dark:border-[#1E3E62] overflow-hidden">
              {apps?.map((app) => (
                <div key={app.id} className="flex items-center justify-between p-3 bg-white dark:bg-[#000000]">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{app.display_name}</span>
                    <span className="ml-2 font-mono text-[10px] text-slate-400">({app.name})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-[#FEA82F]/15 px-2.5 py-1 text-[11px] font-bold text-[#FF6701] dark:bg-[#FF6500]/15 dark:text-[#FF6500]">
                      Hapus setelah: {app.retention_days} hari
                    </span>
                    <span className="text-[11px] text-slate-400">
                      (Min. Keep: {app.min_keep} file)
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 italic">
              * Untuk mengubah jumlah hari retensi aplikasi tertentu (misal menjadi 5 hari, 7 hari, 14 hari, dll), buka menu <strong>Aplikasi & API Key</strong> lalu klik <strong>Ubah Retensi</strong>.
            </p>
          </div>

          {/* Riwayat Eksekusi Retensi */}
          {retentionRuns && retentionRuns.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]">
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-[#FF6701] dark:text-[#FF6500]" />
                Riwayat Pembersihan Retensi Terakhir:
              </h4>
              <div className="overflow-x-auto rounded-xl border border-[#92B4EC]/60 dark:border-[#1E3E62]">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-[#92B4EC]/15 dark:bg-[#000000] text-slate-700 dark:text-slate-300 border-b border-[#92B4EC]/40 dark:border-[#1E3E62]">
                    <tr>
                      <th className="px-3 py-2 font-bold">Waktu Eksekusi</th>
                      <th className="px-3 py-2 font-bold">Tipe</th>
                      <th className="px-3 py-2 font-bold">Status</th>
                      <th className="px-3 py-2 font-bold">Dikarantina</th>
                      <th className="px-3 py-2 font-bold">Dihapus</th>
                      <th className="px-3 py-2 font-bold">Kapasitas Bebas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#92B4EC]/20 dark:divide-[#1E3E62]">
                    {retentionRuns.slice(0, 5).map((run: any) => (
                      <tr key={run.id} className="hover:bg-[#92B4EC]/5 dark:hover:bg-[#1E3E62]/20">
                        <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                          {formatDate(run.triggered_at)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            run.is_dry_run 
                              ? 'bg-[#FEA82F]/15 text-[#FF6701] dark:bg-[#FEA82F]/20 dark:text-[#FEA82F]' 
                              : 'bg-[#FF6701]/15 text-[#FF6701] dark:bg-[#FF6500]/20 dark:text-[#FF6500]'
                          }`}>
                            {run.is_dry_run ? 'Dry-Run' : 'Live'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-emerald-500 font-bold">
                          {run.status}
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                          {run.items_quarantined || 0}
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                          {run.items_deleted || 0}
                        </td>
                        <td className="px-3 py-2 font-bold text-emerald-500">
                          {formatBytes(run.bytes_freed || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Panduan Enkripsi Klien (Client-Side Encryption) */}
      <div className="rounded-2xl border border-[#92B4EC]/70 bg-white p-6 shadow-sm dark:border-[#1E3E62] dark:bg-[#0B192C] space-y-3 text-xs">
        <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
          <Terminal className="h-4 w-4 text-[#FF6701] dark:text-[#FF6500]" />
          Panduan Enkripsi Sisi Klien (Client-Side with `age`)
        </h3>
        <p className="text-slate-600 dark:text-slate-300">
          Sesuai standar keamanan terbaik, Anda sangat disarankan mengenkripsi database backup sebelum diunggah ke server:
        </p>

        <div className="rounded-2xl bg-[#000000] border border-[#1E3E62] p-4 font-mono text-[11px] text-slate-200 space-y-2 overflow-x-auto shadow-inner">
          <p className="text-slate-500"># 1. Generate keypair di server klien:</p>
          <p className="text-[#FF6500] font-bold">age-keygen -o backup_key.txt</p>
          <p className="text-slate-500"># 2. Dump PostgreSQL + compress + encrypt + upload streaming:</p>
          <p className="text-[#FEA82F] font-bold">
            pg_dump mydb | gzip | age -r &lt;PUBLIC_KEY&gt; &gt; backup.sql.gz.age
          </p>
          <p className="text-slate-500"># 3. Kirim via curl dengan header checksum:</p>
          <p className="text-[#92B4EC]">
            curl -X PUT https://inmeet.cloud/api/v1/upload \<br/>
            &nbsp;&nbsp;-H "Authorization: Bearer $API_KEY" \<br/>
            &nbsp;&nbsp;-H "X-Checksum-SHA256: $(sha256sum backup.sql.gz.age | cut -d' ' -f1)" \<br/>
            &nbsp;&nbsp;--data-binary @backup.sql.gz.age
          </p>
        </div>
      </div>

      {/* Modal Tambah Anggota Tim */}
      <Modal
        isOpen={isAddUserOpen}
        onClose={() => setIsAddUserOpen(false)}
        title="Tambah Anggota Tim Baru"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
          {addUserError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
              {addUserError}
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Email Pengguna
            </label>
            <input
              type="email"
              required
              autoFocus
              placeholder="nama@perusahaan.com"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              className="w-full rounded-xl border border-[#92B4EC]/80 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-[#FF6701] focus:ring-2 focus:ring-[#FF6701]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100 dark:focus:border-[#FF6500]"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Password Awal (Min. 8 Karakter)
            </label>
            <input
              type="password"
              required
              placeholder="Minimal 8 karakter"
              value={addPassword}
              onChange={(e) => setAddPassword(e.target.value)}
              className="w-full rounded-xl border border-[#92B4EC]/80 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-[#FF6701] focus:ring-2 focus:ring-[#FF6701]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100 dark:focus:border-[#FF6500]"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Peran Akun (Role)
            </label>
            <select
              value={addRole}
              onChange={(e) => {
                const r = e.target.value as 'user' | 'admin';
                setAddRole(r);
                if (r === 'admin') {
                  setAddCanView(true);
                  setAddCanEdit(true);
                  setAddCanDelete(true);
                } else {
                  setAddCanView(true);
                  setAddCanEdit(true);
                  setAddCanDelete(true);
                  setAddQuotaGB(15);
                }
              }}
              className="w-full rounded-xl border border-[#92B4EC]/80 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-[#FF6701] dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100 dark:focus:border-[#FF6500]"
            >
              <option value="user">Anggota Tim (User) — Kuota Kustom, Akses Drive Personal</option>
              <option value="admin">Administrator — Kuota Unlimited & Hak Akses Global</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Kotak Ceklis Izin Akses:
            </label>
            <div className="space-y-2">
              <label className="flex items-start gap-2.5 rounded-xl border border-[#92B4EC]/60 bg-white p-3 dark:border-[#1E3E62] dark:bg-[#000000] cursor-pointer hover:border-[#FF6701] transition-colors">
                <input
                  type="checkbox"
                  checked={addCanView}
                  onChange={(e) => setAddCanView(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#FF6701] focus:ring-[#FF6701]"
                />
                <div>
                  <span className="font-bold text-slate-900 dark:text-slate-100 block">Izin Lihat (View & Download)</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Dapat membuka, melihat, dan mengunduh berkas Drive & arsip backup</span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 rounded-xl border border-[#92B4EC]/60 bg-white p-3 dark:border-[#1E3E62] dark:bg-[#000000] cursor-pointer hover:border-[#FF6701] transition-colors">
                <input
                  type="checkbox"
                  checked={addCanEdit}
                  onChange={(e) => setAddCanEdit(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#FF6701] focus:ring-[#FF6701]"
                />
                <div>
                  <span className="font-bold text-slate-900 dark:text-slate-100 block">Izin Edit (Upload, Buat Folder, Pindah & Rename)</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Dapat mengunggah berkas baru, membuat folder, mengganti nama, dan memindahkan data</span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 rounded-xl border border-[#92B4EC]/60 bg-white p-3 dark:border-[#1E3E62] dark:bg-[#000000] cursor-pointer hover:border-[#FF6701] transition-colors">
                <input
                  type="checkbox"
                  checked={addCanDelete}
                  onChange={(e) => setAddCanDelete(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#FF6701] focus:ring-[#FF6701]"
                />
                <div>
                  <span className="font-bold text-slate-900 dark:text-slate-100 block">Izin Hapus (Sampah & Hapus Permanen)</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Dapat memindahkan ke folder sampah, memulihkan, serta mengosongkan sampah</span>
                </div>
              </label>
            </div>
          </div>

          {addRole === 'admin' ? (
            addCanView && !addCanEdit && !addCanDelete ? (
              <div className="rounded-xl border border-blue-300 bg-blue-50/80 p-3 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 text-[11px] space-y-1">
                <span className="font-bold block text-blue-700 dark:text-blue-300">
                  💡 Mode Administrator Hanya-Lihat Aktif:
                </span>
                <p>
                  Dengan hanya mencentang izin <strong>Lihat</strong>, administrator ke-2 ini dapat melihat dan mengunduh seluruh data tim di InMeet Drive, Backup, dan Audit Log tanpa izin perubahan atau penghapusan data.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-[#FEA82F]/40 bg-[#FEA82F]/10 p-3 text-slate-800 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-200 text-[11px] space-y-1">
                <span className="font-bold block text-[#FF6701] dark:text-[#FEA82F]">
                  Hak Akses Administrator:
                </span>
                <p>
                  Administrator memiliki kapasitas penyimpanan unlimited dan dapat mengakses seluruh file tim sesuai kotak ceklis izin yang Anda tentukan di atas.
                </p>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Alokasi Kuota InMeet Drive (GB)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    required
                    value={addQuotaGB}
                    onChange={(e) => setAddQuotaGB(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full rounded-xl border border-[#92B4EC]/80 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-[#FF6701] focus:ring-2 focus:ring-[#FF6701]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100 dark:focus:border-[#FF6500]"
                  />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">GB</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Dapat disesuaikan (misal 15, 20, 50, 100 GB). Setara dengan {formatBytes(addQuotaGB * 1024 * 1024 * 1024)}.
                </p>
              </div>

              <div className="rounded-xl border border-[#92B4EC]/60 bg-[#92B4EC]/10 p-3 dark:border-[#1E3E62] dark:bg-[#000000] space-y-1">
                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                  Hak Akses & Isolasi Anggota Tim:
                </span>
                <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-300 text-[11px]">
                  <li><strong>InMeet Drive:</strong> Terisolasi penuh. Pengguna hanya dapat mengakses file dan folder miliknya sendiri hingga kuota <strong>{addQuotaGB} GB</strong>.</li>
                  <li><strong>Daftar Backup:</strong> Hanya dapat melihat daftar riwayat backup.</li>
                </ul>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]">
            <button
              type="button"
              onClick={() => setIsAddUserOpen(false)}
              className="rounded-xl px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmittingUser}
              className="flex items-center gap-1.5 rounded-xl bg-[#FF6701] hover:bg-[#FF6500] px-4 py-2 font-bold text-white transition-all shadow-md shadow-[#FF6701]/20 disabled:opacity-50 dark:bg-[#FF6500] dark:text-white dark:shadow-[#FF6500]/20"
            >
              {isSubmittingUser ? 'Menyimpan...' : 'Tambah Pengguna'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Reset Password Anggota Tim */}
      <Modal
        isOpen={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title="Reset Password Anggota Tim"
        maxWidth="max-w-md"
      >
        {resetTarget && (
          <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
            {resetError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
                {resetError}
              </div>
            )}

            <div>
              <span className="font-medium text-slate-500 dark:text-slate-400">Pengguna Target:</span>
              <p className="mt-0.5 font-bold text-slate-900 dark:text-white text-sm">{resetTarget.email}</p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Password Baru (Min. 8 Karakter)
              </label>
              <input
                type="password"
                required
                autoFocus
                placeholder="Masukkan password baru"
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
                className="w-full rounded-xl border border-[#92B4EC]/80 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-[#FF6701] focus:ring-2 focus:ring-[#FF6701]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100 dark:focus:border-[#FF6500]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="rounded-xl px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isResetting}
                className="flex items-center gap-1.5 rounded-xl bg-[#FF6701] hover:bg-[#FF6500] px-4 py-2 font-bold text-white transition-all shadow-md shadow-[#FF6701]/20 disabled:opacity-50 dark:bg-[#FF6500] dark:text-white dark:shadow-[#FF6500]/20"
              >
                {isResetting ? 'Menyimpan...' : 'Perbarui Password'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal Konfirmasi Hapus Anggota Tim */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Konfirmasi Hapus Pengguna"
        maxWidth="max-w-md"
      >
        {deleteTarget && (
          <div className="space-y-4 text-xs">
            {deleteError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
                {deleteError}
              </div>
            )}

            <div className="rounded-xl border border-rose-300 bg-rose-50/80 p-3.5 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
              <p className="font-bold">Peringatan Penghapusan Akun</p>
              <p className="mt-1 text-[11px] leading-relaxed">
                Anda akan menghapus akun <strong>{deleteTarget.email}</strong>. Seluruh sesi login dan akses pengguna ini akan dicabut secara permanen.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={isDeleting}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 font-bold text-white transition-all shadow-md shadow-rose-600/20 disabled:opacity-50"
              >
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus Pengguna'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Ubah Izin Akses & Kuota Pengguna */}
      <Modal
        isOpen={!!permissionTarget}
        onClose={() => setPermissionTarget(null)}
        title="Ubah Izin Akses & Kuota Pengguna"
        maxWidth="max-w-lg"
      >
        {permissionTarget && (
          <form onSubmit={handleUpdatePermissions} className="space-y-4 text-xs">
            {permissionError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
                {permissionError}
              </div>
            )}

            <div className="rounded-xl border border-[#92B4EC]/60 bg-[#92B4EC]/10 p-3 dark:border-[#1E3E62] dark:bg-[#000000] flex items-center justify-between">
              <div>
                <span className="font-medium text-slate-500 dark:text-slate-400 block text-[11px]">Pengguna Target:</span>
                <p className="font-bold text-slate-900 dark:text-white text-sm">{permissionTarget.email}</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                permissionTarget.role === 'admin'
                  ? 'bg-[#FF6701]/15 text-[#FF6701] dark:bg-[#FF6500]/20 dark:text-[#FF6500]'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
              }`}>
                {permissionTarget.role === 'admin' ? 'Administrator' : 'Anggota Tim'}
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Kotak Izin Akses (Centang izin yang diberikan):
              </label>
              <div className="space-y-2">
                <label className="flex items-start gap-2.5 rounded-xl border border-[#92B4EC]/60 bg-white p-3 dark:border-[#1E3E62] dark:bg-[#000000] cursor-pointer hover:border-[#FF6701] transition-colors">
                  <input
                    type="checkbox"
                    checked={editCanView}
                    onChange={(e) => setEditCanView(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#FF6701] focus:ring-[#FF6701]"
                  />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">Izin Lihat (View & Download)</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Dapat membuka, melihat, dan mengunduh berkas Drive & backup</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 rounded-xl border border-[#92B4EC]/60 bg-white p-3 dark:border-[#1E3E62] dark:bg-[#000000] cursor-pointer hover:border-[#FF6701] transition-colors">
                  <input
                    type="checkbox"
                    checked={editCanEdit}
                    onChange={(e) => setEditCanEdit(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#FF6701] focus:ring-[#FF6701]"
                  />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">Izin Edit (Upload, Buat Folder, Pindah & Rename)</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Dapat mengunggah berkas baru, membuat folder, mengganti nama, dan memindahkan data</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 rounded-xl border border-[#92B4EC]/60 bg-white p-3 dark:border-[#1E3E62] dark:bg-[#000000] cursor-pointer hover:border-[#FF6701] transition-colors">
                  <input
                    type="checkbox"
                    checked={editCanDelete}
                    onChange={(e) => setEditCanDelete(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#FF6701] focus:ring-[#FF6701]"
                  />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">Izin Hapus (Sampah & Hapus Permanen)</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Dapat memindahkan berkas ke folder sampah, memulihkan, serta mengosongkan sampah</span>
                  </div>
                </label>
              </div>
            </div>

            {permissionTarget.role === 'admin' ? (
              editCanView && !editCanEdit && !editCanDelete ? (
                <div className="rounded-xl border border-blue-300 bg-blue-50/80 p-3 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 text-[11px]">
                  <strong>Mode Administrator Hanya-Lihat Aktif:</strong> Akun administrator ini dapat melihat dan mengunduh seluruh data tim di InMeet Drive, Backup, dan Audit Log tanpa izin perubahan atau penghapusan data.
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/80 p-3 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 text-[11px]">
                  Administrator dengan izin kustom terpilih. Kuota penyimpanan InMeet Drive untuk peran Administrator adalah unlimited.
                </div>
              )
            ) : (
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Alokasi Kuota InMeet Drive (GB)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    required
                    value={editQuotaGB}
                    onChange={(e) => setEditQuotaGB(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full rounded-xl border border-[#92B4EC]/80 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-[#FF6701] focus:ring-2 focus:ring-[#FF6701]/20 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-100 dark:focus:border-[#FF6500]"
                  />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">GB</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Setara dengan {formatBytes(editQuotaGB * 1024 * 1024 * 1024)}.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]">
              <button
                type="button"
                onClick={() => setPermissionTarget(null)}
                className="rounded-xl px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isUpdatingPermissions}
                className="flex items-center gap-1.5 rounded-xl bg-[#FF6701] hover:bg-[#FF6500] px-4 py-2 font-bold text-white transition-all shadow-md shadow-[#FF6701]/20 disabled:opacity-50 dark:bg-[#FF6500] dark:text-white dark:shadow-[#FF6500]/20"
              >
                {isUpdatingPermissions ? 'Menyimpan...' : 'Simpan Izin & Kuota'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
