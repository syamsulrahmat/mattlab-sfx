import React, { useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Bookmark,
  FolderPlus,
  Download,
  FolderOpen,
  Copy,
  Wand2,
  Edit2,
} from 'lucide-react';
import { AudioItem } from './AudioPlayer';

export interface ContextMenuProps {
  x: number;
  y: number;
  item: AudioItem;
  isSelected: boolean;
  isPlaying: boolean;
  isCollected: boolean;
  assignedProjectsCount: number;
  onClose: () => void;
  onPlayPause: (item: AudioItem) => void;
  onToggleCollect: (item: AudioItem) => void;
  onOpenProjects: (item: AudioItem) => void;
  onDownload: (item: AudioItem) => void;
  onCopyExplorer: (item: AudioItem) => void;
  onCopySMB: (item: AudioItem) => void;
  onAiListen: (item: AudioItem) => void;
  onRename: (item: AudioItem) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  item,
  isSelected,
  isPlaying,
  isCollected,
  assignedProjectsCount,
  onClose,
  onPlayPause,
  onToggleCollect,
  onOpenProjects,
  onDownload,
  onCopyExplorer,
  onCopySMB,
  onAiListen,
  onRename,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Auto-dismiss on click outside, scroll, resize, or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    const handleScrollOrResize = () => {
      onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [onClose]);

  // Viewport edge clamping calculation
  const menuWidth = 230;
  const menuHeight = 330;

  let posX = x;
  let posY = y;

  if (typeof window !== 'undefined') {
    if (posX + menuWidth > window.innerWidth - 12) {
      posX = window.innerWidth - menuWidth - 12;
    }
    if (posY + menuHeight > window.innerHeight - 12) {
      posY = window.innerHeight - menuHeight - 12;
    }
    if (posX < 12) posX = 12;
    if (posY < 12) posY = 12;
  }

  return (
    <div
      ref={menuRef}
      style={{ left: `${posX}px`, top: `${posY}px` }}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-50 w-56 bg-slate-900/95 border border-slate-700/90 rounded-xl shadow-2xl py-1.5 backdrop-blur-md text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-100 select-none divide-y divide-slate-800"
    >
      {/* Sound Header Preview */}
      <div className="px-3 py-1.5 min-w-0">
        <div className="font-semibold text-white truncate text-[11px]" title={item.display_name || item.filename}>
          {item.display_name || item.filename}
        </div>
        <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between mt-0.5">
          <span>{item.duration ? `${item.duration}s` : ''}</span>
          <span className="text-slate-500 truncate max-w-[120px]">{item.sub_category || item.category}</span>
        </div>
      </div>

      {/* Primary Actions */}
      <div className="py-1">
        <button
          onClick={() => {
            onPlayPause(item);
            onClose();
          }}
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-indigo-600/25 hover:text-white transition text-left cursor-pointer group"
        >
          <span className="flex items-center gap-2">
            {isSelected && isPlaying ? (
              <Pause className="w-3.5 h-3.5 text-indigo-400" />
            ) : (
              <Play className="w-3.5 h-3.5 text-indigo-400 ml-0.5" />
            )}
            <span>{isSelected && isPlaying ? 'Pause Audio' : 'Play Sound'}</span>
          </span>
          <kbd className="text-[10px] text-slate-500 font-mono bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-700/60">
            Space
          </kbd>
        </button>

        <button
          onClick={() => {
            onToggleCollect(item);
            onClose();
          }}
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-amber-600/20 hover:text-amber-200 transition text-left cursor-pointer group"
        >
          <span className="flex items-center gap-2">
            <Bookmark className={`w-3.5 h-3.5 ${isCollected ? 'text-amber-400 fill-amber-400' : 'text-amber-400'}`} />
            <span>{isCollected ? 'Remove from Saved' : 'Save to Collection'}</span>
          </span>
          <kbd className="text-[10px] text-slate-500 font-mono bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-700/60">
            B
          </kbd>
        </button>

        <button
          onClick={() => {
            onOpenProjects(item);
            onClose();
          }}
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-amber-600/20 hover:text-amber-200 transition text-left cursor-pointer group"
        >
          <span className="flex items-center gap-2">
            <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {assignedProjectsCount > 0 ? `Projects (${assignedProjectsCount})` : 'Assign to Projects...'}
            </span>
          </span>
          <kbd className="text-[10px] text-slate-500 font-mono bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-700/60">
            P
          </kbd>
        </button>
      </div>

      {/* File & Network Operations */}
      <div className="py-1">
        <button
          onClick={() => {
            onDownload(item);
            onClose();
          }}
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-800 hover:text-white transition text-left cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Download className="w-3.5 h-3.5 text-indigo-300" />
            <span>Download Audio</span>
          </span>
          <kbd className="text-[10px] text-slate-500 font-mono bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-700/60">
            D
          </kbd>
        </button>

        <button
          onClick={() => {
            onCopyExplorer(item);
            onClose();
          }}
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-800 hover:text-white transition text-left cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <FolderOpen className="w-3.5 h-3.5 text-indigo-300" />
            <span>Reveal in Explorer</span>
          </span>
          <kbd className="text-[10px] text-slate-500 font-mono bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-700/60">
            E
          </kbd>
        </button>

        <button
          onClick={() => {
            onCopySMB(item);
            onClose();
          }}
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-800 hover:text-white transition text-left cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            <span>Copy Raw SMB Path</span>
          </span>
          <kbd className="text-[10px] text-slate-500 font-mono bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-700/60">
            C
          </kbd>
        </button>
      </div>

      {/* Sound Editing & AI */}
      <div className="py-1">
        <button
          onClick={() => {
            onAiListen(item);
            onClose();
          }}
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-800 hover:text-amber-300 transition text-left cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Wand2 className="w-3.5 h-3.5 text-amber-400" />
            <span>AI Acoustic Listen</span>
          </span>
        </button>

        <button
          onClick={() => {
            onRename(item);
            onClose();
          }}
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-800 hover:text-indigo-300 transition text-left cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Edit2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Rename Sound in App</span>
          </span>
        </button>
      </div>
    </div>
  );
};
