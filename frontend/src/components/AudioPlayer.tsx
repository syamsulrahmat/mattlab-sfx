import React from 'react';
import { Play, Pause, FolderOpen, Copy, Check, Wand2, Repeat, Volume2, VolumeX, Download, Bookmark, FolderPlus } from 'lucide-react';

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
  onDownload: (item: AudioItem) => void;
  isCollected?: boolean;
  onToggleCollect?: (item: AudioItem) => void;
  onOpenProjects?: (item: AudioItem) => void;
  assignedProjectsCount?: number;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  currentItem,
  isPlaying,
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
            className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white flex items-center justify-center transition shadow-lg shadow-indigo-600/25 shrink-0 cursor-pointer"
            title="Play / Pause [Space]"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-semibold text-white truncate leading-snug">
                {currentItem ? (currentItem.display_name || currentItem.filename) : 'Select a sound effect to preview'}
              </span>
              {currentItem && currentItem.sample_rate > 0 && (
                <span className="hidden md:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700/60 shrink-0">
                  {(currentItem.sample_rate / 1000).toFixed(1)} kHz {currentItem.channels === 2 ? 'Stereo' : currentItem.channels === 1 ? 'Mono' : ''}
                </span>
              )}
            </div>
            <div className="text-[10px] sm:text-xs text-slate-400 truncate leading-snug mt-0.5 flex items-center gap-2">
              <span className="truncate">
                {currentItem ? currentItem.filename : 'Shortcuts: [Space] Play • [↑/↓] Navigate • [B] Collect • [D] Download • [E] Reveal • [C] Copy • [L] Loop'}
              </span>
            </div>
          </div>
        </div>

        {/* Studio Controls: Timecode + Loop + Volume + Actions */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 ml-auto">
          {/* Real-time Timecode */}
          <div className="px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-[11px] font-mono text-indigo-300 shrink-0 select-none">
            <span>{formatTime(currentTime)}</span>
            <span className="text-slate-500 mx-1">/</span>
            <span className="text-slate-400">{formatTime(duration || currentItem?.duration || 0)}</span>
          </div>

          {/* Loop Toggle */}
          <button
            onClick={onToggleLoop}
            className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${
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
              className="text-slate-400 hover:text-white transition"
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
                      ? 'bg-amber-950/40 border-amber-500/60 text-amber-200'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 border-slate-700'
                  }`}
                  title="Assign sound to project collections"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden md:inline">
                    {assignedProjectsCount > 0 ? `Projects (${assignedProjectsCount})` : 'Projects'}
                  </span>
                </button>
              )}

              <button
                onClick={() => onAiListen(currentItem.id)}
                disabled={listeningId === currentItem.id}
                className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-amber-300 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-slate-700 transition"
                title="Detect sound type with AI"
              >
                <Wand2 className={`w-3.5 h-3.5 ${listeningId === currentItem.id ? 'animate-spin' : ''}`} />
                <span className="hidden md:inline">AI Listen</span>
              </button>

              <button
                onClick={() => onCopyExplorer(currentItem)}
                className="flex items-center gap-1.5 text-xs bg-indigo-900/40 hover:bg-indigo-600/60 text-indigo-200 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-indigo-700/40 transition"
                title="Reveal in Windows Explorer [Hotkey: E]"
              >
                {revealedId === currentItem.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FolderOpen className="w-3.5 h-3.5" />}
                <span className="hidden md:inline">Reveal [E]</span>
              </button>

              <button
                onClick={() => onCopySMB(currentItem)}
                className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-slate-700 transition"
                title="Copy Windows SMB network path [Hotkey: C]"
              >
                {copiedId === currentItem.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="hidden md:inline">Copy [C]</span>
              </button>

              <button
                onClick={() => onDownload(currentItem)}
                className="flex items-center gap-1.5 text-xs bg-indigo-950/60 hover:bg-indigo-600/60 text-indigo-200 hover:text-white p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-indigo-700/50 transition cursor-pointer"
                title="Download original audio file directly in browser [Hotkey: D]"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Download [D]</span>
              </button>
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
