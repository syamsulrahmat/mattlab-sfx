import React from 'react';
import { MousePointer, Scissors, Settings } from 'lucide-react';

interface ShortcutFooterProps {
  hasSelectedSound: boolean;
  isPlaying: boolean;
  hasTrimRegion: boolean;
  isSearching: boolean;
  isLooping: boolean;
  isCollected?: boolean;
  nudgeStep?: number;
  fastJumpStep?: number;
  onOpenSettings?: () => void;
}

export const ShortcutFooter: React.FC<ShortcutFooterProps> = ({
  hasSelectedSound,
  isPlaying,
  hasTrimRegion,
  isSearching,
  isLooping,
  nudgeStep = 0.1,
  fastJumpStep = 0.5,
  onOpenSettings,
}) => {
  const KeyBadge = ({
    children,
    variant = 'default',
  }: {
    children: React.ReactNode;
    variant?: 'default' | 'violet' | 'indigo' | 'amber';
  }) => {
    let colorClasses = 'bg-slate-800 text-slate-200 border-slate-700/80 shadow-[inset_0_-1px_0_rgba(0,0,0,0.5)]';
    if (variant === 'violet') {
      colorClasses = 'bg-violet-950/80 text-violet-200 border-violet-600/60 shadow-[inset_0_-1px_0_rgba(139,92,246,0.3)]';
    } else if (variant === 'indigo') {
      colorClasses = 'bg-indigo-950/80 text-indigo-200 border-indigo-600/60 shadow-[inset_0_-1px_0_rgba(99,102,241,0.3)]';
    } else if (variant === 'amber') {
      colorClasses = 'bg-amber-950/80 text-amber-200 border-amber-600/60 shadow-[inset_0_-1px_0_rgba(245,158,11,0.3)]';
    }

    return (
      <kbd
        className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded text-[10px] font-mono font-medium border leading-tight ${colorClasses}`}
      >
        {children}
      </kbd>
    );
  };

  const MouseBadge = ({ label, color = 'indigo' }: { label: string; color?: 'indigo' | 'violet' }) => (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold border leading-tight ${
        color === 'violet'
          ? 'bg-violet-950/80 text-violet-300 border-violet-700/60'
          : 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60'
      }`}
    >
      <MousePointer className="w-2.5 h-2.5 opacity-80" />
      {label}
    </span>
  );

  return (
    <footer className="h-[26px] bg-slate-950 border-t border-slate-800/90 px-3 sm:px-4 flex items-center justify-between text-[11px] text-slate-400 select-none shrink-0 z-30 overflow-hidden w-full backdrop-blur">
      <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar py-0.5 whitespace-nowrap min-w-0">
        {/* Context 1: Search Input Focused */}
        {isSearching ? (
          <>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-indigo-400 hidden lg:inline">
              Search Mode
            </span>
            <div className="flex items-center gap-1.5">
              <KeyBadge variant="indigo">Enter</KeyBadge>
              <span className="text-slate-300">Play Top Match</span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5">
              <KeyBadge>↓</KeyBadge>
              <span className="text-slate-300">Jump to Results</span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5">
              <KeyBadge>Esc</KeyBadge>
              <span className="text-slate-300">Exit Search</span>
            </div>
          </>
        ) : hasTrimRegion ? (
          /* Context 2: Trim Selection Active (Blender Trim Mode) */
          <>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-violet-400">
              <Scissors className="w-3 h-3 text-violet-400" /> Trim Mode
            </span>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5">
              <MouseBadge label="Drag Edge" color="violet" />
              <span className="text-slate-300">Resize</span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5">
              <KeyBadge variant="violet">Space</KeyBadge>
              <span className="text-violet-200 font-medium">Audition</span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5">
              <KeyBadge>←</KeyBadge> <KeyBadge>→</KeyBadge>
              <span className="text-violet-200 font-medium">Scrub ({nudgeStep}s)</span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5">
              <KeyBadge variant="violet">D</KeyBadge>
              <span className="text-violet-200 font-medium">Download Slice</span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5">
              <KeyBadge variant="violet">X</KeyBadge>
              <span className="text-slate-300">Clear Trim</span>
            </div>
            <span className="text-slate-700 hidden sm:inline">•</span>
            <div className="hidden sm:flex items-center gap-1.5">
              <KeyBadge variant={isLooping ? 'indigo' : 'default'}>L</KeyBadge>
              <span className="text-slate-300">{isLooping ? 'Looping' : 'Loop'}</span>
            </div>
            <span className="text-slate-700 hidden md:inline">•</span>
            <div className="hidden md:flex items-center gap-1.5">
              <KeyBadge>Shift</KeyBadge><span className="text-slate-500 text-[10px]">+</span><KeyBadge>←/→</KeyBadge>
              <span className="text-slate-400">Jump ({fastJumpStep}s)</span>
            </div>
            <span className="text-slate-700 hidden lg:inline">•</span>
            <div className="hidden lg:flex items-center gap-1.5">
              <KeyBadge>I</KeyBadge> <KeyBadge>O</KeyBadge>
              <span className="text-slate-400">Nudge In/Out</span>
            </div>
          </>
        ) : hasSelectedSound ? (
          /* Context 3: Track Loaded / Playing */
          <>
            <div className="flex items-center gap-1.5">
              <MouseBadge label="LMB" color="indigo" />
              <span className="text-slate-300">Seek</span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5">
              <MouseBadge label="LMB Drag" color="violet" />
              <span className="text-slate-300">Trim</span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5">
              <KeyBadge variant="indigo">Space</KeyBadge>
              <span className="text-slate-200 font-medium">{isPlaying ? 'Pause' : 'Play'}</span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5">
              <KeyBadge>←</KeyBadge> <KeyBadge>→</KeyBadge>
              <span className="text-slate-300">Nudge ({nudgeStep}s)</span>
            </div>
            <span className="text-slate-700 hidden sm:inline">•</span>
            <div className="hidden sm:flex items-center gap-1.5">
              <KeyBadge>Shift</KeyBadge><span className="text-slate-500 text-[10px]">+</span><KeyBadge>←/→</KeyBadge>
              <span className="text-slate-400">Jump ({fastJumpStep}s)</span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5">
              <KeyBadge>I</KeyBadge> <KeyBadge>O</KeyBadge>
              <span className="text-slate-300">Mark In/Out</span>
            </div>
            <span className="text-slate-700 hidden md:inline">•</span>
            <div className="hidden md:flex items-center gap-1.5">
              <KeyBadge variant="violet">D</KeyBadge>
              <span className="text-slate-300">Download</span>
            </div>
            <span className="text-slate-700 hidden md:inline">•</span>
            <div className="hidden md:flex items-center gap-1.5">
              <KeyBadge variant={isLooping ? 'indigo' : 'default'}>L</KeyBadge>
              <span className="text-slate-400">Loop</span>
            </div>
            <span className="text-slate-700 hidden lg:inline">•</span>
            <div className="hidden lg:flex items-center gap-1.5">
              <KeyBadge>B</KeyBadge>
              <span className="text-slate-400">Collect</span>
            </div>
            <span className="text-slate-700 hidden lg:inline">•</span>
            <div className="hidden lg:flex items-center gap-1.5">
              <KeyBadge>P</KeyBadge>
              <span className="text-slate-400">Projects</span>
            </div>
            <span className="text-slate-700 hidden xl:inline">•</span>
            <div className="hidden xl:flex items-center gap-1.5">
              <KeyBadge>E</KeyBadge>
              <span className="text-slate-400">Explorer</span>
            </div>
            <span className="text-slate-700 hidden xl:inline">•</span>
            <div className="hidden xl:flex items-center gap-1.5">
              <KeyBadge>C</KeyBadge>
              <span className="text-slate-400">SMB</span>
            </div>
          </>
        ) : (
          /* Context 4: Idle / Nothing Loaded */
          <>
            <div className="flex items-center gap-1.5">
              <MouseBadge label="LMB" color="indigo" />
              <span className="text-slate-300">Select & Play</span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5">
              <KeyBadge variant="indigo">Space</KeyBadge>
              <span className="text-slate-300">Play First Track</span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5">
              <KeyBadge>↑</KeyBadge> <KeyBadge>↓</KeyBadge>
              <span className="text-slate-300">Navigate</span>
            </div>
            <span className="text-slate-700 hidden sm:inline">•</span>
            <div className="hidden sm:flex items-center gap-1.5">
              <KeyBadge>/</KeyBadge>
              <span className="text-slate-400">Search</span>
            </div>
          </>
        )}
      </div>

      {/* Right status & Settings trigger */}
      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 shrink-0 pl-2">
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
            title="Open Playback & Scrub Settings"
          >
            <Settings className="w-3 h-3 text-slate-400" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        )}
        <span className="hidden md:inline text-slate-600">|</span>
        <span className="hidden md:inline">MattLab SFX</span>
      </div>
    </footer>
  );
};
