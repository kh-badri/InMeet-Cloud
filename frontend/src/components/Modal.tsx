import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Fullscreen Backdrop Overlay */}
      <div
        className="fixed inset-0 bg-black/60 transition-opacity animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Box with Midnight Navy / Crisp White styling */}
      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-10 w-full ${maxWidth} my-auto max-h-[90vh] overflow-y-auto rounded-2xl border border-[#92B4EC] bg-white p-5 sm:p-6 shadow-md dark:border-[#1E3E62] dark:bg-[#0B192C] animate-scale-in text-slate-900 dark:text-slate-100`}
      >
        <div className="flex items-center justify-between pb-3.5 border-b border-[#92B4EC]/40 dark:border-[#1E3E62]">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-[#92B4EC]/20 hover:text-slate-900 dark:hover:bg-[#1E3E62] dark:hover:text-[#FF6500] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body
  );
};
