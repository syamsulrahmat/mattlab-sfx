import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Film,
  Play,
  Pause,
  RotateCcw,
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
  AlertCircle
} from 'lucide-react';
import { StudioTrack, StudioClip, DEFAULT_TRACKS } from './types';
import { StudioTimeline } from './StudioTimeline';
import { StudioPalette } from './StudioPalette';
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
  const [tracks, setTracks] = useState<StudioTrack[]>(DEFAULT_TRACKS);
  const [clips, setClips] = useState<StudioClip[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<number>(0);

  // Exporting state
  const [isExportingWav, setIsExportingWav] = useState(false);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);

  // References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourcesRef = useRef<Map<string, { source: AudioBufferSourceNode; gain: GainNode }>>(new Map());
  const cachedBuffersRef = useRef<Map<number, AudioBuffer>>(new Map());

  // Initialize or get AudioContext
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Pre-load and cache audio buffer for a sound ID
  const loadAudioBuffer = useCallback(async (soundId: number): Promise<AudioBuffer | null> => {
    if (cachedBuffersRef.current.has(soundId)) {
      return cachedBuffersRef.current.get(soundId)!;
    }
    try {
      const audioCtx = getAudioContext();
      const res = await fetch(`/api/stream/${soundId}`);
      if (!res.ok) throw new Error('Failed to fetch audio stream');
      const arrayBuf = await res.arrayBuffer();
      const decodedBuf = await audioCtx.decodeAudioData(arrayBuf);
      cachedBuffersRef.current.set(soundId, decodedBuf);
      return decodedBuf;
    } catch (e) {
      console.error(`Error decoding audio buffer for sound ${soundId}:`, e);
      return null;
    }
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

      if (startPos <= clip.startTime) {
        // Clip starts in the future relative to playhead
        const delay = clip.startTime - startPos;
        source.start(audioCtx.currentTime + delay, 0);
      } else {
        // Clip is currently in mid-playback
        const offset = startPos - clip.startTime;
        source.start(audioCtx.currentTime, offset);
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

  // Spot Sound onto active track at current playhead
  const handleSpotSound = (sound: { id: number; filename: string; display_name: string; category?: string; duration: number }) => {
    const spotTime = videoRef.current ? videoRef.current.currentTime : currentTime;

    const newClip: StudioClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
      soundId: sound.id,
      name: sound.display_name || sound.filename,
      filename: sound.filename,
      startTime: parseFloat(spotTime.toFixed(3)),
      duration: sound.duration && sound.duration > 0 ? sound.duration : 1.5,
      volume: 1.0,
      trackId: selectedTrackId,
      category: sound.category,
    };

    setClips((prev) => [...prev, newClip]);
    // Pre-decode audio buffer in background
    loadAudioBuffer(sound.id);

    setStatusMessage({
      text: `Spotted "${newClip.name}" onto [${tracks[selectedTrackId].tag}] at ${spotTime.toFixed(2)}s`,
      type: 'info',
    });
    setTimeout(() => setStatusMessage(null), 2500);
  };

  // Keyboard shortcut listener for Space (play/pause) and S (spot)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fps, duration]);

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
    setClips((prev) => prev.filter((c) => c.id !== clipId));
  };

  // Export 1: Master Audio WAV Mixdown (Client-Side via OfflineAudioContext)
  const renderMixdownBuffer = async (): Promise<AudioBuffer> => {
    const sampleRate = 48000;
    const totalDuration = Math.max(duration || 5, ...clips.map((c) => c.startTime + c.duration), 1);
    const totalFrames = Math.ceil(totalDuration * sampleRate);

    const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);
    const hasSolo = tracks.some((t) => t.solo);

    // Pre-load any missing buffers
    await Promise.all(clips.map((c) => loadAudioBuffer(c.soundId)));

    for (const clip of clips) {
      const track = tracks.find((t) => t.id === clip.trackId);
      if (!track || track.muted) continue;
      if (hasSolo && !track.solo) continue;

      const buffer = cachedBuffersRef.current.get(clip.soundId);
      if (!buffer) continue;

      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;

      const gain = offlineCtx.createGain();
      gain.gain.value = Math.max(0, (track.volume || 1.0) * (clip.volume || 1.0));

      source.connect(gain);
      gain.connect(offlineCtx.destination);
      source.start(clip.startTime);
    }

    return await offlineCtx.startRendering();
  };

  const handleExportWav = async () => {
    if (clips.length === 0) {
      setStatusMessage({ text: 'Add at least one sound effect before exporting mixdown.', type: 'error' });
      return;
    }

    setIsExportingWav(true);
    setStatusMessage({ text: 'Rendering 24-bit/48kHz Master Audio Mixdown...', type: 'info' });

    try {
      const renderedBuffer = await renderMixdownBuffer();
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

  // Export 2: Lossless Video Muxing (FFmpeg Backend)
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
    setStatusMessage({ text: 'Rendering audio and multiplexing video via FFmpeg...', type: 'info' });

    try {
      // 1. Render mixdown WAV
      const renderedBuffer = await renderMixdownBuffer();
      const wavBlob = audioBufferToWavBlob(renderedBuffer);

      // 2. Prepare multipart upload to backend
      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('audio', wavBlob, 'mixdown.wav');

      const res = await fetch('/api/studio/mux-video', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.detail || 'FFmpeg multiplexing failed');
      }

      // 3. Receive finished video blob
      const videoBlob = await res.blob();
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
    } finally {
      setIsExportingVideo(false);
    }
  };

  // Format time as MM:SS.ms
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 100);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}.${ms < 10 ? '0' : ''}${ms}`;
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Studio Top Navigation Bar */}
      <div className="h-12 border-b border-slate-800 bg-slate-900/90 px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToLibrary}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Sound Library</span>
          </button>

          <div className="h-4 w-px bg-slate-800" />

          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-sm">
              <Film className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                  MattLab Studio Lab
                </h2>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  STUDIO
                </span>
              </div>
            </div>
          </div>
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
              onClick={() => setClips([])}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
              title="Clear Timeline"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

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
            <span>Export MP4 Video</span>
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
              onSelectTrack={setSelectedTrackId}
              onSeek={handleSeek}
              onUpdateClip={handleUpdateClip}
              onDeleteClip={handleDeleteClip}
              onToggleMute={handleToggleMute}
              onToggleSolo={handleToggleSolo}
              onUpdateTrackVolume={handleUpdateTrackVolume}
            />
          </div>
        </div>

        {/* Right Side: Sound Palette Dock (25-30% width) */}
        <div className="w-80 md:w-96 shrink-0 h-full">
          <StudioPalette
            onSpotSound={handleSpotSound}
            selectedTrackTag={tracks[selectedTrackId]?.tag || 'T1'}
          />
        </div>
      </div>
    </div>
  );
};
