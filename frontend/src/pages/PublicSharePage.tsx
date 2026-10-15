import React, { useState, useEffect, useRef } from 'react';
import {
  Cloud,
  Folder,
  Download,
  MessageSquare,
  Globe,
  Upload,
  FolderPlus,
  ArrowLeft,
  ChevronRight,
  Eye,
  Send,
  Loader2,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  Archive,
  Code,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import { PublicSharedItemResponse, DriveItem, DriveComment, ShareRole } from '../types';
import { formatBytes, formatDate } from '../lib/api';

interface PublicSharePageProps {
  token: string;
}

export const PublicSharePage: React.FC<PublicSharePageProps> = ({ token }) => {
  const [data, setData] = useState<PublicSharedItemResponse | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Comments state
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<DriveComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentAuthor, setCommentAuthor] = useState('');
  const [commentContent, setCommentContent] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Editor actions (New folder & upload)
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Theme state: default to light mode
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('bv_theme_v2') || localStorage.getItem('theme');
    if (saved === 'dark') return true;
    return false; // Default light mode
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleDarkMode = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('bv_theme_v2', 'light');
      localStorage.setItem('theme', 'light');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('bv_theme_v2', 'dark');
      localStorage.setItem('theme', 'dark');
      setIsDarkMode(true);
    }
  };

  const loadSharedItem = async (parentId?: string | null) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = parentId
        ? `/api/v1/public/share/${token}?parent_id=${parentId}`
        : `/api/v1/public/share/${token}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Tautan tidak valid atau telah berakhir');
      }
      setData(json);
      setCurrentFolderId(parentId || null);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat item');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSharedItem();
  }, [token]);

  // Load comments
  const loadComments = async (itemId?: string) => {
    if (!token) return;
    setCommentsLoading(true);
    try {
      const targetId = itemId || data?.item?.id;
      const url = targetId
        ? `/api/v1/public/share/${token}/comments?item_id=${targetId}`
        : `/api/v1/public/share/${token}/comments`;
      const res = await fetch(url);
      const json = await res.json();
      if (res.ok) {
        setComments(json || []);
      }
    } catch {
      // ignore
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    if (showComments) {
      loadComments(data?.item?.id);
    }
  }, [showComments, data?.item?.id]);

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentContent.trim() || !data) return;

    setIsSubmittingComment(true);
    try {
      const targetId = data.item.id;
      const res = await fetch(`/api/v1/public/share/${token}/comments?item_id=${targetId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author_name: commentAuthor.trim() || 'Tamu',
          content: commentContent.trim(),
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Gagal mengirim komentar');
      }
      setCommentContent('');
      await loadComments(targetId);
      setData((prev) =>
        prev ? { ...prev, comments_count: (prev.comments_count || 0) + 1 } : prev
      );
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    setIsCreatingFolder(true);
    try {
      const res = await fetch(`/api/v1/public/share/${token}/folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parent_id: currentFolderId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Gagal membuat folder');
      }
      setNewFolderName('');
      setShowNewFolderModal(false);
      await loadSharedItem(currentFolderId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(`Mengunggah ${files[0].name}...`);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Mengunggah (${i + 1}/${files.length}): ${file.name}...`);

        const formData = new FormData();
        formData.append('file', file);
        if (currentFolderId) {
          formData.append('parent_id', currentFolderId);
        }

        const res = await fetch(`/api/v1/public/share/${token}/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || `Gagal mengunggah ${file.name}`);
        }
      }
      await loadSharedItem(currentFolderId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const roleBadge = (role: ShareRole) => {
    switch (role) {
      case 'viewer':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
            <Eye className="h-3 w-3" />
            <span>Pelihat</span>
          </span>
        );
      case 'commenter':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
            <MessageSquare className="h-3 w-3" />
            <span>Pengomentar</span>
          </span>
        );
      case 'editor':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
            <Globe className="h-3 w-3" />
            <span>Editor</span>
          </span>
        );
    }
  };

  const getFileIcon = (item: DriveItem) => {
    if (item.type === 'folder') {
      return <Folder className="h-5 w-5 text-amber-500 fill-amber-500/20" />;
    }
    const mime = item.mime_type || '';
    if (mime.startsWith('image/')) return <ImageIcon className="h-5 w-5 text-emerald-500" />;
    if (mime.startsWith('video/')) return <Video className="h-5 w-5 text-indigo-500" />;
    if (mime.startsWith('audio/')) return <Music className="h-5 w-5 text-purple-500" />;
    if (mime.includes('zip') || mime.includes('tar') || mime.includes('rar'))
      return <Archive className="h-5 w-5 text-rose-500" />;
    if (mime.includes('text/') || mime.includes('json') || mime.includes('javascript'))
      return <Code className="h-5 w-5 text-cyan-500" />;
    return <FileText className="h-5 w-5 text-blue-500" />;
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-lightBg dark:bg-darkBg p-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF6701] text-white shadow-md">
            <Cloud className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
              InMeet Drive
            </h1>
            <p className="text-xs text-slate-500">Memuat berkas bersama...</p>
          </div>
          <Loader2 className="h-6 w-6 animate-spin text-[#FF6701]" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-lightBg dark:bg-darkBg p-4">
        <div className="max-w-md w-full bg-white dark:bg-darkCard rounded-2xl border border-slate-200 dark:border-darkBorder p-8 text-center shadow-xl space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
            <AlertCircle className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Tautan Tidak Dapat Diakses
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {error || 'Tautan ini mungkin telah dinonaktifkan atau dihapus oleh pemiliknya.'}
            </p>
          </div>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF6701] text-white text-xs font-semibold hover:bg-[#e05a00] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Kembali ke Halaman Utama</span>
          </a>
        </div>
      </div>
    );
  }

  const { item, role, items = [], breadcrumbs = [], comments_count = 0 } = data;
  const isFolder = item.type === 'folder';

  return (
    <div className="min-h-screen bg-lightBg dark:bg-darkBg text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 dark:border-darkBorder bg-white/95 dark:bg-darkCard/95 px-4 md:px-6 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF6701] text-white shadow-sm">
            <Cloud className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                InMeet Drive
              </span>
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                Publik
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate">{item.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {roleBadge(role)}

          {/* Download button */}
          <a
            href={
              isFolder
                ? `/api/v1/public/share/${token}/download?zip=1${
                    currentFolderId ? `&item_id=${currentFolderId}` : ''
                  }`
                : `/api/v1/public/share/${token}/download`
            }
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#FF6701] hover:bg-[#e05a00] text-white text-xs font-semibold shadow-sm transition-all"
            download
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {isFolder ? 'Unduh Semua (ZIP)' : 'Unduh Berkas'}
            </span>
          </a>

          {/* Toggle comments */}
          <button
            onClick={() => setShowComments((v) => !v)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
              showComments
                ? 'bg-orange-50 text-[#FF6701] border-orange-200 dark:bg-orange-950/40 dark:border-orange-800'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Komentar</span>
            {comments_count > 0 && (
              <span className="h-4 min-w-[16px] px-1 rounded-full bg-[#FF6701] text-white text-[10px] font-bold flex items-center justify-center">
                {comments_count}
              </span>
            )}
          </button>

          {/* Dark mode */}
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {/* Breadcrumb & Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-darkCard p-3.5 rounded-2xl border border-slate-200/80 dark:border-darkBorder shadow-xs">
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs py-1">
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={crumb.id || 'root'}>
                    {idx > 0 && (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    )}
                    <button
                      onClick={() => loadSharedItem(crumb.id)}
                      disabled={isLast}
                      className={`truncate max-w-[160px] font-medium transition-colors ${
                        isLast
                          ? 'text-slate-900 dark:text-slate-100 font-bold cursor-default'
                          : 'text-[#FF6701] dark:text-[#FF6500] hover:underline'
                      }`}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Editor Actions */}
            {role === 'editor' && isFolder && (
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-all disabled:opacity-50"
                >
                  {isUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  <span>Unggah Berkas</span>
                </button>

                <button
                  onClick={() => setShowNewFolderModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-darkBorder bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold transition-all"
                >
                  <FolderPlus className="h-3.5 w-3.5 text-[#FF6701]" />
                  <span>Folder Baru</span>
                </button>
              </div>
            )}
          </div>

          {/* Upload Progress banner */}
          {uploadProgress && (
            <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-xl border border-emerald-200 dark:border-emerald-800 text-xs animate-fade-in">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>{uploadProgress}</span>
            </div>
          )}

          {/* Content view */}
          {isFolder ? (
            /* Folder Content */
            items.length === 0 ? (
              <div className="bg-white dark:bg-darkCard rounded-2xl border border-slate-200/80 dark:border-darkBorder p-12 text-center space-y-3">
                <div className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center text-slate-400 mx-auto">
                  <Folder className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                </div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Folder ini kosong
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {role === 'editor'
                    ? 'Folder ini belum memiliki berkas. Anda dapat mengunggah berkas atau membuat subfolder di atas.'
                    : 'Belum ada berkas atau folder di dalam direktori ini.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {items.map((child) => (
                  <div
                    key={child.id}
                    onClick={() => {
                      if (child.type === 'folder') {
                        loadSharedItem(child.id);
                      }
                    }}
                    className={`group relative p-3.5 rounded-2xl bg-white dark:bg-darkCard border border-slate-200/80 dark:border-darkBorder hover:border-[#FF6701]/60 hover:shadow-md transition-all flex flex-col justify-between gap-3 ${
                      child.type === 'folder' ? 'cursor-pointer' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-50 dark:bg-slate-800/80 flex items-center justify-center">
                        {getFileIcon(child)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-[#FF6701] transition-colors"
                          title={child.name}
                        >
                          {child.name}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {child.type === 'folder'
                            ? `${child.item_count ?? 0} item`
                            : formatBytes(child.size_bytes)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-darkBorder text-[10px] text-slate-400">
                      <span>{formatDate(child.updated_at)}</span>

                      {child.type === 'file' ? (
                        <a
                          href={`/api/v1/public/share/${token}/download?item_id=${child.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded-md text-slate-400 hover:text-[#FF6701] hover:bg-orange-50 dark:hover:bg-slate-800 transition-colors"
                          title="Unduh berkas"
                          download
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="text-slate-400 group-hover:text-[#FF6701] transition-colors">
                          Buka &rarr;
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* File Preview View */
            <div className="bg-white dark:bg-darkCard rounded-2xl border border-slate-200/80 dark:border-darkBorder p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-darkBorder">
                <div className="flex items-center gap-3.5">
                  <div className="h-12 w-12 rounded-2xl bg-orange-100 text-[#FF6701] dark:bg-orange-950/40 dark:text-[#FF6500] flex items-center justify-center">
                    {getFileIcon(item)}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {item.name}
                    </h2>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                      <span>{formatBytes(item.size_bytes)}</span>
                      <span>•</span>
                      <span>{item.mime_type}</span>
                      <span>•</span>
                      <span>Diperbarui {formatDate(item.updated_at)}</span>
                    </div>
                  </div>
                </div>

                <a
                  href={`/api/v1/public/share/${token}/download`}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF6701] hover:bg-[#e05a00] text-white text-xs font-semibold shadow-sm transition-all"
                  download
                >
                  <Download className="h-4 w-4" />
                  <span>Unduh Berkas</span>
                </a>
              </div>

              {/* Preview Container */}
              <div className="rounded-xl border border-slate-200 dark:border-darkBorder overflow-hidden bg-slate-50 dark:bg-slate-900/60 p-4 min-h-[300px] flex items-center justify-center">
                {item.mime_type?.startsWith('image/') ? (
                  <img
                    src={`/api/v1/public/share/${token}/download?inline=1`}
                    alt={item.name}
                    className="max-h-[600px] max-w-full rounded-lg object-contain shadow-sm"
                  />
                ) : item.mime_type?.startsWith('video/') ? (
                  <video
                    controls
                    src={`/api/v1/public/share/${token}/download?inline=1`}
                    className="max-h-[500px] max-w-full rounded-lg shadow-sm"
                  />
                ) : item.mime_type?.startsWith('audio/') ? (
                  <audio
                    controls
                    src={`/api/v1/public/share/${token}/download?inline=1`}
                    className="w-full max-w-md"
                  />
                ) : (
                  <div className="text-center space-y-3 py-12">
                    <FileText className="h-16 w-16 text-slate-400 mx-auto" />
                    <p className="text-xs text-slate-500">
                      Pratinjau langsung tidak tersedia untuk format berkas ini.
                    </p>
                    <a
                      href={`/api/v1/public/share/${token}/download`}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold"
                      download
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Unduh untuk Membuka</span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Comments Sidebar */}
        {showComments && (
          <aside className="w-80 md:w-96 border-l border-slate-200/80 dark:border-darkBorder bg-white dark:bg-darkCard flex flex-col shrink-0 animate-slide-in-right">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-darkBorder">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-[#FF6701]" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                  Komentar ({comments.length})
                </h3>
              </div>
              <button
                onClick={() => setShowComments(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {commentsLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin text-[#FF6701]" />
                  <span className="text-xs">Memuat komentar...</span>
                </div>
              ) : comments.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 space-y-1">
                  <p>Belum ada komentar pada item ini</p>
                  {role !== 'viewer' && (
                    <p className="text-[11px] text-slate-500">
                      Jadilah yang pertama menambahkan komentar di bawah
                    </p>
                  )}
                </div>
              ) : (
                comments.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-darkBorder space-y-1"
                  >
                    <div className="flex items-center justify-between gap-1 text-[11px]">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {c.author_name}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {formatDate(c.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                      {c.content}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Comment form */}
            <div className="p-3.5 border-t border-slate-100 dark:border-darkBorder bg-slate-50/50 dark:bg-slate-900/30">
              {role === 'viewer' ? (
                <p className="text-[11px] text-slate-400 text-center py-2">
                  Tautan ini memiliki izin <strong>Pelihat</strong>. Anda hanya dapat membaca komentar.
                </p>
              ) : (
                <form onSubmit={handleSendComment} className="space-y-2">
                  <input
                    type="text"
                    value={commentAuthor}
                    onChange={(e) => setCommentAuthor(e.target.value)}
                    placeholder="Nama Anda (opsional, bawaan: Tamu)"
                    className="w-full rounded-xl border border-slate-200 dark:border-darkBorder bg-white dark:bg-darkCard px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-[#FF6701]"
                  />
                  <textarea
                    value={commentContent}
                    onChange={(e) => setCommentContent(e.target.value)}
                    placeholder="Tulis tanggapan atau komentar..."
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 dark:border-darkBorder bg-white dark:bg-darkCard p-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-[#FF6701] resize-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmittingComment || !commentContent.trim()}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#FF6701] hover:bg-[#e05a00] text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition-all"
                    >
                      {isSubmittingComment ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="h-3 w-3" />
                      )}
                      <span>Kirim</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* New Folder Modal (Editor only) */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Buat Folder Baru
            </h3>
            <form onSubmit={handleCreateFolder} className="space-y-3">
              <input
                type="text"
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Nama folder..."
                className="w-full rounded-xl border border-slate-200 dark:border-darkBorder bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-[#FF6701]"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewFolderModal(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isCreatingFolder || !newFolderName.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#FF6701] hover:bg-[#e05a00] text-white text-xs font-semibold disabled:opacity-50"
                >
                  {isCreatingFolder && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>Buat Folder</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
