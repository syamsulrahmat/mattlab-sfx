import React, { useState, useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { Play, Pause, Search, Volume2, Copy, Check, RefreshCw, Tag, X, Edit2, Wand2, Brain, Square, FolderOpen, Menu, ArrowUpDown, ArrowUp, ArrowDown, Download, Bookmark, FolderPlus, Trash2, Plus, Folder, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Info, Users, LogOut, Loader2, Scissors, Settings } from 'lucide-react';
import { Logo } from './components/Logo';
import { AudioPlayer } from './components/AudioPlayer';
import { ProjectAssignModal, ProjectCollection } from './components/ProjectAssignModal';
import { ConfirmModal } from './components/ConfirmModal';
import { ContextMenu } from './components/ContextMenu';
import { useAuth } from './context/AuthContext';
import { LoginPage } from './components/LoginPage';
import { UserManagementModal } from './components/UserManagementModal';
import { ShortcutFooter } from './components/ShortcutFooter';
import { SettingsModal, UserSettings, DEFAULT_SETTINGS } from './components/SettingsModal';

interface AudioItem {
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

export default function App() {
  const { user, isLoading: authLoading, logout, isAdmin } = useAuth();
  const [userMgmtOpen, setUserMgmtOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [results, setResults] = useState<AudioItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [revealedId, setRevealedId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [categories, setCategories] = useState<{ category: string; sub_category: string; count: number }[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [listeningId, setListeningId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'error' | 'info' | 'clipboard'; title: string; body?: string; code?: string }>>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    severity?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: AudioItem;
  } | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [collectionIds, setCollectionIds] = useState<Set<number>>(new Set());
  const [collectionOnly, setCollectionOnly] = useState<boolean>(false);
  const [collectionCollapsed, setCollectionCollapsed] = useState(() => {
    return localStorage.getItem('sfx_collection_collapsed') === 'true';
  });
  const [projects, setProjects] = useState<ProjectCollection[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [projectAssignments, setProjectAssignments] = useState<Record<number, number[]>>({});
  const [assignModalSound, setAssignModalSound] = useState<AudioItem | null>(null);
  const [newProjectInline, setNewProjectInline] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const isLoopingRef = useRef(false);
  isLoopingRef.current = isLooping;

  const [aiStatus, setAiStatus] = useState<{
    is_running: boolean;
    total: number;
    processed: number;
    remaining?: number;
    last_result: string;
    governor_mode?: 'turbo' | 'balanced' | 'eco' | string;
    active_threads?: number;
    server_load_pct?: number;
  }>({
    is_running: false,
    total: 0,
    processed: 0,
    remaining: 0,
    last_result: '',
    governor_mode: 'eco',
    active_threads: 1,
    server_load_pct: 0,
  });

  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [loadingTrackId, setLoadingTrackId] = useState<number | null>(null);
  const currentLoadedIdRef = useRef<number | null>(null);
  const peaksCacheRef = useRef<Map<number, number[]>>(new Map());
  const trackLoadRequestIdRef = useRef<number>(0);
  const regionsPluginRef = useRef<any>(null);
  const [trimRegion, setTrimRegion] = useState<{ start: number; end: number } | null>(null);
  const trimRegionRef = useRef<{ start: number; end: number } | null>(null);
  trimRegionRef.current = trimRegion;
  const [isSearching, setIsSearching] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const saved = localStorage.getItem('mattlab_sfx_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          nudgeStep: Number(parsed.nudgeStep) || DEFAULT_SETTINGS.nudgeStep,
          fastJumpStep: Number(parsed.fastJumpStep) || DEFAULT_SETTINGS.fastJumpStep,
        };
      }
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS;
  });
  const settingsRef = useRef<UserSettings>(settings);
  settingsRef.current = settings;
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleSaveSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem('mattlab_sfx_settings', JSON.stringify(newSettings));
    } catch {
      // ignore
    }
    addToast({
      type: 'success',
      title: 'Settings Saved',
      body: `Nudge: ${newSettings.nudgeStep}s • Fast Jump: ${newSettings.fastJumpStep}s`,
    });
  };

  // WaveSurfer initialization helper
  const initWaveSurfer = (container: HTMLElement) => {
    if (wavesurfer.current) return wavesurfer.current;

    const ws = WaveSurfer.create({
      container,
      waveColor: '#4f46e5',
      progressColor: '#818cf8',
      cursorColor: '#c7d2fe',
      barWidth: 2,
      barRadius: 2,
      barGap: 1,
      height: 44,
      autoplay: true,
    });

    const wsRegions = RegionsPlugin.create();
    ws.registerPlugin(wsRegions);
    regionsPluginRef.current = wsRegions;

    const getMinTrimDuration = () => {
      const totalDur = ws.getDuration() || 0;
      if (totalDur > 0 && totalDur < 0.6) {
        return Math.max(0.1, totalDur * 0.5);
      }
      return 0.3; // 300ms minimum trim threshold
    };

    wsRegions.enableDragSelection(
      {
        color: 'rgba(139, 92, 246, 0.28)',
        minLength: 0.3,
      },
      10 // 10px drag threshold to filter out pure clicks and accidental mouse slips
    );

    wsRegions.on('region-created', (region: any) => {
      // Retain only the newest active trim region
      const all = wsRegions.getRegions();
      all.forEach((r: any) => {
        if (r.id !== region.id) r.remove();
      });

      const span = region.end - region.start;
      const minDur = getMinTrimDuration();
      if (span < minDur) {
        // Silently discard accidental micro-drag (< 300ms) and seek to position
        const seekTime = Math.max(0, region.start);
        region.remove();
        setTrimRegion(null);
        if (ws.getDuration() > 0) {
          ws.seekTo(seekTime / ws.getDuration());
          setCurrentTime(seekTime);
        }
        return;
      }

      setTrimRegion({ start: Math.max(0, region.start), end: region.end });
    });

    wsRegions.on('region-update', (region: any) => {
      setTrimRegion({ start: Math.max(0, region.start), end: region.end });
    });

    wsRegions.on('region-updated', (region: any) => {
      const span = region.end - region.start;
      const minDur = getMinTrimDuration();
      if (span < minDur) {
        // Silently discard if resized below 300ms threshold and seek
        const seekTime = Math.max(0, region.start);
        region.remove();
        setTrimRegion(null);
        if (ws.getDuration() > 0) {
          ws.seekTo(seekTime / ws.getDuration());
          setCurrentTime(seekTime);
        }
        return;
      }

      setTrimRegion({ start: Math.max(0, region.start), end: region.end });
    });

    wsRegions.on('region-removed', () => {
      setTrimRegion(null);
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => {
      const trim = trimRegionRef.current;
      if (trim) {
        if (isLoopingRef.current) {
          ws.seekTo(trim.start / (ws.getDuration() || 1));
          ws.play();
        } else {
          setIsPlaying(false);
          ws.seekTo(trim.start / (ws.getDuration() || 1));
        }
      } else if (isLoopingRef.current) {
        wavesurfer.current?.play();
      } else {
        setIsPlaying(false);
      }
    });

    ws.on('timeupdate', (t) => {
      setCurrentTime(t);
      const trim = trimRegionRef.current;
      if (trim && ws.isPlaying()) {
        if (t >= trim.end) {
          if (isLoopingRef.current) {
            ws.seekTo(trim.start / (ws.getDuration() || 1));
            ws.play();
          } else {
            ws.pause();
            ws.seekTo(trim.start / (ws.getDuration() || 1));
          }
        }
      }
    });

    ws.on('ready', () => {
      setDuration(ws.getDuration() || 0);
    });

    ws.setVolume(volume);
    wavesurfer.current = ws;
    return ws;
  };

  // Initialize WaveSurfer when user is authenticated and waveform container is mounted
  useEffect(() => {
    if (!user) {
      if (wavesurfer.current) {
        wavesurfer.current.destroy();
        wavesurfer.current = null;
      }
      return;
    }

    if (waveformRef.current && !wavesurfer.current) {
      initWaveSurfer(waveformRef.current);
    }

    return () => {
      wavesurfer.current?.destroy();
      wavesurfer.current = null;
    };
  }, [user]);

  // Fetch all bookmarked collection IDs
  const fetchCollectionIds = async () => {
    try {
      const res = await fetch('/api/collection/ids');
      const ids: number[] = await res.json();
      setCollectionIds(new Set(ids));
    } catch (e) {
      console.error('Error fetching collection IDs:', e);
    }
  };

  // Fetch project collections list
  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (e) {
      console.error('Error fetching projects:', e);
    }
  };

  // Fetch project assignments map
  const fetchProjectAssignments = async () => {
    try {
      const res = await fetch('/api/projects/assignments');
      if (res.ok) {
        const data = await res.json();
        setProjectAssignments(data);
      }
    } catch (e) {
      console.error('Error fetching project assignments:', e);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchCollectionIds();
    fetchProjects();
    fetchProjectAssignments();
  }, [user]);

  // Fetch search results
  const fetchResults = async (
    q: string,
    cat: string,
    sBy: string = sortBy,
    sOrder: string = sortOrder,
    cOnly: boolean = collectionOnly,
    pId: number | null = activeProjectId
  ) => {
    try {
      const pParam = pId !== null ? `&project_id=${pId}` : '';
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}&sort_by=${encodeURIComponent(sBy)}&sort_order=${encodeURIComponent(sOrder)}&collection_only=${cOnly}${pParam}&limit=100`
      );
      const data = await res.json();
      setResults(data.results || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
    }
  };

  // In-app Toast helpers
  const addToast = (toast: { type: 'success' | 'error' | 'info' | 'clipboard'; title: string; body?: string; code?: string }) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      removeToast(id);
    }, toast.type === 'clipboard' ? 5500 : 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleCreateProject = async (name: string, color: string = '#f59e0b'): Promise<number | null> => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create project');
      }
      const data = await res.json();
      await fetchProjects();
      addToast({
        type: 'success',
        title: 'Project Created',
        body: `Created collection "${name}".`,
      });
      return data.project.id;
    } catch (e: any) {
      addToast({
        type: 'error',
        title: 'Error Creating Project',
        body: e.message || 'Could not create project.',
      });
      return null;
    }
  };

  const handleRenameProject = async (projectId: number, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        await fetchProjects();
        setEditingProjectId(null);
        addToast({
          type: 'success',
          title: 'Project Renamed',
          body: `Project renamed to "${trimmed}".`,
        });
      } else {
        const err = await res.json();
        addToast({
          type: 'error',
          title: 'Error Renaming Project',
          body: err.detail || 'Failed to rename project.',
        });
      }
    } catch (e: any) {
      addToast({
        type: 'error',
        title: 'Error Renaming Project',
        body: e.message || 'Failed to rename project.',
      });
    }
  };

  const handleDeleteProject = (projectId: number, projectName: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Project Collection?',
      message: `Are you sure you want to delete project "${projectName}"?\n\nSounds will remain safe in your library and My Collection.`,
      confirmText: 'Delete Project',
      cancelText: 'Cancel',
      severity: 'danger',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
          if (res.ok) {
            if (activeProjectId === projectId) {
              setActiveProjectId(null);
            }
            await fetchProjects();
            await fetchProjectAssignments();
            addToast({
              type: 'success',
              title: 'Project Deleted',
              body: `Project "${projectName}" was removed.`,
            });
          }
        } catch (e: any) {
          addToast({
            type: 'error',
            title: 'Error Deleting Project',
            body: e.message || 'Failed to delete project.',
          });
        }
      },
    });
  };

  const handleToggleAssign = async (projectId: number, soundId: number, isCurrentlyAssigned: boolean) => {
    // Optimistic assignment map update
    setProjectAssignments((prev) => {
      const current = prev[soundId] || [];
      const updated = isCurrentlyAssigned
        ? current.filter((id) => id !== projectId)
        : [...current, projectId];
      return { ...prev, [soundId]: updated };
    });

    if (!isCurrentlyAssigned) {
      // Ensure sound is also reflected in collectionIds
      setCollectionIds((prev) => new Set(prev).add(soundId));
    }

    try {
      if (isCurrentlyAssigned) {
        await fetch(`/api/projects/${projectId}/items/${soundId}`, { method: 'DELETE' });
      } else {
        await fetch(`/api/projects/${projectId}/items/${soundId}`, { method: 'POST' });
      }
      await fetchProjects();
      if (activeProjectId === projectId) {
        fetchResults(query, category, sortBy, sortOrder, collectionOnly, activeProjectId);
      }
    } catch (e) {
      console.error('Error toggling project assignment:', e);
      fetchProjects();
      fetchProjectAssignments();
    }
  };

  const toggleCollect = async (item: AudioItem) => {
    const inCollection = collectionIds.has(item.id);

    // Optimistic UI update
    setCollectionIds((prev) => {
      const next = new Set(prev);
      if (inCollection) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      return next;
    });

    addToast({
      type: inCollection ? 'info' : 'success',
      title: inCollection ? 'Removed from Collection' : 'Saved to My Collection',
      body: item.display_name || item.filename,
    });

    try {
      if (inCollection) {
        await fetch(`/api/collection/${item.id}`, { method: 'DELETE' });
      } else {
        await fetch(`/api/collection/${item.id}`, { method: 'POST' });
      }
      if (collectionOnly || activeProjectId !== null) {
        fetchResults(query, category, sortBy, sortOrder, collectionOnly, activeProjectId);
      }
      await fetchProjects();
      await fetchProjectAssignments();
    } catch (e) {
      console.error('Error toggling collection:', e);
      fetchCollectionIds();
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder(field === 'duration' || field === 'sample_rate' ? 'desc' : 'asc');
    }
  };

  // Fetch categories & AI status
  const fetchAuxData = async () => {
    try {
      const [catRes, aiRes] = await Promise.all([
        fetch('/api/categories'),
        fetch('/api/ai/status')
      ]);
      setCategories(await catRes.json());
      const aiData = await aiRes.json();
      setAiStatus(aiData);
      if (aiData.is_running) {
        fetchResults(query, category, sortBy, sortOrder, collectionOnly, activeProjectId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchResults(query, category, sortBy, sortOrder, collectionOnly, activeProjectId);
  }, [user, query, category, sortBy, sortOrder, collectionOnly, activeProjectId]);

  useEffect(() => {
    if (!user) return;
    fetchAuxData();
    const interval = setInterval(fetchAuxData, 3000);
    return () => clearInterval(interval);
  }, [user, query, category]);

  // Load and play selected track with instant retrigger & zero-blocking streaming
  const selectTrack = (item: AudioItem) => {
    // 1. Instant retrigger if this sound is already loaded in WaveSurfer
    if (currentLoadedIdRef.current === item.id && wavesurfer.current) {
      setSelectedId(item.id);
      const trim = trimRegionRef.current;
      if (trim) {
        wavesurfer.current.seekTo(trim.start / (wavesurfer.current.getDuration() || 1));
        setCurrentTime(trim.start);
      } else {
        wavesurfer.current.seekTo(0);
        setCurrentTime(0);
      }
      wavesurfer.current.play();
      return;
    }

    const requestId = ++trackLoadRequestIdRef.current;

    // 2. Immediately silence any currently playing track (0ms instant cutoff)
    if (wavesurfer.current) {
      try {
        wavesurfer.current.pause();
      } catch (e) {
        // ignore
      }
    }

    // Clear any previous trim regions when switching sound
    if (regionsPluginRef.current) {
      regionsPluginRef.current.clearRegions();
    }
    setTrimRegion(null);

    // 3. Immediately switch visual state to new track
    setIsPlaying(false);
    setSelectedId(item.id);
    setLoadingTrackId(item.id);
    setCurrentTime(0);
    setDuration(item.duration || 0);

    let ws = wavesurfer.current;
    if (!ws && waveformRef.current) {
      ws = initWaveSurfer(waveformRef.current);
    }
    if (!ws) {
      setLoadingTrackId(null);
      return;
    }

    currentLoadedIdRef.current = item.id;

    const audioUrl = `/api/stream/${item.id}`;
    const cachedPeaks = peaksCacheRef.current.get(item.id);

    // 4. Load audio stream immediately without waiting for peaks
    try {
      ws.load(audioUrl, cachedPeaks ? [cachedPeaks] : undefined, item.duration || undefined);
      ws.play();
    } catch (e) {
      console.warn('Error starting direct playback:', e);
    }

    // Clear spinner as soon as playback starts or buffers (guarded by requestId)
    ws.once('play', () => {
      if (trackLoadRequestIdRef.current === requestId) {
        setLoadingTrackId(null);
      }
    });

    ws.once('ready', () => {
      if (trackLoadRequestIdRef.current === requestId) {
        setDuration(ws.getDuration() || item.duration || 0);
        setLoadingTrackId(null);
      }
    });

    ws.once('error', (err) => {
      console.error('WaveSurfer error:', err);
      if (trackLoadRequestIdRef.current === requestId) {
        setLoadingTrackId(null);
      }
    });

    // 5. Asynchronously fetch and cache peaks in background
    if (!cachedPeaks) {
      fetch(`/api/peaks/${item.id}`)
        .then((res) => res.json())
        .then((peaks) => {
          if (Array.isArray(peaks) && peaks.length > 0) {
            peaksCacheRef.current.set(item.id, peaks);
          }
        })
        .catch(() => {});
    }
  };

  const handleMarkIn = () => {
    const ws = wavesurfer.current;
    const wsRegions = regionsPluginRef.current;
    if (!ws || !wsRegions) return;

    const time = ws.getCurrentTime() || 0;
    const dur = ws.getDuration() || duration || 0;
    const minSpan = dur > 0 && dur < 0.6 ? Math.max(0.1, dur * 0.5) : 0.3;
    const regions = wsRegions.getRegions();

    if (regions.length > 0) {
      const reg = regions[0];
      let end = reg.end;
      if (end - time < minSpan) {
        end = Math.min(time + minSpan, dur > 0 ? dur : time + minSpan);
      }
      reg.setOptions({ start: time, end, minLength: minSpan });
      setTrimRegion({ start: time, end });
    } else {
      const end = dur > time + minSpan ? dur : time + minSpan;
      wsRegions.addRegion({
        start: time,
        end,
        color: 'rgba(139, 92, 246, 0.28)',
        minLength: minSpan,
      });
      setTrimRegion({ start: time, end });
    }
    addToast({
      type: 'info',
      title: 'Trim IN Marked [I]',
      body: `Start set to ${time.toFixed(2)}s`,
    });
  };

  const handleMarkOut = () => {
    const ws = wavesurfer.current;
    const wsRegions = regionsPluginRef.current;
    if (!ws || !wsRegions) return;

    const time = ws.getCurrentTime() || 0;
    const dur = ws.getDuration() || duration || 0;
    const minSpan = dur > 0 && dur < 0.6 ? Math.max(0.1, dur * 0.5) : 0.3;
    const regions = wsRegions.getRegions();

    if (regions.length > 0) {
      const reg = regions[0];
      let start = reg.start;
      if (time - start < minSpan) {
        start = Math.max(0, time - minSpan);
      }
      reg.setOptions({ start, end: time, minLength: minSpan });
      setTrimRegion({ start, end: time });
    } else {
      const start = Math.max(0, time - minSpan);
      wsRegions.addRegion({
        start,
        end: time,
        color: 'rgba(139, 92, 246, 0.28)',
        minLength: minSpan,
      });
      setTrimRegion({ start, end: time });
    }
    addToast({
      type: 'info',
      title: 'Trim OUT Marked [O]',
      body: `End set to ${time.toFixed(2)}s`,
    });
  };

  const handleClearTrim = () => {
    if (regionsPluginRef.current) {
      regionsPluginRef.current.clearRegions();
    }
    setTrimRegion(null);
    addToast({
      type: 'info',
      title: 'Trim Cleared [X]',
      body: 'Full track restored',
    });
  };

  const downloadAudio = (item: AudioItem, trim?: { start: number; end: number } | null) => {
    const link = document.createElement('a');
    let url = `/api/download/${item.id}`;
    let title = 'Downloading Sound';
    let body = item.display_name || item.filename;

    if (trim && trim.end > trim.start) {
      url += `?start=${trim.start.toFixed(3)}&end=${trim.end.toFixed(3)}`;
      const dur = (trim.end - trim.start).toFixed(1);
      title = `Downloading Trimmed Slice (${dur}s)`;
      body = `${item.display_name || item.filename} [${trim.start.toFixed(1)}s - ${trim.end.toFixed(1)}s]`;
    }

    link.href = url;
    link.download = item.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast({
      type: 'info',
      title,
      body,
    });
  };

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (contextMenu !== null && e.key === 'Escape') {
        e.preventDefault();
        setContextMenu(null);
        return;
      }

      const isInput =
        document.activeElement === searchInputRef.current ||
        editingId !== null ||
        editingProjectId !== null ||
        assignModalSound !== null ||
        confirmDialog !== null ||
        contextMenu !== null ||
        settingsOpen ||
        newProjectInline;

      if (!isInput && (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'))) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (isInput) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (settingsOpen) {
            setSettingsOpen(false);
          } else if (editingId !== null) {
            setEditingId(null);
          } else {
            searchInputRef.current?.blur();
          }
        } else if (document.activeElement === searchInputRef.current && (e.key === 'ArrowDown' || e.key === 'Enter')) {
          e.preventDefault();
          searchInputRef.current?.blur();
          if (results.length > 0 && selectedId === null) {
            selectTrack(results[0]);
          }
        }
        return;
      }

      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        const ws = wavesurfer.current;
        if (!ws) return;
        e.preventDefault();

        const current = ws.getCurrentTime() || 0;
        const dur = ws.getDuration() || duration || 0;
        const trim = trimRegionRef.current;

        const step = e.shiftKey
          ? (settingsRef.current.fastJumpStep || 0.5)
          : (settingsRef.current.nudgeStep || 0.1);
        const delta = e.code === 'ArrowRight' ? step : -step;

        const minBound = trim ? trim.start : 0;
        const maxBound = trim ? trim.end : (dur > 0 ? dur : current + step);

        const targetTime = Math.max(minBound, Math.min(maxBound, current + delta));
        if (dur > 0) {
          ws.seekTo(targetTime / dur);
          setCurrentTime(targetTime);
        }
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (wavesurfer.current) {
          if (wavesurfer.current.isPlaying()) {
            wavesurfer.current.pause();
          } else {
            const trim = trimRegionRef.current;
            const cur = wavesurfer.current.getCurrentTime();
            if (trim && (cur < trim.start || cur >= trim.end)) {
              wavesurfer.current.seekTo(trim.start / (wavesurfer.current.getDuration() || 1));
            }
            wavesurfer.current.play();
          }
        } else if (results.length > 0) {
          const itemToPlay = results.find((r) => r.id === selectedId) || results[0];
          selectTrack(itemToPlay);
        }
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        const currentIndex = results.findIndex((r) => r.id === selectedId);
        if (currentIndex < results.length - 1) {
          selectTrack(results[currentIndex + 1]);
        } else if (currentIndex === -1 && results.length > 0) {
          selectTrack(results[0]);
        }
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        const currentIndex = results.findIndex((r) => r.id === selectedId);
        if (currentIndex > 0) {
          selectTrack(results[currentIndex - 1]);
        }
      } else if (e.key.toLowerCase() === 'e') {
        const item = results.find((r) => r.id === selectedId);
        if (item) {
          e.preventDefault();
          copyExplorer(item);
        }
      } else if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
        const item = results.find((r) => r.id === selectedId);
        if (item) {
          e.preventDefault();
          copySMB(item);
        }
      } else if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsLooping((prev) => !prev);
      } else if (e.key.toLowerCase() === 'i' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleMarkIn();
      } else if (e.key.toLowerCase() === 'o' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleMarkOut();
      } else if (e.key.toLowerCase() === 'x' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleClearTrim();
      } else if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey) {
        const item = results.find((r) => r.id === selectedId);
        if (item) {
          e.preventDefault();
          downloadAudio(item, trimRegionRef.current);
        }
      } else if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey) {
        const item = results.find((r) => r.id === selectedId);
        if (item) {
          e.preventDefault();
          toggleCollect(item);
        }
      } else if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey) {
        const item = results.find((r) => r.id === selectedId);
        if (item) {
          e.preventDefault();
          setAssignModalSound(item);
        }
      } else if (e.key === ',' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, selectedId, editingId, editingProjectId, assignModalSound, confirmDialog, contextMenu, settingsOpen, newProjectInline]);

  const copyToClipboard = async (text: string): Promise<boolean> => {
    // 1. Try modern navigator.clipboard if in a secure context
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fallback below
      }
    }

    // 2. Reliable fallback for HTTP / LAN IP origins
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.error('Fallback clipboard copy failed:', err);
      return false;
    }
  };

  const copyExplorer = async (item: AudioItem) => {
    const cmd = item.explorer_cmd || `explorer.exe /select,"${item.smb_path}"`;
    const success = await copyToClipboard(cmd);
    if (success) {
      setRevealedId(item.id);
      addToast({
        type: 'clipboard',
        title: 'Copied Explorer Command! [Hotkeys: E]',
        body: 'Press Win + R and paste (Ctrl+V) to reveal & select file in Explorer.\nTip: If Desktop opens, access \\\\192.168.100.200\\Assets in Explorer once to save login.',
        code: cmd,
      });

      // Optional 1-click trigger if user installed the mattlab-reveal protocol
      try {
        const b64 = btoa(unescape(encodeURIComponent(item.smb_path)));
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `mattlab-reveal:${b64}`;
        document.body.appendChild(iframe);
        setTimeout(() => document.body.removeChild(iframe), 2000);
      } catch {
        // Silently ignore if protocol is unhandled
      }

      setTimeout(() => setRevealedId(null), 2000);
    }
  };

  const copySMB = async (item: AudioItem) => {
    const success = await copyToClipboard(item.smb_path);
    if (success) {
      setCopiedId(item.id);
      addToast({
        type: 'clipboard',
        title: 'Copied Raw SMB Path! [Hotkeys: C]',
        body: 'Windows network path ready for your DAW, NLE, or file picker.',
        code: item.smb_path,
      });
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const saveCustomName = async (id: number) => {
    if (!editValue.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await fetch(`/api/audio/${id}/name`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: editValue.trim() })
      });
      setResults((prev) =>
        prev.map((item) => (item.id === id ? { ...item, display_name: editValue.trim() } : item))
      );
      addToast({
        type: 'success',
        title: 'Renamed Sound in App',
        body: editValue.trim(),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setEditingId(null);
    }
  };

  const aiListen = async (id: number) => {
    setListeningId(id);
    try {
      const res = await fetch(`/api/audio/${id}/ai-listen`, { method: 'POST' });
      const data = await res.json();
      if (data.display_name) {
        setResults((prev) =>
          prev.map((item) => (item.id === id ? { ...item, display_name: data.display_name } : item))
        );
        addToast({
          type: 'success',
          title: 'AI Smart Name Generated',
          body: data.display_name,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setListeningId(null);
    }
  };

  const isAiComplete = aiStatus.total > 0 && (aiStatus.remaining ?? (aiStatus.total - (aiStatus.processed || 0))) === 0;

  const toggleBatchAi = async () => {
    if (isAiComplete && !aiStatus.is_running) {
      addToast({
        type: 'info',
        title: 'Library 100% Classified',
        body: `All ${(aiStatus.total || 0).toLocaleString()} sounds are already analyzed. Scan new files to process more.`,
      });
      return;
    }
    if (aiStatus.is_running) {
      await fetch('/api/ai/stop', { method: 'POST' });
      addToast({
        type: 'info',
        title: 'AI Acoustic Renaming Paused',
      });
    } else {
      await fetch('/api/ai/start', { method: 'POST' });
      addToast({
        type: 'success',
        title: 'AI Acoustic Renaming Started',
        body: 'Analyzing library sounds in the background.',
      });
    }
    fetchAuxData();
  };

  const triggerScan = async () => {
    setScanning(true);
    await fetch('/api/scan', { method: 'POST' });
    setTimeout(() => {
      fetchResults(query, category);
      fetchAuxData();
      setScanning(false);
    }, 2000);
  };

  const currentItem = results.find((r) => r.id === selectedId);
  const activeProject = projects.find((p) => p.id === activeProjectId);

  // Dynamic total library count & rounded representation
  const totalLibraryCount = categories.reduce((acc, c) => acc + c.count, 0) || aiStatus.total || total;
  const roundedLibraryApprox = totalLibraryCount > 0 
    ? (Math.round(totalLibraryCount / 1000) * 1000).toLocaleString() 
    : '30,000';

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950 text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400 font-medium">Loading MattLab SFX...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Mobile Drawer Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
        />
      )}

      {/* Sidebar: Categories (Desktop Pinned + Mobile Slide-over Drawer) */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 border-r border-slate-800 flex flex-col p-4 transition-transform duration-300 ease-in-out md:static md:w-64 md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between mb-4 px-2">
          <Logo size={30} showText={true} />
          {/* Mobile Close Button */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isAdmin && (
          <button
            onClick={triggerScan}
            disabled={scanning}
            className="flex items-center justify-center gap-2 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-lg py-2 px-3 text-sm font-medium transition mb-4 shadow-sm shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning...' : 'Rescan Library'}
          </button>
        )}

        {/* Main Library Navigation */}
        <div className="space-y-1 mb-4 shrink-0">
          <button
            onClick={() => {
              setCollectionOnly(false);
              setActiveProjectId(null);
              setCategory('');
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
              !collectionOnly && activeProjectId === null
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 border border-transparent'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="text-sm">📁</span>
              All Sounds
            </span>
            <span className="text-xs text-slate-400 font-mono">{totalLibraryCount.toLocaleString()}</span>
          </button>

          {/* My Collection Section */}
          <div className="pt-2 border-t border-slate-800/80">
            <div
              onClick={() => {
                setCollectionCollapsed((prev) => {
                  const next = !prev;
                  localStorage.setItem('sfx_collection_collapsed', String(next));
                  return next;
                });
              }}
              className="flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition cursor-pointer select-none rounded group"
              title={collectionCollapsed ? 'Expand My Collection' : 'Collapse My Collection'}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                {collectionCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 transition shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 transition shrink-0" />
                )}
                <Bookmark className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">My Collection</span>
              </span>
              <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  collectionOnly || activeProjectId !== null
                    ? 'bg-amber-500/20 text-amber-300 font-semibold'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {collectionIds.size}
                </span>
                <button
                  onClick={() => {
                    if (collectionCollapsed) {
                      setCollectionCollapsed(false);
                      localStorage.setItem('sfx_collection_collapsed', 'false');
                    }
                    setNewProjectInline((prev) => !prev);
                  }}
                  className="text-slate-400 hover:text-amber-400 p-0.5 rounded transition cursor-pointer"
                  title="Create New Project Collection"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Collapsible Content */}
            {!collectionCollapsed && (
              <div className="space-y-1 mt-1 animate-in fade-in duration-150">
                {/* All Saved (Global Root) */}
                <button
                  onClick={() => {
                    setCollectionOnly(true);
                    setActiveProjectId(null);
                    setCategory('');
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    collectionOnly && activeProjectId === null
                      ? 'bg-amber-950/50 text-amber-300 border border-amber-600/60 shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800/80 border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Bookmark className={`w-3.5 h-3.5 ${collectionOnly && activeProjectId === null ? 'text-amber-400 fill-amber-400' : 'text-amber-400'}`} />
                    All Saved
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    collectionOnly && activeProjectId === null ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {collectionIds.size}
                  </span>
                </button>

                {/* Inline Project Creation */}
                {newProjectInline && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!newProjectName.trim()) return;
                      await handleCreateProject(newProjectName.trim());
                      setNewProjectName('');
                      setNewProjectInline(false);
                    }}
                    className="mt-1.5 p-2 bg-slate-950/80 border border-slate-800 rounded-lg flex flex-col gap-1.5 animate-in fade-in duration-150"
                  >
                    <input
                      type="text"
                      placeholder="Project name..."
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      autoFocus
                      className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setNewProjectInline(false);
                          setNewProjectName('');
                        }}
                        className="text-[10px] px-2 py-0.5 rounded text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!newProjectName.trim()}
                        className="text-[10px] bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 text-slate-950 font-semibold px-2 py-0.5 rounded transition cursor-pointer"
                      >
                        Create
                      </button>
                    </div>
                  </form>
                )}

                {/* Projects Sub-list */}
                <div className="space-y-0.5 max-h-40 overflow-y-auto pr-0.5">
                  {projects.map((p) => {
                    const isActive = activeProjectId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setActiveProjectId(p.id);
                          setCollectionOnly(false);
                          setCategory('');
                          setSidebarOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer group ${
                          isActive
                            ? 'bg-amber-950/50 text-amber-300 border border-amber-600/60 shadow-sm'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: p.color || '#f59e0b' }}
                          />
                          <span className="truncate">{p.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0 group-hover:text-slate-400">
                          {p.sound_count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 px-2 flex items-center gap-1.5 shrink-0">
          <Tag className="w-3.5 h-3.5" />
          Categories
        </h2>

        {/* Categories List (Scrollable Area) */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1">
          {categories.map((c) => (
            <button
              key={c.category}
              onClick={() => {
                setCategory(category === c.category ? '' : c.category);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-sm transition ${
                category === c.category ? 'bg-indigo-600/20 text-indigo-300 font-medium' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <span>{c.sub_category || c.category}</span>
              <span className="text-xs text-slate-500">{c.count}</span>
            </button>
          ))}
        </div>

        {/* Bottom-Left Corner: AI Background Progress & Status (Admin Only) */}
        {isAdmin && (
          <div className="mt-3 pt-3 border-t border-slate-800 shrink-0">
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-lg p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5" />
                  AI Acoustic Renaming
                </span>
                <div className="flex items-center gap-1.5">
                  {aiStatus.is_running && (
                    <span
                      className={`text-[9px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1 transition-all ${
                        aiStatus.governor_mode === 'turbo'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : aiStatus.governor_mode === 'balanced'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                      title={`Dynamic Governor: ${
                        aiStatus.governor_mode === 'turbo'
                          ? 'Turbo mode (4 CPU cores, 0ms gap) - Server idle'
                          : aiStatus.governor_mode === 'balanced'
                          ? 'Balanced mode (2 CPU cores, 30ms gap) - Light server load'
                          : 'Eco mode (1 CPU core, 100ms gap) - Active user or heavy load'
                      } • Host load: ${aiStatus.server_load_pct ?? 0}%`}
                    >
                      {aiStatus.governor_mode === 'turbo' ? '🚀 Turbo' : aiStatus.governor_mode === 'balanced' ? '⚖️ Balanced' : '🍃 Eco'}
                      <span className="opacity-75">({aiStatus.active_threads ?? 1}T)</span>
                    </span>
                  )}
                  {isAiComplete ? (
                    <button
                      onClick={toggleBatchAi}
                      className="p-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs flex items-center gap-1 hover:bg-emerald-500/30 transition cursor-pointer"
                      title="Library 100% acoustically classified"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  ) : (
                    <button
                      onClick={toggleBatchAi}
                      className={`p-1 rounded text-xs transition cursor-pointer ${
                        aiStatus.is_running
                          ? 'bg-rose-600/80 hover:bg-rose-500 text-white'
                          : 'bg-amber-600/80 hover:bg-amber-500 text-white'
                      }`}
                      title={aiStatus.is_running ? 'Pause batch acoustic renaming' : 'Start unified acoustic renaming for whole library'}
                    >
                      {aiStatus.is_running ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                    </button>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>{aiStatus.is_running ? 'Processing' : isAiComplete ? 'Library status:' : 'Unified library:'}</span>
                <span className="font-mono text-slate-300">
                  {(aiStatus.processed || 0).toLocaleString()} / {(aiStatus.total || 0).toLocaleString()}
                </span>
              </div>
              {(aiStatus.is_running || isAiComplete) && (
                <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1.5">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isAiComplete
                        ? 'bg-emerald-500'
                        : 'bg-gradient-to-r from-amber-400 to-amber-500'
                    }`}
                    style={{
                      width: isAiComplete ? '100%' : `${aiStatus.total ? (aiStatus.processed / aiStatus.total) * 100 : 0}%`
                    }}
                  />
                </div>
              )}
              <div className="text-[10px] text-slate-400 flex items-center justify-between mt-1">
                <span>Remaining:</span>
                <span className={`font-mono font-medium ${isAiComplete ? 'text-emerald-400' : 'text-amber-300/90'}`}>
                  {isAiComplete ? '0 files (100% complete)' : `${(aiStatus.remaining ?? (aiStatus.total ? aiStatus.total - (aiStatus.processed || 0) : 0)).toLocaleString()} files`}
                </span>
              </div>
              {aiStatus.last_result && !isAiComplete && (
                <div className="text-[10px] text-amber-400/80 truncate mt-1 pt-1 border-t border-slate-700/50" title={aiStatus.current_file || ''}>
                  Latest: {aiStatus.last_result}
                </div>
              )}
            </div>
          </div>
        )}

        {/* User Profile Card */}
        <div className="mt-auto pt-3 border-t border-slate-800 shrink-0">
          <div className="flex items-center justify-between bg-slate-800/60 border border-slate-700/60 rounded-xl p-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-xs text-white uppercase shrink-0 shadow-sm">
                {(user.display_name || user.username || 'U')[0]}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-200 truncate leading-tight">
                    {user.display_name || user.username}
                  </span>
                  <span
                    className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                      isAdmin
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                    }`}
                  >
                    {user.role}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate leading-tight mt-0.5">
                  @{user.username}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/70 transition cursor-pointer"
                title="Playback & Scrub Settings [Hotkey: ,]"
              >
                <Settings className="w-4 h-4" />
              </button>
              {isAdmin && (
                <button
                  onClick={() => setUserMgmtOpen(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/70 transition cursor-pointer"
                  title="User Management"
                >
                  <Users className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={logout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 w-full max-w-full overflow-hidden">
        {/* Top Search Header */}
        <div className="p-3 sm:p-4 border-b border-slate-800 bg-slate-900/40 flex flex-col gap-2 overflow-hidden w-full max-w-full">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 w-full">
            {/* Hamburger Button for Mobile Drawer */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition shrink-0"
              title="Open Categories & AI Status"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="md:hidden shrink-0">
              <Logo size={26} />
            </div>

            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-2.5 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={`Search ${roundedLibraryApprox}+ sound effects...`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsSearching(true)}
                onBlur={() => setIsSearching(false)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-lg pl-9 sm:pl-11 pr-3 sm:pr-24 py-2 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 truncate"
              />
              <div className="hidden sm:flex absolute right-3 top-2.5 items-center gap-1">
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-700/60 rounded border border-slate-600">/</kbd>
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-700/60 rounded border border-slate-600">Ctrl+K</kbd>
              </div>
            </div>
            <div className="text-[11px] sm:text-xs text-slate-400 whitespace-nowrap shrink-0">
              <span className="font-semibold text-slate-200">
                {query || category ? `${total.toLocaleString()} of ${totalLibraryCount.toLocaleString()}` : totalLibraryCount.toLocaleString()}
              </span>
              <span className="hidden sm:inline"> sounds</span>
            </div>

            {/* Quick Sort Dropdown */}
            <div className="flex items-center shrink-0">
              <select
                value={`${sortBy}:${sortOrder}`}
                onChange={(e) => {
                  const [f, o] = e.target.value.split(':');
                  setSortBy(f);
                  setSortOrder(o as 'asc' | 'desc');
                }}
                className="bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-300 text-[11px] sm:text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
                title="Sort Sound Effects"
              >
                <option value="name:asc">Sort: Name (A-Z)</option>
                <option value="name:desc">Sort: Name (Z-A)</option>
                <option value="duration:asc">Sort: Duration (Shortest)</option>
                <option value="duration:desc">Sort: Duration (Longest)</option>
                <option value="category:asc">Sort: Category (A-Z)</option>
                <option value="sample_rate:desc">Sort: Highest Quality</option>
                {query && <option value="rank:asc">Sort: Relevance</option>}
                <option value="id:desc">Sort: Newest Added</option>
              </select>
            </div>
          </div>

          {/* Active Filter Pills (Project, Collection & Category) */}
          {(activeProjectId !== null || collectionOnly || category) && (
            <div className="flex items-center gap-2 pt-1 min-w-0 overflow-hidden flex-wrap">
              {activeProject && (
                <span className="inline-flex items-center gap-2 bg-amber-950/60 text-amber-200 border border-amber-500/60 text-xs px-3 py-1 rounded-full shrink-0 shadow-sm">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: activeProject.color || '#f59e0b' }}
                  />
                  {editingProjectId === activeProject.id ? (
                    <input
                      type="text"
                      value={editProjectName}
                      autoFocus
                      onChange={(e) => setEditProjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameProject(activeProject.id, editProjectName);
                        if (e.key === 'Escape') setEditingProjectId(null);
                      }}
                      onBlur={() => handleRenameProject(activeProject.id, editProjectName)}
                      className="bg-slate-900 border border-amber-400 rounded px-1.5 py-0.2 text-xs text-white focus:outline-none"
                    />
                  ) : (
                    <span>Project: <strong>{activeProject.name}</strong> ({total})</span>
                  )}

                  {/* Rename project button */}
                  <button
                    onClick={() => {
                      setEditingProjectId(activeProject.id);
                      setEditProjectName(activeProject.name);
                    }}
                    className="text-amber-400 hover:text-white transition p-0.5 cursor-pointer"
                    title="Rename Project"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>

                  {/* Delete project button */}
                  <button
                    onClick={() => handleDeleteProject(activeProject.id, activeProject.name)}
                    className="text-rose-400 hover:text-rose-300 transition p-0.5 cursor-pointer"
                    title="Delete Project Collection"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>

                  <button
                    onClick={() => setActiveProjectId(null)}
                    className="hover:text-white ml-0.5 shrink-0 cursor-pointer"
                    title="Close Project View"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
              {collectionOnly && activeProjectId === null && (
                <span className="inline-flex items-center gap-1.5 bg-amber-950/50 text-amber-300 border border-amber-600/60 text-xs px-2.5 py-1 rounded-full shrink-0">
                  <Bookmark className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                  <span>Viewing: <strong>All Saved Collection</strong> ({total})</span>
                  <button onClick={() => setCollectionOnly(false)} className="hover:text-white ml-0.5 shrink-0" title="Switch to All Sounds">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
              {category && (
                <span className="inline-flex items-center gap-1.5 bg-slate-800 text-slate-300 border border-slate-700 text-xs px-2.5 py-1 rounded-full truncate max-w-full">
                  <Tag className="w-3 h-3 shrink-0" />
                  <span className="truncate">Category: <strong className="font-semibold">{category}</strong></span>
                  <button onClick={() => setCategory('')} className="hover:text-white ml-0.5 shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* SFX Table List */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 w-full">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-xs uppercase sticky top-0 backdrop-blur z-10 border-b border-slate-800 select-none">
              <tr>
                <th className="py-2.5 px-2 sm:px-4 w-12 sm:w-14 shrink-0">Play</th>
                <th className="py-2.5 px-2 sm:px-4 w-auto min-w-0">
                  <button
                    onClick={() => handleSort('name')}
                    className="flex items-center gap-1.5 hover:text-white transition font-semibold group text-left cursor-pointer"
                    title="Click to sort by Name (A-Z / Z-A)"
                  >
                    <span>Sound Effect Name</span>
                    {sortBy === 'name' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition shrink-0" />
                    )}
                  </button>
                </th>
                <th className="py-2.5 px-3 w-28 hidden sm:table-cell shrink-0">
                  <button
                    onClick={() => handleSort('category')}
                    className="flex items-center gap-1.5 hover:text-white transition font-semibold group text-left cursor-pointer"
                    title="Click to sort by Category"
                  >
                    <span>Category</span>
                    {sortBy === 'category' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition shrink-0" />
                    )}
                  </button>
                </th>
                <th className="py-2.5 px-3 w-24 hidden md:table-cell shrink-0">
                  <button
                    onClick={() => handleSort('duration')}
                    className="flex items-center gap-1.5 hover:text-white transition font-semibold group text-left cursor-pointer"
                    title="Click to sort by Duration (Shortest / Longest)"
                  >
                    <span>Duration</span>
                    {sortBy === 'duration' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition shrink-0" />
                    )}
                  </button>
                </th>
                <th className="py-2.5 px-3 w-24 hidden lg:table-cell shrink-0">
                  <button
                    onClick={() => handleSort('sample_rate')}
                    className="flex items-center gap-1.5 hover:text-white transition font-semibold group text-left cursor-pointer"
                    title="Click to sort by Quality / Sample Rate"
                  >
                    <span>Quality</span>
                    {sortBy === 'sample_rate' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition shrink-0" />
                    )}
                  </button>
                </th>
                <th className="py-2.5 px-2 sm:px-4 w-28 sm:w-32 text-right shrink-0">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {results.map((item) => {
                const isSelected = item.id === selectedId;
                const isEditing = editingId === item.id;
                const isListening = listeningId === item.id;

                return (
                  <tr
                    key={item.id}
                    onClick={() => selectTrack(item)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSelectedId(item.id);
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        item,
                      });
                    }}
                    className={`group cursor-pointer transition ${
                      isSelected ? 'bg-indigo-950/40 border-l-2 border-indigo-500' : 'hover:bg-slate-900/50'
                    }`}
                  >
                    <td className="py-2.5 px-2 sm:px-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          selectTrack(item);
                        }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition shrink-0 cursor-pointer ${
                          loadingTrackId === item.id
                            ? 'bg-indigo-950 border border-indigo-500/70 text-indigo-400 shadow-md shadow-indigo-500/20'
                            : isSelected && isPlaying
                            ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                            : 'bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white'
                        }`}
                        title={
                          loadingTrackId === item.id
                            ? 'Buffering audio...'
                            : isSelected && isPlaying
                            ? 'Click to re-trigger from start'
                            : 'Play sound'
                        }
                      >
                        {loadingTrackId === item.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                        ) : isSelected && isPlaying ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4 ml-0.5" />
                        )}
                      </button>
                    </td>
                    <td className="py-2.5 px-2 sm:px-4 font-medium text-slate-200 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValue}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveCustomName(item.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            onBlur={() => saveCustomName(item.id)}
                            className="bg-slate-800 border border-indigo-500 rounded px-2 py-0.5 text-xs sm:text-sm text-white focus:outline-none w-full max-w-sm min-w-0"
                          />
                        ) : (
                          <span
                            className="font-semibold text-slate-100 transition truncate block text-xs sm:text-sm min-w-0 flex-1"
                          >
                            {item.display_name || item.filename}
                          </span>
                        )}

                        {/* Inline Edit Button (Admin Only) */}
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(item.id);
                              setEditValue(item.display_name || item.filename);
                            }}
                            className="opacity-40 group-hover:opacity-100 hover:text-indigo-400 text-slate-400 p-1 rounded hover:bg-slate-800 transition shrink-0"
                            title="Rename sound in app"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* AI Listen Button (Admin Only) */}
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              aiListen(item.id);
                            }}
                            disabled={isListening}
                            className="opacity-40 group-hover:opacity-100 hover:text-fuchsia-400 text-slate-400 p-1 rounded hover:bg-fuchsia-950/40 transition shrink-0"
                            title="AI Listen: Detect sound type from audio waveform"
                          >
                            <Wand2 className={`w-3.5 h-3.5 ${isListening ? 'animate-spin text-fuchsia-400' : ''}`} />
                          </button>
                        )}

                        {/* Collect / Bookmark Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCollect(item);
                          }}
                          className={`p-1 rounded transition shrink-0 cursor-pointer ${
                            collectionIds.has(item.id)
                              ? 'text-amber-400 hover:text-amber-300'
                              : 'opacity-30 group-hover:opacity-100 hover:text-amber-400 text-slate-400'
                          }`}
                          title={collectionIds.has(item.id) ? 'Remove from My Collection [B]' : 'Save to My Collection [B]'}
                        >
                          <Bookmark className={`w-3.5 h-3.5 ${collectionIds.has(item.id) ? 'fill-amber-400 text-amber-400' : ''}`} />
                        </button>

                        {/* Project Organizer Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAssignModalSound(item);
                          }}
                          className={`p-1 rounded transition shrink-0 cursor-pointer ${
                            (projectAssignments[item.id] || []).length > 0
                              ? 'text-orange-400 hover:text-orange-300'
                              : 'opacity-30 group-hover:opacity-100 hover:text-orange-400 text-slate-400'
                          }`}
                          title={`Organize into Projects [P]${
                            (projectAssignments[item.id] || []).length > 0
                              ? ` (in ${(projectAssignments[item.id] || []).length} project${(projectAssignments[item.id] || []).length === 1 ? '' : 's'})`
                              : ''
                          }`}
                        >
                          <FolderPlus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Subtitle: Original filename */}
                      <div className="text-[11px] sm:text-xs text-slate-400 flex items-center gap-1.5 mt-0.5 min-w-0">
                        <span className="font-mono text-slate-500 truncate min-w-0 flex-1">{item.filename}</span>
                        {/* Mobile category badge */}
                        <span className="sm:hidden text-[10px] bg-slate-800 text-slate-400 px-1 py-0.2 rounded shrink-0">
                          {item.sub_category || item.category}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 hidden sm:table-cell overflow-hidden">
                      <span className="inline-block bg-slate-800 text-slate-300 text-xs px-2 py-0.5 rounded truncate max-w-full">
                        {item.sub_category || item.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 hidden md:table-cell truncate">{item.duration ? `${item.duration}s` : '-'}</td>
                    <td className="py-2.5 px-3 text-slate-400 hidden lg:table-cell truncate">{item.sample_rate ? `${item.sample_rate} Hz` : '-'}</td>
                    <td className="py-2.5 px-2 sm:px-4 text-right shrink-0">
                      <div className="flex items-center justify-end gap-1 sm:gap-1.5">
                        {/* Reveal & Select in Explorer (Sky) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyExplorer(item);
                          }}
                          title={`Reveal & Select in Windows Explorer [E]:\nexplorer.exe /select,"${item.smb_path}"\n(Press Win+R -> Ctrl+V -> Enter)`}
                          className="p-1.5 rounded-lg bg-sky-950/40 hover:bg-sky-600/30 text-sky-400 hover:text-sky-200 border border-sky-800/50 hover:border-sky-500/70 transition cursor-pointer shadow-sm"
                        >
                          {revealedId === item.id ? <Check className="w-4 h-4 text-emerald-400" /> : <FolderOpen className="w-4 h-4" />}
                        </button>

                        {/* Copy Raw SMB Path (Emerald) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copySMB(item);
                          }}
                          title={`Copy Raw SMB Path [C]:\n${item.smb_path}`}
                          className="p-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-600/30 text-emerald-400 hover:text-emerald-200 border border-emerald-800/50 hover:border-emerald-500/70 transition cursor-pointer shadow-sm"
                        >
                          {copiedId === item.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>

                        {/* Direct Browser Download (Violet) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadAudio(item, item.id === selectedId ? trimRegion : null);
                          }}
                          title={
                            item.id === selectedId && trimRegion && trimRegion.end > trimRegion.start
                              ? `Download trimmed slice (${(trimRegion.end - trimRegion.start).toFixed(1)}s) [Hotkey: D]:\n${item.filename}`
                              : `Download audio file to browser [Hotkey: D]:\n${item.filename}`
                          }
                          className="p-1.5 rounded-lg bg-violet-950/40 hover:bg-violet-600/30 text-violet-300 hover:text-violet-100 border border-violet-800/50 hover:border-violet-500/70 transition cursor-pointer shadow-sm"
                        >
                          {item.id === selectedId && trimRegion && trimRegion.end > trimRegion.start ? (
                            <Scissors className="w-4 h-4 text-violet-400" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {results.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-slate-500">
                    {activeProject ? (
                      <div className="flex flex-col items-center gap-2">
                        <Folder className="w-8 h-8 text-amber-500/40" />
                        <span className="text-sm font-medium text-slate-300">Project "{activeProject.name}" is currently empty</span>
                        <span className="text-xs text-slate-400">Click the project folder icon or press [P] on any sound effect to add it here.</span>
                        <button
                          onClick={() => setActiveProjectId(null)}
                          className="mt-2 text-xs bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white px-3 py-1.5 rounded-lg border border-indigo-500/40 transition cursor-pointer"
                        >
                          Browse All Sounds
                        </button>
                      </div>
                    ) : collectionOnly ? (
                      <div className="flex flex-col items-center gap-2">
                        <Bookmark className="w-8 h-8 text-amber-500/40" />
                        <span className="text-sm font-medium text-slate-300">My Collection is currently empty</span>
                        <span className="text-xs text-slate-400">Click the bookmark ribbon or press [B] on any sound effect to save it here.</span>
                        <button
                          onClick={() => setCollectionOnly(false)}
                          className="mt-2 text-xs bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white px-3 py-1.5 rounded-lg border border-indigo-500/40 transition cursor-pointer"
                        >
                          Browse All Sounds
                        </button>
                      </div>
                    ) : (
                      'No sound effects found matching your query.'
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Audio Player Bar */}
        <AudioPlayer
          currentItem={currentItem}
          isPlaying={isPlaying}
          isLoading={loadingTrackId === currentItem?.id}
          onPlayPause={() => {
            if (wavesurfer.current) {
              if (wavesurfer.current.isPlaying()) {
                wavesurfer.current.pause();
              } else {
                const trim = trimRegionRef.current;
                const cur = wavesurfer.current.getCurrentTime();
                if (trim && (cur < trim.start || cur >= trim.end)) {
                  wavesurfer.current.seekTo(trim.start / (wavesurfer.current.getDuration() || 1));
                }
                wavesurfer.current.play();
              }
            } else if (currentItem) {
              selectTrack(currentItem);
            }
          }}
          waveformRef={waveformRef}
          currentTime={currentTime}
          duration={duration}
          isLooping={isLooping}
          onToggleLoop={() => setIsLooping((prev) => !prev)}
          volume={volume}
          onVolumeChange={(v) => {
            setVolume(v);
            wavesurfer.current?.setVolume(v);
          }}
          onAiListen={aiListen}
          listeningId={listeningId}
          onCopyExplorer={copyExplorer}
          revealedId={revealedId}
          onCopySMB={copySMB}
          copiedId={copiedId}
          onDownload={downloadAudio}
          trimRegion={trimRegion}
          onClearTrim={handleClearTrim}
          isCollected={currentItem ? collectionIds.has(currentItem.id) : false}
          onToggleCollect={toggleCollect}
          onOpenProjects={(item) => setAssignModalSound(item)}
          assignedProjectsCount={currentItem ? (projectAssignments[currentItem.id] || []).length : 0}
          isAdmin={isAdmin}
        />

        {/* Blender-Style Shortcut & Status Footer */}
        <ShortcutFooter
          hasSelectedSound={currentItem !== null}
          isPlaying={isPlaying}
          hasTrimRegion={trimRegion !== null && trimRegion.end > trimRegion.start}
          isSearching={isSearching}
          isLooping={isLooping}
          isCollected={currentItem ? collectionIds.has(currentItem.id) : false}
          nudgeStep={settings.nudgeStep}
          fastJumpStep={settings.fastJumpStep}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {/* Playback & Scrub Settings Modal */}
        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onSave={handleSaveSettings}
        />

        {/* Project Assignment Modal */}
        <ProjectAssignModal
          sound={assignModalSound}
          isOpen={assignModalSound !== null}
          onClose={() => setAssignModalSound(null)}
          projects={projects}
          assignedProjectIds={assignModalSound ? (projectAssignments[assignModalSound.id] || []) : []}
          onToggleAssign={handleToggleAssign}
          onCreateProject={handleCreateProject}
        />

        {/* Confirmation Modal */}
        {confirmDialog && (
          <ConfirmModal
            isOpen={confirmDialog.isOpen}
            title={confirmDialog.title}
            message={confirmDialog.message}
            confirmText={confirmDialog.confirmText}
            cancelText={confirmDialog.cancelText}
            severity={confirmDialog.severity}
            onConfirm={confirmDialog.onConfirm}
            onCancel={() => setConfirmDialog(null)}
          />
        )}

        {/* Right-Click Context Menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            item={contextMenu.item}
            isAdmin={isAdmin}
            isSelected={selectedId === contextMenu.item.id}
            isPlaying={isPlaying && selectedId === contextMenu.item.id}
            isLoading={loadingTrackId === contextMenu.item.id}
            isCollected={collectionIds.has(contextMenu.item.id)}
            assignedProjectsCount={(projectAssignments[contextMenu.item.id] || []).length}
            onClose={() => setContextMenu(null)}
            onPlayPause={(item) => selectTrack(item)}
            onToggleCollect={toggleCollect}
            onOpenProjects={(item) => setAssignModalSound(item)}
            onDownload={(item) => downloadAudio(item, item.id === selectedId ? trimRegion : null)}
            onCopyExplorer={copyExplorer}
            onCopySMB={copySMB}
            onAiListen={(item) => aiListen(item.id)}
            onRename={(item) => {
              setEditingId(item.id);
              setEditValue(item.display_name || item.filename);
            }}
          />
        )}

        {/* User Management Modal (Admin Only) */}
        {isAdmin && (
          <UserManagementModal
            isOpen={userMgmtOpen}
            onClose={() => setUserMgmtOpen(false)}
            onToast={addToast}
          />
        )}

        {/* Unified In-App Toast Notifications */}
        <div className="fixed bottom-28 inset-x-3 sm:inset-x-auto sm:right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto bg-slate-900/95 border border-slate-700/80 shadow-2xl rounded-xl p-3 sm:p-3.5 flex items-start gap-3 text-slate-100 text-xs backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150 overflow-hidden"
            >
              {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
              {t.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
              {t.type === 'info' && <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />}
              {t.type === 'clipboard' && <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}

              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="font-semibold text-white truncate">{t.title}</div>
                {t.body && <div className="text-slate-300 text-[11px] mt-0.5 whitespace-pre-line">{t.body}</div>}
                {t.code && (
                  <div className="bg-slate-950 px-2.5 py-1 rounded border border-slate-800 font-mono text-[10px] text-indigo-300 truncate select-all my-1.5">
                    {t.code}
                  </div>
                )}
                {t.type === 'clipboard' && (
                  <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <span>1-click reveal setup:</span>
                    <a
                      href="/mattlab-reveal-setup.reg"
                      download
                      className="text-indigo-400 hover:text-indigo-300 underline font-medium"
                    >
                      .reg file
                    </a>
                  </div>
                )}
              </div>

              <button
                onClick={() => removeToast(t.id)}
                className="text-slate-500 hover:text-slate-300 p-0.5 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
