import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, formatBytes, formatDate } from '../lib/api';
import { DriveItem, DriveListResponse, DriveFolderTreeItem, User as UserModel } from '../types';
import { useDriveUpload } from '../context/DriveUploadContext';
import { useAuth } from '../context/AuthContext';
import { Modal } from '../components/Modal';
import {
  Folder, FolderPlus, Upload, File, FileText, FileArchive,
  FileCode, Image as ImageIcon, Film, Music, Search,
  Grid, List, Trash2, Download, Edit3, ChevronRight,
  ArrowLeft, Home, RefreshCw, Eye, HardDrive,
  FolderArchive, Check, AlertCircle, FolderSymlink, MoveRight,
  RotateCcw, Clock, AlertTriangle
} from 'lucide-react';

interface HierarchicalFolder {
  id: string;
  name: string;
  parent_id: string | null;
  depth: number;
  isDisabled: boolean;
}

function buildFolderHierarchy(
  folders: DriveFolderTreeItem[],
  moveTarget: DriveItem | null
): HierarchicalFolder[] {
  const forbiddenIds = new Set<string>();
  if (moveTarget && moveTarget.type === 'folder') {
    forbiddenIds.add(moveTarget.id);
    const queue = [moveTarget.id];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const children = folders.filter((f) => f.parent_id === parentId);
      for (const child of children) {
        forbiddenIds.add(child.id);
        queue.push(child.id);
      }
    }
  }

  const result: HierarchicalFolder[] = [];
  function traverse(parentId: string | null, depth: number) {
    const children = folders.filter((f) => f.parent_id === parentId);
    for (const child of children) {
      result.push({
        id: child.id,
        name: child.name,
        parent_id: child.parent_id,
        depth,
        isDisabled: forbiddenIds.has(child.id),
      });
      traverse(child.id, depth + 1);
    }
  }
  traverse(null, 0);
  return result;
}

