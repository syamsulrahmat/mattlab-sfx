import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Volume2, VolumeX, Trash2, ZoomIn, ZoomOut, Move, Sliders, Undo2, Redo2, Layers, AlertTriangle, Maximize2, Edit2 } from 'lucide-react';
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
  onCommitClipMove?: (
    clipId: string,
    initialStartTime: number,
    finalStartTime: number,
    initialTrackId?: number,
    finalTrackId?: number
  ) => void;
  onMoveClipToTrack?: (clipId: string, targetTrackId: number) => void;
  onRenameTrack?: (trackId: number, newName: string) => void;
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
  onMoveClipToTrack,
  onRenameTrack,
  onDeleteClip,
  onToggleMute,
  onToggleSolo,
  onUpdateTrackVolume,
}) => {
  const [pps, setPps] = useState(60); // pixels per second
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  const [layerMenuClipId, setLayerMenuClipId] = useState<string | null>(null);
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);
  const [editTrackName, setEditTrackName] = useState<string>('');

  const handleStartRename = (track: StudioTrack, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTrackId(track.id);
    setEditTrackName(track.name);
  };

  const handleCommitRename = (trackId: number) => {
    if (editingTrackId === trackId) {
      if (editTrackName.trim() && onRenameTrack) {
        onRenameTrack(trackId, editTrackName.trim());
      }
      setEditingTrackId(null);
    }
  };
  
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ startX: number; initialTime: number }>({ startX: 0, initialTime: 0 });
  const isDraggingScrubberRef = useRef(false);

  // Premiere-style Sequence Width: tightly bounded to sequence duration without wasted buffer
  const sequenceWidth = Math.ceil((duration > 0 ? duration : 10) * pps);
  const totalWidth = Math.max(timelineRef.current?.clientWidth || 800, sequenceWidth + 20);

  const formatTimeCode = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 100);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}.${ms < 10 ? '0' : ''}${ms}`;
  };

  const isAtEnd = duration > 0 && Math.abs(currentTime - duration) < 0.08;

  // Track previous zoom level and fit state
  const prevZoomLevelRef = useRef<number>(60);

  // Calculate current fit PPS based on viewport so sequence always fills 100% of window
  const getFitPps = useCallback(() => {
    if (!timelineRef.current || !duration || duration <= 0) return 20;
    const clientWidth = timelineRef.current.clientWidth;
    return parseFloat(Math.max(4, Math.min(240, (clientWidth - 20) / duration)).toFixed(2));
  }, [duration]);

  // Premiere-style "Zoom to Fit / Zoom Back to Playhead" ( \ shortcut toggle )
  const toggleZoomFit = useCallback(() => {
    if (!timelineRef.current || !duration || duration <= 0) return;
    const clientWidth = timelineRef.current.clientWidth;
    const fitPps = getFitPps();

    // If currently fitted to window (within 1.5px/s), toggle back to previous zoom and focus on playhead!
    const isCurrentlyFit = Math.abs(pps - fitPps) < 1.5;

    if (isCurrentlyFit) {
      // Restore previous zoom level (or default 60px/s if prev was fit)
      const targetPps = prevZoomLevelRef.current && Math.abs(prevZoomLevelRef.current - fitPps) > 2
        ? prevZoomLevelRef.current
        : Math.max(fitPps * 2.5, 60);

      setPps(targetPps);

      // Center timeline scroll directly on playhead area
      requestAnimationFrame(() => {
        if (timelineRef.current) {
          const playheadX = currentTime * targetPps;
          timelineRef.current.scrollLeft = Math.max(0, playheadX - clientWidth / 2);
        }
      });
    } else {
      // Currently zoomed in: save current pps and fit whole sequence to window
      prevZoomLevelRef.current = pps;
      setPps(fitPps);
      if (timelineRef.current) {
        timelineRef.current.scrollLeft = 0;
      }
    }
  }, [duration, pps, currentTime, getFitPps]);

  // Auto-fit to sequence on initial load and video change
  useEffect(() => {
    if (duration > 0 && timelineRef.current) {
      const clientWidth = timelineRef.current.clientWidth;
      const initialFitPps = parseFloat(Math.max(4, Math.min(240, (clientWidth - 20) / duration)).toFixed(2));
      setPps(initialFitPps);
      prevZoomLevelRef.current = Math.max(initialFitPps * 2.5, 60);
    }
  }, [duration]);

  // Keep sequence fitted to window on window resize or sound palette collapse/expand
  useEffect(() => {
    const timelineEl = timelineRef.current;
    if (!timelineEl) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (newWidth > 100 && duration > 0) {
          const newFit = parseFloat(Math.max(4, Math.min(240, (newWidth - 20) / duration)).toFixed(2));
          setPps((current) => (current <= newFit + 2 ? newFit : current));
        }
      }
    });

    ro.observe(timelineEl);
    return () => ro.disconnect();
  }, [duration]);

  // Time ruler ticks (cleanly capped at duration)
  const ticks = useMemo(() => {
    const tickInterval = pps < 30 ? 10 : pps < 60 ? 5 : pps < 120 ? 2 : 1;
    const maxSec = duration > 0 ? duration : 10;
    const numTicks = Math.floor(maxSec / tickInterval);
    const list: number[] = [];
    for (let i = 0; i <= numTicks; i++) {
      const sec = i * tickInterval;
      if (duration > 0 && Math.abs(sec - duration) < (tickInterval * 0.45)) {
        continue;
      }
      list.push(sec);
    }
    return list;
  }, [duration, pps]);

  // Smooth keyboard zoom centered on the playhead
  const zoomStep = useCallback((factor: number) => {
    const timelineEl = timelineRef.current;
    const fitPps = getFitPps();
    const targetPps = Math.max(fitPps, Math.min(240, parseFloat((pps * factor).toFixed(2))));

    if (targetPps !== pps) {
      prevZoomLevelRef.current = targetPps;
      setPps(targetPps);

      if (timelineEl) {
        const clientWidth = timelineEl.clientWidth;
        const playheadX = currentTime * targetPps;
        timelineEl.scrollLeft = Math.max(0, playheadX - clientWidth / 2);
      }
    }
  }, [pps, currentTime, getFitPps]);

  const zoomIn = useCallback(() => zoomStep(1.2), [zoomStep]);
  const zoomOut = useCallback(() => zoomStep(0.833), [zoomStep]);
  const zoomReset = useCallback(() => {
    const fitPps = getFitPps();
    const target = Math.max(fitPps, 60);
    prevZoomLevelRef.current = target;
    setPps(target);
  }, [getFitPps]);

  // Zoom keyboard shortcuts (+ / - / 0 / \) with capture: true
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      const isZoomIn = e.key === '=' || e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd';
      const isZoomOut = e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract';
      const isZoomReset = (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') && (e.ctrlKey || e.metaKey);
      const isZoomFit = e.key === '\\' || e.code === 'Backslash';

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
      } else if (isZoomFit) {
        e.preventDefault();
        e.stopPropagation();
        toggleZoomFit();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [zoomIn, zoomOut, zoomReset, toggleZoomFit]);

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
      const maxTime = duration > 0 ? duration : timelineDuration;
      return Math.max(0, Math.min(maxTime, clickX / pps));
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

  // Dragging clip along time axis and vertically across track layers
  const handleClipMouseDown = (clip: StudioClip, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingClipId(clip.id);
    setLayerMenuClipId(null);
    const initialStartTime = clip.startTime;
    const initialTrackId = clip.trackId;
    const startX = e.clientX;
    const startY = e.clientY;

    let latestStartTime = clip.startTime;
    let latestTrackId = clip.trackId;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / pps;
      const newStartTime = Math.max(0, parseFloat((initialStartTime + deltaTime).toFixed(3)));

      const deltaY = moveEvent.clientY - startY;
      const trackDelta = Math.round(deltaY / 64); // 64px is h-16
      const newTrackId = Math.max(0, Math.min(tracks.length - 1, initialTrackId + trackDelta));

      latestStartTime = newStartTime;
      latestTrackId = newTrackId;
      onUpdateClip(clip.id, { startTime: newStartTime, trackId: newTrackId });
    };

    const handleMouseUp = () => {
      setDraggingClipId(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (onCommitClipMove && (latestStartTime !== initialStartTime || latestTrackId !== initialTrackId)) {
        onCommitClipMove(clip.id, initialStartTime, latestStartTime, initialTrackId, latestTrackId);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Helper to compute sub-row positioning and overlap detection for clips on a track
  const layoutTrackClips = useCallback((trackClips: StudioClip[]) => {
    if (trackClips.length <= 1) {
      return trackClips.map((c) => ({ clip: c, row: 0, hasOverlap: false }));
    }

    // Sort by startTime
    const sorted = [...trackClips].sort((a, b) => a.startTime - b.startTime);
    const endTimes = [0, 0];
    const overlapMap = new Map<string, { row: number; hasOverlap: boolean }>();

    let anyOverlap = false;
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const c1 = sorted[i];
        const c2 = sorted[j];
        if (c1.startTime < c2.startTime + c2.duration && c2.startTime < c1.startTime + c1.duration) {
          anyOverlap = true;
          break;
        }
      }
      if (anyOverlap) break;
    }

    if (!anyOverlap) {
      return sorted.map((c) => ({ clip: c, row: 0, hasOverlap: false }));
    }

    sorted.forEach((c) => {
      const clipEnd = c.startTime + c.duration;
      let chosenRow = 0;
      if (c.startTime < endTimes[0]) {
        chosenRow = 1;
      }
      endTimes[chosenRow] = Math.max(endTimes[chosenRow], clipEnd);
      overlapMap.set(c.id, { row: chosenRow, hasOverlap: true });
    });

    return sorted.map((c) => ({
      clip: c,
      row: overlapMap.get(c.id)?.row ?? 0,
      hasOverlap: overlapMap.get(c.id)?.hasOverlap ?? false,
    }));
  }, []);

  // Non-passive native wheel listener: buttery-smooth continuous zoom anchored to mouse cursor
  useEffect(() => {
    const el = timelineContainerRef.current;
    if (!el) return;

    const handleNativeWheel = (e: WheelEvent) => {
      // Zoom if Ctrl, Meta (Cmd), or Alt is held
      if (e.ctrlKey || e.metaKey || e.altKey) {
        e.preventDefault();
        e.stopPropagation();

        const timelineEl = timelineRef.current;
        if (!timelineEl) return;

        const rect = timelineEl.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const currentScrollLeft = timelineEl.scrollLeft;

        // The exact timecode under the user's cursor
        const timeAtCursor = (cursorX + currentScrollLeft) / pps;

        // Smooth continuous exponential scale
        const zoomDelta = -e.deltaY * 0.002;
        const zoomFactor = Math.exp(Math.max(-0.25, Math.min(0.25, zoomDelta)));
        const fitPps = getFitPps();
        // Clamped between fitPps (so timeline NEVER shrinks smaller than window) and 240px/s
        const targetPps = Math.max(fitPps, Math.min(240, parseFloat((pps * zoomFactor).toFixed(2))));

        if (targetPps !== pps) {
          prevZoomLevelRef.current = targetPps;
          setPps(targetPps);

          // Anchor the timecode directly under the cursor so it doesn't drift!
          const newScrollLeft = Math.max(0, timeAtCursor * targetPps - cursorX);
          timelineEl.scrollLeft = newScrollLeft;
        }
      }
    };

    // { passive: false } is MANDATORY so e.preventDefault() actually stops native browser zoom
    el.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleNativeWheel);
    };
  }, [pps, getFitPps]);

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

          {/* Zoom Controls with Premiere Fit (\) */}
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
              onClick={toggleZoomFit}
              className={`flex items-center gap-1 px-2 py-1 rounded transition cursor-pointer text-[10px] font-mono border ${
                duration > 0 && Math.abs(pps - getFitPps()) < 1.5
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                  : 'text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border-slate-700'
              }`}
              title={
                duration > 0 && Math.abs(pps - getFitPps()) < 1.5
                  ? "Toggle Zoom back to Playhead [ \\ ]"
                  : "Fit Sequence to Window [ \\ ]"
              }
            >
              <Maximize2 className={`w-3 h-3 ${duration > 0 && Math.abs(pps - getFitPps()) < 1.5 ? 'text-white' : 'text-indigo-400'}`} />
              <span>Fit</span>
              <kbd className="text-[8px] font-mono px-1 rounded bg-slate-900 text-slate-400 border border-slate-700">\</kbd>
            </button>
            <button
              onClick={zoomReset}
              className="text-[10px] text-slate-400 hover:text-white font-mono px-1.5 py-0.5 rounded hover:bg-slate-800 transition cursor-pointer"
              title="Reset Zoom to 60px/s [Ctrl+0]"
            >
              {Math.round(pps)}px/s
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
                  {/* Track Title & Tag with Inline Renaming */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1">
                      <span
                        className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded shrink-0 ${track.colorBg} ${track.colorText} border ${track.colorBorder}`}
                      >
                        {track.tag}
                      </span>

                      {editingTrackId === track.id ? (
                        <input
                          type="text"
                          value={editTrackName}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setEditTrackName(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                              handleCommitRename(track.id);
                            } else if (e.key === 'Escape') {
                              setEditingTrackId(null);
                            }
                          }}
                          onBlur={() => handleCommitRename(track.id)}
                          className="bg-slate-950 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-white font-medium w-full focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                      ) : (
                        <div
                          onDoubleClick={(e) => handleStartRename(track, e)}
                          className="flex items-center gap-1 min-w-0 group/rename cursor-text flex-1"
                          title="Double-click or click pencil icon to rename track"
                        >
                          <span className="text-xs font-semibold text-slate-200 truncate">
                            {track.name}
                          </span>
                          <button
                            onClick={(e) => handleStartRename(track, e)}
                            className="opacity-0 group-hover/rename:opacity-100 p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition shrink-0 cursor-pointer"
                            title="Rename Track"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {isSelected && editingTrackId !== track.id && (
                      <span className="w-2 h-2 rounded-full bg-indigo-400 shadow-sm animate-pulse shrink-0" title="Active Spotting Track" />
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

              {/* Dedicated Final Video Duration Marker on Ruler */}
              {duration > 0 && (
                <div
                  style={{ left: `${duration * pps}px` }}
                  className="absolute top-0 bottom-0 flex items-center z-10 pointer-events-none"
                >
                  <div className="absolute top-0.5 -translate-x-full -ml-1 px-1.5 py-0.5 rounded bg-amber-500 text-[8.5px] font-mono font-black text-slate-950 shadow-md flex items-center gap-1 border border-amber-400 select-none">
                    <span>END</span>
                    <span className="text-slate-900">{formatTimeCode(duration)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Premiere-style Sequence End Boundary Line across canvas */}
            {duration > 0 && (
              <div
                style={{ left: `${duration * pps}px` }}
                className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-20 pointer-events-none shadow-md shadow-amber-400/50"
              />
            )}

            {/* Red Playhead Line & Draggable Scrubber with GPU transform */}
            <div
              ref={playheadRef}
              style={{ transform: `translateX(${currentTime * pps}px)` }}
              className={`absolute top-0 bottom-0 left-0 w-0.5 z-30 shadow-lg pointer-events-none will-change-transform ${
                isAtEnd ? 'bg-amber-400 shadow-amber-400/70' : 'bg-rose-500 shadow-rose-500/50'
              }`}
            >
              {/* Grab Handle directly on ruler */}
              <div
                onMouseDown={handleScrubStart}
                className="w-6 h-7 -ml-[12px] top-0 absolute flex items-center justify-center cursor-ew-resize pointer-events-auto group"
                title={isAtEnd ? `Playhead at End (${formatTimeCode(duration)})` : 'Drag to Scrub Playhead'}
              >
                {/* Scrubber Diamond */}
                <div
                  className={`w-3.5 h-3.5 rotate-45 shadow-md group-hover:scale-125 transition-all ${
                    isAtEnd
                      ? 'bg-amber-400 shadow-amber-400/90 ring-2 ring-amber-300'
                      : 'bg-rose-500 shadow-rose-500/90'
                  }`}
                />

                {/* Floating "END" Tag when parked at video duration */}
                {isAtEnd && (
                  <span className="absolute -top-3.5 px-1 py-0.2 rounded bg-amber-500 text-slate-950 font-mono font-black text-[7.5px] uppercase tracking-wider shadow-md pointer-events-none animate-pulse">
                    END
                  </span>
                )}
              </div>
            </div>

            {/* 4 Track Lanes */}
            <div className="flex-1 flex flex-col relative pb-4">
              {tracks.map((track) => {
                const trackClips = clips.filter((c) => c.trackId === track.id);
                const isSelected = selectedTrackId === track.id;
                const positionedClips = layoutTrackClips(trackClips);

                return (
                  <div
                    key={track.id}
                    onMouseDown={(e) => {
                      setLayerMenuClipId(null);
                      onSelectTrack(track.id);
                      handleScrubStart(e);
                    }}
                    className={`h-16 border-b border-slate-800/60 relative transition cursor-crosshair ${
                      isSelected ? 'bg-slate-900/40' : 'bg-transparent'
                    }`}
                  >
                    {/* Render Clips with Real Audio Waveform Background and Sub-Row Staggering */}
                    {positionedClips.map(({ clip, row, hasOverlap }) => {
                      const clipLeft = clip.startTime * pps;
                      const clipWidth = Math.max(30, clip.duration * pps);
                      const isDragging = draggingClipId === clip.id;
                      const isStaggered = hasOverlap;
                      const verticalClass = !isStaggered
                        ? 'top-1.5 bottom-1.5'
                        : row === 0
                        ? 'top-1 h-[27px]'
                        : 'bottom-1 h-[27px]';

                      return (
                        <div
                          key={clip.id}
                          style={{
                            left: `${clipLeft}px`,
                            width: `${clipWidth}px`,
                          }}
                          onMouseDown={(e) => handleClipMouseDown(clip, e)}
                          className={`absolute ${verticalClass} rounded-lg border shadow-md flex flex-col justify-between p-1 cursor-grab active:cursor-grabbing transition-all overflow-hidden group select-none ${
                            track.colorClip
                          } ${isDragging ? 'opacity-80 scale-[0.99] ring-2 ring-white z-40' : 'z-10'} ${
                            hasOverlap ? 'ring-1 ring-amber-400/80 border-amber-500/70' : ''
                          }`}
                        >
                          {/* Audio Waveform Background */}
                          <ClipWaveform soundId={clip.soundId} />

                          {/* Clip Header: Title + Overlap Alert + Layer Selector + Delete */}
                          <div className="flex items-center justify-between gap-1 z-10 w-full">
                            <div className="flex items-center gap-1 min-w-0">
                              <span
                                className="text-[9px] sm:text-[10px] font-bold truncate leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] text-white"
                                title={clip.name}
                              >
                                {clip.name}
                              </span>
                              {hasOverlap && (
                                <span
                                  className="px-1 py-0.2 bg-amber-500 text-slate-950 font-black text-[7px] rounded uppercase shrink-0 animate-pulse hidden sm:inline"
                                  title="Clips overlap on this layer! Drag vertically or click layer badge to move."
                                >
                                  Overlap
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {/* Quick Layer Switcher Badge */}
                              <div className="relative">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLayerMenuClipId(layerMenuClipId === clip.id ? null : clip.id);
                                  }}
                                  className={`px-1 py-0.5 rounded text-[8px] font-mono font-bold border transition cursor-pointer flex items-center gap-0.5 ${
                                    track.colorBg
                                  } ${track.colorText} ${track.colorBorder} hover:brightness-125`}
                                  title={`Assigned to ${track.tag} (${track.name}). Click to move layer.`}
                                >
                                  <Layers className="w-2.5 h-2.5" />
                                  <span>{track.tag}</span>
                                </button>

                                {/* Layer Popover Menu */}
                                {layerMenuClipId === clip.id && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute right-0 top-full mt-1 z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-1.5 flex flex-col gap-1 w-36 animate-in fade-in zoom-in-95"
                                  >
                                    <div className="text-[9px] font-semibold text-slate-400 px-1 border-b border-slate-800 pb-0.5">
                                      Move to Layer:
                                    </div>
                                    {tracks.map((t) => (
                                      <button
                                        key={t.id}
                                        onClick={() => {
                                          if (onMoveClipToTrack) {
                                            onMoveClipToTrack(clip.id, t.id);
                                          } else {
                                            onUpdateClip(clip.id, { trackId: t.id });
                                          }
                                          setLayerMenuClipId(null);
                                        }}
                                        className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] font-medium transition cursor-pointer text-left ${
                                          clip.trackId === t.id
                                            ? 'bg-indigo-600/30 text-indigo-200 font-bold'
                                            : 'hover:bg-slate-800 text-slate-300'
                                        }`}
                                      >
                                        <span className={`px-1 py-0.2 rounded text-[8px] font-mono font-bold ${t.colorBg} ${t.colorText} border ${t.colorBorder}`}>
                                          {t.tag}
                                        </span>
                                        <span className="truncate">{t.name}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

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
                          </div>

                          {/* Clip Footer: Start Time & Duration (shown when full height) */}
                          {!isStaggered && (
                            <div className="flex items-center justify-between text-[8px] font-mono opacity-90 z-10 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] text-white/90">
                              <span>{clip.startTime.toFixed(2)}s</span>
                              <span>{clip.duration.toFixed(1)}s</span>
                            </div>
                          )}
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
