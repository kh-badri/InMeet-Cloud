import React, { useState, useEffect } from 'react';
import {
  Link2,
  Check,
  Users,
  Globe,
  Lock,
  Trash2,
  X,
  File,
  Folder,
  Loader2,
  AlertCircle,
  Shield,
} from 'lucide-react';
import { DriveItem, ItemShareDetailsResponse, ShareRole } from '../types';
import { apiRequest } from '../lib/api';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: DriveItem | null;
  onUpdated?: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  item,
  onUpdated,
}) => {
  const [details, setDetails] = useState<ItemShareDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ShareRole>('viewer');
  const [isInviting, setIsInviting] = useState(false);

  // Public link state
  const [linkActive, setLinkActive] = useState(false);
  const [linkRole, setLinkRole] = useState<ShareRole>('viewer');
  const [isUpdatingLink, setIsUpdatingLink] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const loadDetails = async () => {
    if (!item) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiRequest<ItemShareDetailsResponse>(
        `/api/v1/drive/items/${item.id}/share`
      );
      setDetails(data);
      if (data.public_link) {
        setLinkActive(data.public_link.is_active);
        setLinkRole(data.public_link.role);
      } else {
        setLinkActive(false);
        setLinkRole('viewer');
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat pengaturan berbagi');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && item) {
      setInviteEmail('');
      setError(null);
      setIsCopied(false);
      loadDetails();
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setIsInviting(true);
    setError(null);
    try {
      await apiRequest(`/api/v1/drive/items/${item.id}/share/users`, {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      setInviteEmail('');
      await loadDetails();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Gagal menambahkan akses pengguna');
    } finally {
      setIsInviting(false);
    }
  };

  const handleUpdateUserRole = async (targetEmail: string, newRole: ShareRole) => {
    setError(null);
    try {
      await apiRequest(`/api/v1/drive/items/${item.id}/share/users`, {
        method: 'POST',
        body: JSON.stringify({
          email: targetEmail,
          role: newRole,
        }),
      });
      await loadDetails();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Gagal memperbarui izin');
    }
  };

  const handleRemoveUser = async (targetUserId: string) => {
    setError(null);
    try {
      await apiRequest(`/api/v1/drive/items/${item.id}/share/users/${targetUserId}`, {
        method: 'DELETE',
      });
      await loadDetails();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Gagal menghapus akses');
    }
  };

  const handleTogglePublicLink = async (active: boolean, role: ShareRole = linkRole) => {
    setIsUpdatingLink(true);
    setError(null);
    try {
      const data = await apiRequest(`/api/v1/drive/items/${item.id}/share/link`, {
        method: 'PUT',
        body: JSON.stringify({
          is_active: active,
          role: role,
        }),
      });
      setLinkActive(data.is_active);
      setLinkRole(data.role);
      await loadDetails();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Gagal mengubah pengaturan tautan publik');
    } finally {
      setIsUpdatingLink(false);
    }
  };

  const shareUrl = details?.public_link?.share_token
    ? `${window.location.origin}/share/${details.public_link.share_token}`
    : '';

  const copyToClipboard = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const roleLabel = (role: ShareRole) => {
    switch (role) {
      case 'viewer':
        return 'Pelihat';
      case 'commenter':
        return 'Pengomentar';
      case 'editor':
        return 'Editor';
    }
  };

  const roleDesc = (role: ShareRole) => {
    switch (role) {
      case 'viewer':
        return 'Dapat melihat dan mengunduh berkas/folder';
      case 'commenter':
        return 'Dapat melihat, mengunduh, dan mengirim komentar';
      case 'editor':
        return 'Dapat mengunggah, membuat folder, mengedit nama, dan berkomentar';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-darkBorder bg-slate-50/50 dark:bg-slate-900/30">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-[#FF6701] dark:bg-orange-950/40 dark:text-[#FF6500]">
              {item.type === 'folder' ? (
                <Folder className="h-5 w-5 fill-[#FF6701]/20 dark:fill-[#FF6500]/20" />
              ) : (
                <File className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                Bagikan "{item.name}"
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Atur siapa saja yang dapat mengakses item ini
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="flex items-center gap-2 p-3 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-900/40">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="h-7 w-7 animate-spin text-[#FF6701]" />
              <span className="text-xs">Memuat izin berbagi...</span>
            </div>
          ) : (
            <>
              {/* Add people form */}
              {details?.can_manage_share && (
                <form onSubmit={handleInviteUser} className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                    <span>Tambahkan orang atau anggota tim</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="Masukkan email anggota tim..."
                      className="flex-1 rounded-xl border border-slate-200 dark:border-darkBorder bg-slate-50/50 dark:bg-slate-900/50 px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#FF6701] focus:ring-1 focus:ring-[#FF6701] outline-none transition-all"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as ShareRole)}
                      className="rounded-xl border border-slate-200 dark:border-darkBorder bg-slate-50/50 dark:bg-slate-900/50 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 focus:border-[#FF6701] outline-none cursor-pointer"
                    >
                      <option value="viewer">Pelihat</option>
                      <option value="commenter">Pengomentar</option>
                      <option value="editor">Editor</option>
                    </select>
                    <button
                      type="submit"
                      disabled={isInviting || !inviteEmail.trim()}
                      className="rounded-xl bg-[#FF6701] hover:bg-[#e05a00] text-white px-4 py-2 text-xs font-semibold shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isInviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Kirim'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {roleDesc(inviteRole)}
                  </p>
                </form>
              )}

              {/* People with access list */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Orang yang memiliki akses
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-darkBorder rounded-xl border border-slate-100 dark:border-darkBorder overflow-hidden">
                  {/* Owner */}
                  <div className="flex items-center justify-between p-3 bg-white dark:bg-darkCard hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-300">
                        {(details?.item?.owner_email || 'O')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                          {details?.item?.owner_email || 'Pemilik'}
                        </p>
                        <p className="text-[10px] text-slate-400">Pemilik berkas</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md">
                      Pemilik
                    </span>
                  </div>

                  {/* Shared users */}
                  {details?.shares && details.shares.length > 0 ? (
                    details.shares.map((share) => (
                      <div
                        key={share.id}
                        className="flex items-center justify-between p-3 bg-white dark:bg-darkCard hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold">
                            {(share.shared_with_email || 'U')[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                              {share.shared_with_email}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {roleDesc(share.role)}
                            </p>
                          </div>
                        </div>

                        {details.can_manage_share ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={share.role}
                              onChange={(e) =>
                                handleUpdateUserRole(
                                  share.shared_with_email,
                                  e.target.value as ShareRole
                                )
                              }
                              className="rounded-lg border border-slate-200 dark:border-darkBorder bg-slate-50 dark:bg-slate-800/80 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                            >
                              <option value="viewer">Pelihat</option>
                              <option value="commenter">Pengomentar</option>
                              <option value="editor">Editor</option>
                            </select>
                            <button
                              onClick={() => handleRemoveUser(share.shared_with_user_id)}
                              title="Hapus akses"
                              className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 px-2.5 py-1">
                            {roleLabel(share.role)}
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-center text-xs text-slate-400">
                      Belum ada pengguna khusus yang ditambahkan
                    </div>
                  )}
                </div>
              </div>

              {/* General Access (Public link) */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Akses umum
                </h3>
                <div className="rounded-xl border border-slate-200 dark:border-darkBorder p-4 space-y-3.5 bg-slate-50/50 dark:bg-slate-900/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${
                          linkActive
                            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                            : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {linkActive ? (
                          <Globe className="h-5 w-5" />
                        ) : (
                          <Lock className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {linkActive
                            ? 'Siapa saja yang memiliki link'
                            : 'Dibatasi'}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {linkActive
                            ? 'Siapa saja di internet yang memiliki link ini dapat membuka tanpa perlu login'
                            : 'Hanya orang yang ditambahkan di atas yang dapat mengakses item ini'}
                        </p>
                      </div>
                    </div>

                    {details?.can_manage_share && (
                      <select
                        value={linkActive ? 'public' : 'restricted'}
                        disabled={isUpdatingLink}
                        onChange={(e) =>
                          handleTogglePublicLink(e.target.value === 'public')
                        }
                        className="rounded-lg border border-slate-200 dark:border-darkBorder bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                      >
                        <option value="restricted">Dibatasi</option>
                        <option value="public">Siapa saja yang memiliki link</option>
                      </select>
                    )}
                  </div>

                  {/* Role picker for public link */}
                  {linkActive && (
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-darkBorder/60">
                      <div className="text-[11px] text-slate-500">
                        <span>Izin pengunjung link: </span>
                        <strong className="text-slate-700 dark:text-slate-300 font-semibold">
                          {roleLabel(linkRole)}
                        </strong>
                        <span className="block text-[10px] text-slate-400 mt-0.5">
                          {roleDesc(linkRole)}
                        </span>
                      </div>

                      {details?.can_manage_share && (
                        <select
                          value={linkRole}
                          disabled={isUpdatingLink}
                          onChange={(e) =>
                            handleTogglePublicLink(true, e.target.value as ShareRole)
                          }
                          className="rounded-lg border border-slate-200 dark:border-darkBorder bg-white dark:bg-slate-800 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                        >
                          <option value="viewer">Pelihat</option>
                          <option value="commenter">Pengomentar</option>
                          <option value="editor">Editor</option>
                        </select>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-darkBorder bg-slate-50/70 dark:bg-slate-900/40 flex items-center justify-between gap-3">
          {linkActive && shareUrl ? (
            <button
              onClick={copyToClipboard}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                isCopied
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800'
                  : 'bg-white dark:bg-darkCard text-slate-700 dark:text-slate-200 border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {isCopied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Link Berhasil Disalin!</span>
                </>
              ) : (
                <>
                  <Link2 className="h-3.5 w-3.5 text-slate-500" />
                  <span>Salin Link</span>
                </>
              )}
            </button>
          ) : (
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              <span>Akses privat terlindungi</span>
            </div>
          )}

          <button
            onClick={onClose}
            className="rounded-xl bg-[#FF6701] hover:bg-[#e05a00] text-white px-5 py-2 text-xs font-semibold shadow-sm transition-all"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
