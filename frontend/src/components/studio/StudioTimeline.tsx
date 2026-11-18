import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Volume2, VolumeX, Trash2, ZoomIn, ZoomOut, Move, Sliders, Undo2, Redo2 } from 'lucide-react';
import { StudioTrack, StudioClip } from './types';
import { ClipWaveform } from './ClipWaveform';

interface StudioTimelineProps {
  tracks: StudioTrack[];
  clips: StudioClip[];
  currentTime: number;
  duration: number;
  selectedTrackId: number;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  isPlaying?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onSelectTrack: (trackId: number) => void;
  onSeek: (time: number) => void;
  onUpdateClip: (clipId: string, updates: Partial<StudioClip>) => void;
  onCommitClipMove?: (clipId: string, initialStartTime: number, finalStartTime: number) => void;
  onDeleteClip: (clipId: string) => void;
  onToggleMute: (trackId: number) => void;
  onToggleSolo: (trackId: number) => void;
  onUpdateTrackVolume: (trackId: number, volume: number) => void;
}

export const StudioTimeline: React.FC<StudioTimelineProps> = React.memo(({
  tracks,
  clips,
  currentTime,
  duration,
  selectedTrackId,
  videoRef,
  isPlaying = false,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onSelectTrack,
  onSeek,
  onUpdateClip,
  onCommitClipMove,
  onDeleteClip,
  onToggleMute,
  onToggleSolo,
  onUpdateTrackVolume,
}) => {
  const [pps, setPps] = useState(60); // pixels per second
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ startX: number; initialTime: number }>({ startX: 0, initialTime: 0 });
  const isDraggingScrubberRef = useRef(false);

  const timelineDuration = Math.max(duration || 10, 15);
  // Add 260px right margin so the rightmost timecode and clips have ample room and are never cut off
  const totalWidth = Math.max(800, timelineDuration * pps + 260);

  // Time ruler ticks (memoized to eliminate frame garbage collection churn)
  const ticks = useMemo(() => {
    const tickInterval = pps < 50 ? 5 : pps < 100 ? 2 : 1;
    const numTicks = Math.ceil(timelineDuration / tickInterval);
    return Array.from({ length: numTicks + 1 }, (_, i) => i * tickInterval);
  }, [timelineDuration, pps]);

  // Zoom helpers
  const zoomIn = useCallback(() => setPps((prev) => Math.min(240, prev + 15)), []);
  const zoomOut = useCallback(() => setPps((prev) => Math.max(20, prev - 15)), []);
  const zoomReset = useCallback(() => setPps(60), []);

  // Zoom keyboard shortcuts (+ / - / 0) with capture: true to prevent browser native zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      const isZoomIn = e.key === '=' || e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd';
      const isZoomOut = e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract';
      const isZoomReset = (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') && (e.ctrlKey || e.metaKey);

      if (isZoomIn) {
        e.preventDefault();
        e.stopPropagation();
        zoomIn();
      } else if (isZoomOut) {
        e.preventDefault();
        e.stopPropagation();
        zoomOut();
      } else if (isZoomReset) {
        e.preventDefault();
        e.stopPropagation();
        zoomReset();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [zoomIn, zoomOut, zoomReset]);

  // 60fps / 120fps GPU-accelerated playhead movement via requestAnimationFrame
  useEffect(() => {
    let animId: number;
    const updateLoop = () => {
      if (playheadRef.current) {
        let time = currentTime;
        if (isPlaying && videoRef?.current && !isDraggingScrubberRef.current) {
          time = videoRef.current.currentTime;
        }
        const x = time * pps;
        playheadRef.current.style.transform = `translateX(${x}px)`;
      }
      animId = requestAnimationFrame(updateLoop);
    };

    animId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animId);
  }, [pps, isPlaying, videoRef, currentTime]);

  // Auto-scroll timeline to keep playhead in view during playback or scrubbing
  useEffect(() => {
    if (!timelineRef.current) return;
    const playheadX = currentTime * pps;
    const scrollLeft = timelineRef.current.scrollLeft;
    const clientWidth = timelineRef.current.clientWidth;

    if (playheadX > scrollLeft + clientWidth - 80) {
      timelineRef.current.scrollLeft = playheadX - 120;
    } else if (playheadX < scrollLeft) {
      timelineRef.current.scrollLeft = Math.max(0, playheadX - 40);
    }
  }, [currentTime, pps]);

  // Real-time Scrubbing Drag (both clicking & dragging across ruler or playhead)
  const handleScrubStart = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!timelineRef.current) return;
    isDraggingScrubberRef.current = true;

    const calcTime = (clientX: number) => {
      const rect = timelineRef.current!.getBoundingClientRect();
      const scrollLeft = timelineRef.current!.scrollLeft;
      const clickX = clientX - rect.left + scrollLeft;
      return Math.max(0, Math.min(timelineDuration, clickX / pps));
    };

    const initialTime = calcTime(e.clientX);
    onSeek(initialTime);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const newTime = calcTime(moveEvent.clientX);
      onSeek(newTime);
    };

    const handleMouseUp = () => {
      isDraggingScrubberRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Dragging clip along time axis
  const handleClipMouseDown = (clip: StudioClip, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingClipId(clip.id);
    const initialStartTime = clip.startTime;
    dragStartRef.current = {
      startX: e.clientX,
      initialTime: clip.startTime,
    };

    let latestStartTime = clip.startTime;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - dragStartRef.current.startX;
      const deltaTime = deltaX / pps;
      const newStartTime = Math.max(0, parseFloat((dragStartRef.current.initialTime + deltaTime).toFixed(3)));
      latestStartTime = newStartTime;
      onUpdateClip(clip.id, { startTime: newStartTime });
    };

    const handleMouseUp = () => {
      setDraggingClipId(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (onCommitClipMove && latestStartTime !== initialStartTime) {
        onCommitClipMove(clip.id, initialStartTime, latestStartTime);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Non-passive native wheel listener to zoom timeline and 100% stop browser page zoom
  useEffect(() => {
    const el = timelineContainerRef.current;
    if (!el) return;

    const handleNativeWheel = (e: WheelEvent) => {
      // Zoom if Ctrl, Meta (Cmd), or Alt is held
      if (e.ctrlKey || e.metaKey || e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        if (e.deltaY < 0) {
          zoomIn();
        } else {
          zoomOut();
        }
      }
    };

    // { passive: false } is MANDATORY so e.preventDefault() actually stops native browser zoom
    el.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleNativeWheel);
    };
  }, [zoomIn, zoomOut]);

  return (
    <div
      ref={timelineContainerRef}
      className="flex flex-col h-full bg-slate-950/70 select-none overflow-hidden border-t border-slate-800"
    >
      {/* Timeline Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
            Multi-Track Canvas
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            4 Tracks • {clips.length} Clips
          </span>
        </div>

        {/* Right side controls: Undo/Redo & Zoom Controls */}
        <div className="flex items-center gap-2">
          {/* Undo / Redo Controls */}
          <div className="flex items-center gap-0.5 border-r border-slate-800 pr-2">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className={`flex items-center gap-1 px-1.5 py-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer ${
                !canUndo ? 'opacity-30 pointer-events-none' : ''
              }`}
              title="Undo [Ctrl+Z]"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span className="text-[10px] hidden sm:inline">Undo</span>
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className={`flex items-center gap-1 px-1.5 py-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer ${
                !canRedo ? 'opacity-30 pointer-events-none' : ''
              }`}
              title="Redo [Ctrl+Shift+Z / Ctrl+Y]"
            >
              <Redo2 className="w-3.5 h-3.5" />
              <span className="text-[10px] hidden sm:inline">Redo</span>
            </button>
          </div>

          {/* Zoom Controls with Shortcut Badges */}
          <div className="flex items-center gap-1">
            <button
              onClick={zoomOut}
              className="flex items-center gap-1 px-1.5 py-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Zoom Out [- / _]"
            >
              <ZoomOut className="w-3.5 h-3.5" />
              <kbd className="text-[9px] font-mono px-1 rounded bg-slate-800 text-slate-400 border border-slate-700">-</kbd>
            </button>
            <button
              onClick={zoomReset}
              className="text-[10px] text-slate-400 hover:text-white font-mono px-1.5 py-0.5 rounded hover:bg-slate-800 transition cursor-pointer"
              title="Reset Zoom to 60px/s [Ctrl+0]"
            >
              {pps}px/s
            </button>
            <button
              onClick={zoomIn}
              className="flex items-center gap-1 px-1.5 py-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Zoom In [+ / =]"
            >
              <ZoomIn className="w-3.5 h-3.5" />
              <kbd className="text-[9px] font-mono px-1 rounded bg-slate-800 text-slate-400 border border-slate-700">+</kbd>
            </button>
          </div>
        </div>
      </div>

      {/* Main Timeline Workspace: Left Header Columns + Right Scrolling Lanes */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Track Headers (Fixed) */}
        <div className="w-48 shrink-0 flex flex-col border-r border-slate-800 bg-slate-900/90 z-20">
          {/* Ruler Header Blank */}
          <div className="h-7 border-b border-slate-800 flex items-center px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-950/40">
            Tracks
          </div>

          {/* Track Headers */}
          <div className="flex-1 flex flex-col">
            {tracks.map((track) => {
              const isSelected = selectedTrackId === track.id;
              return (
                <div
                  key={track.id}
                  onClick={() => onSelectTrack(track.id)}
                  className={`h-16 border-b border-slate-800/80 p-2 flex flex-col justify-between transition cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800/80 border-l-4 border-l-indigo-500'
                      : 'bg-slate-900/50 hover:bg-slate-850'
                  }`}
                >
                  {/* Track Title & Tag */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${track.colorBg} ${track.colorText} border ${track.colorBorder}`}
                      >
                        {track.tag}
                      </span>
                      <span className="text-xs font-semibold text-slate-200 truncate">
                        {track.name}
                      </span>
                    </div>

                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-indigo-400 shadow-sm animate-pulse" title="Active Spotting Track" />
                    )}
                  </div>

                  {/* Track Controls: Mute, Solo, Volume */}
                  <div className="flex items-center justify-between gap-1 pt-1">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleMute(track.id);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition cursor-pointer ${
                          track.muted
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                        title="Mute Track"
                      >
                        M
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSolo(track.id);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition cursor-pointer ${
                          track.solo
                            ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                        title="Solo Track"
                      >
                        S
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <Volume2 className="w-2.5 h-2.5 text-slate-500" />
                      <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.05"
                        value={track.volume}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onUpdateTrackVolume(track.id, parseFloat(e.target.value))}
                        className="w-14 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        title={`Track Volume: ${Math.round(track.volume * 100)}%`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Scrolling Timeline Lanes */}
        <div
          ref={timelineRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-slate-950/90"
        >
          <div style={{ width: `${totalWidth}px` }} className="relative h-full flex flex-col">
            {/* Time Ruler (Draggable Scrubber) */}
            <div
              onMouseDown={handleScrubStart}
              className="h-7 border-b border-slate-800 bg-slate-900/60 relative cursor-ew-resize select-none"
              title="Click & Drag to Scrub Playhead"
            >
              {ticks.map((sec) => {
                const x = sec * pps;
                const min = Math.floor(sec / 60);
                const s = sec % 60;
                const timeStr = `${min}:${s < 10 ? '0' : ''}${s}`;

                return (
                  <div
                    key={sec}
                    style={{ left: `${x}px` }}
                    className="absolute top-0 bottom-0 border-l border-slate-700/60 pl-1 flex items-center pointer-events-none"
                  >
                    <span className="text-[9px] font-mono text-slate-400 select-none">
                      {timeStr}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Red Playhead Line & Draggable Scrubber with GPU transform */}
            <div
              ref={playheadRef}
              style={{ transform: `translateX(${currentTime * pps}px)` }}
              className="absolute top-0 bottom-0 left-0 w-0.5 bg-rose-500 z-30 shadow-lg shadow-rose-500/50 pointer-events-none will-change-transform"
            >
              {/* Grab Handle directly on ruler */}
              <div
                onMouseDown={handleScrubStart}
                className="w-6 h-7 -ml-[12px] top-0 absolute flex items-center justify-center cursor-ew-resize pointer-events-auto group"
                title="Drag to Scrub Playhead"
              >
                <div className="w-3.5 h-3.5 bg-rose-500 rotate-45 shadow-md shadow-rose-500/90 group-hover:scale-125 transition-transform" />
              </div>
            </div>

            {/* 4 Track Lanes */}
            <div className="flex-1 flex flex-col relative pb-4">
              {tracks.map((track) => {
                const trackClips = clips.filter((c) => c.trackId === track.id);
                const isSelected = selectedTrackId === track.id;

                return (
                  <div
                    key={track.id}
                    onMouseDown={(e) => {
                      onSelectTrack(track.id);
                      handleScrubStart(e);
                    }}
                    className={`h-16 border-b border-slate-800/60 relative transition cursor-crosshair ${
                      isSelected ? 'bg-slate-900/40' : 'bg-transparent'
                    }`}
                  >
                    {/* Render Clips with Real Audio Waveform Background */}
                    {trackClips.map((clip) => {
                      const clipLeft = clip.startTime * pps;
                      const clipWidth = Math.max(30, clip.duration * pps);
                      const isDragging = draggingClipId === clip.id;

                      return (
                        <div
                          key={clip.id}
                          style={{
                            left: `${clipLeft}px`,
                            width: `${clipWidth}px`,
                          }}
                          onMouseDown={(e) => handleClipMouseDown(clip, e)}
                          className={`absolute top-1.5 bottom-1.5 rounded-lg border shadow-md flex flex-col justify-between p-1.5 cursor-grab active:cursor-grabbing transition-shadow overflow-hidden group select-none ${
                            track.colorClip
                          } ${isDragging ? 'opacity-80 scale-[0.99] ring-2 ring-white' : ''}`}
                        >
                          {/* Audio Waveform Background */}
                          <ClipWaveform soundId={clip.soundId} />

                          {/* Clip Header: Title + Delete */}
                          <div className="flex items-center justify-between gap-1 z-10">
                            <span
                              className="text-[10px] font-bold truncate leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] text-white"
                              title={clip.name}
                            >
                              {clip.name}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteClip(clip.id);
                              }}
                              className="p-0.5 rounded hover:bg-black/50 text-white/80 hover:text-white transition cursor-pointer"
                              title="Delete Clip"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>

                          {/* Clip Footer: Start Time & Duration */}
                          <div className="flex items-center justify-between text-[8px] font-mono opacity-90 z-10 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] text-white/90">
                            <span>{clip.startTime.toFixed(2)}s</span>
                            <span>{clip.duration.toFixed(1)}s</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
