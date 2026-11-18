import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import {
  Volume2,
  VolumeX,
  Trash2,
  ZoomIn,
  ZoomOut,
  Move,
  Sliders,
  Undo2,
  Redo2,
  Layers,
  AlertTriangle,
  Maximize2,
  Edit2,
  MousePointer,
  Scissors,
  Split,
  Magnet,
  Copy,
  RotateCcw
} from 'lucide-react';
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
  onCommitClipTrim?: (
    clipId: string,
    before: { startTime: number; duration: number; trimIn?: number },
    after: { startTime: number; duration: number; trimIn?: number }
  ) => void;
  onSplitClip?: (clipId: string, splitTime: number) => void;
  onDuplicateClip?: (clipId: string) => void;
  onResetClipTrim?: (clipId: string) => void;
  onMoveClipToTrack?: (clipId: string, targetTrackId: number) => void;
  onRenameTrack?: (trackId: number, newName: string) => void;
  onDeleteClip: (clipId: string) => void;
  onToggleMute: (trackId: number) => void;
  onToggleSolo: (trackId: number) => void;
  onUpdateTrackVolume: (trackId: number, volume: number) => void;
  onUpdateTrackHeight?: (trackId: number, height: number) => void;
  onUpdateAllTrackHeights?: (delta: number) => void;
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
  onCommitClipTrim,
  onSplitClip,
  onDuplicateClip,
  onResetClipTrim,
  onMoveClipToTrack,
  onRenameTrack,
  onDeleteClip,
  onToggleMute,
  onToggleSolo,
  onUpdateTrackVolume,
  onUpdateTrackHeight,
  onUpdateAllTrackHeights,
}) => {
  const [pps, setPps] = useState(60); // pixels per second
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  const [layerMenuClipId, setLayerMenuClipId] = useState<string | null>(null);
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);
  const [editTrackName, setEditTrackName] = useState<string>('');

  // Editing Tools & Clip Selection States
  const [activeTool, setActiveTool] = useState<'select' | 'razor'>('select');
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [snappingEnabled, setSnappingEnabled] = useState<boolean>(true);
  const [hoverSplitInfo, setHoverSplitInfo] = useState<{ clipId: string; time: number; x: number } | null>(null);
  const isTrimmingRef = useRef(false);

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
  const headersScrollRef = useRef<HTMLDivElement | null>(null);
  const isSyncingVerticalScrollRef = useRef(false);
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
  const ppsRef = useRef<number>(pps);
  ppsRef.current = pps;
  const zoomAccumulatorRef = useRef<number>(0);
  const zoomRafRef = useRef<number | null>(null);
  const cursorPositionRef = useRef<{ clientX: number; clientY: number }>({ clientX: 0, clientY: 0 });
  const pendingScrollAnchorRef = useRef<{ timeAtCursor: number; cursorX: number } | null>(null);

  // Synchronously adjust scrollLeft before browser paints to prevent clamping or jitter
  useLayoutEffect(() => {
    if (pendingScrollAnchorRef.current && timelineRef.current) {
      const { timeAtCursor, cursorX } = pendingScrollAnchorRef.current;
      timelineRef.current.scrollLeft = Math.max(0, timeAtCursor * pps - cursorX);
      pendingScrollAnchorRef.current = null;
    }
  }, [pps]);

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

  // Split clip at playhead
  const handleSplitAtPlayhead = useCallback(() => {
    let target = clips.find(
      (c) =>
        c.id === selectedClipId &&
        currentTime > c.startTime + 0.05 &&
        currentTime < c.startTime + c.duration - 0.05
    );
    if (!target) {
      target = clips.find(
        (c) =>
          c.trackId === selectedTrackId &&
          currentTime > c.startTime + 0.05 &&
          currentTime < c.startTime + c.duration - 0.05
      );
    }
    if (!target) {
      target = clips.find(
        (c) =>
          currentTime > c.startTime + 0.05 &&
          currentTime < c.startTime + c.duration - 0.05
      );
    }

    if (target && onSplitClip) {
      onSplitClip(target.id, currentTime);
    }
  }, [clips, selectedClipId, selectedTrackId, currentTime, onSplitClip]);

  // Keyboard shortcuts (+ / - / 0 / \, V, C, N, Ctrl+K, Ctrl+D, Delete) with capture: true
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      // Tool selection shortcuts
      if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        setActiveTool('select');
        return;
      }
      if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        setActiveTool('razor');
        return;
      }
      // Toggle magnetic snapping: [N]
      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        setSnappingEnabled((prev) => !prev);
        return;
      }
      // Split at playhead: Ctrl+K / Cmd+K
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        e.stopPropagation();
        handleSplitAtPlayhead();
        return;
      }
      // Duplicate clip: Ctrl+D / Cmd+D
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        if (selectedClipId && onDuplicateClip) {
          e.preventDefault();
          e.stopPropagation();
          onDuplicateClip(selectedClipId);
          return;
        }
      }
      // Delete selected clip: Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipId && editingTrackId === null) {
          e.preventDefault();
          e.stopPropagation();
          onDeleteClip(selectedClipId);
          setSelectedClipId(null);
          return;
        }
      }
      // Escape: deselect or return to select tool
      if (e.key === 'Escape') {
        if (activeTool === 'razor') {
          setActiveTool('select');
        } else {
          setSelectedClipId(null);
        }
        return;
      }

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
  }, [
    zoomIn,
    zoomOut,
    zoomReset,
    toggleZoomFit,
    activeTool,
    selectedClipId,
    editingTrackId,
    handleSplitAtPlayhead,
    onDuplicateClip,
    onDeleteClip,
  ]);

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

  // Auto-scroll timeline to keep playhead in view strictly during active playback or scrubbing
  useEffect(() => {
    if (!timelineRef.current) return;
    if (!isPlaying && !isDraggingScrubberRef.current) return;
    const playheadX = currentTime * pps;
    const scrollLeft = timelineRef.current.scrollLeft;
    const clientWidth = timelineRef.current.clientWidth;

    if (playheadX > scrollLeft + clientWidth - 80) {
      timelineRef.current.scrollLeft = playheadX - 120;
    } else if (playheadX < scrollLeft) {
      timelineRef.current.scrollLeft = Math.max(0, playheadX - 40);
    }
  }, [currentTime, pps, isPlaying]);

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

  // Trimming In-Point (Head) or Out-Point (Tail)
  const handleTrimStart = (clip: StudioClip, type: 'in' | 'out', e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isTrimmingRef.current = true;
    setSelectedClipId(clip.id);
    setLayerMenuClipId(null);

    const initialStartTime = clip.startTime;
    const initialDuration = clip.duration;
    const initialTrimIn = clip.trimIn || 0;
    const originalDur = clip.originalDuration || (initialTrimIn + initialDuration);
    const startX = e.clientX;

    let latestStartTime = initialStartTime;
    let latestDuration = initialDuration;
    let latestTrimIn = initialTrimIn;

    // Collect snap points for magnetic alignment
    const snapPoints: number[] = [0, currentTime];
    if (duration > 0) snapPoints.push(duration);
    clips.forEach((c) => {
      if (c.id !== clip.id && c.trackId === clip.trackId) {
        snapPoints.push(c.startTime);
        snapPoints.push(c.startTime + c.duration);
      }
    });

    const snapThresholdSeconds = 8 / pps;

    const getSnappedTime = (time: number) => {
      if (!snappingEnabled) return time;
      for (const pt of snapPoints) {
        if (Math.abs(time - pt) <= snapThresholdSeconds) {
          return pt;
        }
      }
      return time;
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / pps;

      if (type === 'in') {
        let rawNewStartTime = initialStartTime + deltaTime;
        let snappedStartTime = getSnappedTime(rawNewStartTime);
        let actualDelta = snappedStartTime - initialStartTime;

        // TrimIn cannot go below 0 (cannot extend earlier than audio file start)
        if (initialTrimIn + actualDelta < 0) {
          actualDelta = -initialTrimIn;
          snappedStartTime = initialStartTime + actualDelta;
        }
        // StartTime cannot go below 0s timeline
        if (snappedStartTime < 0) {
          snappedStartTime = 0;
          actualDelta = -initialStartTime;
        }
        // Minimum duration must be at least 0.05s
        if (initialDuration - actualDelta < 0.05) {
          actualDelta = initialDuration - 0.05;
          snappedStartTime = initialStartTime + actualDelta;
        }

        const newStartTime = parseFloat(snappedStartTime.toFixed(3));
        const newDuration = parseFloat((initialDuration - actualDelta).toFixed(3));
        const newTrimIn = parseFloat((initialTrimIn + actualDelta).toFixed(3));

        latestStartTime = newStartTime;
        latestDuration = newDuration;
        latestTrimIn = newTrimIn;

        onUpdateClip(clip.id, {
          startTime: newStartTime,
          duration: newDuration,
          trimIn: newTrimIn,
          originalDuration: originalDur,
        });
      } else {
        let rawNewEndTime = initialStartTime + initialDuration + deltaTime;
        let snappedEndTime = getSnappedTime(rawNewEndTime);
        let newDuration = snappedEndTime - initialStartTime;

        // Minimum duration 0.05s
        newDuration = Math.max(0.05, newDuration);
        // Cannot exceed original audio length
        const maxDuration = Math.max(0.05, originalDur - initialTrimIn);
        newDuration = Math.min(maxDuration, newDuration);

        const finalDuration = parseFloat(newDuration.toFixed(3));
        latestDuration = finalDuration;

        onUpdateClip(clip.id, {
          duration: finalDuration,
          originalDuration: originalDur,
        });
      }
    };

    const handleMouseUp = () => {
      isTrimmingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      if (
        onCommitClipTrim &&
        (latestStartTime !== initialStartTime ||
          latestDuration !== initialDuration ||
          latestTrimIn !== initialTrimIn)
      ) {
        onCommitClipTrim(
          clip.id,
          { startTime: initialStartTime, duration: initialDuration, trimIn: initialTrimIn },
          { startTime: latestStartTime, duration: latestDuration, trimIn: latestTrimIn }
        );
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Dragging clip along time axis and vertically across track layers
  const handleClipMouseDown = (clip: StudioClip, e: React.MouseEvent) => {
    e.stopPropagation();

    // If Razor tool is active, clicking splits the clip!
    if (activeTool === 'razor') {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left + timelineRef.current.scrollLeft;
      const clickTime = clickX / pps;

      if (clickTime > clip.startTime + 0.05 && clickTime < clip.startTime + clip.duration - 0.05) {
        if (onSplitClip) {
          onSplitClip(clip.id, clickTime);
        }
      }
      return;
    }

    setSelectedClipId(clip.id);
    setDraggingClipId(clip.id);
    setLayerMenuClipId(null);
    const initialStartTime = clip.startTime;
    const initialTrackId = clip.trackId;
    const startX = e.clientX;
    const startY = e.clientY;

    let latestStartTime = clip.startTime;
    let latestTrackId = clip.trackId;

    const snapPoints: number[] = [0, currentTime];
    if (duration > 0) snapPoints.push(duration);
    clips.forEach((c) => {
      if (c.id !== clip.id) {
        snapPoints.push(c.startTime);
        snapPoints.push(c.startTime + c.duration);
      }
    });
    const snapThresholdSeconds = 8 / pps;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / pps;
      let newStartTime = Math.max(0, initialStartTime + deltaTime);

      if (snappingEnabled) {
        for (const pt of snapPoints) {
          if (Math.abs(newStartTime - pt) <= snapThresholdSeconds) {
            newStartTime = pt;
            break;
          }
          if (Math.abs((newStartTime + clip.duration) - pt) <= snapThresholdSeconds) {
            newStartTime = Math.max(0, pt - clip.duration);
            break;
          }
        }
      }

      const formattedStartTime = parseFloat(newStartTime.toFixed(3));
      const deltaY = moveEvent.clientY - startY;

      // Calculate dynamic target track based on variable track heights
      let baseCenterY = 0;
      for (let i = 0; i < initialTrackId; i++) {
        baseCenterY += (tracks[i]?.height || 64);
      }
      baseCenterY += (tracks[initialTrackId]?.height || 64) / 2;
      const targetCenterY = baseCenterY + deltaY;

      let newTrackId = 0;
      let cumulativeHeight = 0;
      for (let i = 0; i < tracks.length; i++) {
        const h = tracks[i]?.height || 64;
        if (targetCenterY >= cumulativeHeight && targetCenterY < cumulativeHeight + h) {
          newTrackId = i;
          break;
        }
        cumulativeHeight += h;
        if (i === tracks.length - 1) {
          newTrackId = tracks.length - 1;
        }
      }
      newTrackId = Math.max(0, Math.min(tracks.length - 1, newTrackId));

      latestStartTime = formattedStartTime;
      latestTrackId = newTrackId;
      onUpdateClip(clip.id, { startTime: formattedStartTime, trackId: newTrackId });
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
      // If hovering over the track headers column on the left, let track height scaling handle it
      if (headersScrollRef.current && headersScrollRef.current.contains(e.target as Node)) {
        return;
      }

      // Zoom if Ctrl, Meta (Cmd), or Alt is held
      if (e.ctrlKey || e.metaKey || e.altKey) {
        e.preventDefault();
        e.stopPropagation();

        cursorPositionRef.current = { clientX: e.clientX, clientY: e.clientY };
        zoomAccumulatorRef.current += -e.deltaY;

        if (zoomRafRef.current === null) {
          zoomRafRef.current = requestAnimationFrame(() => {
            zoomRafRef.current = null;
            const delta = zoomAccumulatorRef.current;
            zoomAccumulatorRef.current = 0;

            const timelineEl = timelineRef.current;
            if (!timelineEl) return;

            const currentPps = ppsRef.current;
            const rect = timelineEl.getBoundingClientRect();
            const cursorX = cursorPositionRef.current.clientX - rect.left;
            const currentScrollLeft = timelineEl.scrollLeft;

            // The exact timecode under the user's cursor
            const timeAtCursor = (cursorX + currentScrollLeft) / currentPps;

            // Smooth continuous exponential scale
            const zoomDelta = delta * 0.0016;
            const zoomFactor = Math.exp(Math.max(-0.35, Math.min(0.35, zoomDelta)));
            const fitPps = getFitPps();
            const targetPps = Math.max(fitPps, Math.min(240, parseFloat((currentPps * zoomFactor).toFixed(2))));

            if (Math.abs(targetPps - currentPps) > 0.01) {
              pendingScrollAnchorRef.current = { timeAtCursor, cursorX };
              prevZoomLevelRef.current = targetPps;
              setPps(targetPps);
            }
          });
        }
      }
    };

    // { passive: false } is MANDATORY so e.preventDefault() actually stops native browser zoom
    el.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleNativeWheel);
      if (zoomRafRef.current !== null) {
        cancelAnimationFrame(zoomRafRef.current);
        zoomRafRef.current = null;
      }
    };
  }, [getFitPps]);

  // Track Headers Wheel listener for Alt+Scroll (per layer) and Shift+Scroll (all layers)
  useEffect(() => {
    const el = headersScrollRef.current;
    if (!el) return;

    const handleHeadersWheel = (e: WheelEvent) => {
      if (e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        const target = e.target as HTMLElement | null;
        const trackHeaderEl = target?.closest('[data-track-id]') as HTMLElement | null;
        const trackIdStr = trackHeaderEl?.getAttribute('data-track-id');
        if (trackIdStr !== null && trackIdStr !== undefined) {
          const trackId = parseInt(trackIdStr, 10);
          const currentTrack = tracks.find((t) => t.id === trackId);
          const currentHeight = currentTrack?.height || 64;
          const delta = e.deltaY < 0 ? 8 : -8;
          const newHeight = Math.max(36, Math.min(200, currentHeight + delta));
          onUpdateTrackHeight?.(trackId, newHeight);
        }
      } else if (e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const rawDelta = Math.abs(e.deltaY) > 0 ? e.deltaY : e.deltaX;
        const delta = rawDelta < 0 ? 8 : -8;
        onUpdateAllTrackHeights?.(delta);
      }
    };

    el.addEventListener('wheel', handleHeadersWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleHeadersWheel);
    };
  }, [tracks, onUpdateTrackHeight, onUpdateAllTrackHeights]);

  // Track Header Resize via dragging bottom divider (Premiere Pro style)
  const handleStartHeaderResize = useCallback((trackId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const currentTrack = tracks.find((t) => t.id === trackId);
    const startHeight = currentTrack?.height || 64;
    const isShift = e.shiftKey;
    let lastDelta = 0;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      if (moveEvent.shiftKey || isShift) {
        const step = deltaY - lastDelta;
        lastDelta = deltaY;
        onUpdateAllTrackHeights?.(step);
      } else {
        const targetHeight = Math.max(36, Math.min(200, Math.round(startHeight + deltaY)));
        onUpdateTrackHeight?.(trackId, targetHeight);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [tracks, onUpdateTrackHeight, onUpdateAllTrackHeights]);

  // Double-Click Header / Divider Toggle (Compact 38px <-> Standard 64px)
  const handleToggleTrackHeight = useCallback((trackId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentTrack = tracks.find((t) => t.id === trackId);
    const currentHeight = currentTrack?.height || 64;
    const nextHeight = currentHeight <= 44 ? 64 : 38;
    if (e.shiftKey) {
      tracks.forEach((t) => onUpdateTrackHeight?.(t.id, nextHeight));
    } else {
      onUpdateTrackHeight?.(trackId, nextHeight);
    }
  }, [tracks, onUpdateTrackHeight]);

  // Synchronized Vertical Scrolling between Left Headers and Right Lanes
  const handleHeadersScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingVerticalScrollRef.current) return;
    isSyncingVerticalScrollRef.current = true;
    if (timelineRef.current) {
      timelineRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    requestAnimationFrame(() => {
      isSyncingVerticalScrollRef.current = false;
    });
  }, []);

  const handleTimelineVerticalScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingVerticalScrollRef.current) return;
    isSyncingVerticalScrollRef.current = true;
    if (headersScrollRef.current) {
      headersScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    requestAnimationFrame(() => {
      isSyncingVerticalScrollRef.current = false;
    });
  }, []);

  return (
    <div
      ref={timelineContainerRef}
      className="flex flex-col h-full bg-slate-950/70 select-none overflow-hidden border-t border-slate-800"
    >
      {/* Timeline Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider hidden sm:inline">
              Multi-Track Canvas
            </span>
            <span className="text-[10px] text-slate-500 font-mono hidden md:inline">
              4 Tracks • {clips.length} Clips
            </span>
          </div>

          {/* Edit Tools: Selection [V], Razor [C], Split at Playhead [Ctrl+K], Snap [N] */}
          <div className="flex items-center gap-0.5 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTool('select')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition cursor-pointer ${
                activeTool === 'select'
                  ? 'bg-indigo-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Selection Tool [V]"
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Select [V]</span>
            </button>

            <button
              onClick={() => setActiveTool('razor')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition cursor-pointer ${
                activeTool === 'razor'
                  ? 'bg-rose-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Razor / Split Tool [C]"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Razor [C]</span>
            </button>

            <div className="w-[1px] h-3.5 bg-slate-800 mx-0.5" />

            <button
              onClick={handleSplitAtPlayhead}
              className="flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Split Clip at Playhead [Ctrl+K]"
            >
              <Split className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden md:inline">Split [Ctrl+K]</span>
            </button>

            <button
              onClick={() => setSnappingEnabled((prev) => !prev)}
              className={`flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium transition cursor-pointer ${
                snappingEnabled
                  ? 'text-amber-400 bg-amber-950/40 border border-amber-500/40'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title={snappingEnabled ? 'Magnetic Snapping Active [N]' : 'Magnetic Snapping Off [N]'}
            >
              <Magnet className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{snappingEnabled ? 'Snap ON' : 'Snap OFF'}</span>
            </button>
          </div>
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
        {/* Left Track Headers (Fixed with Premiere Pro-style track height scaling) */}
        <div
          ref={headersScrollRef}
          onScroll={handleHeadersScroll}
          className="w-52 shrink-0 flex flex-col border-r border-slate-800 bg-slate-900/90 z-20 overflow-y-auto overflow-x-hidden scrollbar-none select-none"
        >
          {/* Ruler Header Blank */}
          <div className="h-7 border-b border-slate-800 flex items-center justify-between px-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-950/40 select-none">
            <span>Tracks</span>
            <span
              className="text-[8.5px] font-mono text-slate-500 font-normal lowercase tracking-normal"
              title="Alt+Scroll on layer to resize, Shift+Scroll to resize all"
            >
              alt/shift+scroll
            </span>
          </div>

          {/* Track Headers */}
          <div className="flex-1 flex flex-col">
            {tracks.map((track) => {
              const isSelected = selectedTrackId === track.id;
              const trackHeight = track.height || 64;
              const isCompact = trackHeight < 50;

              return (
                <div
                  key={track.id}
                  data-track-id={track.id}
                  onClick={() => onSelectTrack(track.id)}
                  style={{ height: `${trackHeight}px` }}
                  className={`border-b border-slate-800/80 px-2 py-1.5 flex flex-col justify-between transition-[background-color,border-color] relative cursor-pointer select-none group/trackHeader ${
                    isSelected
                      ? 'bg-slate-800/80 border-l-4 border-l-indigo-500'
                      : 'bg-slate-900/50 hover:bg-slate-850'
                  }`}
                >
                  {isCompact ? (
                    /* Compact Single-Row Layout (< 50px) */
                    <div className="flex items-center justify-between w-full h-full gap-1">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span
                          className={`text-[8.5px] font-bold font-mono px-1 py-0.2 rounded shrink-0 ${track.colorBg} ${track.colorText} border ${track.colorBorder}`}
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
                              if (e.key === 'Enter') handleCommitRename(track.id);
                              else if (e.key === 'Escape') setEditingTrackId(null);
                            }}
                            onBlur={() => handleCommitRename(track.id)}
                            className="bg-slate-950 border border-indigo-500 rounded px-1 py-0 text-xs text-white font-medium w-full focus:outline-none"
                          />
                        ) : (
                          <span
                            onDoubleClick={(e) => handleStartRename(track, e)}
                            className="text-xs font-semibold text-slate-200 truncate cursor-text"
                            title="Double-click to rename track"
                          >
                            {track.name}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleMute(track.id);
                          }}
                          className={`px-1 py-0.2 rounded text-[8.5px] font-mono font-bold transition cursor-pointer ${
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
                          className={`px-1 py-0.2 rounded text-[8.5px] font-mono font-bold transition cursor-pointer ${
                            track.solo
                              ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                          title="Solo Track"
                        >
                          S
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Standard / Expanded 2-Row Layout (>= 50px) */
                    <>
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
                    </>
                  )}

                  {/* Premiere Pro-style Bottom Divider Resize Handle */}
                  <div
                    onMouseDown={(e) => handleStartHeaderResize(track.id, e)}
                    onDoubleClick={(e) => handleToggleTrackHeight(track.id, e)}
                    className="absolute -bottom-1 left-0 right-0 h-2 cursor-row-resize hover:bg-indigo-500/50 z-30 transition-colors group/resizer flex items-center justify-center"
                    title="Alt+Scroll to resize • Shift+Scroll to resize all • Drag to resize • Double-click to toggle"
                  >
                    <div className="w-8 h-0.5 bg-slate-700/60 group-hover/resizer:bg-indigo-400 rounded-full transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Scrolling Timeline Lanes */}
        <div
          ref={timelineRef}
          onScroll={handleTimelineVerticalScroll}
          className="flex-1 overflow-x-auto overflow-y-auto relative bg-slate-950/90"
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
                    style={{ height: `${track.height || 64}px` }}
                    onMouseDown={(e) => {
                      setSelectedClipId(null);
                      setLayerMenuClipId(null);
                      onSelectTrack(track.id);
                      handleScrubStart(e);
                    }}
                    className={`border-b border-slate-800/60 relative transition-colors duration-150 cursor-crosshair ${
                      isSelected ? 'bg-slate-900/40' : 'bg-transparent'
                    }`}
                  >
                    {/* Render Clips with Real Audio Waveform Background and Sub-Row Staggering */}
                    {positionedClips.map(({ clip, row, hasOverlap }) => {
                      const clipLeft = clip.startTime * pps;
                      const clipWidth = Math.max(30, clip.duration * pps);
                      const isDragging = draggingClipId === clip.id;
                      const isClipSelected = selectedClipId === clip.id;
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
                          onMouseMove={(e) => {
                            if (activeTool === 'razor') {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const localX = e.clientX - rect.left;
                              const hoverTime = clip.startTime + localX / pps;
                              setHoverSplitInfo({ clipId: clip.id, time: hoverTime, x: localX });
                            }
                          }}
                          onMouseLeave={() => {
                            if (activeTool === 'razor') {
                              setHoverSplitInfo(null);
                            }
                          }}
                          className={`absolute ${verticalClass} rounded-lg border shadow-md flex flex-col justify-between p-1 transition-[box-shadow,opacity] duration-150 overflow-hidden group select-none ${
                            track.colorClip
                          } ${isDragging ? 'opacity-80 scale-[0.99] ring-2 ring-white z-40' : 'z-10'} ${
                            isClipSelected ? 'ring-2 ring-white shadow-xl brightness-110' : ''
                          } ${
                            hasOverlap ? 'ring-1 ring-amber-400/80 border-amber-500/70' : ''
                          } ${
                            activeTool === 'razor' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
                          }`}
                        >
                          {/* Audio Waveform Background */}
                          <ClipWaveform
                            soundId={clip.soundId}
                            trimIn={clip.trimIn}
                            duration={clip.duration}
                            originalDuration={clip.originalDuration}
                          />

                          {/* Left Trim Handle (In-Point) */}
                          <div
                            onMouseDown={(e) => handleTrimStart(clip, 'in', e)}
                            className={`absolute left-0 top-0 bottom-0 w-2.5 hover:w-3.5 z-30 transition-[width,background-color] duration-150 cursor-col-resize flex items-center justify-start pl-0.5 group/trimIn ${
                              activeTool === 'razor' ? 'pointer-events-none' : ''
                            }`}
                            title={`Trim In-Point (Offset: ${(clip.trimIn || 0).toFixed(2)}s)`}
                          >
                            <div className="w-1 h-5 bg-white/40 group-hover/trimIn:bg-white rounded-r-sm shadow-sm transition-colors duration-150" />
                          </div>

                          {/* Right Trim Handle (Out-Point) */}
                          <div
                            onMouseDown={(e) => handleTrimStart(clip, 'out', e)}
                            className={`absolute right-0 top-0 bottom-0 w-2.5 hover:w-3.5 z-30 transition-[width,background-color] duration-150 cursor-col-resize flex items-center justify-end pr-0.5 group/trimOut ${
                              activeTool === 'razor' ? 'pointer-events-none' : ''
                            }`}
                            title={`Trim Out-Point (Duration: ${clip.duration.toFixed(2)}s)`}
                          >
                            <div className="w-1 h-5 bg-white/40 group-hover/trimOut:bg-white rounded-l-sm shadow-sm transition-colors duration-150" />
                          </div>

                          {/* Razor Cut Guideline (when hovering in Razor tool mode) */}
                          {activeTool === 'razor' && hoverSplitInfo?.clipId === clip.id && (
                            <div
                              style={{ left: `${hoverSplitInfo.x}px` }}
                              className="absolute top-0 bottom-0 w-0.5 bg-rose-400 z-50 pointer-events-none flex flex-col items-center"
                            >
                              <div className="bg-rose-600 text-[8px] font-mono px-1 py-0.2 rounded text-white shadow font-bold -translate-y-3.5 whitespace-nowrap">
                                ✂ {hoverSplitInfo.time.toFixed(2)}s
                              </div>
                            </div>
                          )}

                          {/* Clip Header: Title + Overlap Alert + Layer Selector + Tools + Delete */}
                          <div className="flex items-center justify-between gap-1 z-10 w-full pl-2 pr-2">
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

                              {/* Reset Trimming Button (if trimmed) */}
                              {((clip.trimIn || 0) > 0 || (clip.originalDuration && clip.duration < clip.originalDuration - 0.05)) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onResetClipTrim) onResetClipTrim(clip.id);
                                  }}
                                  className="p-0.5 rounded hover:bg-black/50 text-white/70 hover:text-white transition cursor-pointer"
                                  title="Reset Trimming to Full Duration"
                                >
                                  <RotateCcw className="w-2.5 h-2.5" />
                                </button>
                              )}

                              {/* Duplicate Clip Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onDuplicateClip) onDuplicateClip(clip.id);
                                }}
                                className="p-0.5 rounded hover:bg-black/50 text-white/70 hover:text-white transition cursor-pointer"
                                title="Duplicate Clip [Ctrl+D]"
                              >
                                <Copy className="w-2.5 h-2.5" />
                              </button>

                              {/* Delete Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteClip(clip.id);
                                }}
                                className="p-0.5 rounded hover:bg-black/50 text-white/80 hover:text-white transition cursor-pointer"
                                title="Delete Clip [Delete]"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>

                          {/* Clip Footer: Start Time, Trim Indicator & Duration (shown when full height) */}
                          {!isStaggered && (
                            <div className="flex items-center justify-between text-[8px] font-mono opacity-90 z-10 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] text-white/90 pl-2 pr-2">
                              <span>{clip.startTime.toFixed(2)}s</span>
                              {(clip.trimIn || 0) > 0 && (
                                <span className="text-[7.5px] text-amber-300 font-semibold" title={`Trimmed in by ${(clip.trimIn || 0).toFixed(2)}s`}>
                                  +{(clip.trimIn || 0).toFixed(1)}s
                                </span>
                              )}
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
