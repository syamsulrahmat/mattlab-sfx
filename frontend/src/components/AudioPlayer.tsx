import React from 'react';
import { Play, Pause, FolderOpen, Copy, Check, Wand2, Repeat, Volume2, VolumeX, Download, Bookmark, FolderPlus, Loader2, Scissors, X } from 'lucide-react';

export interface AudioItem {
  id: number;
  filename: string;
  display_name: string;
  rel_path: string;
  category: string;
  sub_category: string;
  duration: number;
  sample_rate: number;
  channels: number;
  smb_path: string;
  explorer_cmd?: string;
  description: string;
}

interface AudioPlayerProps {
  currentItem: AudioItem | null;
  isPlaying: boolean;
  isLoading?: boolean;
  onPlayPause: () => void;
  waveformRef: React.RefObject<HTMLDivElement>;
  currentTime: number;
  duration: number;
  isLooping: boolean;
  onToggleLoop: () => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  onAiListen: (id: number) => void;
  listeningId: number | null;
  onCopyExplorer: (item: AudioItem) => void;
  revealedId: number | null;
  onCopySMB: (item: AudioItem) => void;
  copiedId: number | null;
  onDownload: (item: AudioItem, trim?: { start: number; end: number } | null) => void;
  isCollected?: boolean;
  onToggleCollect?: (item: AudioItem) => void;
  onOpenProjects?: (item: AudioItem) => void;
  assignedProjectsCount?: number;
  isAdmin?: boolean;
  trimRegion?: { start: number; end: number } | null;
  onClearTrim?: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  currentItem,
  isPlaying,
  isLoading = false,
  onPlayPause,
  waveformRef,
  currentTime,
  duration,
  isLooping,
  onToggleLoop,
  volume,
  onVolumeChange,
  onAiListen,
  listeningId,
  onCopyExplorer,
  revealedId,
  onCopySMB,
  copiedId,
  onDownload,
  isCollected = false,
  onToggleCollect,
  onOpenProjects,
  assignedProjectsCount = 0,
  isAdmin = false,
  trimRegion = null,
  onClearTrim,
}) => {
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '00:00.0';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  return (
    <div className="shrink-0 border-t border-slate-800 bg-slate-900/95 backdrop-blur py-3 px-3 sm:px-5 flex flex-col gap-2 w-full max-w-full z-20">
      {/* Upper Control Bar */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 min-w-0 w-full">
        {/* Play Button & Sound Details */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={onPlayPause}
            disabled={!currentItem}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition shadow-lg shrink-0 cursor-pointer ${
              isLoading
                ? 'bg-indigo-950 border border-indigo-400/60 text-indigo-300 shadow-indigo-500/20'
                : 'bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white shadow-indigo-600/25'
            }`}
            title={isLoading ? 'Buffering audio...' : 'Play / Pause [Space]'}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-indigo-300" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-semibold text-white truncate leading-snug">
                {currentItem ? (currentItem.display_name || currentItem.filename) : 'Select a sound effect to preview'}
              </span>
              {isLoading && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 shrink-0 animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" /> Buffering
                </span>
              )}
              {currentItem && currentItem.sample_rate > 0 && (
                <span className="hidden md:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700/60 shrink-0">
                  {(currentItem.sample_rate / 1000).toFixed(1)} kHz {currentItem.channels === 2 ? 'Stereo' : currentItem.channels === 1 ? 'Mono' : ''}
                </span>
              )}
            </div>
            <div className="text-[10px] sm:text-xs text-slate-400 truncate leading-snug mt-0.5 flex items-center gap-2">
              <span className="truncate">
                {currentItem ? currentItem.rel_path || currentItem.filename : 'Ready to audition • Select any sound to preview'}
              </span>
            </div>
          </div>
        </div>

        {/* Studio Controls: Timecode + Loop + Volume + Actions */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 ml-auto">
          {/* Real-time Timecode & Trim Indicator */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-[11px] font-mono text-indigo-300 shrink-0 select-none">
              <span>{formatTime(currentTime)}</span>
              <span className="text-slate-500 mx-1">/</span>
              <span className="text-slate-400">{formatTime(duration || currentItem?.duration || 0)}</span>
            </div>

            {trimRegion && trimRegion.end > trimRegion.start && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-950/70 border border-violet-500/50 text-[11px] font-mono text-violet-300 shadow-sm animate-in fade-in select-none">
                <Scissors className="w-3 h-3 text-violet-400 shrink-0" />
                <span>
                  {trimRegion.start.toFixed(2)}s – {trimRegion.end.toFixed(2)}s
                </span>
                <span className="text-violet-400 font-semibold ml-0.5">
                  ({(trimRegion.end - trimRegion.start).toFixed(2)}s)
                </span>
                {onClearTrim && (
                  <button
                    onClick={onClearTrim}
                    className="ml-1 text-slate-400 hover:text-white transition p-0.5 rounded hover:bg-violet-900/50 cursor-pointer"
                    title="Clear Trim Selection [Hotkey: X]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Loop Toggle */}
          <button
            onClick={onToggleLoop}
            className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
              isLooping
                ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
            title="Toggle Continuous Loop [Hotkey: L]"
          >
            <Repeat className="w-3.5 h-3.5" />
            <span className="hidden lg:inline text-[11px]">Loop</span>
          </button>

          {/* Volume Slider */}
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 px-2 py-1 rounded-lg">
            <button
              onClick={() => onVolumeChange(volume > 0 ? 0 : 0.8)}
              className="text-slate-400 hover:text-white transition cursor-pointer"
              title={volume === 0 ? 'Unmute' : 'Mute'}
            >
              {volume === 0 ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              title={`Volume: ${Math.round(volume * 100)}%`}
            />
          </div>

          {/* Action Buttons for Active Sound */}
          {currentItem && (
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Collect / Bookmark Button */}
              {onToggleCollect && (
                <button
                  onClick={() => onToggleCollect(currentItem)}
                  className={`flex items-center gap-1.5 text-xs p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border transition cursor-pointer ${
                    isCollected
                      ? 'bg-amber-950/50 border-amber-500/70 text-amber-300 shadow-sm shadow-amber-500/10'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 border-slate-700'
                  }`}
                  title={isCollected ? 'Remove from My Collection [Hotkey: B]' : 'Save to My Collection [Hotkey: B]'}
                >
                  <Bookmark className={`w-3.5 h-3.5 ${isCollected ? 'text-amber-400 fill-amber-400' : ''}`} />
                  <span className="hidden md:inline">{isCollected ? 'Collected' : 'Collect [B]'}</span>
                </button>
              )}

              {/* Projects Organizer Button */}
              {onOpenProjects && (
                <button
                  onClick={() => onOpenProjects(currentItem)}
                  className={`flex items-center gap-1.5 text-xs p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border transition cursor-pointer ${
                    assignedProjectsCount > 0
                      ? 'bg-orange-950/50 border-orange-500/60 text-orange-300'
                      : 'bg-orange-950/20 hover:bg-orange-600/30 text-orange-400 hover:text-orange-200 border-orange-800/40 hover:border-orange-500/60'
                  }`}
                  title="Assign sound to project collections [Hotkey: P]"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-orange-400" />
                  <span className="hidden md:inline">
                    {assignedProjectsCount > 0 ? `Projects (${assignedProjectsCount})` : 'Projects [P]'}
                  </span>
                </button>
              )}

              {/* AI Listen Button (Admin Only) */}
              {isAdmin && (
                <button
                  onClick={() => onAiListen(currentItem.id)}
                  disabled={listeningId === currentItem.id}
                  className="flex items-center gap-1.5 text-xs bg-fuchsia-950/40 hover:bg-fuchsia-600/30 text-fuchsia-300 hover:text-fuchsia-100 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-fuchsia-800/40 hover:border-fuchsia-500/60 transition cursor-pointer"
                  title="Detect sound type with AI"
                >
                  <Wand2 className={`w-3.5 h-3.5 ${listeningId === currentItem.id ? 'animate-spin text-fuchsia-400' : 'text-fuchsia-400'}`} />
                  <span className="hidden md:inline">AI Listen</span>
                </button>
              )}

              {/* Reveal in Explorer Button (Sky) */}
              <button
                onClick={() => onCopyExplorer(currentItem)}
                className="flex items-center gap-1.5 text-xs bg-sky-950/40 hover:bg-sky-600/30 text-sky-300 hover:text-sky-100 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-sky-800/40 hover:border-sky-500/60 transition cursor-pointer"
                title="Reveal in Windows Explorer [Hotkey: E]"
              >
                {revealedId === currentItem.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FolderOpen className="w-3.5 h-3.5 text-sky-400" />}
                <span className="hidden md:inline">Reveal [E]</span>
              </button>

              {/* Copy SMB Button (Emerald) */}
              <button
                onClick={() => onCopySMB(currentItem)}
                className="flex items-center gap-1.5 text-xs bg-emerald-950/40 hover:bg-emerald-600/30 text-emerald-300 hover:text-emerald-100 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-emerald-800/40 hover:border-emerald-500/60 transition cursor-pointer"
                title="Copy Windows SMB network path [Hotkey: C]"
              >
                {copiedId === currentItem.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-emerald-400" />}
                <span className="hidden md:inline">Copy [C]</span>
              </button>

              {/* Download Action (Dual Trim/Full button if trim is active) */}
              {trimRegion && trimRegion.end > trimRegion.start ? (
                <div className="flex items-center rounded-lg border border-violet-600/60 bg-violet-950/50 overflow-hidden shadow-sm">
                  <button
                    onClick={() => onDownload(currentItem, trimRegion)}
                    className="flex items-center gap-1.5 text-xs py-1.5 px-2.5 bg-violet-600 hover:bg-violet-500 text-white font-medium transition cursor-pointer"
                    title={`Download trimmed slice (${(trimRegion.end - trimRegion.start).toFixed(2)}s) [Hotkey: D]`}
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Trim ({(trimRegion.end - trimRegion.start).toFixed(1)}s) [D]</span>
                  </button>
                  <button
                    onClick={() => onDownload(currentItem, null)}
                    className="flex items-center gap-1 text-xs py-1.5 px-2 text-violet-300 hover:text-white hover:bg-violet-800/40 border-l border-violet-600/40 transition cursor-pointer"
                    title="Download full audio file"
                  >
                    <Download className="w-3 h-3" />
                    <span className="hidden sm:inline">Full</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onDownload(currentItem)}
                  className="flex items-center gap-1.5 text-xs bg-violet-950/40 hover:bg-violet-600/30 text-violet-300 hover:text-violet-100 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-violet-800/40 hover:border-violet-500/60 transition cursor-pointer"
                  title="Download original audio file directly in browser [Hotkey: D]"
                >
                  <Download className="w-3.5 h-3.5 text-violet-400" />
                  <span className="hidden md:inline">Download [D]</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Waveform Scrubber */}
      <div className="w-full bg-slate-950/60 rounded-lg px-2 py-1 border border-slate-800/80">
        <div ref={waveformRef} className="w-full" />
      </div>
    </div>
  );
};
