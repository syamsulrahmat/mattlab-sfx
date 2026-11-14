import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, Info, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  severity?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  severity = 'danger',
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  const getIcon = () => {
    switch (severity) {
      case 'danger':
        return (
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
        );
      case 'warning':
        return (
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
        );
      case 'info':
      default:
        return (
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <Info className="w-5 h-5" />
          </div>
        );
    }
  };

  const getConfirmButtonClasses = () => {
    switch (severity) {
      case 'danger':
        return 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30';
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/30';
      case 'info':
      default:
        return 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30';
    }
  };

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-5 flex flex-col gap-4 text-slate-200 overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {getIcon()}
            <div className="min-w-0 pt-0.5">
              <h3 className="text-base font-bold text-white tracking-tight leading-snug">
                {title}
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed whitespace-pre-line">
                {message}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition shrink-0"
            title="Cancel [Esc]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800 text-xs">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer"
          >
            {cancelText} <span className="text-[10px] text-slate-500 font-mono ml-1">[Esc]</span>
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-3.5 py-1.5 rounded-lg font-semibold transition cursor-pointer ${getConfirmButtonClasses()}`}
          >
            {confirmText} <span className="text-[10px] opacity-75 font-mono ml-1">[Enter]</span>
          </button>
        </div>
      </div>
    </div>
  );
};
