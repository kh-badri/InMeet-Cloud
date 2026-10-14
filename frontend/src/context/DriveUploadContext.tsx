import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest, getCSRFToken } from '../lib/api';
import { DriveUploadSession } from '../types';
import { saveUploadToDB, getAllUploadsFromDB, removeUploadFromDB } from '../lib/uploadDb';

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
  status: 'queued' | 'uploading' | 'paused' | 'completed' | 'error';
  errorMessage?: string;
  parentFolderId: string | null;
  parentFolderName?: string;
  chunkSize: number;
  totalChunks: number;
  lastChunkIndex: number;
  uploadedChunks: number[];
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
  cancelAllUploads: () => void;
  clearCompleted: () => void;
}

const DriveUploadContext = createContext<DriveUploadContextType | undefined>(undefined);

// High-speed Gigabit upload configuration:
// 10MB chunk size + 4 parallel HTTP/2 streams per file
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk
const PARALLEL_CHUNKS = 4; // 4 concurrent chunk workers per active file
const MAX_CONCURRENT_FILES = 2; // Maximum 2 files upload concurrently to prevent HTTP 429 rate-limiting

export const DriveUploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [isDockOpen, setIsDockOpen] = useState(true);
  const queryClient = useQueryClient();

  const tasksRef = useRef<UploadTask[]>([]);
  tasksRef.current = tasks;

  // Active abort controllers per task
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  // Pause flags per task
  const pauseFlagsRef = useRef<Map<string, boolean>>(new Map());
  // In-flight task IDs to prevent multiple simultaneous workers on the same task
  const inFlightTaskIdsRef = useRef<Set<string>>(new Set());

  const isUploading = tasks.some((t) => t.status === 'uploading' || t.status === 'queued');

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

  // Robust session initialization with exponential backoff on HTTP 429
  const initSessionWithRetry = async (
    file: File,
    relativePath: string,
    parentId: string | null,
    signal: AbortSignal
  ) => {
    let attempts = 0;
    const maxAttempts = 4;
    while (attempts <= maxAttempts) {
      if (signal.aborted) throw new Error('Upload dibatalkan');
      try {
        const res = await apiRequest<{
          upload_id: string;
          total_chunks: number;
          chunk_size: number;
          uploaded_bytes: number;
          last_chunk_index: number;
          uploaded_chunks?: number[];
        }>('/api/v1/drive/upload/init', {
          method: 'POST',
          signal,
          body: JSON.stringify({
            filename: file.name,
            relative_path: relativePath,
            total_bytes: file.size,
            chunk_size: CHUNK_SIZE,
            parent_id: parentId,
            mime_type: file.type || 'application/octet-stream',
          }),
        });
        return res;
      } catch (err: any) {
        if (signal.aborted) throw err;
        const msg = err.message || '';
        // If storage quota exceeded, do NOT retry: return error immediately to user
        if (msg.includes('kuota') || msg.includes('kapasitas') || msg.includes('quota')) {
          throw err;
        }
        const is429 = err.status === 429 || msg.toLowerCase().includes('too many request');
        if (is429 && attempts < maxAttempts) {
          attempts++;
          const backoffDelay = Math.min(1000 * Math.pow(2, attempts), 8000);
          await new Promise((r) => setTimeout(r, backoffDelay));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Gagal inisialisasi sesi upload (terlalu banyak permintaan). Coba lagi.');
  };

  // High-speed parallel chunk worker pool for an active task
  const processUploadTask = useCallback(
    async (task: UploadTask, file: File) => {
      const controller = new AbortController();
      let currentId = task.id;

      abortControllersRef.current.set(currentId, controller);
      pauseFlagsRef.current.set(currentId, false);

      let totalBytes = task.totalBytes;
      let chunkSize = task.chunkSize;
      let totalChunks = task.totalChunks;
      let completedChunks = new Set<number>(task.uploadedChunks || []);
      let currentUploadedBytes = task.uploadedBytes;

      try {
        // Step 1: If task is a client pending task (starts with 'pending_'), initialize on backend
        if (currentId.startsWith('pending_')) {
          const initRes = await initSessionWithRetry(file, task.relativePath, task.parentFolderId, controller.signal);
          const realUploadId = initRes.upload_id;

          // Swap tracking references from temporary ID to server upload_id
          abortControllersRef.current.delete(currentId);
          pauseFlagsRef.current.delete(currentId);
          inFlightTaskIdsRef.current.delete(currentId);

          abortControllersRef.current.set(realUploadId, controller);
          pauseFlagsRef.current.set(realUploadId, false);
          inFlightTaskIdsRef.current.add(realUploadId);

          currentId = realUploadId;
          totalBytes = file.size;
          chunkSize = initRes.chunk_size;
          totalChunks = initRes.total_chunks;
          completedChunks = new Set<number>(initRes.uploaded_chunks || []);
          currentUploadedBytes = initRes.uploaded_bytes;

          setTasks((prev) =>
            prev.map((t) =>
              t.id === task.id
                ? {
                    ...t,
                    id: realUploadId,
                    status: 'uploading',
                    chunkSize: initRes.chunk_size,
                    totalChunks: initRes.total_chunks,
                    uploadedBytes: initRes.uploaded_bytes,
                    lastChunkIndex: initRes.last_chunk_index,
                    uploadedChunks: initRes.uploaded_chunks || [],
                  }
                : t
            )
          );

          await saveUploadToDB({
            id: realUploadId,
            file,
            filename: task.filename,
            relativePath: task.relativePath,
            totalBytes: file.size,
            uploadedBytes: initRes.uploaded_bytes,
            chunkSize: initRes.chunk_size,
            totalChunks: initRes.total_chunks,
            lastChunkIndex: initRes.last_chunk_index,
            uploadedChunks: initRes.uploaded_chunks || [],
            parentFolderId: task.parentFolderId,
            parentFolderName: task.parentFolderName,
            status: 'uploading',
            updatedAt: Date.now(),
          });
        }

        // Exact byte calculation from completed chunk indices
        currentUploadedBytes = Array.from(completedChunks).reduce((acc, idx) => {
          const s = idx * chunkSize;
          const e = Math.min(s + chunkSize, totalBytes);
          return acc + (e - s);
        }, 0);

        const pendingChunks: number[] = [];
        for (let i = 0; i < totalChunks; i++) {
          if (!completedChunks.has(i)) {
            pendingChunks.push(i);
          }
        }

        let bytesInWindow = 0;
        let windowStartTime = Date.now();
        let currentSpeed = 0;

        if (pendingChunks.length > 0) {
          let chunkQueueIndex = 0;
          let activeError: Error | null = null;

          const worker = async () => {
            while (chunkQueueIndex < pendingChunks.length) {
              if (pauseFlagsRef.current.get(currentId) || controller.signal.aborted || activeError) {
                return;
              }

              const chunkIdx = pendingChunks[chunkQueueIndex++];
              if (chunkIdx === undefined) return;

              const start = chunkIdx * chunkSize;
              const end = Math.min(start + chunkSize, totalBytes);
              const chunkBlob = file.slice(start, end);
              const chunkLen = end - start;

              const formData = new FormData();
              formData.append('upload_id', currentId);
              formData.append('chunk_index', String(chunkIdx));
              formData.append('chunk', chunkBlob);

              const csrfToken = getCSRFToken();
              const headers: Record<string, string> = {};
              if (csrfToken) {
                headers['X-CSRF-Token'] = csrfToken;
              }

              // Retry chunk upload with backoff on 429
              let retryAttempt = 0;
              const maxChunkRetries = 3;

              while (retryAttempt <= maxChunkRetries) {
                if (pauseFlagsRef.current.get(currentId) || controller.signal.aborted || activeError) {
                  return;
                }

                try {
                  const res = await fetch('/api/v1/drive/upload/chunk', {
                    method: 'POST',
                    headers,
                    body: formData,
                    signal: controller.signal,
                    credentials: 'include',
                  });

                  if (res.status === 429) {
                    retryAttempt++;
                    if (retryAttempt > maxChunkRetries) {
                      throw new Error('Terlalu banyak permintaan (HTTP 429). Silakan tunggu.');
                    }
                    const retryHeader = res.headers.get('Retry-After');
                    const backoffMs = retryHeader
                      ? Math.max(1000, parseInt(retryHeader, 10) * 1000)
                      : Math.min(1000 * Math.pow(2, retryAttempt), 5000);
                    await new Promise((r) => setTimeout(r, backoffMs));
                    continue;
                  }

                  if (!res.ok) {
                    if (pauseFlagsRef.current.get(currentId) || controller.signal.aborted) return;
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || `Gagal mengunggah bagian ke-${chunkIdx + 1}`);
                  }

                  // Successfully uploaded chunk
                  break;
                } catch (err: any) {
                  if (pauseFlagsRef.current.get(currentId) || controller.signal.aborted) return;
                  if (err.name === 'AbortError') return;
                  if (retryAttempt >= maxChunkRetries || err.message?.includes('HTTP 429')) {
                    throw err;
                  }
                  retryAttempt++;
                  await new Promise((r) => setTimeout(r, 1000 * retryAttempt));
                }
              }

              completedChunks.add(chunkIdx);
              currentUploadedBytes = Array.from(completedChunks).reduce((acc, idx) => {
                const s = idx * chunkSize;
                const e = Math.min(s + chunkSize, totalBytes);
                return acc + (e - s);
              }, 0);

              bytesInWindow += chunkLen;

              const now = Date.now();
              const elapsed = (now - windowStartTime) / 1000;
              if (elapsed >= 0.4) {
                currentSpeed = bytesInWindow / elapsed;
                bytesInWindow = 0;
                windowStartTime = now;
              }

              const remainingBytes = Math.max(0, totalBytes - currentUploadedBytes);
              const eta = currentSpeed > 0 ? Math.ceil(remainingBytes / currentSpeed) : 0;
              const progress = totalBytes > 0 ? Math.min(100, Math.floor((currentUploadedBytes / totalBytes) * 100)) : 100;
              const uploadedArray = Array.from(completedChunks);
              const maxUploadedIndex = uploadedArray.length > 0 ? Math.max(...uploadedArray) : -1;

              setTasks((prev) =>
                prev.map((t) => {
                  if (t.id !== currentId) return t;
                  return {
                    ...t,
                    uploadedBytes: currentUploadedBytes,
                    uploadedChunks: uploadedArray,
                    lastChunkIndex: maxUploadedIndex,
                    progressPercent: progress,
                    speedBytesPerSec: currentSpeed || t.speedBytesPerSec,
                    etaSeconds: eta,
                  };
                })
              );

              // Periodic IndexedDB snapshot
              if (completedChunks.size % 2 === 0 || completedChunks.size === totalChunks) {
                saveUploadToDB({
                  id: currentId,
                  file,
                  filename: task.filename,
                  relativePath: task.relativePath,
                  totalBytes,
                  uploadedBytes: currentUploadedBytes,
                  chunkSize,
                  totalChunks,
                  lastChunkIndex: maxUploadedIndex,
                  uploadedChunks: uploadedArray,
                  parentFolderId: task.parentFolderId,
                  parentFolderName: task.parentFolderName,
                  status: 'uploading',
                  updatedAt: Date.now(),
                });
              }
            }
          };

          const workerCount = Math.min(PARALLEL_CHUNKS, pendingChunks.length);
          const workers = Array.from({ length: workerCount }, () =>
            worker().catch((err) => {
              if (!activeError && !controller.signal.aborted && !pauseFlagsRef.current.get(currentId)) {
                activeError = err;
              }
            })
          );

          await Promise.all(workers);

          if (pauseFlagsRef.current.get(currentId) || controller.signal.aborted) {
            const uploadedArray = Array.from(completedChunks);
            const maxUploadedIndex = uploadedArray.length > 0 ? Math.max(...uploadedArray) : -1;
            setTasks((prev) =>
              prev.map((t) => (t.id === currentId ? { ...t, status: 'paused', speedBytesPerSec: 0 } : t))
            );
            saveUploadToDB({
              id: currentId,
              file,
              filename: task.filename,
              relativePath: task.relativePath,
              totalBytes,
              uploadedBytes: currentUploadedBytes,
              chunkSize,
              totalChunks,
              lastChunkIndex: maxUploadedIndex,
              uploadedChunks: uploadedArray,
              parentFolderId: task.parentFolderId,
              parentFolderName: task.parentFolderName,
              status: 'paused',
              updatedAt: Date.now(),
            });
            return;
          }

          if (activeError) {
            throw activeError;
          }
        }

        // Finalize upload on backend
        await apiRequest('/api/v1/drive/upload/complete', {
          method: 'POST',
          body: JSON.stringify({ upload_id: currentId }),
          signal: controller.signal,
        });

        setTasks((prev) =>
          prev.map((t) =>
            t.id === currentId
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

        // Remove completed session from IndexedDB
        removeUploadFromDB(currentId);

        // Invalidate queries to refresh drive and dashboard stats
        queryClient.invalidateQueries({ queryKey: ['drive-items'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
        queryClient.invalidateQueries({ queryKey: ['stats-summary'] });
      } catch (err: any) {
        if (err.name === 'AbortError' || pauseFlagsRef.current.get(currentId)) return;

        const uploadedArray = Array.from(completedChunks);
        const maxUploadedIndex = uploadedArray.length > 0 ? Math.max(...uploadedArray) : -1;

        setTasks((prev) =>
          prev.map((t) =>
            t.id === currentId || t.id === task.id
              ? {
                  ...t,
                  status: 'error',
                  errorMessage: err.message || 'Koneksi terputus saat upload',
                  speedBytesPerSec: 0,
                }
              : t
          )
        );

        if (!currentId.startsWith('pending_')) {
          saveUploadToDB({
            id: currentId,
            file,
            filename: task.filename,
            relativePath: task.relativePath,
            totalBytes,
            uploadedBytes: currentUploadedBytes,
            chunkSize,
            totalChunks,
            lastChunkIndex: maxUploadedIndex,
            uploadedChunks: uploadedArray,
            parentFolderId: task.parentFolderId,
            parentFolderName: task.parentFolderName,
            status: 'error',
            errorMessage: err.message,
            updatedAt: Date.now(),
          });
        }
      } finally {
        abortControllersRef.current.delete(currentId);
        abortControllersRef.current.delete(task.id);
        pauseFlagsRef.current.delete(currentId);
        pauseFlagsRef.current.delete(task.id);
        inFlightTaskIdsRef.current.delete(currentId);
        inFlightTaskIdsRef.current.delete(task.id);
      }
    },
    [queryClient]
  );

  // Queue runner: controls file concurrency (MAX_CONCURRENT_FILES = 2)
  const isPumpingRef = useRef(false);
  const pumpQueue = useCallback(() => {
    if (isPumpingRef.current) return;
    isPumpingRef.current = true;

    try {
      const currentTasks = tasksRef.current;
      const activeCount = currentTasks.filter((t) => t.status === 'uploading').length;
      const availableSlots = Math.max(0, MAX_CONCURRENT_FILES - activeCount);

      if (availableSlots <= 0) return;

      const queuedTasks = currentTasks.filter(
        (t) => t.status === 'queued' && t.file && !inFlightTaskIdsRef.current.has(t.id)
      );

      const tasksToStart = queuedTasks.slice(0, availableSlots);
      for (const nextTask of tasksToStart) {
        inFlightTaskIdsRef.current.add(nextTask.id);
        setTasks((prev) =>
          prev.map((t) => (t.id === nextTask.id ? { ...t, status: 'uploading' } : t))
        );
        processUploadTask(nextTask, nextTask.file!).finally(() => {
          // Whenever an active task ends, schedule next pump
          setTimeout(() => pumpQueue(), 50);
        });
      }
    } finally {
      isPumpingRef.current = false;
    }
  }, [processUploadTask]);

  // Keep pumping queue whenever tasks change
  useEffect(() => {
    pumpQueue();
  }, [tasks, pumpQueue]);

  // Load existing uncompleted sessions on mount & restore file persistence from IndexedDB
  useEffect(() => {
    let isMounted = true;

    const restoreSessions = async () => {
      const dbTasks = await getAllUploadsFromDB();
      let serverSessions: DriveUploadSession[] = [];
      try {
        serverSessions = await apiRequest<DriveUploadSession[]>('/api/v1/drive/upload/sessions');
      } catch (err) {
        // offline or transient network error
      }

      if (!isMounted) return;

      const serverMap = new Map(serverSessions.map((s) => [s.id, s]));
      const restoredList: UploadTask[] = [];

      for (const t of dbTasks) {
        const s = serverMap.get(t.id);
        const uploadedBytes = s ? s.uploaded_bytes : t.uploadedBytes;
        const lastChunkIndex = s ? s.last_chunk_index : t.lastChunkIndex;
        const uploadedChunks = s?.uploaded_chunks || t.uploadedChunks || [];
        const progressPercent = t.totalBytes > 0 ? Math.floor((uploadedBytes / t.totalBytes) * 100) : 0;

        if (s && s.status === 'completed') {
          await removeUploadFromDB(t.id);
          continue;
        }

        const task: UploadTask = {
          id: t.id,
          file: t.file,
          filename: t.filename,
          relativePath: t.relativePath,
          totalBytes: t.totalBytes,
          uploadedBytes,
          speedBytesPerSec: 0,
          etaSeconds: 0,
          progressPercent,
          status: t.file ? 'queued' : 'paused',
          parentFolderId: t.parentFolderId,
          parentFolderName: t.parentFolderName,
          chunkSize: t.chunkSize,
          totalChunks: t.totalChunks,
          lastChunkIndex,
          uploadedChunks,
        };

        restoredList.push(task);
      }

      // Add any server sessions not present in local IndexedDB
      for (const s of serverSessions) {
        if (!dbTasks.some((t) => t.id === s.id)) {
          restoredList.push({
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
            uploadedChunks: s.uploaded_chunks || [],
          });
        }
      }

      if (isMounted && restoredList.length > 0) {
        setTasks(restoredList);
      }
    };

    restoreSessions();

    return () => {
      isMounted = false;
    };
  }, []);

  // Start uploading array of files (supports nested folders with hundreds of files smoothly)
  const startUpload = useCallback(
    async (fileList: FileList | File[], parentId: string | null, parentName?: string) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      setIsDockOpen(true);

      const newTasks: UploadTask[] = files.map((file, idx) => {
        const relativePath = (file as any).webkitRelativePath || '';
        const tempId = `pending_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 8)}`;
        return {
          id: tempId,
          file,
          filename: file.name,
          relativePath,
          totalBytes: file.size,
          uploadedBytes: 0,
          speedBytesPerSec: 0,
          etaSeconds: 0,
          progressPercent: 0,
          status: 'queued',
          parentFolderId: parentId,
          parentFolderName: parentName || (parentId ? 'Folder Terpilih' : 'Drive Saya'),
          chunkSize: CHUNK_SIZE,
          totalChunks: Math.ceil(file.size / CHUNK_SIZE) || 1,
          lastChunkIndex: -1,
          uploadedChunks: [],
        };
      });

      setTasks((prev) => [...newTasks, ...prev]);
    },
    []
  );

  const pauseUpload = useCallback((taskId: string) => {
    pauseFlagsRef.current.set(taskId, true);
    const controller = abortControllersRef.current.get(taskId);
    if (controller) {
      controller.abort();
    }
    inFlightTaskIdsRef.current.delete(taskId);
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: 'paused', speedBytesPerSec: 0 } : t))
    );
  }, []);

  const resumeUpload = useCallback((taskId: string, reattachedFile?: File) => {
    setTasks((prev) => {
      const target = prev.find((t) => t.id === taskId);
      if (!target) return prev;

      const fileToUse = reattachedFile || target.file;
      if (!fileToUse) {
        alert(`Pilih berkas "${target.filename}" kembali untuk melanjutkan proses upload.`);
        return prev;
      }

      const updated: UploadTask = {
        ...target,
        file: fileToUse,
        status: 'queued',
        errorMessage: undefined,
      };

      if (!taskId.startsWith('pending_')) {
        saveUploadToDB({
          id: updated.id,
          file: fileToUse,
          filename: updated.filename,
          relativePath: updated.relativePath,
          totalBytes: updated.totalBytes,
          uploadedBytes: updated.uploadedBytes,
          chunkSize: updated.chunkSize,
          totalChunks: updated.totalChunks,
          lastChunkIndex: updated.lastChunkIndex,
          uploadedChunks: updated.uploadedChunks || [],
          parentFolderId: updated.parentFolderId,
          parentFolderName: updated.parentFolderName,
          status: 'queued',
          updatedAt: Date.now(),
        });
      }

      return prev.map((t) => (t.id === taskId ? updated : t));
    });
  }, []);

  const cancelUpload = useCallback((taskId: string) => {
    pauseFlagsRef.current.set(taskId, true);
    const controller = abortControllersRef.current.get(taskId);
    if (controller) {
      controller.abort();
    }
    inFlightTaskIdsRef.current.delete(taskId);

    if (!taskId.startsWith('pending_')) {
      apiRequest(`/api/v1/drive/upload/sessions/${taskId}`, {
        method: 'DELETE',
      }).catch(() => {});
      removeUploadFromDB(taskId);
    }

    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const cancelAllUploads = useCallback(() => {
    tasks.forEach((t) => {
      pauseFlagsRef.current.set(t.id, true);
      const controller = abortControllersRef.current.get(t.id);
      if (controller) {
        controller.abort();
      }
      inFlightTaskIdsRef.current.delete(t.id);
      if (!t.id.startsWith('pending_')) {
        apiRequest(`/api/v1/drive/upload/sessions/${t.id}`, {
          method: 'DELETE',
        }).catch(() => {});
        removeUploadFromDB(t.id);
      }
    });
    setTasks([]);
  }, [tasks]);

  const clearCompleted = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status === 'uploading' || t.status === 'queued' || t.status === 'paused'));
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
        cancelAllUploads,
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
