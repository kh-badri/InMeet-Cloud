import React, { useState, useEffect } from 'react';
import {
  X,
  MessageSquare,
  Send,
  Loader2,
  AlertCircle,
  File,
  Folder,
  Clock,
} from 'lucide-react';
import { DriveItem, DriveComment } from '../types';
import { apiRequest, formatDate } from '../lib/api';

interface CommentsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: DriveItem | null;
  onCommentAdded?: () => void;
}

export const CommentsDrawer: React.FC<CommentsDrawerProps> = ({
  isOpen,
  onClose,
  item,
  onCommentAdded,
}) => {
  const [comments, setComments] = useState<DriveComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadComments = async () => {
    if (!item) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiRequest<DriveComment[]>(
        `/api/v1/drive/items/${item.id}/comments`
      );
      setComments(data || []);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat komentar');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && item) {
      setContent('');
      setError(null);
      loadComments();
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const isReadOnly = item.share_role === 'viewer';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isReadOnly) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/api/v1/drive/items/${item.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: content.trim() }),
      });
      setContent('');
      await loadComments();
      if (onCommentAdded) onCommentAdded();
    } catch (err: any) {
      setError(err.message || 'Gagal mengirim komentar');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end animate-fade-in">
      <div className="relative w-full max-w-md h-full bg-white dark:bg-darkCard border-l border-slate-200 dark:border-darkBorder shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-darkBorder bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-[#FF6701] dark:bg-orange-950/40 dark:text-[#FF6500]">
              <MessageSquare className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                Diskusi & Komentar
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
                {item.type === 'folder' ? (
                  <Folder className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <File className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate">{item.name}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Comment List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {error && (
            <div className="flex items-center gap-2 p-3 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-900/40">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin text-[#FF6701]" />
              <span className="text-xs">Memuat riwayat komentar...</span>
            </div>
          ) : comments.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-center text-slate-400">
              <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center text-slate-400 mb-1">
                <MessageSquare className="h-6 w-6" />
              </div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Belum ada komentar
              </p>
              <p className="text-[11px] text-slate-400 max-w-xs">
                Mulai diskusi mengenai berkas atau folder ini dengan tim Anda
              </p>
            </div>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                className="p-3.5 rounded-xl border border-slate-100 dark:border-darkBorder bg-slate-50/50 dark:bg-slate-900/30 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold">
                      {(c.author_name || 'U')[0].toUpperCase()}
                    </div>
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {c.author_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 shrink-0">
                    <Clock className="h-3 w-3" />
                    <span>{formatDate(c.created_at)}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed pl-8">
                  {c.content}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Input Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-darkBorder bg-white dark:bg-darkCard">
          {isReadOnly ? (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-center text-xs text-slate-400">
              Peran akun Anda adalah <strong>Pelihat</strong>. Anda hanya dapat membaca komentar yang ada.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2">
              <div className="relative">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Tulis komentar atau catatan..."
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 dark:border-darkBorder bg-slate-50/50 dark:bg-slate-900/50 p-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#FF6701] focus:ring-1 focus:ring-[#FF6701] outline-none resize-none transition-all"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting || !content.trim()}
                  className="rounded-xl bg-[#FF6701] hover:bg-[#e05a00] text-white px-4 py-2 text-xs font-semibold shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  <span>Kirim Komentar</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