export const DrivePage: React.FC = () => {
  const queryClient = useQueryClient();
  const { startUpload } = useDriveUpload();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canView = user?.can_view !== false;
  const canEdit = user?.can_edit !== false;
  const canDelete = user?.can_delete !== false;
  const isReadOnly = !canEdit && !canDelete;
  const isAdminOrViewer = isAdmin;

  // Navigation State
  const [activeTab, setActiveTab] = useState<'drive' | 'trash'>('drive');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterUserId, setFilterUserId] = useState<string>('all');

  // Modals state
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<DriveItem | null>(null);
  const [newName, setNewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DriveItem | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<DriveItem | null>(null);
  const [isEmptyTrashOpen, setIsEmptyTrashOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<DriveItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<DriveItem | null>(null);
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null);

  // Upload state
  const [isDragOver, setIsDragOver] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Team users query for Admin & Viewer filtering
  const { data: teamUsers } = useQuery<UserModel[]>({
    queryKey: ['team-users'],
    queryFn: () => apiRequest<UserModel[]>('/api/v1/users'),
    enabled: isAdminOrViewer,
  });

  // File input refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Attach webkitdirectory attribute to folder input
  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
    }
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Flash toast auto clear
  useEffect(() => {
    if (actionSuccess) {
      const t = setTimeout(() => setActionSuccess(null), 3000);
      return () => clearTimeout(t);
    }
  }, [actionSuccess]);

  // Fetch Drive items
  const { data, isLoading, isFetching, refetch } = useQuery<DriveListResponse>({
    queryKey: ['drive-items', currentFolderId, debouncedSearch, filterUserId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (currentFolderId) params.set('parent_id', currentFolderId);
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (isAdminOrViewer && filterUserId && filterUserId !== 'all') {
        params.set('user_id', filterUserId);
      }
      return apiRequest<DriveListResponse>(`/api/v1/drive/items?${params.toString()}`);
    },
    enabled: canView,
  });

  // Create Folder Mutation
  const createFolderMutation = useMutation({
    mutationFn: (name: string) => {
      return apiRequest('/api/v1/drive/folder', {
        method: 'POST',
        body: JSON.stringify({
          name,
          parent_id: currentFolderId,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-items'] });
      setIsNewFolderOpen(false);
      setNewFolderName('');
      setActionSuccess('Folder baru berhasil dibuat!');
    },
    onError: (err: any) => {
      setActionError(err.message || 'Gagal membuat folder');
    },
  });

  // Rename Item Mutation
  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => {
      return apiRequest(`/api/v1/drive/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-items'] });
      setRenameTarget(null);
      setNewName('');
      setActionSuccess('Nama berhasil diubah!');
    },
    onError: (err: any) => {
      setActionError(err.message || 'Gagal mengubah nama');
    },
  });

  // Delete Item Mutation (Moves to Kotak Sampah / 7-Day Quarantine)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      return apiRequest(`/api/v1/drive/items/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-items'] });
      queryClient.invalidateQueries({ queryKey: ['drive-trash'] });
      queryClient.invalidateQueries({ queryKey: ['stats-summary'] });
      setDeleteTarget(null);
      setActionSuccess('Item berhasil dipindahkan ke Kotak Sampah (Karantina 7 hari)');
    },
    onError: (err: any) => {
      setActionError(err.message || 'Gagal memindahkan item ke sampah');
    },
  });

  // Fetch Trash items
  const {
    data: trashData,
    isLoading: isTrashLoading,
    isFetching: isTrashFetching,
    refetch: refetchTrash,
  } = useQuery<{ items: DriveItem[] }>({
    queryKey: ['drive-trash', filterUserId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (isAdminOrViewer && filterUserId && filterUserId !== 'all') {
        params.set('user_id', filterUserId);
      }
      const qs = params.toString() ? `?${params.toString()}` : '';
      return apiRequest<{ items: DriveItem[] }>(`/api/v1/drive/trash${qs}`);
    },
    enabled: canView,
  });

  // Restore Trash Item Mutation
  const restoreMutation = useMutation({
    mutationFn: (id: string) => {
      return apiRequest(`/api/v1/drive/trash/${id}/restore`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-trash'] });
      queryClient.invalidateQueries({ queryKey: ['drive-items'] });
      queryClient.invalidateQueries({ queryKey: ['stats-summary'] });
      setActionSuccess('Item berhasil dipulihkan ke Drive Saya!');
    },
    onError: (err: any) => {
      setActionError(err.message || 'Gagal memulihkan item');
    },
  });

  // Permanent Delete Mutation
  const permanentDeleteMutation = useMutation({
    mutationFn: (id: string) => {
      return apiRequest(`/api/v1/drive/trash/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-trash'] });
      queryClient.invalidateQueries({ queryKey: ['stats-summary'] });
      setPermanentDeleteTarget(null);
      setActionSuccess('Item berhasil dihapus secara permanen!');
    },
    onError: (err: any) => {
      setActionError(err.message || 'Gagal menghapus item permanen');
    },
  });

  // Empty Trash Mutation
  const emptyTrashMutation = useMutation({
    mutationFn: () => {
      return apiRequest('/api/v1/drive/trash', {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-trash'] });
      queryClient.invalidateQueries({ queryKey: ['stats-summary'] });
      setIsEmptyTrashOpen(false);
      setActionSuccess('Seluruh isi kotak sampah berhasil dikosongkan!');
    },
    onError: (err: any) => {
      setActionError(err.message || 'Gagal mengosongkan kotak sampah');
    },
  });

  // Fetch all user folders for destination picker
  const { data: allFolders } = useQuery<DriveFolderTreeItem[]>({
    queryKey: ['drive-folders', filterUserId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (isAdminOrViewer && filterUserId && filterUserId !== 'all') {
        params.set('user_id', filterUserId);
      }
      const qs = params.toString() ? `?${params.toString()}` : '';
      return apiRequest<DriveFolderTreeItem[]>(`/api/v1/drive/folders${qs}`);
    },
    enabled: !!moveTarget,
  });

  // Move Item Mutation
  const moveMutation = useMutation({
    mutationFn: ({ id, targetParentId }: { id: string; targetParentId: string | null }) => {
      return apiRequest(`/api/v1/drive/items/${id}/move`, {
        method: 'POST',
        body: JSON.stringify({ target_parent_id: targetParentId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-items'] });
      queryClient.invalidateQueries({ queryKey: ['drive-folders'] });
      setMoveTarget(null);
      setActionSuccess('Item berhasil dipindahkan!');
    },
    onError: (err: any) => {
      setActionError(err.message || 'Gagal memindahkan item');
    },
  });

  const openMoveModal = (item: DriveItem) => {
    setMoveTarget(item);
    setSelectedDestinationId(item.parent_id);
  };

  // Helper to upload list of files using the background chunked resumable upload engine
  const handleUploadFiles = async (files: FileList | File[]) => {
    if (!canEdit) {
      setActionError('Akun Anda tidak memiliki izin untuk mengunggah berkas');
      return;
    }
    if (!files || files.length === 0) return;
    setActionError(null);
    const currentFolderName = data?.current_folder?.name || (currentFolderId ? 'Folder' : 'Drive Saya');
    await startUpload(files, currentFolderId, currentFolderName);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (activeTab === 'trash' || !canEdit) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (activeTab === 'trash' || !canEdit) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  // Icon selector by file extension and mime type
  const getFileIcon = (item: DriveItem) => {
    if (item.type === 'folder') {
      return <Folder className="h-6 w-6 text-[#FF6701] dark:text-[#FF6500]" fill="currentColor" />;
    }

    const name = item.name.toLowerCase();
    const mime = item.mime_type.toLowerCase();

    if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|svg|webp|bmp|ico)$/.test(name)) {
      return <ImageIcon className="h-6 w-6 text-emerald-500" />;
    }
    if (mime.startsWith('video/') || /\.(mp4|mkv|mov|avi|webm)$/.test(name)) {
      return <Film className="h-6 w-6 text-purple-500" />;
    }
    if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|flac|aac)$/.test(name)) {
      return <Music className="h-6 w-6 text-pink-500" />;
    }
    if (mime === 'application/pdf' || name.endsWith('.pdf')) {
      return <FileText className="h-6 w-6 text-red-500" />;
    }
    if (/\.(zip|tar|gz|bz2|7z|rar|xz)$/.test(name)) {
      return <FileArchive className="h-6 w-6 text-amber-500" />;
    }
    if (/\.(js|jsx|ts|tsx|py|go|php|json|html|css|sql|sh|c|cpp|rs|java)$/.test(name)) {
      return <FileCode className="h-6 w-6 text-sky-500" />;
    }
    return <File className="h-6 w-6 text-slate-400 dark:text-slate-500" />;
  };

  const isPreviewable = (item: DriveItem) => {
    if (item.type === 'folder') return false;
    const name = item.name.toLowerCase();
    const mime = item.mime_type.toLowerCase();
    return (
      mime.startsWith('image/') ||
      mime === 'application/pdf' ||
      mime.startsWith('text/') ||
      /\.(jpg|jpeg|png|gif|svg|webp|pdf|txt|md|json)$/.test(name)
    );
  };

  const handleDownload = (item: DriveItem) => {
    const downloadUrl = `/api/v1/drive/items/${item.id}/download`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = item.type === 'folder' ? `${item.name}.zip` : item.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getRemainingQuarantineDays = (trashedAt?: string | null) => {
    if (!trashedAt) return 7;
    const trashedTime = new Date(trashedAt).getTime();
    const now = Date.now();
    const diffMs = now - trashedTime;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const remaining = 7 - diffDays;
    return remaining > 0 ? remaining : 0;
  };

  const folders = data?.items.filter((i) => i.type === 'folder') || [];
  const files = data?.items.filter((i) => i.type === 'file') || [];
  const trashItems = trashData?.items || [];
  const filteredTrashItems = trashItems.filter((item) =>
    !debouncedSearch || item.name.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Akses Dibatasi</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
          Akun Anda tidak memiliki izin untuk melihat InMeet Drive. Hubungi administrator utama untuk meminta izin akses &quot;Lihat&quot;.
        </p>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="space-y-6 relative min-h-[calc(100vh-10rem)]"
    >
      {/* Hidden inputs for uploading files and folders */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        className="hidden"
        onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
      />
      <input
        type="file"
        multiple
        ref={folderInputRef}
        className="hidden"
        onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
      />

      {/* Drag & Drop Visual Overlay */}
      {isDragOver && (
        <div className="fixed inset-0 z-50 bg-[#0B192C]/80 border-4 border-dashed border-[#FF6701] dark:border-[#FF6500] flex flex-col items-center justify-center pointer-events-none animate-fade-in text-white p-6 text-center">
          <Upload className="h-16 w-16 text-[#FF6701] dark:text-[#FF6500] animate-bounce mb-4" />
          <h2 className="text-2xl font-bold tracking-tight">Lepaskan Berkas atau Folder di Sini</h2>
          <p className="text-slate-300 text-sm mt-1">
            Berkas akan langsung diunggah ke {data?.current_folder ? `folder "${data.current_folder.name}"` : 'Drive Saya'}
          </p>
        </div>
      )}

      {/* Success & Error Toasts */}
      {actionSuccess && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-semibold animate-fade-in shadow-xs">
          <Check className="h-4 w-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="flex items-center justify-between gap-2 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-semibold animate-fade-in shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-xs underline hover:opacity-80">
            Tutup
          </button>
        </div>
      )}

      {/* Read-Only Notice Banner */}
      {isReadOnly && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-blue-300 bg-blue-50/80 p-3.5 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 text-xs shadow-xs animate-fade-in">
          <AlertCircle className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <span>
            <strong>{isAdmin ? 'Mode Administrator Hanya-Lihat (Read-Only):' : 'Mode Akses Hanya-Lihat (Read-Only):'}</strong> Anda dapat memantau dan mengunduh berkas, namun tidak memiliki izin untuk mengunggah, mengubah nama, memindahkan, atau menghapus berkas/folder.
          </span>
        </div>
      )}

      {/* Header and Toolbar Bento Box */}
      <div className="rounded-2xl border border-[#92B4EC] bg-white p-5 shadow-xs dark:border-[#1E3E62] dark:bg-[#0B192C]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* Title & Stats */}
          <div className="flex items-start sm:items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#FF6701] text-white dark:bg-[#FF6500] dark:text-white">
              {activeTab === 'trash' ? (
                <Trash2 className="h-6 w-6 text-white" />
              ) : (
                <HardDrive className="h-6 w-6 text-white" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {activeTab === 'trash' ? 'Kotak Sampah Drive' : 'InMeet Drive'}
                </h1>
                <span className="rounded-md border border-[#92B4EC]/50 bg-[#92B4EC]/20 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-[#FEA82F]">
                  {activeTab === 'trash' ? 'KARANTINA 7 HARI' : 'PERSONAL STORAGE'}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {activeTab === 'trash'
                    ? trashData
                    ? `${trashData.items.length} item dalam karantina (${formatBytes(
                        trashData.items.reduce((acc, i) => acc + (i.size_bytes || 0), 0)
                      )})`
                    : 'Memuat data sampah...'
                    : data
                    ? `${data.total_items} item tersimpan`
                    : 'Memuat data...'}
                </p>

                {activeTab === 'drive' && data?.storage_quota_bytes && data.storage_quota_bytes > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                      Kuota: <strong className="text-[#FF6701] dark:text-[#FEA82F]">{formatBytes(data.storage_used_bytes || data.total_bytes)}</strong> / {formatBytes(data.storage_quota_bytes)}
                    </span>
                    <div className="w-20 h-1.5 rounded-full bg-[#92B4EC]/30 dark:bg-[#000000] overflow-hidden">
                      <div
                        className="h-full bg-[#FF6701] dark:bg-[#FF6500]"
                        style={{
                          width: `${Math.min(100, Math.round(((data.storage_used_bytes || data.total_bytes) / data.storage_quota_bytes) * 100))}%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      ({Math.round(((data.storage_used_bytes || data.total_bytes) / data.storage_quota_bytes) * 100)}%)
                    </span>
                  </div>
                ) : activeTab === 'drive' && data ? (
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    ({formatBytes(data.total_bytes)}) · <span className="text-emerald-500 font-bold">Unlimited {isAdmin ? '(Admin)' : ''}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Tab Switcher & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* View Mode Toggle: Drive vs Trash */}
            <div className="flex items-center rounded-xl border border-[#92B4EC] p-0.5 bg-slate-50 dark:border-[#1E3E62] dark:bg-[#000000]">
              <button
                onClick={() => {
                  setActiveTab('drive');
                  setSearchQuery('');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'drive'
                    ? 'bg-[#FF6701] text-white dark:bg-[#FF6500] dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                <HardDrive className="h-3.5 w-3.5" />
                <span>Drive Saya</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('trash');
                  setSearchQuery('');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'trash'
                    ? 'bg-[#FF6701] text-white dark:bg-[#FF6500] dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Kotak Sampah</span>
                {trashData?.items && trashData.items.length > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono leading-none ${
                      activeTab === 'trash'
                        ? 'bg-white text-[#FF6500] font-black'
                        : 'bg-red-500 text-white font-bold'
                    }`}
                  >
                    {trashData.items.length}
                  </span>
                )}
              </button>
            </div>

            {activeTab === 'drive' ? (
              <>
                {canEdit && (
                  <>
                    <button
                      onClick={() => setIsNewFolderOpen(true)}
                      className="flex items-center gap-1.5 rounded-xl border border-[#92B4EC] bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-[#92B4EC]/15 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-200 dark:hover:bg-[#1E3E62]/40 transition-colors"
                    >
                      <FolderPlus className="h-4 w-4 text-[#FF6701] dark:text-[#FF6500]" />
                      <span>+ Folder Baru</span>
                    </button>

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-xl bg-[#FF6701] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#FF6500] dark:bg-[#FF6500] dark:text-white dark:hover:bg-[#FF6701] transition-colors"
                    >
                      <Upload className="h-4 w-4 text-white" />
                      <span>Unggah Berkas</span>
                    </button>

                    <button
                      onClick={() => folderInputRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-xl border border-[#FF6701]/40 bg-[#FF6701]/10 px-3 py-2 text-xs font-bold text-[#FF6701] hover:bg-[#FF6701] hover:text-white dark:border-[#FF6500]/40 dark:bg-[#1E3E62]/60 dark:text-[#FF6500] dark:hover:bg-[#FF6500] dark:hover:text-white transition-colors"
                    >
                      <FolderArchive className="h-4 w-4" />
                      <span>Unggah Folder</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => refetch()}
                  title="Perbarui data"
                  disabled={isFetching}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#92B4EC] text-slate-600 hover:bg-[#92B4EC]/20 dark:border-[#1E3E62] dark:text-slate-300 dark:hover:bg-[#1E3E62] transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                </button>
              </>
            ) : (
              <>
                {canDelete && (
                  <button
                    onClick={() => setIsEmptyTrashOpen(true)}
                    disabled={!trashData?.items || trashData.items.length === 0 || emptyTrashMutation.isPending}
                    className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-4 w-4 text-white" />
                    <span>Kosongkan Sampah</span>
                  </button>
                )}

                <button
                  onClick={() => refetchTrash()}
                  title="Perbarui data sampah"
                  disabled={isTrashFetching}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#92B4EC] text-slate-600 hover:bg-[#92B4EC]/20 dark:border-[#1E3E62] dark:text-slate-300 dark:hover:bg-[#1E3E62] transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${isTrashFetching ? 'animate-spin' : ''}`} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Search & Navigation Bar */}
        <div className="mt-4 pt-4 border-t border-[#92B4EC]/40 dark:border-[#1E3E62] flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Breadcrumb Path or Back to Drive */}
          {activeTab === 'drive' ? (
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto text-xs font-medium text-slate-600 dark:text-slate-300 py-1">
              {currentFolderId && (
                <button
                  onClick={() => {
                    if (data?.breadcrumbs && data.breadcrumbs.length > 1) {
                      const parent = data.breadcrumbs[data.breadcrumbs.length - 2];
                      setCurrentFolderId(parent.id);
                    } else {
                      setCurrentFolderId(null);
                    }
                  }}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-[#92B4EC]/20 dark:hover:bg-[#1E3E62] text-[#FF6701] dark:text-[#FF6500] font-bold"
                  title="Ke folder sebelumnya"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Kembali</span>
                </button>
              )}

              <button
                onClick={() => setCurrentFolderId(null)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 transition-colors ${
                  currentFolderId === null
                    ? 'bg-[#92B4EC]/25 text-[#FF6701] dark:bg-[#1E3E62] dark:text-[#FF6500] font-bold'
                    : 'hover:bg-[#92B4EC]/15 hover:text-slate-900 dark:hover:bg-[#1E3E62]/50'
                }`}
              >
                <Home className="h-3.5 w-3.5" />
                <span>Drive Saya</span>
              </button>

              {data?.breadcrumbs &&
                data.breadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={crumb.id || idx}>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <button
                      onClick={() => setCurrentFolderId(crumb.id)}
                      className={`rounded-lg px-2 py-1 whitespace-nowrap transition-colors ${
                        currentFolderId === crumb.id
                          ? 'bg-[#92B4EC]/25 text-[#FF6701] dark:bg-[#1E3E62] dark:text-[#FF6500] font-bold'
                          : 'hover:bg-[#92B4EC]/15 hover:text-slate-900 dark:hover:bg-[#1E3E62]/50'
                      }`}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 w-full sm:w-auto py-1">
              <button
                onClick={() => setActiveTab('drive')}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-[#FF6701] dark:text-[#FF6500] hover:bg-[#92B4EC]/20 dark:hover:bg-[#1E3E62] transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Kembali ke Drive Saya</span>
              </button>
            </div>
          )}

          {/* User Filter, Search Input & View Toggle */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
            {isAdminOrViewer && (
              <div className="flex items-center gap-1.5">
                <select
                  value={filterUserId}
                  onChange={(e) => {
                    setFilterUserId(e.target.value);
                    setCurrentFolderId(null);
                  }}
                  className="rounded-xl border border-[#92B4EC] bg-white px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:border-[#FF6701] dark:border-[#1E3E62] dark:bg-[#000000] dark:text-white"
                  title="Filter data InMeet Drive berdasarkan pengguna"
                >
                  <option value="all">Semua Pengguna (Semua Tim)</option>
                  {teamUsers?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email} ({u.role === 'admin' ? (u.can_edit === false && u.can_delete === false ? 'Admin (Lihat)' : 'Admin') : 'User'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="relative flex-1 sm:w-52">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder={activeTab === 'trash' ? 'Cari di kotak sampah...' : 'Cari berkas atau folder...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[#92B4EC] bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#FF6701] focus:outline-none dark:border-[#1E3E62] dark:bg-[#000000] dark:text-white"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center rounded-xl border border-[#92B4EC] dark:border-[#1E3E62] p-0.5 bg-slate-50 dark:bg-[#000000]">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-[#FF6701] text-white dark:bg-[#FF6500] dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
                title="Tampilan Kisi (Grid)"
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === 'list'
                    ? 'bg-[#FF6701] text-white dark:bg-[#FF6500] dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
                title="Tampilan Tabel (List)"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Current Folder Info & Space Banner (Only in Drive Tab) */}
      {activeTab === 'drive' && data?.current_folder && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#92B4EC] bg-[#F3F6FD] px-4 py-3 dark:border-[#1E3E62] dark:bg-[#000000] shadow-xs animate-fade-in">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FF6701] text-white dark:bg-[#FF6500] dark:text-white">
              <Folder className="h-5 w-5 text-white" fill="currentColor" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                Folder: {data.current_folder.name}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {data.current_folder.item_count !== undefined ? `${data.current_folder.item_count} item tersimpan` : `${folders.length + files.length} item`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF6701] dark:bg-[#FF6500] text-white px-3 py-1.5 text-xs font-mono font-bold">
              <HardDrive className="h-3.5 w-3.5 text-white" />
              <span>Space Digunakan: {formatBytes(data.current_folder.size_bytes)}</span>
            </span>
            <button
              onClick={() => handleDownload(data.current_folder!)}
              className="flex items-center gap-1.5 rounded-xl border border-[#92B4EC] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-[#92B4EC]/20 dark:border-[#1E3E62] dark:bg-[#0B192C] dark:text-slate-200 transition-colors"
              title="Unduh seluruh isi folder ini sebagai arsip ZIP"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Unduh ZIP</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {activeTab === 'trash' ? (
        <div className="space-y-6">
          {/* Quarantine Information Banner */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-900 dark:text-amber-200 shadow-xs">
            <div className="flex items-start sm:items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Karantina Kotak Sampah (7 Hari)</span>
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-800 dark:text-amber-300">
                    Auto-Purge 23:30 WIB
                  </span>
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                  Berkas dan folder yang Anda hapus diamankan di sini selama 7 hari sebelum dimusnahkan secara permanen oleh sistem. Anda dapat memulihkannya kapan saja ke Drive Saya.
                </p>
              </div>
            </div>
          </div>

          {/* Trash Content */}
          {isTrashLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-28 rounded-2xl border border-[#92B4EC]/50 bg-[#92B4EC]/10 dark:border-[#1E3E62] dark:bg-[#0B192C] animate-pulse"
                />
              ))}
            </div>
          ) : filteredTrashItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-[#92B4EC] dark:border-[#1E3E62] bg-white/50 dark:bg-[#0B192C]/50">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#92B4EC]/20 dark:bg-[#1E3E62] text-slate-400 dark:text-slate-500 mb-4">
                <Trash2 className="h-8 w-8" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {debouncedSearch ? 'Tidak ada item sampah yang cocok' : 'Kotak Sampah Kosong'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                {debouncedSearch
                  ? `Tidak ada berkas di kotak sampah yang cocok dengan pencarian "${debouncedSearch}".`
                  : 'Tidak ada berkas atau folder dalam masa karantina sampah.'}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredTrashItems.map((item) => {
                const remainingDays = getRemainingQuarantineDays(item.trashed_at);
                const isUrgent = remainingDays <= 1;

                return (
                  <div
                    key={item.id}
                    className="group relative flex flex-col justify-between rounded-2xl border border-[#92B4EC] bg-white p-3.5 dark:border-[#1E3E62] dark:bg-[#0B192C] shadow-xs hover:border-[#FF6701] dark:hover:border-[#FF6500] transition-colors"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FEA82F]/15 dark:bg-[#1E3E62]">
                          {getFileIcon(item)}
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                            isUrgent
                              ? 'border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          }`}
                          title={`Dihapus: ${item.trashed_at ? formatDate(item.trashed_at) : '-'}`}
                        >
                          <Clock className="h-3 w-3" />
                          {remainingDays === 0 ? '< 1 hari lagi' : `${remainingDays} hari tersisa`}
                        </span>
                      </div>

                      <div className="mt-3 min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate" title={item.name}>
                          {item.name}
                        </p>
                        <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                          <span>
                            {item.type === 'folder'
                              ? item.item_count !== undefined
                                ? `${item.item_count} item`
                                : 'Folder'
                              : formatBytes(item.size_bytes)}
                          </span>
                          {isAdminOrViewer && filterUserId === 'all' && item.owner_email ? (
                            <span className="font-mono text-[9px] truncate max-w-[80px]" title={`Pemilik: ${item.owner_email}`}>
                              👤 {item.owner_email.split('@')[0]}
                            </span>
                          ) : (
                            <span>{item.trashed_at ? formatDate(item.trashed_at).split(',')[0] : ''}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/60 flex items-center justify-between gap-2">
                      {canDelete || canEdit ? (
                        <>
                          <button
                            onClick={() => restoreMutation.mutate(item.id)}
                            disabled={restoreMutation.isPending}
                            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#FF6701] px-2.5 py-1.5 text-xs font-bold text-white hover:bg-[#FF6500] dark:bg-[#FF6500] dark:text-white transition-colors disabled:opacity-50"
                            title="Pulihkan ke Drive Saya"
                          >
                            <RotateCcw className="h-3.5 w-3.5 text-white" />
                            <span>Pulihkan</span>
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => setPermanentDeleteTarget(item)}
                              className="p-1.5 rounded-xl border border-red-500/30 text-red-600 hover:bg-red-500/15 dark:text-red-400 transition-colors"
                              title="Hapus Permanen"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic text-center w-full py-0.5">
                          Mode Hanya-Lihat
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#92B4EC] bg-white dark:border-[#1E3E62] dark:bg-[#0B192C]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#92B4EC]/40 bg-slate-50/50 dark:border-[#1E3E62] dark:bg-[#000000] text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="px-4 py-3">Nama Berkas / Folder</th>
                      {isAdminOrViewer && filterUserId === 'all' && (
                        <th className="px-4 py-3">Pemilik</th>
                      )}
                      <th className="px-4 py-3">Ukuran</th>
                      <th className="px-4 py-3">Tipe</th>
                      <th className="px-4 py-3">Waktu Masuk Sampah</th>
                      <th className="px-4 py-3">Masa Karantina</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#92B4EC]/30 dark:divide-[#1E3E62]/60">
                    {filteredTrashItems.map((item) => {
                      const remainingDays = getRemainingQuarantineDays(item.trashed_at);
                      const isUrgent = remainingDays <= 1;

                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-[#92B4EC]/10 dark:hover:bg-[#1E3E62]/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="shrink-0">{getFileIcon(item)}</div>
                              <span
                                className="font-bold text-slate-900 dark:text-white truncate max-w-xs"
                                title={item.name}
                              >
                                {item.name}
                              </span>
                            </div>
                          </td>
                          {isAdminOrViewer && filterUserId === 'all' && (
                            <td className="px-4 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {item.owner_email || '-'}
                            </td>
                          )}
                          <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                            {formatBytes(item.size_bytes)}
                          </td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                            {item.type === 'folder'
                              ? `Folder (${item.item_count || 0} item)`
                              : item.mime_type || 'Berkas'}
                          </td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                            {item.trashed_at ? formatDate(item.trashed_at) : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                isUrgent
                                  ? 'border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
                                  : 'border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                              }`}
                            >
                              <Clock className="h-3 w-3" />
                              {remainingDays === 0 ? '< 1 hari lagi' : `${remainingDays} hari tersisa`}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {canDelete || canEdit ? (
                                <>
                                  <button
                                    onClick={() => restoreMutation.mutate(item.id)}
                                    disabled={restoreMutation.isPending}
                                    className="flex items-center gap-1.5 rounded-lg bg-[#FF6701] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#FF6500] dark:bg-[#FF6500] dark:text-white transition-colors disabled:opacity-50"
                                    title="Pulihkan ke Drive Saya"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5 text-white" />
                                    <span>Pulihkan</span>
                                  </button>
                                  {canDelete && (
                                    <button
                                      onClick={() => setPermanentDeleteTarget(item)}
                                      className="p-1.5 rounded-lg border border-red-500/30 text-red-600 hover:bg-red-500/15 dark:text-red-400 transition-colors"
                                      title="Hapus Permanen"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">Hanya Lihat</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-2xl border border-[#92B4EC]/50 bg-[#92B4EC]/10 dark:border-[#1E3E62] dark:bg-[#0B192C] animate-pulse"
            />
          ))}
        </div>
      ) : data?.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-[#92B4EC] dark:border-[#1E3E62] bg-white/50 dark:bg-[#0B192C]/50">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#92B4EC]/20 dark:bg-[#1E3E62] text-[#FF6701] dark:text-[#FF6500] mb-4">
            <Folder className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {debouncedSearch ? 'Tidak ada hasil ditemukan' : 'Folder ini masih kosong'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
            {debouncedSearch
              ? `Tidak ada berkas atau folder yang cocok dengan pencarian "${debouncedSearch}".`
              : 'Tarik dan lepaskan berkas ke sini, atau klik tombol di bawah untuk mulai menyimpan.'}
          </p>
          {!debouncedSearch && canEdit && (
            <div className="flex items-center gap-2 mt-5">
              <button
                onClick={() => setIsNewFolderOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-[#92B4EC] px-3 py-2 text-xs font-bold text-slate-700 hover:bg-[#92B4EC]/20 dark:border-[#1E3E62] dark:text-slate-200"
              >
                <FolderPlus className="h-3.5 w-3.5 text-[#FF6701] dark:text-[#FF6500]" />
                <span>+ Folder Baru</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-xl bg-[#FF6701] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#FF6500] dark:bg-[#FF6500] dark:text-white"
              >
                <Upload className="h-3.5 w-3.5 text-white" />
                <span>Unggah Berkas</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* FOLDERS SECTION (In Grid Mode) */}
          {folders.length > 0 && viewMode === 'grid' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black tracking-wider uppercase text-slate-400 dark:text-slate-500">
                  Folder ({folders.length})
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    onDoubleClick={() => setCurrentFolderId(folder.id)}
                    className="group relative flex items-center justify-between p-3.5 rounded-2xl border border-[#92B4EC] bg-white hover:border-[#FF6701] dark:border-[#1E3E62] dark:bg-[#0B192C] dark:hover:border-[#FF6500] transition-colors cursor-pointer shadow-xs"
                  >
                    <div
                      onClick={() => setCurrentFolderId(folder.id)}
                      className="flex items-center gap-3 min-w-0 flex-1 pr-2"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FEA82F]/20 dark:bg-[#1E3E62]">
                        <Folder className="h-5 w-5 text-[#FF6701] dark:text-[#FF6500]" fill="currentColor" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate" title={folder.name}>
                          {folder.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[8.5px] font-mono font-bold bg-[#FF6701] text-white dark:bg-[#FF6500] dark:text-white leading-none shadow-2xs">
                            <HardDrive className="h-2 w-2 text-white shrink-0" />
                            {formatBytes(folder.size_bytes)}
                          </span>
                          <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                            {folder.item_count !== undefined ? `${folder.item_count} item` : '0 item'}
                          </span>
                          {isAdminOrViewer && filterUserId === 'all' && folder.owner_email && (
                            <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 truncate max-w-[110px]" title={`Pemilik: ${folder.owner_email}`}>
                              👤 {folder.owner_email.split('@')[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions Menu */}
                    <div className="flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      {canEdit && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openMoveModal(folder);
                          }}
                          title="Pindahkan Folder"
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1E3E62] dark:hover:text-white transition-colors"
                        >
                          <FolderSymlink className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(folder);
                        }}
                        title="Download ZIP"
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1E3E62] dark:hover:text-white transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      {canEdit && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameTarget(folder);
                            setNewName(folder.name);
                          }}
                          title="Ganti Nama"
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1E3E62] dark:hover:text-white transition-colors"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(folder);
                          }}
                          title="Hapus"
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-red-500/20 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/20 dark:hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GRID VIEW FOR FILES */}
          {files.length > 0 && viewMode === 'grid' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black tracking-wider uppercase text-slate-400 dark:text-slate-500">
                  Berkas ({files.length})
                </h2>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {files.map((file) => {
                  const isImg = file.mime_type.startsWith('image/');
                  return (
                    <div
                      key={file.id}
                      className="group relative flex flex-col justify-between rounded-2xl border border-[#92B4EC] bg-white p-3 hover:border-[#FF6701] dark:border-[#1E3E62] dark:bg-[#0B192C] dark:hover:border-[#FF6500] transition-colors shadow-xs"
                    >
                      {/* File preview thumbnail or icon */}
                      <div
                        onClick={() => {
                          if (isPreviewable(file)) setPreviewItem(file);
                          else handleDownload(file);
                        }}
                        className="h-24 w-full rounded-xl bg-slate-50 dark:bg-[#000000] flex items-center justify-center overflow-hidden cursor-pointer relative"
                      >
                        {isImg ? (
                          <img
                            src={`/api/v1/drive/items/${file.id}/download?inline=1`}
                            alt={file.name}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="p-3">{getFileIcon(file)}</div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                          <Eye className="h-5 w-5" />
                        </div>
                      </div>

                      {/* File Info */}
                      <div className="mt-2.5 min-w-0">
                        <p
                          className="text-xs font-bold text-slate-900 dark:text-white truncate"
                          title={file.name}
                        >
                          {file.name}
                        </p>
                        <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                          <span>{formatBytes(file.size_bytes)}</span>
                          {isAdminOrViewer && filterUserId === 'all' && file.owner_email ? (
                            <span className="font-mono text-[9px] truncate max-w-[80px]" title={`Pemilik: ${file.owner_email}`}>
                              👤 {file.owner_email.split('@')[0]}
                            </span>
                          ) : (
                            <span>{formatDate(file.created_at).split(',')[0]}</span>
                          )}
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="mt-3 pt-2 border-t border-[#92B4EC]/30 dark:border-[#1E3E62]/60 flex items-center justify-between">
                        {canEdit ? (
                          <button
                            onClick={() => openMoveModal(file)}
                            title="Pindahkan Berkas"
                            className="p-1 rounded-lg text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1E3E62] dark:hover:text-white transition-colors"
                          >
                            <FolderSymlink className="h-3.5 w-3.5" />
                          </button>
                        ) : <div />}
                        <button
                          onClick={() => handleDownload(file)}
                          title="Unduh"
                          className="p-1 rounded-lg text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1E3E62] dark:hover:text-white transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => {
                              setRenameTarget(file);
                              setNewName(file.name);
                            }}
                            title="Ganti Nama"
                            className="p-1 rounded-lg text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1E3E62] dark:hover:text-white transition-colors"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(file)}
                            title="Hapus"
                            className="p-1 rounded-lg text-slate-500 hover:bg-red-500/20 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/20 dark:hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* LIST VIEW (TABLE) FOR BOTH FOLDERS & FILES */}
          {viewMode === 'list' && (folders.length > 0 || files.length > 0) && (
            <div className="overflow-hidden rounded-2xl border border-[#92B4EC] bg-white dark:border-[#1E3E62] dark:bg-[#0B192C]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#92B4EC]/40 bg-slate-50/50 dark:border-[#1E3E62] dark:bg-[#000000] text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="px-4 py-3">Nama Berkas / Folder</th>
                      {isAdminOrViewer && filterUserId === 'all' && (
                        <th className="px-4 py-3">Pemilik</th>
                      )}
                      <th className="px-4 py-3">Space Digunakan</th>
                      <th className="px-4 py-3">Tipe</th>
                      <th className="px-4 py-3">Tanggal Unggah</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#92B4EC]/30 dark:divide-[#1E3E62]/60">
                    {/* Folders Rows */}
                    {folders.map((folder) => (
                      <tr
                        key={folder.id}
                        className="hover:bg-[#92B4EC]/10 dark:hover:bg-[#1E3E62]/30 transition-colors bg-[#FEA82F]/5 dark:bg-[#1E3E62]/10"
                      >
                        <td className="px-4 py-3">
                          <div
                            onClick={() => setCurrentFolderId(folder.id)}
                            className="flex items-center gap-2.5 cursor-pointer group"
                          >
                            <div className="shrink-0">
                              <Folder className="h-5 w-5 text-[#FF6701] dark:text-[#FF6500]" fill="currentColor" />
                            </div>
                            <span className="font-bold text-slate-900 dark:text-white group-hover:text-[#FF6701] dark:group-hover:text-[#FF6500] truncate max-w-xs">
                              {folder.name}
                            </span>
                          </div>
                        </td>
                        {isAdminOrViewer && filterUserId === 'all' && (
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {folder.owner_email || '-'}
                          </td>
                        )}
                        <td className="px-4 py-3 font-mono font-bold text-[#FF6701] dark:text-[#FEA82F]">
                          {formatBytes(folder.size_bytes)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-semibold text-[11px]">
                          Folder ({folder.item_count !== undefined ? `${folder.item_count} item` : '0 item'})
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                          {formatDate(folder.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canEdit && (
                              <button
                                onClick={() => openMoveModal(folder)}
                                title="Pindahkan Folder"
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1E3E62] dark:hover:text-white transition-colors"
                              >
                                <FolderSymlink className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDownload(folder)}
                              title="Download ZIP"
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1E3E62] dark:hover:text-white transition-colors"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            {canEdit && (
                              <button
                                onClick={() => {
                                  setRenameTarget(folder);
                                  setNewName(folder.name);
                                }}
                                title="Ganti Nama"
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1E3E62] dark:hover:text-white transition-colors"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => setDeleteTarget(folder)}
                                title="Hapus"
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-red-500/20 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/20 dark:hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}

                    {/* Files Rows */}
                    {files.map((file) => (
                      <tr
                        key={file.id}
                        className="hover:bg-[#92B4EC]/10 dark:hover:bg-[#1E3E62]/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="shrink-0">{getFileIcon(file)}</div>
                            <span
                              onClick={() => {
                                if (isPreviewable(file)) setPreviewItem(file);
                                else handleDownload(file);
                              }}
                              className="font-bold text-slate-900 dark:text-white hover:text-[#FF6701] dark:hover:text-[#FF6500] cursor-pointer truncate max-w-xs"
                            >
                              {file.name}
                            </span>
                          </div>
                        </td>
                        {isAdminOrViewer && filterUserId === 'all' && (
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {file.owner_email || '-'}
                          </td>
                        )}
                        <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                          {formatBytes(file.size_bytes)}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono text-[11px] truncate max-w-[150px]">
                          {file.mime_type}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                          {formatDate(file.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isPreviewable(file) && (
                              <button
                                onClick={() => setPreviewItem(file)}
                                title="Pratinjau"
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1E3E62] dark:hover:text-white transition-colors"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
                            {canEdit && (
                              <button
                                onClick={() => openMoveModal(file)}
                                title="Pindahkan Berkas"
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1E3E62] dark:hover:text-white transition-colors"
                              >
                                <FolderSymlink className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDownload(file)}
                              title="Unduh"
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1E3E62] dark:hover:text-white transition-colors"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            {canEdit && (
                              <button
                                onClick={() => {
                                  setRenameTarget(file);
                                  setNewName(file.name);
                                }}
                                title="Ganti Nama"
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1E3E62] dark:hover:text-white transition-colors"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => setDeleteTarget(file)}
                                title="Hapus"
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-red-500/20 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/20 dark:hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
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

      {/* MODAL: Buat Folder Baru */}
      <Modal
        isOpen={isNewFolderOpen}
        onClose={() => {
          setIsNewFolderOpen(false);
          setNewFolderName('');
        }}
        title="Buat Folder Baru"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newFolderName.trim()) {
              createFolderMutation.mutate(newFolderName.trim());
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Nama Folder
            </label>
            <input
              type="text"
              autoFocus
              required
              placeholder="Contoh: Dokumen Proyek, Foto, Backup..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="w-full rounded-xl border border-[#92B4EC] bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#FF6701] focus:outline-none dark:border-[#1E3E62] dark:bg-[#000000] dark:text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsNewFolderOpen(false);
                setNewFolderName('');
              }}
              className="rounded-xl border border-[#92B4EC] px-4 py-2 text-xs font-bold text-slate-700 hover:bg-[#92B4EC]/20 dark:border-[#1E3E62] dark:text-slate-300 dark:hover:bg-[#1E3E62]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
              className="rounded-xl bg-[#FF6701] px-4 py-2 text-xs font-bold text-white hover:bg-[#FF6500] dark:bg-[#FF6500] dark:text-white disabled:opacity-50 transition-colors"
            >
              {createFolderMutation.isPending ? 'Membuat...' : 'Buat Folder'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Ganti Nama */}
      <Modal
        isOpen={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        title={`Ganti Nama ${renameTarget?.type === 'folder' ? 'Folder' : 'Berkas'}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (renameTarget && newName.trim()) {
              renameMutation.mutate({ id: renameTarget.id, name: newName.trim() });
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Nama Baru
            </label>
            <input
              type="text"
              autoFocus
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-xl border border-[#92B4EC] bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#FF6701] focus:outline-none dark:border-[#1E3E62] dark:bg-[#000000] dark:text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setRenameTarget(null)}
              className="rounded-xl border border-[#92B4EC] px-4 py-2 text-xs font-bold text-slate-700 hover:bg-[#92B4EC]/20 dark:border-[#1E3E62] dark:text-slate-300 dark:hover:bg-[#1E3E62]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!newName.trim() || renameMutation.isPending}
              className="rounded-xl bg-[#FF6701] px-4 py-2 text-xs font-bold text-white hover:bg-[#FF6500] dark:bg-[#FF6500] dark:text-white disabled:opacity-50 transition-colors"
            >
              {renameMutation.isPending ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Konfirmasi Pindahkan ke Kotak Sampah (Karantina 7 Hari) */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Pindahkan ke Kotak Sampah"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Apakah Anda yakin ingin memindahkan {deleteTarget?.type === 'folder' ? 'folder' : 'berkas'}{' '}
            <strong className="text-slate-900 dark:text-white font-bold">"{deleteTarget?.name}"</strong> ke Kotak Sampah?
          </p>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-300">
              <Clock className="h-4 w-4" />
              <span>Karantina 7 Hari</span>
            </div>
            <p>
              Item tidak langsung terhapus permanen. Item akan disimpan di Kotak Sampah selama 7 hari sebelum dihapus permanen secara otomatis oleh sistem. Anda dapat memulihkannya kapan saja ke Drive Saya.
            </p>
            {deleteTarget?.type === 'folder' && (
              <p className="font-semibold text-red-600 dark:text-red-400 pt-1">
                * Seluruh berkas dan subfolder di dalam folder ini juga akan ikut dipindahkan ke Kotak Sampah.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-xl border border-[#92B4EC] px-4 py-2 text-xs font-bold text-slate-700 hover:bg-[#92B4EC]/20 dark:border-[#1E3E62] dark:text-slate-300 dark:hover:bg-[#1E3E62]"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="flex items-center gap-1.5 rounded-xl bg-[#FF6701] px-4 py-2 text-xs font-bold text-white hover:bg-[#FF6500] dark:bg-[#FF6500] dark:text-white disabled:opacity-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5 text-white" />
              <span>{deleteMutation.isPending ? 'Memindahkan...' : 'Pindahkan ke Sampah'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Konfirmasi Hapus Permanen */}
      <Modal
        isOpen={permanentDeleteTarget !== null}
        onClose={() => setPermanentDeleteTarget(null)}
        title="Hapus Permanen"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold">Peringatan: Tindakan ini permanen!</p>
              <p className="mt-0.5">
                Berkas atau folder akan langsung dimusnahkan dari server dan tidak dapat dipulihkan kembali.
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300">
            Apakah Anda yakin ingin menghapus permanen {permanentDeleteTarget?.type === 'folder' ? 'folder' : 'berkas'}{' '}
            <strong className="text-slate-900 dark:text-white font-bold">"{permanentDeleteTarget?.name}"</strong>?
          </p>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPermanentDeleteTarget(null)}
              className="rounded-xl border border-[#92B4EC] px-4 py-2 text-xs font-bold text-slate-700 hover:bg-[#92B4EC]/20 dark:border-[#1E3E62] dark:text-slate-300 dark:hover:bg-[#1E3E62]"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={permanentDeleteMutation.isPending}
              onClick={() => permanentDeleteTarget && permanentDeleteMutation.mutate(permanentDeleteTarget.id)}
              className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5 text-white" />
              <span>{permanentDeleteMutation.isPending ? 'Menghapus...' : 'Hapus Permanen'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Konfirmasi Kosongkan Kotak Sampah */}
      <Modal
        isOpen={isEmptyTrashOpen}
        onClose={() => setIsEmptyTrashOpen(false)}
        title="Kosongkan Kotak Sampah"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold">Peringatan: Seluruh item akan dihapus permanen!</p>
              <p className="mt-0.5">
                Semua {trashData?.items.length || 0} item di kotak sampah akan segera dihapus permanen dari server. Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300">
            Apakah Anda yakin ingin mengosongkan seluruh isi Kotak Sampah sekarang?
          </p>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsEmptyTrashOpen(false)}
              className="rounded-xl border border-[#92B4EC] px-4 py-2 text-xs font-bold text-slate-700 hover:bg-[#92B4EC]/20 dark:border-[#1E3E62] dark:text-slate-300 dark:hover:bg-[#1E3E62]"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={emptyTrashMutation.isPending}
              onClick={() => emptyTrashMutation.mutate()}
              className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5 text-white" />
              <span>{emptyTrashMutation.isPending ? 'Mengosongkan...' : 'Kosongkan Sekarang'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Pratinjau Berkas (Preview) */}
      <Modal
        isOpen={previewItem !== null}
        onClose={() => setPreviewItem(null)}
        title={previewItem?.name || 'Pratinjau'}
        maxWidth="max-w-2xl"
      >
        {previewItem && (
          <div className="space-y-4">
            <div className="max-h-[60vh] overflow-auto flex items-center justify-center rounded-xl bg-slate-100 dark:bg-[#000000] p-2 border border-[#92B4EC]/50 dark:border-[#1E3E62]">
              {previewItem.mime_type.startsWith('image/') ? (
                <img
                  src={`/api/v1/drive/items/${previewItem.id}/download?inline=1`}
                  alt={previewItem.name}
                  className="max-h-[50vh] max-w-full rounded object-contain"
                />
              ) : previewItem.mime_type === 'application/pdf' ? (
                <iframe
                  src={`/api/v1/drive/items/${previewItem.id}/download?inline=1`}
                  title={previewItem.name}
                  className="w-full h-96 rounded"
                />
              ) : (
                <div className="flex flex-col items-center p-8 text-center text-slate-500">
                  {getFileIcon(previewItem)}
                  <p className="mt-3 text-sm font-semibold">{previewItem.name}</p>
                  <p className="text-xs text-slate-400 mt-1">{previewItem.mime_type}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Ukuran: {formatBytes(previewItem.size_bytes)}</span>
              <span>Diunggah: {formatDate(previewItem.created_at)}</span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => handleDownload(previewItem)}
                className="flex items-center gap-1.5 rounded-xl bg-[#FF6701] px-4 py-2 text-xs font-bold text-white hover:bg-[#FF6500] dark:bg-[#FF6500] dark:text-white transition-colors"
              >
                <Download className="h-4 w-4 text-white" />
                <span>Unduh Berkas</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: Pindahkan Item (File atau Folder ke Subfolder Lain) */}
      <Modal
        isOpen={moveTarget !== null}
        onClose={() => setMoveTarget(null)}
        title={`Pindahkan ${moveTarget?.type === 'folder' ? 'Folder' : 'Berkas'}`}
      >
        {moveTarget && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#92B4EC]/60 bg-[#F3F6FD] p-3 dark:border-[#1E3E62] dark:bg-[#000000]">
              <div className="flex items-center gap-2">
                {moveTarget.type === 'folder' ? (
                  <Folder className="h-4 w-4 text-[#FF6701] dark:text-[#FF6500]" fill="currentColor" />
                ) : (
                  <File className="h-4 w-4 text-[#FF6701] dark:text-[#FF6500]" />
                )}
                <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {moveTarget.name}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Pilih folder tujuan untuk memindahkan item ini:
              </p>
            </div>

            {/* Folder Destination Selector */}
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {/* Root / Drive Saya */}
              <button
                type="button"
                onClick={() => setSelectedDestinationId(null)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${
                  selectedDestinationId === null
                    ? 'border border-[#FF6701] bg-[#FF6701]/10 text-[#FF6701] dark:border-[#FF6500] dark:bg-[#1E3E62] dark:text-[#FF6500]'
                    : 'border border-[#92B4EC]/50 bg-white hover:bg-[#92B4EC]/15 text-slate-700 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Home className="h-4 w-4 text-[#FF6701] dark:text-[#FF6500]" />
                  <span>Drive Saya (Folder Utama)</span>
                </div>
                {moveTarget.parent_id === null && (
                  <span className="text-[10px] text-slate-400 font-normal">(Lokasi Saat Ini)</span>
                )}
              </button>

              {/* Hierarchical Folder list */}
              {allFolders &&
                buildFolderHierarchy(allFolders, moveTarget).map((f) => {
                  const isCurrentParent = moveTarget.parent_id === f.id;
                  const isSelected = selectedDestinationId === f.id;
                  const isDisabled = f.isDisabled;

                  return (
                    <button
                      key={f.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => setSelectedDestinationId(f.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                        isDisabled
                          ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-600'
                          : isSelected
                          ? 'border border-[#FF6701] bg-[#FF6701]/10 text-[#FF6701] dark:border-[#FF6500] dark:bg-[#1E3E62] dark:text-[#FF6500] font-bold'
                          : 'border border-[#92B4EC]/40 bg-white hover:bg-[#92B4EC]/15 text-slate-700 dark:border-[#1E3E62] dark:bg-[#000000] dark:text-slate-300'
                      }`}
                      style={{ paddingLeft: `${Math.max(12, f.depth * 16 + 12)}px` }}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Folder className="h-3.5 w-3.5 text-[#FF6701] dark:text-[#FF6500] shrink-0" fill="currentColor" />
                        <span className="truncate">{f.name}</span>
                      </div>
                      {isCurrentParent ? (
                        <span className="text-[10px] text-slate-400 font-normal shrink-0">(Lokasi Saat Ini)</span>
                      ) : isDisabled ? (
                        <span className="text-[10px] text-slate-400 font-normal shrink-0">(Tidak Dapat Dipilih)</span>
                      ) : null}
                    </button>
                  );
                })}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#92B4EC]/40 dark:border-[#1E3E62]">
              <button
                type="button"
                onClick={() => setMoveTarget(null)}
                className="rounded-xl border border-[#92B4EC] px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-[#92B4EC]/15 dark:border-[#1E3E62] dark:text-slate-300"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={moveTarget.parent_id === selectedDestinationId || moveMutation.isPending}
                onClick={() => {
                  moveMutation.mutate({
                    id: moveTarget.id,
                    targetParentId: selectedDestinationId,
                  });
                }}
                className="flex items-center gap-1.5 rounded-xl bg-[#FF6701] px-4 py-2 text-xs font-bold text-white hover:bg-[#FF6500] dark:bg-[#FF6500] dark:text-white transition-colors disabled:opacity-50"
              >
                <MoveRight className="h-3.5 w-3.5 text-white" />
                <span>{moveMutation.isPending ? 'Memindahkan...' : 'Pindahkan ke Sini'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
