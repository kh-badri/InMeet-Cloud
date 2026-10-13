import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { DriveUploadSession } from '../types';

export interface UploadTask {
  id: string;
  file?: File;
  filename: string;
  relativePath: string;
  totalBytes: number;
  uploadedBytes: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  progressPercent: number;
  status: 'uploading' | 'paused' | 'completed' | 'error';
  errorMessage?: string;
  parentFolderId: string | null;
  parentFolderName?: string;
  chunkSize: number;
  totalChunks: number;
  lastChunkIndex: number;
}

interface DriveUploadContextType {
  tasks: UploadTask[];
  isUploading: boolean;
  isDockOpen: boolean;
  setIsDockOpen: (open: boolean) => void;
  startUpload: (files: FileList | File[], parentId: string | null, parentName?: string) => Promise<void>;
  pauseUpload: (taskId: string) => void;
  resumeUpload: (taskId: string, reattachedFile?: File) => void;
  cancelUpload: (taskId: string) => void;
  clearCompleted: () => void;
}

const DriveUploadContext = createContext<DriveUploadContextType | undefined>(undefined);

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk (fast and resilient)

export const DriveUploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [isDockOpen, setIsDockOpen] = useState(true);
  const queryClient = useQueryClient();

  // Active abort controllers per task
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  // Pause flags per task
  const pauseFlagsRef = useRef<Map<string, boolean>>(new Map());

  const isUploading = tasks.some((t) => t.status === 'uploading');

  // Prevent accidental refresh or tab close while uploading
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isUploading) {
        e.preventDefault();
        e.returnValue = 'Proses upload sedang berjalan. Jika Anda me-refresh atau menutup halaman, proses upload akan terhenti.';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isUploading]);

  // Load existing uncompleted sessions on mount
  useEffect(() => {
    apiRequest<DriveUploadSession[]>('/api/v1/drive/upload/sessions')
      .then((sessions) => {
        if (sessions && sessions.length > 0) {
          const restoredTasks: UploadTask[] = sessions.map((s) => ({
            id: s.id,
            filename: s.filename,
            relativePath: s.relative_path,
            totalBytes: s.total_bytes,
            uploadedBytes: s.uploaded_bytes,
            speedBytesPerSec: 0,
            etaSeconds: 0,
            progressPercent: s.total_bytes > 0 ? Math.floor((s.uploaded_bytes / s.total_bytes) * 100) : 0,
            status: 'paused',
            parentFolderId: s.parent_id,
            chunkSize: s.chunk_size,
            totalChunks: s.total_chunks,
            lastChunkIndex: s.last_chunk_index,
          }));
          setTasks((prev) => {
            const existingIds = new Set(prev.map((t) => t.id));
            const newRestored = restoredTasks.filter((t) => !existingIds.has(t.id));
            return [...prev, ...newRestored];
          });
        }
      })
      .catch(() => {});
  }, []);

  // Worker function to upload chunks for a task
  const processUploadTask = useCallback(async (task: UploadTask, file: File) => {
    const controller = new AbortController();
    abortControllersRef.current.set(task.id, controller);
    pauseFlagsRef.current.set(task.id, false);

    let currentChunk = task.lastChunkIndex + 1;
    let uploadedBytes = task.uploadedBytes;
    const totalBytes = task.totalBytes;
    const chunkSize = task.chunkSize;
    const totalChunks = task.totalChunks;

    let bytesInWindow = 0;
    let windowStartTime = Date.now();

    try {
      while (currentChunk < totalChunks) {
        if (pauseFlagsRef.current.get(task.id)) {
          setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, status: 'paused', speedBytesPerSec: 0 } : t))
          );
          return;
        }

        const start = currentChunk * chunkSize;
        const end = Math.min(start + chunkSize, totalBytes);
        const chunkBlob = file.slice(start, end);
        const chunkLen = end - start;

        const formData = new FormData();
        formData.append('upload_id', task.id);
        formData.append('chunk_index', String(currentChunk));
        formData.append('chunk', chunkBlob);

        const res = await fetch('/api/v1/drive/upload/chunk', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
          credentials: 'include',
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Gagal mengunggah bagian ke-${currentChunk + 1}`);
        }

        uploadedBytes = Math.min(uploadedBytes + chunkLen, totalBytes);
        bytesInWindow += chunkLen;

        const now = Date.now();
        const windowElapsed = (now - windowStartTime) / 1000;
        let speed = 0;
        if (windowElapsed >= 0.5) {
          speed = bytesInWindow / windowElapsed;
          bytesInWindow = 0;
          windowStartTime = now;
        }

        const remainingBytes = Math.max(0, totalBytes - uploadedBytes);
        const eta = speed > 0 ? Math.ceil(remainingBytes / speed) : 0;
        const progress = Math.min(100, Math.floor((uploadedBytes / totalBytes) * 100));

        currentChunk++;

        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== task.id) return t;
            return {
              ...t,
              uploadedBytes,
              lastChunkIndex: currentChunk - 1,
              progressPercent: progress,
              speedBytesPerSec: speed || t.speedBytesPerSec,
              etaSeconds: eta,
            };
          })
        );
      }

      // Finalize upload on server
      const completeRes = await fetch('/api/v1/drive/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: task.id }),
        signal: controller.signal,
        credentials: 'include',
      });

      if (!completeRes.ok) {
        const errData = await completeRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Gagal menyelesaikan berkas di server');
      }

      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: 'completed',
                progressPercent: 100,
                uploadedBytes: totalBytes,
                speedBytesPerSec: 0,
                etaSeconds: 0,
              }
            : t
        )
      );

      // Refresh items in current folder
      queryClient.invalidateQueries({ queryKey: ['drive-items'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    } catch (err: any) {
      if (err.name === 'AbortError') return;

      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: 'error',
                errorMessage: err.message || 'Koneksi terputus saat upload',
                speedBytesPerSec: 0,
              }
            : t
        )
      );
    } finally {
      abortControllersRef.current.delete(task.id);
      pauseFlagsRef.current.delete(task.id);
    }
  }, [queryClient]);

  // Start uploading array of files (supports multi-gigabyte files & nested directories)
  const startUpload = useCallback(
    async (fileList: FileList | File[], parentId: string | null, parentName?: string) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      setIsDockOpen(true);

      for (const file of files) {
        try {
          const relativePath = (file as any).webkitRelativePath || '';
          const initRes = await apiRequest<{
            upload_id: string;
            total_chunks: number;
            chunk_size: number;
            uploaded_bytes: number;
            last_chunk_index: number;
          }>('/api/v1/drive/upload/init', {
            method: 'POST',
            body: JSON.stringify({
              filename: file.name,
              relative_path: relativePath,
              total_bytes: file.size,
              chunk_size: CHUNK_SIZE,
              parent_id: parentId,
              mime_type: file.type || 'application/octet-stream',
            }),
          });

          const newTask: UploadTask = {
            id: initRes.upload_id,
            file,
            filename: file.name,
            relativePath,
            totalBytes: file.size,
            uploadedBytes: initRes.uploaded_bytes,
            speedBytesPerSec: 0,
            etaSeconds: 0,
            progressPercent: file.size > 0 ? Math.floor((initRes.uploaded_bytes / file.size) * 100) : 0,
            status: 'uploading',
            parentFolderId: parentId,
            parentFolderName: parentName || (parentId ? 'Folder Terpilih' : 'Drive Saya'),
            chunkSize: initRes.chunk_size,
            totalChunks: initRes.total_chunks,
            lastChunkIndex: initRes.last_chunk_index,
          };

          setTasks((prev) => [newTask, ...prev.filter((t) => t.id !== newTask.id)]);

          // Start chunk upload loop
          processUploadTask(newTask, file);
        } catch (err: any) {
          console.error('Gagal inisialisasi upload:', err);
        }
      }
    },
    [processUploadTask]
  );

  const pauseUpload = useCallback((taskId: string) => {
    pauseFlagsRef.current.set(taskId, true);
    const controller = abortControllersRef.current.get(taskId);
    if (controller) {
      controller.abort();
    }
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: 'paused', speedBytesPerSec: 0 } : t))
    );
  }, []);

  const resumeUpload = useCallback(
    (taskId: string, reattachedFile?: File) => {
      setTasks((prev) => {
        const target = prev.find((t) => t.id === taskId);
        if (!target) return prev;

        const fileToUse = reattachedFile || target.file;
        if (!fileToUse) {
          alert(`Pilih berkas "${target.filename}" kembali untuk melanjutkan proses upload.`);
          return prev;
        }

        const updated = { ...target, file: fileToUse, status: 'uploading' as const };
        processUploadTask(updated, fileToUse);
        return prev.map((t) => (t.id === taskId ? updated : t));
      });
    },
    [processUploadTask]
  );

  const cancelUpload = useCallback((taskId: string) => {
    pauseFlagsRef.current.set(taskId, true);
    const controller = abortControllersRef.current.get(taskId);
    if (controller) {
      controller.abort();
    }
    fetch(`/api/v1/drive/upload/sessions/${taskId}`, {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => {});

    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const clearCompleted = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status === 'uploading' || t.status === 'paused'));
  }, []);

  return (
    <DriveUploadContext.Provider
      value={{
        tasks,
        isUploading,
        isDockOpen,
        setIsDockOpen,
        startUpload,
        pauseUpload,
        resumeUpload,
        cancelUpload,
        clearCompleted,
      }}
    >
      {children}
    </DriveUploadContext.Provider>
  );
};

export const useDriveUpload = () => {
  const context = useContext(DriveUploadContext);
  if (!context) {
    throw new Error('useDriveUpload must be used within a DriveUploadProvider');
  }
  return context;
};
