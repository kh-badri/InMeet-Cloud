import React, { useRef } from 'react';
import { useDriveUpload, UploadTask } from '../context/DriveUploadContext';
import { formatBytes } from '../lib/api';
import {
  Upload, ChevronDown, ChevronUp, X, Pause, Play,
  CheckCircle2, AlertCircle, File, Folder, Zap, Clock
} from 'lucide-react';

export const UploadDock: React.FC = () => {
  const {
    tasks,
    isDockOpen,
    setIsDockOpen,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    clearCompleted,
  } = useDriveUpload();

  const fileReattachRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  if (tasks.length === 0) return null;

  const uploadingCount = tasks.filter((t) => t.status === 'uploading').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const totalCount = tasks.length;

  const formatEta = (seconds: number) => {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--';
    if (seconds < 60) return `${seconds} dtk`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}d`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}j ${remMins}m`;
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (!bytesPerSec || bytesPerSec <= 0) return '';
    const mbps = (bytesPerSec * 8) / 1_000_000;
    const mbpsStr = mbps >= 10 ? mbps.toFixed(0) : mbps.toFixed(1);
    return `${formatBytes(bytesPerSec)}/s (${mbpsStr} Mbps)`;
  };

  const handleReattachFile = (task: UploadTask, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      resumeUpload(task.id, file);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[92vw] max-w-sm sm:w-96 rounded-2xl border border-[#92B4EC] bg-white shadow-xl dark:border-[#1E3E62] dark:bg-[#0B192C] overflow-hidden transition-all text-slate-900 dark:text-slate-100">
      {/* Dock Header */}
      <div className="flex items-center justify-between border-b border-[#92B4EC]/60 bg-slate-50/80 px-4 py-3 dark:border-[#1E3E62] dark:bg-[#000000]">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FF6701] text-white dark:bg-[#FF6500]">
            <Upload className="h-4 w-4 text-white" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">
              {uploadingCount > 0 ? `Mengunggah ${uploadingCount} berkas...` : 'Status Upload'}
            </h4>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              {completedCount} dari {totalCount} selesai
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {completedCount > 0 && (
            <button
              onClick={clearCompleted}
              title="Bersihkan berkas selesai"
              className="rounded-lg px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-800 dark:hover:bg-[#1E3E62] dark:hover:text-slate-200"
            >
              Hapus Selesai
            </button>
          )}

          <button
            onClick={() => setIsDockOpen(!isDockOpen)}
            title={isDockOpen ? 'Sembunyikan' : 'Buka'}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-[#92B4EC]/20 hover:text-slate-800 dark:hover:bg-[#1E3E62] dark:hover:text-slate-200"
          >
            {isDockOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Dock Content Body */}
      {isDockOpen && (
        <div className="max-h-72 overflow-y-auto divide-y divide-[#92B4EC]/30 dark:divide-[#1E3E62]/60 p-1">
          {tasks.map((task) => {
            return (
              <div key={task.id} className="p-3 space-y-2">
                {/* File Header Info */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <File className="h-4 w-4 text-[#FF6701] dark:text-[#FF6500] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate" title={task.filename}>
                        {task.filename}
                      </p>
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                        <Folder className="h-2.5 w-2.5 text-slate-400" />
                        <span className="truncate">{task.parentFolderName || 'Drive Saya'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Status Icon */}
                  <div className="flex items-center gap-1 shrink-0">
                    {task.status === 'completed' && (
                      <span className="text-emerald-500">
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                    )}

                    {task.status === 'error' && (
                      <span className="text-rose-500" title={task.errorMessage || 'Upload gagal'}>
                        <AlertCircle className="h-4 w-4" />
                      </span>
                    )}

                    {task.status === 'uploading' && (
                      <button
                        onClick={() => pauseUpload(task.id)}
                        title="Jeda upload"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-[#92B4EC]/20 dark:hover:bg-[#1E3E62]"
                      >
                        <Pause className="h-3 w-3" />
                      </button>
                    )}

                    {task.status === 'paused' && (
                      <>
                        {task.file ? (
                          <button
                            onClick={() => resumeUpload(task.id)}
                            title="Lanjutkan upload"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-[#FF6701] dark:text-[#FF6500] hover:bg-[#92B4EC]/20 dark:hover:bg-[#1E3E62]"
                          >
                            <Play className="h-3 w-3 fill-current" />
                          </button>
                        ) : (
                          <>
                            <input
                              type="file"
                              className="hidden"
                              ref={(el) => {
                                if (el) fileReattachRefs.current.set(task.id, el);
                              }}
                              onChange={(e) => handleReattachFile(task, e)}
                            />
                            <button
                              onClick={() => fileReattachRefs.current.get(task.id)?.click()}
                              className="rounded bg-[#FF6701] px-1.5 py-0.5 text-[9px] font-bold text-white hover:bg-[#FF6500] dark:bg-[#FF6500]"
                              title="Pilih kembali berkas ini untuk melanjutkan dari byte terakhir"
                            >
                              Lanjutkan
                            </button>
                          </>
                        )}
                      </>
                    )}

                    <button
                      onClick={() => cancelUpload(task.id)}
                      title="Batalkan"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#92B4EC]/25 dark:bg-[#000000]">
                  <div
                    className={`h-full transition-all duration-200 ${
                      task.status === 'completed'
                        ? 'bg-emerald-500'
                        : task.status === 'error'
                        ? 'bg-rose-500'
                        : task.status === 'paused'
                        ? 'bg-[#FEA82F]'
                        : 'bg-[#FF6701] dark:bg-[#FF6500]'
                    }`}
                    style={{ width: `${task.progressPercent}%` }}
                  />
                </div>

                {/* Real-time Telemetry (Bytes, Speed, ETA) */}
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  <span>
                    {formatBytes(task.uploadedBytes)} / {formatBytes(task.totalBytes)} ({task.progressPercent}%)
                  </span>

                  {task.status === 'uploading' && (
                    <div className="flex items-center gap-2">
                      {task.speedBytesPerSec > 0 && (
                        <span className="flex items-center gap-0.5 text-[#FF6701] dark:text-[#FEA82F] font-bold">
                          <Zap className="h-2.5 w-2.5 text-[#FF6701] dark:text-[#FEA82F]" />
                          {formatSpeed(task.speedBytesPerSec)}
                        </span>
                      )}
                      {task.etaSeconds > 0 && (
                        <span className="flex items-center gap-0.5 text-slate-500 dark:text-slate-400">
                          <Clock className="h-2.5 w-2.5" />
                          {formatEta(task.etaSeconds)}
                        </span>
                      )}
                    </div>
                  )}

                  {task.status === 'paused' && (
                    <span className="font-bold text-[#FEA82F]">Dijeda</span>
                  )}

                  {task.status === 'completed' && (
                    <span className="font-bold text-emerald-500">Selesai</span>
                  )}

                  {task.status === 'error' && (
                    <span className="font-bold text-rose-500 truncate max-w-[120px]" title={task.errorMessage}>
                      {task.errorMessage || 'Gagal'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
