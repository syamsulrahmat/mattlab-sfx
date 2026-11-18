import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Film,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Upload,
  Download,
  FileVideo,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Trash2,
  Zap,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Save,
  FolderOpen,
  Edit2,
  Check
} from 'lucide-react';
import { StudioTrack, StudioClip, DEFAULT_TRACKS, StudioProject } from './types';
import { StudioTimeline } from './StudioTimeline';
import { StudioPalette } from './StudioPalette';
import { StudioProjectsHub } from './StudioProjectsHub';
import { audioBufferToWavBlob } from './wavEncoder';

interface StudioPageProps {
  onBackToLibrary: () => void;
}

export const StudioPage: React.FC<StudioPageProps> = ({ onBackToLibrary }) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoVolume, setVideoVolume] = useState(0.8);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [fps, setFps] = useState(24);
  const [isLooping, setIsLooping] = useState(false);

  // Studio Tracks & Clips State
  const [tracks, setTracks] = useState<StudioTrack[]>(() => {
    try {
      const saved = localStorage.getItem('mattlab_sfx_studio_tracks');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === DEFAULT_TRACKS.length) {
          return DEFAULT_TRACKS.map((def, idx) => ({
            ...def,
            name: parsed[idx]?.name || def.name,
          }));
        }
      }
    } catch (e) {
      // ignore
    }
    return DEFAULT_TRACKS;
  });
  const [clips, setClips] = useState<StudioClip[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<number>(0);
  const [paletteOpen, setPaletteOpen] = useState(true);

  // Undo / Redo History Stack (up to 50 steps)
  const clipsRef = useRef<StudioClip[]>([]);
  clipsRef.current = clips;
  const pastRef = useRef<StudioClip[][]>([]);
  const futureRef = useRef<StudioClip[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Active Project & Persistence State
  const [activeProject, setActiveProject] = useState<StudioProject | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const updateUndoRedoState = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const handleOpenProject = useCallback((project: StudioProject) => {
    setActiveProject(project);
    setTracks(project.tracks?.length ? project.tracks : DEFAULT_TRACKS);
    setClips(project.clips || []);
    setDuration(project.video_duration || 0);
    setFps(project.video_fps || 24);
    setTitleInput(project.title);
    setVideoFile(null);
    setVideoSrc(null);
    setCurrentTime(0);
    pastRef.current = [];
    futureRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setSaveStatus('saved');
  }, []);

  const handleNewBlankProject = useCallback(async () => {
    try {
      const res = await fetch('/api/studio/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Untitled Studio Project',
          tracks: DEFAULT_TRACKS,
          clips: [],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        handleOpenProject(data.project);
        return;
      }
    } catch (e) {
      console.warn('Failed to auto-create project on server:', e);
    }
    handleOpenProject({
      id: `proj_${Date.now()}`,
      title: 'Untitled Studio Project',
      tracks: DEFAULT_TRACKS,
      clips: [],
    });
  }, [handleOpenProject]);

  const handleSaveProject = useCallback(async (customTitle?: string) => {
    if (!activeProject) return;
    try {
      setSaveStatus('saving');
      const titleToSave = customTitle !== undefined ? customTitle.trim() : (activeProject.title || 'Untitled Studio Project');
      const res = await fetch(`/api/studio/projects/${activeProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleToSave,
          video_filename: videoFile?.name || activeProject.video_filename || '',
          video_duration: duration,
          video_fps: fps,
          tracks,
          clips,
        }),
      });
      if (!res.ok) throw new Error('Failed to save project');
      const data = await res.json();
      setActiveProject(data.project);
      setSaveStatus('saved');
      setStatusMessage({ text: 'Project saved', type: 'success' });
      setTimeout(() => setStatusMessage(null), 2000);
    } catch (e: any) {
      setSaveStatus('unsaved');
      setStatusMessage({ text: e.message || 'Error saving project', type: 'error' });
      setTimeout(() => setStatusMessage(null), 3000);
    }
  }, [activeProject, videoFile, duration, fps, tracks, clips]);

  const handleReturnToProjects = useCallback(async () => {
    if (activeProject && saveStatus === 'unsaved') {
      await handleSaveProject();
    }
    stopAllAudioSources();
    if (videoSrc) {
      URL.revokeObjectURL(videoSrc);
      setVideoSrc(null);
    }
    setVideoFile(null);
    setActiveProject(null);
  }, [activeProject, saveStatus, handleSaveProject, videoSrc]);

  // Debounced auto-save (2 seconds after timeline changes)
  useEffect(() => {
    if (!activeProject) return;
    setSaveStatus('unsaved');
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        setSaveStatus('saving');
        const res = await fetch(`/api/studio/projects/${activeProject.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: activeProject.title,
            video_filename: videoFile?.name || activeProject.video_filename || '',
            video_duration: duration,
            video_fps: fps,
            tracks,
            clips,
          }),
        });
        if (res.ok) {
          setSaveStatus('saved');
        } else {
          setSaveStatus('unsaved');
        }
      } catch {
        setSaveStatus('unsaved');
      }
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [clips, tracks, duration, fps]);

  // Exporting state
  const [isExportingWav, setIsExportingWav] = useState(false);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);

  // References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourcesRef = useRef<Map<string, { source: AudioBufferSourceNode; gain: GainNode }>>(new Map());
  const cachedBuffersRef = useRef<Map<number, AudioBuffer>>(new Map());
  const pendingBuffersRef = useRef<Map<number, Promise<AudioBuffer | null>>>(new Map());

  // Initialize or get AudioContext
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // Pre-load and cache audio buffer for a sound ID with concurrency deduplication & timeout safety
  const loadAudioBuffer = useCallback(async (soundId: number): Promise<AudioBuffer | null> => {
    if (cachedBuffersRef.current.has(soundId)) {
      return cachedBuffersRef.current.get(soundId)!;
    }
    if (pendingBuffersRef.current.has(soundId)) {
      return pendingBuffersRef.current.get(soundId)!;
    }

    const fetchAndDecodePromise = (async (): Promise<AudioBuffer | null> => {
      try {
        const audioCtx = getAudioContext();
        if (audioCtx.state === 'suspended') {
          try {
            await audioCtx.resume();
          } catch {
            // ignore resume error
          }
        }

        const res = await fetch(`/api/stream/${soundId}`, {
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) throw new Error(`Stream fetch failed with status ${res.status}`);
        const arrayBuf = await res.arrayBuffer();

        // Decode with timeout guard to prevent browser decoder deadlocks
        const decodedBuf = await new Promise<AudioBuffer>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Audio decoding timed out after 10s')), 10000);
          audioCtx.decodeAudioData(
            arrayBuf.slice(0),
            (buf) => {
              clearTimeout(timer);
              resolve(buf);
            },
            (err) => {
              clearTimeout(timer);
              reject(err || new Error('decodeAudioData callback rejected'));
            }
          ).then(
            (buf) => {
              clearTimeout(timer);
              resolve(buf);
            },
            () => {}
          ).catch(() => {});
        });

        cachedBuffersRef.current.set(soundId, decodedBuf);
        return decodedBuf;
      } catch (e) {
        console.error(`Error loading/decoding audio buffer for sound ${soundId}:`, e);
        return null;
      } finally {
        pendingBuffersRef.current.delete(soundId);
      }
    })();

    pendingBuffersRef.current.set(soundId, fetchAndDecodePromise);
    return fetchAndDecodePromise;
  }, [getAudioContext]);

  // Clean up active Web Audio sources
  const stopAllAudioSources = useCallback(() => {
    activeSourcesRef.current.forEach(({ source, gain }) => {
      try {
        source.stop();
        source.disconnect();
        gain.disconnect();
      } catch (e) {
        // Source might already have ended
      }
    });
    activeSourcesRef.current.clear();
  }, []);

  // History Actions: Push, Commit Move, Undo, Redo
  const pushClipsWithHistory = useCallback((nextClips: StudioClip[]) => {
    pastRef.current.push(clipsRef.current);
    if (pastRef.current.length > 50) {
      pastRef.current.shift();
    }
    futureRef.current = [];
    setClips(nextClips);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  const handleCommitClipMove = useCallback((
    clipId: string,
    initialStartTime: number,
    finalStartTime: number,
    initialTrackId?: number,
    finalTrackId?: number
  ) => {
    const trackChanged = initialTrackId !== undefined && finalTrackId !== undefined && initialTrackId !== finalTrackId;
    const timeChanged = initialStartTime !== finalStartTime;
    if (!timeChanged && !trackChanged) return;

    const beforeClips = clipsRef.current.map((c) =>
      c.id === clipId
        ? {
            ...c,
            startTime: initialStartTime,
            trackId: initialTrackId !== undefined ? initialTrackId : c.trackId,
          }
        : c
    );
    pastRef.current.push(beforeClips);
    if (pastRef.current.length > 50) {
      pastRef.current.shift();
    }
    futureRef.current = [];
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  const handleMoveClipToTrack = useCallback((clipId: string, targetTrackId: number) => {
    const clip = clipsRef.current.find((c) => c.id === clipId);
    if (!clip || clip.trackId === targetTrackId) return;

    pushClipsWithHistory(
      clipsRef.current.map((c) => (c.id === clipId ? { ...c, trackId: targetTrackId } : c))
    );
    setStatusMessage({
      text: `Moved "${clip.name}" to [${tracks[targetTrackId]?.tag || `Track ${targetTrackId + 1}`}]`,
      type: 'info',
    });
    setTimeout(() => setStatusMessage(null), 2000);
  }, [tracks, pushClipsWithHistory]);

  const handleRenameTrack = useCallback((trackId: number, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setTracks((prev) => {
      const next = prev.map((t) => (t.id === trackId ? { ...t, name: trimmed } : t));
      try {
        localStorage.setItem(
          'mattlab_sfx_studio_tracks',
          JSON.stringify(next.map((t) => ({ id: t.id, name: t.name })))
        );
      } catch (e) {
        // ignore
      }
      return next;
    });
    setStatusMessage({
      text: `Renamed layer [${tracks[trackId]?.tag || `T${trackId + 1}`}] to "${trimmed}"`,
      type: 'info',
    });
    setTimeout(() => setStatusMessage(null), 2000);
  }, [tracks]);

  const handleUndo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const previous = pastRef.current.pop()!;
    futureRef.current.push(clipsRef.current);
    setClips(previous);
    stopAllAudioSources();
    updateUndoRedoState();
    setStatusMessage({
      text: `Undo (${previous.length} clips on timeline)`,
      type: 'info',
    });
    setTimeout(() => setStatusMessage(null), 1500);
  }, [stopAllAudioSources, updateUndoRedoState]);

  const handleRedo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop()!;
    pastRef.current.push(clipsRef.current);
    setClips(next);
    stopAllAudioSources();
    updateUndoRedoState();
    setStatusMessage({
      text: `Redo (${next.length} clips on timeline)`,
      type: 'info',
    });
    setTimeout(() => setStatusMessage(null), 1500);
  }, [stopAllAudioSources, updateUndoRedoState]);

  // Schedule audio clips starting from specified video playback position
  const scheduleAudioPlayback = useCallback((startPos: number) => {
    stopAllAudioSources();
    const audioCtx = getAudioContext();
    const hasSolo = tracks.some((t) => t.solo);

    clips.forEach((clip) => {
      const track = tracks.find((t) => t.id === clip.trackId);
      if (!track || track.muted) return;
      if (hasSolo && !track.solo) return;

      const clipEnd = clip.startTime + clip.duration;
      // Skip if clip is already finished at startPos
      if (startPos >= clipEnd) return;

      const buffer = cachedBuffersRef.current.get(clip.soundId);
      if (!buffer) {
        // Buffer loading in progress, trigger load
        loadAudioBuffer(clip.soundId);
        return;
      }

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;

      const gainNode = audioCtx.createGain();
      const effectiveVolume = Math.max(0, (track.volume || 1.0) * (clip.volume || 1.0));
      gainNode.gain.setValueAtTime(effectiveVolume, audioCtx.currentTime);

      source.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      const uniqueKey = `${clip.id}-${Date.now()}`;
      activeSourcesRef.current.set(uniqueKey, { source, gain: gainNode });

      source.onended = () => {
        activeSourcesRef.current.delete(uniqueKey);
      };

      const trimIn = Math.max(0, clip.trimIn || 0);

      if (startPos <= clip.startTime) {
        // Clip starts in the future relative to playhead
        const delay = clip.startTime - startPos;
        source.start(audioCtx.currentTime + delay, trimIn, clip.duration);
      } else {
        // Clip is currently in mid-playback
        const elapsed = startPos - clip.startTime;
        const offset = trimIn + elapsed;
        const remaining = clip.duration - elapsed;
        if (remaining > 0 && offset < buffer.duration) {
          source.start(audioCtx.currentTime, offset, Math.min(remaining, buffer.duration - offset));
        }
      }
    });
  }, [clips, tracks, getAudioContext, loadAudioBuffer, stopAllAudioSources]);

  // Handle local video drop or selection
  const handleVideoSelect = (file: File) => {
    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|webm|mov|mkv)$/i)) {
      setStatusMessage({ text: 'Please select a valid video file (MP4, WebM, MOV)', type: 'error' });
      return;
    }

    if (videoSrc) {
      URL.revokeObjectURL(videoSrc);
    }

    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoSrc(url);
    setCurrentTime(0);
    setIsPlaying(false);
    stopAllAudioSources();
    setStatusMessage({ text: `Loaded video: ${file.name}`, type: 'success' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleVideoSelect(e.dataTransfer.files[0]);
    }
  };

  // Synchronized Play/Pause
  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      try {
        const audioCtx = getAudioContext();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        // If at the end of video, restart from beginning
        if (video.duration && video.currentTime >= video.duration - 0.05) {
          video.currentTime = 0;
          setCurrentTime(0);
        }
        await video.play();
      } catch (err) {
        console.warn('Video play interrupted or blocked:', err);
        setIsPlaying(false);
        stopAllAudioSources();
      }
    } else {
      video.pause();
    }
  };

  // Video event handlers
  const handlePlay = () => {
    setIsPlaying(true);
    if (videoRef.current) {
      scheduleAudioPlayback(videoRef.current.currentTime);
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
    stopAllAudioSources();
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleSeeked = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (!videoRef.current.paused) {
        scheduleAudioPlayback(videoRef.current.currentTime);
      } else {
        stopAllAudioSources();
      }
    }
  };

  const handleSeek = (newTime: number) => {
    const video = videoRef.current;
    if (!video) return;

    const clampedTime = Math.max(0, Math.min(duration || 0, newTime));
    setCurrentTime(clampedTime);

    try {
      video.currentTime = clampedTime;
    } catch (e) {
      console.warn('Error seeking video:', e);
    }
  };

  const handleStepFrame = (deltaFrames: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    const frameDuration = 1 / fps;
    const newTime = Math.max(0, Math.min(duration || 0, video.currentTime + deltaFrames * frameDuration));
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Spot Sound onto active track (with automatic collision avoidance)
  const handleSpotSound = (sound: { id: number; filename: string; display_name: string; category?: string; duration: number }) => {
    const spotTime = videoRef.current ? videoRef.current.currentTime : currentTime;
    const soundDuration = sound.duration && sound.duration > 0 ? sound.duration : 1.5;
    const parsedSpotTime = parseFloat(spotTime.toFixed(3));

    // Collision check: if selected track already has a clip covering parsedSpotTime, auto-select the first free track
    let targetTrackId = selectedTrackId;
    const isOccupied = (tId: number) =>
      clipsRef.current.some(
        (c) => c.trackId === tId && parsedSpotTime < c.startTime + c.duration && parsedSpotTime + soundDuration > c.startTime
      );

    if (isOccupied(selectedTrackId)) {
      const freeTrack = tracks.find((t) => !isOccupied(t.id));
      if (freeTrack) {
        targetTrackId = freeTrack.id;
      }
    }

    const newClip: StudioClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
      soundId: sound.id,
      name: sound.display_name || sound.filename,
      filename: sound.filename,
      startTime: parsedSpotTime,
      duration: soundDuration,
      originalDuration: soundDuration,
      trimIn: 0,
      volume: 1.0,
      trackId: targetTrackId,
      category: sound.category,
    };

    pushClipsWithHistory([...clipsRef.current, newClip]);
    // Pre-decode audio buffer in background
    loadAudioBuffer(sound.id);

    setStatusMessage({
      text: `Spotted "${newClip.name}" onto [${tracks[targetTrackId].tag}] at ${spotTime.toFixed(2)}s`,
      type: 'info',
    });
    setTimeout(() => setStatusMessage(null), 2500);
  };

  // Keyboard shortcut listener for Space, Frame Stepping, Home, End, Undo/Redo, and Palette Toggle [P/B]
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      // Save Project: Ctrl+S / Cmd+S
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        handleSaveProject();
        return;
      }

      // Toggle Sound Palette drawer: [P] or [B] (without Ctrl/Alt/Meta)
      if ((e.key === 'p' || e.key === 'P' || e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        setPaletteOpen((prev) => !prev);
        return;
      }

      // Undo: Ctrl+Z / Cmd+Z (without Shift)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        handleUndo();
        return;
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z OR Ctrl+Y / Cmd+Y
      if (
        ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        handleRedo();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleStepFrame(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleStepFrame(1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        handleSeek(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        handleSeek(duration);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [fps, duration, handleUndo, handleRedo, togglePlay, handleSaveProject]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopAllAudioSources();
      if (videoSrc) {
        URL.revokeObjectURL(videoSrc);
      }
    };
  }, [stopAllAudioSources, videoSrc]);

  // Timeline track actions
  const handleToggleMute = (trackId: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t))
    );
  };

  const handleToggleSolo = (trackId: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, solo: !t.solo } : t))
    );
  };

  const handleUpdateTrackVolume = (trackId: number, volume: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, volume } : t))
    );
  };

  const handleUpdateClip = (clipId: string, updates: Partial<StudioClip>) => {
    setClips((prev) =>
      prev.map((c) => (c.id === clipId ? { ...c, ...updates } : c))
    );
  };

  const handleDeleteClip = (clipId: string) => {
    pushClipsWithHistory(clipsRef.current.filter((c) => c.id !== clipId));
  };

  const handleCommitClipTrim = useCallback((
    clipId: string,
    before: { startTime: number; duration: number; trimIn?: number },
    after: { startTime: number; duration: number; trimIn?: number }
  ) => {
    if (
      before.startTime !== after.startTime ||
      before.duration !== after.duration ||
      before.trimIn !== after.trimIn
    ) {
      const pastState = clipsRef.current.map((c) =>
        c.id === clipId ? { ...c, ...before } : c
      );
      pastRef.current.push(pastState);
      futureRef.current = [];
      updateUndoRedoState();
    }
  }, [updateUndoRedoState]);

  const handleSplitClip = useCallback((clipId: string, splitTime: number) => {
    const clip = clipsRef.current.find((c) => c.id === clipId);
    if (!clip) return;
    if (splitTime <= clip.startTime + 0.05 || splitTime >= clip.startTime + clip.duration - 0.05) return;

    const leftDuration = parseFloat((splitTime - clip.startTime).toFixed(3));
    const rightDuration = parseFloat((clip.duration - leftDuration).toFixed(3));
    const originalDuration = clip.originalDuration || (clip.trimIn || 0) + clip.duration;
    const leftTrimIn = clip.trimIn || 0;
    const rightTrimIn = parseFloat((leftTrimIn + leftDuration).toFixed(3));

    const leftClip: StudioClip = {
      ...clip,
      duration: leftDuration,
      originalDuration,
    };

    const rightClip: StudioClip = {
      ...clip,
      id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
      startTime: parseFloat(splitTime.toFixed(3)),
      duration: rightDuration,
      trimIn: rightTrimIn,
      originalDuration,
    };

    pushClipsWithHistory(
      clipsRef.current.flatMap((c) => (c.id === clipId ? [leftClip, rightClip] : [c]))
    );
    setStatusMessage({
      text: `Split "${clip.name}" at ${splitTime.toFixed(2)}s into 2 clips`,
      type: 'info',
    });
    setTimeout(() => setStatusMessage(null), 2000);
  }, [pushClipsWithHistory]);

  const handleDuplicateClip = useCallback((clipId: string) => {
    const clip = clipsRef.current.find((c) => c.id === clipId);
    if (!clip) return;
    const newClip: StudioClip = {
      ...clip,
      id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
      startTime: parseFloat((clip.startTime + clip.duration).toFixed(3)),
    };
    pushClipsWithHistory([...clipsRef.current, newClip]);
    setStatusMessage({
      text: `Duplicated "${clip.name}"`,
      type: 'info',
    });
    setTimeout(() => setStatusMessage(null), 2000);
  }, [pushClipsWithHistory]);

  const handleResetClipTrim = useCallback((clipId: string) => {
    const clip = clipsRef.current.find((c) => c.id === clipId);
    if (!clip) return;
    const originalDur = clip.originalDuration || (clip.trimIn || 0) + clip.duration;
    pushClipsWithHistory(
      clipsRef.current.map((c) =>
        c.id === clipId ? { ...c, trimIn: 0, duration: originalDur } : c
      )
    );
    setStatusMessage({
      text: `Reset trimming for "${clip.name}" (${originalDur.toFixed(2)}s)`,
      type: 'info',
    });
    setTimeout(() => setStatusMessage(null), 2000);
  }, [pushClipsWithHistory]);

  // Export 1: Master Audio WAV Mixdown (Client-Side via OfflineAudioContext)
  const renderMixdownBuffer = async (onProgress?: (msg: string) => void): Promise<AudioBuffer> => {
    const sampleRate = 48000;
    const safeVideoDuration = isFinite(duration) && duration > 0 ? duration : 0;
    const maxClipEnd = clips.reduce((max, c) => Math.max(max, (c.startTime || 0) + (c.duration || 0)), 0);
    const totalDuration = Math.max(safeVideoDuration, maxClipEnd, 1);
    const totalFrames = Math.ceil(totalDuration * sampleRate);

    onProgress?.(`Pre-buffering ${clips.length} audio track clip(s)...`);

    // Pre-load all unique sound buffers concurrently with timeout protection
    const uniqueSoundIds = Array.from(new Set(clips.map((c) => c.soundId)));
    await Promise.all(uniqueSoundIds.map((id) => loadAudioBuffer(id)));

    onProgress?.('Synthesizing 24-bit/48kHz Master Audio Mixdown...');

    const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);
    const hasSolo = tracks.some((t) => t.solo);

    for (const clip of clips) {
      const track = tracks.find((t) => t.id === clip.trackId);
      if (!track || track.muted) continue;
      if (hasSolo && !track.solo) continue;

      const buffer = cachedBuffersRef.current.get(clip.soundId);
      if (!buffer) continue;

      const trimIn = Math.max(0, clip.trimIn || 0);
      if (trimIn >= buffer.duration) continue;

      const availableBuffer = buffer.duration - trimIn;
      const playDuration = Math.min(clip.duration, availableBuffer);
      if (playDuration <= 0.01) continue;

      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;

      const gain = offlineCtx.createGain();
      gain.gain.value = Math.max(0, (track.volume ?? 1.0) * (clip.volume ?? 1.0));

      source.connect(gain);
      gain.connect(offlineCtx.destination);
      source.start(Math.max(0, clip.startTime), trimIn, playDuration);
    }

    // Render with 30s timeout guard to avoid hanging the main thread
    return await Promise.race([
      offlineCtx.startRendering(),
      new Promise<AudioBuffer>((_, reject) =>
        setTimeout(() => reject(new Error('Audio mixdown rendering timed out after 30s')), 30000)
      ),
    ]);
  };

  const handleExportWav = async () => {
    if (clips.length === 0) {
      setStatusMessage({ text: 'Add at least one sound effect before exporting mixdown.', type: 'error' });
      return;
    }

    setIsExportingWav(true);
    setStatusMessage({ text: 'Rendering 24-bit/48kHz Master Audio Mixdown...', type: 'info' });

    try {
      const renderedBuffer = await renderMixdownBuffer((msg) => {
        setStatusMessage({ text: msg, type: 'info' });
      });
      const wavBlob = audioBufferToWavBlob(renderedBuffer);

      const baseName = videoFile?.name?.replace(/\.[^/.]+$/, '') || 'mattlab_studio';
      const downloadUrl = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${baseName}_sound_design_mixdown.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      setStatusMessage({ text: 'Master WAV mixdown exported successfully!', type: 'success' });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (e) {
      console.error('Export WAV error:', e);
      setStatusMessage({ text: 'Failed to render WAV mixdown.', type: 'error' });
    } finally {
      setIsExportingWav(false);
    }
  };

  // Export 2: Lossless Video Muxing (FFmpeg Backend with live upload progress & fallback)
  const handleExportVideo = async () => {
    if (!videoFile) {
      setStatusMessage({ text: 'Please load a video file first to export merged video.', type: 'error' });
      return;
    }

    if (clips.length === 0) {
      setStatusMessage({ text: 'Add at least one sound effect to merge with video.', type: 'error' });
      return;
    }

    setIsExportingVideo(true);
    setExportProgress(null);
    setStatusMessage({ text: 'Rendering audio mixdown...', type: 'info' });

    let renderedWavBlob: Blob | null = null;

    try {
      // 1. Render mixdown WAV
      const renderedBuffer = await renderMixdownBuffer((msg) => {
        setStatusMessage({ text: msg, type: 'info' });
      });
      renderedWavBlob = audioBufferToWavBlob(renderedBuffer);

      // Check video size
      const videoSizeMB = (videoFile.size / (1024 * 1024)).toFixed(1);
      const isCloudflareRisk = videoFile.size > 95 * 1024 * 1024;

      // 2. Prepare multipart upload using XMLHttpRequest for real-time progress tracking
      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('audio', renderedWavBlob, 'mixdown.wav');

      const videoBlob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/studio/mux-video', true);
        xhr.responseType = 'blob';
        xhr.timeout = 180000; // 3-minute timeout

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const pct = Math.round((evt.loaded / evt.total) * 100);
            setExportProgress(pct);
            if (pct < 100) {
              setStatusMessage({
                text: `Uploading video to FFmpeg multiplexer (${pct}% of ${videoSizeMB}MB)...`,
                type: 'info',
              });
            } else {
              setStatusMessage({
                text: 'Lossless FFmpeg multiplexing in progress on server...',
                type: 'info',
              });
            }
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response);
          } else {
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const parsed = JSON.parse(reader.result as string);
                reject(new Error(parsed.detail || `Server error ${xhr.status}`));
              } catch {
                if (xhr.status === 413) {
                  reject(new Error(`File exceeds upload limit (${videoSizeMB}MB). Use Export WAV mixdown.`));
                } else {
                  reject(new Error(`Server returned HTTP ${xhr.status}: ${xhr.statusText || 'Multiplex failed'}`));
                }
              }
            };
            reader.onerror = () => reject(new Error(`Server error HTTP ${xhr.status}`));
            reader.readAsText(xhr.response);
          }
        };

        xhr.onerror = () => {
          if (isCloudflareRisk) {
            reject(new Error(`Upload failed or exceeded 100MB proxy limit (${videoSizeMB}MB). Master WAV mixdown saved instead.`));
          } else {
            reject(new Error('Network connection error while communicating with multiplexer.'));
          }
        };

        xhr.ontimeout = () => {
          reject(new Error('Video multiplexing timed out after 3 minutes.'));
        };

        xhr.send(formData);
      });

      // 3. Trigger download of merged MP4 video
      const baseName = videoFile.name.replace(/\.[^/.]+$/, '');
      const downloadUrl = URL.createObjectURL(videoBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${baseName}_sound_designed.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      setStatusMessage({ text: 'Sound-designed video exported successfully!', type: 'success' });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (e: unknown) {
      console.error('Export video error:', e);
      const msg = e instanceof Error ? e.message : 'Video export failed.';
      setStatusMessage({ text: `Export failed: ${msg}`, type: 'error' });

      // If audio mixdown was already generated, automatically trigger WAV download as fallback
      if (renderedWavBlob) {
        try {
          const baseName = videoFile.name.replace(/\.[^/.]+$/, '');
          const wavUrl = URL.createObjectURL(renderedWavBlob);
          const wavA = document.createElement('a');
          wavA.href = wavUrl;
          wavA.download = `${baseName}_sound_design_mixdown.wav`;
          document.body.appendChild(wavA);
          wavA.click();
          document.body.removeChild(wavA);
          URL.revokeObjectURL(wavUrl);
          setStatusMessage({
            text: `Video mux failed (${msg}), but Master WAV mixdown was saved to your downloads!`,
            type: 'error',
          });
        } catch {
          // ignore fallback download error
        }
      }
    } finally {
      setIsExportingVideo(false);
      setExportProgress(null);
    }
  };

  // Format time as MM:SS.ms
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 100);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}.${ms < 10 ? '0' : ''}${ms}`;
  };

  // If no project is currently selected, render the dedicated Studio Projects Hub Start Screen
  if (!activeProject) {
    return (
      <StudioProjectsHub
        onOpenProject={handleOpenProject}
        onNewBlankProject={handleNewBlankProject}
        onBackToLibrary={onBackToLibrary}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Studio Top Navigation Bar */}
      <div className="h-12 border-b border-slate-800 bg-slate-900/90 px-3 sm:px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Back to Projects Start Screen */}
          <button
            onClick={handleReturnToProjects}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 transition cursor-pointer"
            title="Return to Studio Projects Hub (Saves pending changes)"
          >
            <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Projects</span>
          </button>

          <div className="h-4 w-px bg-slate-800" />

          {/* Project Title with Inline Rename */}
          {isEditingTitle ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={titleInput}
                autoFocus
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    setIsEditingTitle(false);
                    if (titleInput.trim()) {
                      handleSaveProject(titleInput.trim());
                    }
                  } else if (e.key === 'Escape') {
                    setIsEditingTitle(false);
                    setTitleInput(activeProject?.title || 'Untitled Studio Project');
                  }
                }}
                onBlur={() => {
                  setIsEditingTitle(false);
                  if (titleInput.trim()) {
                    handleSaveProject(titleInput.trim());
                  }
                }}
                className="bg-slate-950 border border-indigo-500 rounded px-2 py-0.5 text-xs text-white font-bold max-w-[160px] sm:max-w-xs focus:outline-none"
              />
            </div>
          ) : (
            <div
              onClick={() => setIsEditingTitle(true)}
              className="flex items-center gap-1.5 group/title cursor-text px-1.5 py-0.5 rounded hover:bg-slate-800/60 transition"
              title="Click to rename project"
            >
              <h2 className="text-xs font-bold text-white max-w-[140px] sm:max-w-xs truncate">
                {activeProject?.title || 'Untitled Studio Project'}
              </h2>
              <Edit2 className="w-3 h-3 text-slate-500 opacity-0 group-hover/title:opacity-100 transition shrink-0" />
            </div>
          )}

          {/* Save Status Badge & Button */}
          <button
            onClick={() => handleSaveProject()}
            disabled={saveStatus === 'saving'}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer border ${
              saveStatus === 'saved'
                ? 'bg-slate-800/40 text-slate-400 border-slate-700/60 hover:text-white'
                : saveStatus === 'saving'
                ? 'bg-indigo-950/60 text-indigo-300 border-indigo-700/50'
                : 'bg-amber-950/50 text-amber-300 border-amber-600/50 hover:bg-amber-900/60'
            }`}
            title="Save Project [Ctrl+S]"
          >
            {saveStatus === 'saving' ? (
              <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
            ) : saveStatus === 'saved' ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Save className="w-3 h-3 text-amber-400" />
            )}
            <span className="hidden md:inline">
              {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save'}
            </span>
          </button>
        </div>

        {/* Center: Status Message Toast */}
        {statusMessage && (
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border animate-in fade-in ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                : statusMessage.type === 'error'
                ? 'bg-rose-950/80 border-rose-500/40 text-rose-300'
                : 'bg-indigo-950/80 border-indigo-500/40 text-indigo-300'
            }`}
          >
            {statusMessage.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
            {statusMessage.type === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
            {statusMessage.type === 'info' && <Sparkles className="w-3.5 h-3.5 text-indigo-400" />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Right: Export Actions */}
        <div className="flex items-center gap-2">
          {clips.length > 0 && (
            <button
              onClick={() => pushClipsWithHistory([])}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
              title="Clear Timeline"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Toggle Sound Palette Button */}
          <button
            onClick={() => setPaletteOpen(!paletteOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
              paletteOpen
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                : 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border-indigo-500/40 shadow-sm'
            }`}
            title={paletteOpen ? 'Hide Sound Palette [P]' : 'Show Sound Palette [P]'}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">{paletteOpen ? 'Hide Palette [P]' : 'Sound Palette [P]'}</span>
          </button>

          <button
            onClick={handleExportWav}
            disabled={isExportingWav || clips.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer disabled:opacity-50"
            title="Render client-side 24-bit/48kHz Master Audio WAV mixdown"
          >
            {isExportingWav ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            ) : (
              <Download className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span>Export WAV</span>
          </button>

          <button
            onClick={handleExportVideo}
            disabled={isExportingVideo || !videoFile || clips.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-md shadow-indigo-600/30 transition cursor-pointer disabled:opacity-50"
            title="Lossless FFmpeg merge of new sound design into MP4 video"
          >
            {isExportingVideo ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
            ) : (
              <Film className="w-3.5 h-3.5 text-amber-300" />
            )}
            <span>
              {isExportingVideo
                ? exportProgress !== null
                  ? exportProgress < 100
                    ? `Uploading ${exportProgress}%`
                    : 'Muxing...'
                  : 'Rendering...'
                : 'Export MP4 Video'}
            </span>
          </button>
        </div>
      </div>

      {/* Main Studio Workstation Split View */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Side: Video Canvas + Multi-Track Timeline (70-75% width) */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Top Half: Video Player Stage */}
          <div className="h-[46%] bg-slate-950 flex flex-col border-b border-slate-800 relative">
            {videoSrc ? (
              <div className="flex-1 flex items-center justify-center relative bg-black/90 p-2 overflow-hidden">
                <video
                  ref={videoRef}
                  src={videoSrc}
                  playsInline
                  preload="auto"
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onWaiting={() => stopAllAudioSources()}
                  onTimeUpdate={handleTimeUpdate}
                  onSeeked={handleSeeked}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      setDuration(videoRef.current.duration);
                    }
                  }}
                  onEnded={() => {
                    if (isLooping && videoRef.current) {
                      videoRef.current.currentTime = 0;
                      videoRef.current.play();
                    } else {
                      setIsPlaying(false);
                      stopAllAudioSources();
                    }
                  }}
                  className="max-h-full max-w-full rounded shadow-2xl object-contain"
                />

                {/* Video Info Overlay */}
                <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-800/80 text-[10px] text-slate-300 font-mono flex items-center gap-2">
                  <span className="text-amber-400 font-bold">{videoFile?.name}</span>
                  <span>•</span>
                  <span>{fps} fps</span>
                </div>

                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  <label className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 hover:bg-black/90 backdrop-blur-md border border-slate-800 text-[10px] font-medium text-slate-300 cursor-pointer">
                    <span>Change Video</span>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => e.target.files?.[0] && handleVideoSelect(e.target.files[0])}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            ) : activeProject?.video_filename ? (
              /* Re-attach Specific Video Guide Drop Zone */
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-amber-500/40 hover:border-amber-400 rounded-2xl m-3 bg-amber-950/10 transition text-center group cursor-pointer"
              >
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3 group-hover:scale-110 transition">
                  <Film className="w-7 h-7" />
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-mono mb-2">
                  <span>Re-attach Guide:</span>
                  <span className="font-bold">{activeProject.video_filename}</span>
                  {duration > 0 && <span>({duration.toFixed(1)}s)</span>}
                </div>
                <p className="text-xs text-slate-400 max-w-md mb-4 leading-relaxed">
                  Drop <strong className="text-white">{activeProject.video_filename}</strong> here to restore synchronized video preview, or continue working with your audio timeline.
                </p>
                <label className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/30 transition cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Locate {activeProject.video_filename}</span>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => e.target.files?.[0] && handleVideoSelect(e.target.files[0])}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              /* Drag & Drop Upload Zone */
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-2xl m-3 bg-slate-900/30 transition text-center group cursor-pointer"
              >
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3 group-hover:scale-110 transition">
                  <FileVideo className="w-7 h-7" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1">
                  Drag & Drop Video Here to Begin Spotting
                </h3>
                <p className="text-xs text-slate-400 max-w-md mb-4 leading-relaxed">
                  Supports MP4, WebM, and MOV. Video loads 100% locally in-memory for instant playback with zero server upload wait.
                </p>
                <label className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose Video File</span>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => e.target.files?.[0] && handleVideoSelect(e.target.files[0])}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            {/* Video Transport Control Bar */}
            <div className="h-10 border-t border-slate-800/80 bg-slate-900/90 px-3 flex items-center justify-between shrink-0">
              {/* Transport Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleSeek(0)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title="Jump to Start [Home]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => handleSeek(duration)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title="Jump to End [End]"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => handleStepFrame(-1)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer font-mono text-[10px]"
                  title="Step 1 Frame Back [←]"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <button
                  onClick={togglePlay}
                  className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition cursor-pointer"
                  title="Play / Pause [Space]"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                <button
                  onClick={() => handleStepFrame(1)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer font-mono text-[10px]"
                  title="Step 1 Frame Forward [→]"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setIsLooping(!isLooping)}
                  className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition cursor-pointer ml-1 ${
                    isLooping
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                  title="Toggle Video Loop"
                >
                  LOOP
                </button>
              </div>

              {/* Timecode Readout */}
              <div className="flex items-center gap-2">
                <div className="px-3 py-1 rounded-lg bg-black/60 border border-slate-800 font-mono text-xs flex items-center gap-2">
                  <span className="text-rose-400 font-bold">{formatTime(currentTime)}</span>
                  <span className="text-slate-600">/</span>
                  <span className="text-slate-400">{formatTime(duration)}</span>
                </div>
              </div>

              {/* Volume & Frame Rate Controls */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 font-mono">FPS:</span>
                  <select
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                    className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-[10px] font-mono text-slate-300 focus:outline-none"
                  >
                    <option value={24}>24</option>
                    <option value={25}>25</option>
                    <option value={30}>30</option>
                    <option value={60}>60</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.muted = !isVideoMuted;
                      }
                      setIsVideoMuted(!isVideoMuted);
                    }}
                    className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    {isVideoMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isVideoMuted ? 0 : videoVolume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setVideoVolume(v);
                      if (videoRef.current) {
                        videoRef.current.volume = v;
                        videoRef.current.muted = false;
                      }
                      setIsVideoMuted(false);
                    }}
                    className="w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    title={`Video Guide Volume: ${Math.round(videoVolume * 100)}%`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Half: Multi-Track Timeline Stage */}
          <div className="flex-1 min-h-0 bg-slate-950">
            <StudioTimeline
              tracks={tracks}
              clips={clips}
              currentTime={currentTime}
              duration={duration}
              selectedTrackId={selectedTrackId}
              videoRef={videoRef}
              isPlaying={isPlaying}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onSelectTrack={setSelectedTrackId}
              onSeek={handleSeek}
              onUpdateClip={handleUpdateClip}
              onCommitClipMove={handleCommitClipMove}
              onCommitClipTrim={handleCommitClipTrim}
              onSplitClip={handleSplitClip}
              onDuplicateClip={handleDuplicateClip}
              onResetClipTrim={handleResetClipTrim}
              onMoveClipToTrack={handleMoveClipToTrack}
              onRenameTrack={handleRenameTrack}
              onDeleteClip={handleDeleteClip}
              onToggleMute={handleToggleMute}
              onToggleSolo={handleToggleSolo}
              onUpdateTrackVolume={handleUpdateTrackVolume}
            />
          </div>
        </div>

        {/* Right Side: Collapsible Sound Palette Dock */}
        <div
          className={`h-full flex shrink-0 transition-all duration-300 ease-in-out relative border-l border-slate-800 ${
            paletteOpen ? 'w-80 md:w-96' : 'w-0 border-l-0'
          }`}
        >
          {/* Tactile Collapse / Expand Handle Tab */}
          <button
            onClick={() => setPaletteOpen(!paletteOpen)}
            className="absolute -left-3.5 top-1/2 -translate-y-1/2 z-30 w-4 h-14 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-l-md flex items-center justify-center text-slate-400 hover:text-white shadow-xl transition cursor-pointer"
            title={paletteOpen ? 'Collapse Sound Palette [P]' : 'Expand Sound Palette [P]'}
          >
            {paletteOpen ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>

          <div className={`w-80 md:w-96 h-full overflow-hidden ${paletteOpen ? 'block' : 'hidden'}`}>
            <StudioPalette
              onSpotSound={handleSpotSound}
              selectedTrackTag={tracks[selectedTrackId]?.tag || 'T1'}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
