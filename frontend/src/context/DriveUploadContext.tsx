import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
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
  status: 'uploading' | 'paused' | 'completed' | 'error';
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
  clearCompleted: () => void;
}

const DriveUploadContext = createContext<DriveUploadContextType | undefined>(undefined);

// High-speed Gigabit upload configuration:
// 10MB chunk size + 4 parallel HTTP/2 streams saturates 100Mbps - 1000Mbps line rate
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk
const PARALLEL_CHUNKS = 4; // 4 concurrent workers

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

  // High-speed parallel chunk worker pool for a task
  const processUploadTask = useCallback(async (task: UploadTask, file: File) => {
    const controller = new AbortController();
    abortControllersRef.current.set(task.id, controller);
    pauseFlagsRef.current.set(task.id, false);

    const totalBytes = task.totalBytes;
    const chunkSize = task.chunkSize;
    const totalChunks = task.totalChunks;
    const completedChunks = new Set<number>(task.uploadedChunks || []);

    // Exact byte calculation from completed chunk indices
    let currentUploadedBytes = Array.from(completedChunks).reduce((acc, idx) => {
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

    try {
      if (pendingChunks.length > 0) {
        let chunkQueueIndex = 0;
        let activeError: Error | null = null;

        const worker = async () => {
          while (chunkQueueIndex < pendingChunks.length) {
            if (pauseFlagsRef.current.get(task.id) || controller.signal.aborted || activeError) {
              return;
            }

            const chunkIdx = pendingChunks[chunkQueueIndex++];
            if (chunkIdx === undefined) return;

            const start = chunkIdx * chunkSize;
            const end = Math.min(start + chunkSize, totalBytes);
            const chunkBlob = file.slice(start, end);
            const chunkLen = end - start;

            const formData = new FormData();
            formData.append('upload_id', task.id);
            formData.append('chunk_index', String(chunkIdx));
            formData.append('chunk', chunkBlob);

            const res = await fetch('/api/v1/drive/upload/chunk', {
              method: 'POST',
              body: formData,
              signal: controller.signal,
              credentials: 'include',
            });

            if (!res.ok) {
              if (pauseFlagsRef.current.get(task.id) || controller.signal.aborted) return;
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || `Gagal mengunggah bagian ke-${chunkIdx + 1}`);
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
                if (t.id !== task.id) return t;
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

            // Sync to IndexedDB periodically
            if (completedChunks.size % 2 === 0 || completedChunks.size === totalChunks) {
              saveUploadToDB({
                id: task.id,
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
            if (!activeError && !controller.signal.aborted && !pauseFlagsRef.current.get(task.id)) {
              activeError = err;
            }
          })
        );

        await Promise.all(workers);

        if (pauseFlagsRef.current.get(task.id) || controller.signal.aborted) {
          const uploadedArray = Array.from(completedChunks);
          const maxUploadedIndex = uploadedArray.length > 0 ? Math.max(...uploadedArray) : -1;
          setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, status: 'paused', speedBytesPerSec: 0 } : t))
          );
          saveUploadToDB({
            id: task.id,
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

      // Clean up from IndexedDB upon completion
      removeUploadFromDB(task.id);

      // Refresh items in current folder
      queryClient.invalidateQueries({ queryKey: ['drive-items'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    } catch (err: any) {
      if (err.name === 'AbortError' || pauseFlagsRef.current.get(task.id)) return;

      const uploadedArray = Array.from(completedChunks);
      const maxUploadedIndex = uploadedArray.length > 0 ? Math.max(...uploadedArray) : -1;

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

      saveUploadToDB({
        id: task.id,
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
    } finally {
      abortControllersRef.current.delete(task.id);
      pauseFlagsRef.current.delete(task.id);
    }
  }, [queryClient]);

  // Load existing uncompleted sessions on mount & automatically resume if File exists in IndexedDB
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
          status: t.file ? 'uploading' : 'paused',
          parentFolderId: t.parentFolderId,
          parentFolderName: t.parentFolderName,
          chunkSize: t.chunkSize,
          totalChunks: t.totalChunks,
          lastChunkIndex,
          uploadedChunks,
        };

        restoredList.push(task);

        // AUTO-RESUME SEAMLESSLY IF FILE PERSISTS IN INDEXEDDB!
        if (task.file) {
          processUploadTask(task, task.file);
        }
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
  }, [processUploadTask]);

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
            uploaded_chunks?: number[];
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
            uploadedChunks: initRes.uploaded_chunks || [],
          };

          // Save to IndexedDB so File persists across page refreshes!
          await saveUploadToDB({
            id: newTask.id,
            file,
            filename: newTask.filename,
            relativePath: newTask.relativePath,
            totalBytes: newTask.totalBytes,
            uploadedBytes: newTask.uploadedBytes,
            chunkSize: newTask.chunkSize,
            totalChunks: newTask.totalChunks,
            lastChunkIndex: newTask.lastChunkIndex,
            uploadedChunks: newTask.uploadedChunks,
            parentFolderId: newTask.parentFolderId,
            parentFolderName: newTask.parentFolderName,
            status: 'uploading',
            updatedAt: Date.now(),
          });

          setTasks((prev) => [newTask, ...prev.filter((t) => t.id !== newTask.id)]);

          // Start high-speed parallel chunk upload loop
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
          status: 'uploading',
          updatedAt: Date.now(),
        });
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

    removeUploadFromDB(taskId);
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
