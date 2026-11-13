import React, { useState, useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause, Search, Volume2, Copy, Check, RefreshCw, Tag, X, Edit2, Wand2, Brain, Square, FolderOpen, Menu, ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { Logo } from './components/Logo';
import { AudioPlayer } from './components/AudioPlayer';

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
  const [toastMessage, setToastMessage] = useState<{ title: string; body: string; code: string } | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const isLoopingRef = useRef(false);
  isLoopingRef.current = isLooping;

  const [aiStatus, setAiStatus] = useState<{ is_running: boolean; total: number; processed: number; last_result: string }>({
    is_running: false,
    total: 0,
    processed: 0,
    last_result: ''
  });

  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Initialize WaveSurfer
  useEffect(() => {
    if (waveformRef.current && !wavesurfer.current) {
      wavesurfer.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#4f46e5',
        progressColor: '#818cf8',
        cursorColor: '#c7d2fe',
        barWidth: 2,
        barRadius: 2,
        barGap: 1,
        height: 44,
      });

      wavesurfer.current.on('play', () => setIsPlaying(true));
      wavesurfer.current.on('pause', () => setIsPlaying(false));
      wavesurfer.current.on('finish', () => {
        if (isLoopingRef.current) {
          wavesurfer.current?.play();
        } else {
          setIsPlaying(false);
        }
      });
      wavesurfer.current.on('timeupdate', (t) => setCurrentTime(t));
      wavesurfer.current.on('ready', () => {
        setDuration(wavesurfer.current?.getDuration() || 0);
      });
    }

    return () => {
      wavesurfer.current?.destroy();
      wavesurfer.current = null;
    };
  }, []);

  // Fetch search results
  const fetchResults = async (q: string, cat: string, sBy: string = sortBy, sOrder: string = sortOrder) => {
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}&sort_by=${encodeURIComponent(sBy)}&sort_order=${encodeURIComponent(sOrder)}&limit=100`
      );
      const data = await res.json();
      setResults(data.results || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
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
        fetchResults(query, category, sortBy, sortOrder);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchResults(query, category, sortBy, sortOrder);
  }, [query, category, sortBy, sortOrder]);

  useEffect(() => {
    fetchAuxData();
    const interval = setInterval(fetchAuxData, 3000);
    return () => clearInterval(interval);
  }, [query, category]);

  // Load and play selected track
  const selectTrack = async (item: AudioItem) => {
    setSelectedId(item.id);
    if (!wavesurfer.current) return;

    try {
      const peakRes = await fetch(`/api/peaks/${item.id}`);
      const peaks = await peakRes.json();
      const audioUrl = `/api/stream/${item.id}`;

      wavesurfer.current.load(audioUrl, [peaks]);
      setCurrentTime(0);
      setDuration(item.duration || 0);
      wavesurfer.current.once('ready', () => {
        setDuration(wavesurfer.current?.getDuration() || item.duration || 0);
        wavesurfer.current?.play();
      });
    } catch (e) {
      console.error('Error loading audio:', e);
    }
  };

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = document.activeElement === searchInputRef.current || editingId !== null;

      if (!isInput && (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'))) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (isInput) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (editingId !== null) {
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

      if (e.code === 'Space') {
        e.preventDefault();
        wavesurfer.current?.playPause();
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
      } else if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey) {
        const item = results.find((r) => r.id === selectedId);
        if (item) {
          e.preventDefault();
          downloadAudio(item);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, selectedId, editingId]);

  const downloadAudio = (item: AudioItem) => {
    const link = document.createElement('a');
    link.href = `/api/download/${item.id}`;
    link.download = item.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
      setToastMessage({
        title: "Copied Explorer Command! [Hotkeys: E]",
        body: "Press Win + R and paste (Ctrl+V) to reveal & select file in Explorer.",
        code: cmd
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
      setTimeout(() => setToastMessage(null), 6000);
    }
  };

  const copySMB = async (item: AudioItem) => {
    const success = await copyToClipboard(item.smb_path);
    if (success) {
      setCopiedId(item.id);
      setToastMessage({
        title: "Copied Raw SMB Path!",
        body: "Windows network path ready for your DAW, NLE, or file picker.",
        code: item.smb_path
      });
      setTimeout(() => setCopiedId(null), 2000);
      setTimeout(() => setToastMessage(null), 4500);
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
      }
    } catch (e) {
      console.error(e);
    } finally {
      setListeningId(null);
    }
  };

  const toggleBatchAi = async () => {
    if (aiStatus.is_running) {
      await fetch('/api/ai/stop', { method: 'POST' });
    } else {
      await fetch('/api/ai/start', { method: 'POST' });
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

  // Dynamic total library count & rounded representation
  const totalLibraryCount = categories.reduce((acc, c) => acc + c.count, 0) || aiStatus.total || total;
  const roundedLibraryApprox = totalLibraryCount > 0 
    ? (Math.round(totalLibraryCount / 1000) * 1000).toLocaleString() 
    : '30,000';

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

        <button
          onClick={triggerScan}
          disabled={scanning}
          className="flex items-center justify-center gap-2 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-lg py-2 px-3 text-sm font-medium transition mb-4 shadow-sm shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning...' : 'Rescan Library'}
        </button>

        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 px-2 flex items-center gap-1.5 shrink-0">
          <Tag className="w-3.5 h-3.5" />
          Categories
        </h2>

        {/* Categories List (Scrollable Area) */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1">
          <button
            onClick={() => {
              setCategory('');
              setSidebarOpen(false);
            }}
            className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition ${
              category === '' ? 'bg-indigo-600/20 text-indigo-300 font-medium' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            All Sounds ({total})
          </button>
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

        {/* Bottom-Left Corner: AI Background Progress & Status */}
        <div className="mt-3 pt-3 border-t border-slate-800 shrink-0">
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5" />
                AI Acoustic Renaming
              </span>
              <button
                onClick={toggleBatchAi}
                className={`p-1 rounded text-xs transition ${
                  aiStatus.is_running
                    ? 'bg-rose-600/80 hover:bg-rose-500 text-white'
                    : 'bg-amber-600/80 hover:bg-amber-500 text-white'
                }`}
                title={aiStatus.is_running ? 'Pause batch acoustic renaming' : 'Start unified acoustic renaming for whole library'}
              >
                {aiStatus.is_running ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
              </button>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center justify-between">
              <span>{aiStatus.is_running ? 'Processing' : 'Unified library:'}</span>
              <span className="font-mono text-slate-300">
                {(aiStatus.processed || 0).toLocaleString()} / {(aiStatus.total || 0).toLocaleString()}
              </span>
            </div>
            {aiStatus.is_running && (
              <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1.5">
                <div
                  className="bg-gradient-to-r from-amber-400 to-amber-500 h-full transition-all duration-300"
                  style={{
                    width: `${aiStatus.total ? (aiStatus.processed / aiStatus.total) * 100 : 0}%`
                  }}
                />
              </div>
            )}
            <div className="text-[10px] text-slate-400 flex items-center justify-between mt-1">
              <span>Remaining:</span>
              <span className="font-mono text-amber-300/90 font-medium">
                {(aiStatus.remaining ?? (aiStatus.total ? aiStatus.total - (aiStatus.processed || 0) : 0)).toLocaleString()} files
              </span>
            </div>
            {aiStatus.last_result && (
              <div className="text-[10px] text-amber-400/80 truncate mt-1 pt-1 border-t border-slate-700/50" title={aiStatus.current_file || ''}>
                Latest: {aiStatus.last_result}
              </div>
            )}
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

          {/* Active Category Pill */}
          {category && (
            <div className="flex items-center gap-2 pt-1 min-w-0 overflow-hidden">
              <span className="text-xs text-slate-500 shrink-0">Filtered by:</span>
              <span className="inline-flex items-center gap-1.5 bg-slate-800 text-slate-300 border border-slate-700 text-xs px-2.5 py-1 rounded-full truncate max-w-full">
                <Tag className="w-3 h-3 shrink-0" />
                <span className="truncate">Category: <strong className="font-semibold">{category}</strong></span>
                <button onClick={() => setCategory('')} className="hover:text-white ml-0.5 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
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
                    className={`group cursor-pointer transition ${
                      isSelected ? 'bg-indigo-950/40 border-l-2 border-indigo-500' : 'hover:bg-slate-900/50'
                    }`}
                  >
                    <td className="py-2.5 px-2 sm:px-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSelected) {
                            wavesurfer.current?.playPause();
                          } else {
                            selectTrack(item);
                          }
                        }}
                        className="w-8 h-8 rounded-full bg-slate-800 hover:bg-indigo-600 flex items-center justify-center text-slate-300 hover:text-white transition shrink-0"
                      >
                        {isSelected && isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
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
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingId(item.id);
                              setEditValue(item.display_name || item.filename);
                            }}
                            className="font-semibold text-slate-100 hover:text-indigo-300 transition truncate block text-xs sm:text-sm min-w-0 flex-1"
                            title="Double-click to rename"
                          >
                            {item.display_name || item.filename}
                          </span>
                        )}

                        {/* Inline Edit Button */}
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

                        {/* AI Listen Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            aiListen(item.id);
                          }}
                          disabled={isListening}
                          className="opacity-40 group-hover:opacity-100 hover:text-amber-400 text-slate-400 p-1 rounded hover:bg-slate-800 transition shrink-0"
                          title="AI Listen: Detect sound type from audio waveform"
                        >
                          <Wand2 className={`w-3.5 h-3.5 ${isListening ? 'animate-spin text-amber-400' : ''}`} />
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
                        {/* Reveal & Select in Explorer (Win+R command / E hotkey) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyExplorer(item);
                          }}
                          title={`Reveal & Select in Windows Explorer [E]:\nexplorer.exe /select,"${item.smb_path}"\n(Press Win+R -> Ctrl+V -> Enter)`}
                          className="p-1.5 rounded bg-indigo-900/30 hover:bg-indigo-600/50 text-indigo-300 hover:text-white transition"
                        >
                          {revealedId === item.id ? <Check className="w-4 h-4 text-emerald-400" /> : <FolderOpen className="w-4 h-4" />}
                        </button>

                        {/* Copy Raw SMB Path */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copySMB(item);
                          }}
                          title={`Copy Raw SMB Path [C]:\n${item.smb_path}`}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                        >
                          {copiedId === item.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>

                        {/* Direct Browser Download */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadAudio(item);
                          }}
                          title={`Download audio file to browser [Hotkey: D]:\n${item.filename}`}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white transition cursor-pointer"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bottom Audio Player Bar */}
        <AudioPlayer
          currentItem={currentItem}
          isPlaying={isPlaying}
          onPlayPause={() => wavesurfer.current?.playPause()}
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
        />

        {/* Toast Notification for Clipboard */}
        {toastMessage && (
          <div className="fixed bottom-28 inset-x-3 sm:inset-x-auto sm:right-6 z-50 bg-slate-900/95 border border-indigo-500/60 shadow-2xl rounded-xl p-3 sm:p-4 flex items-start gap-3 text-slate-100 text-xs sm:max-w-lg backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-200 overflow-hidden">
            <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="font-semibold text-white mb-0.5 truncate">{toastMessage.title}</div>
              <div className="text-slate-300 text-[11px] mb-1.5">{toastMessage.body}</div>
              <div className="bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 font-mono text-[11px] text-indigo-300 truncate select-all mb-1.5">
                {toastMessage.code}
              </div>
              <div className="text-[10px] text-slate-400 flex items-center gap-1.5 truncate">
                <span>Want 1-click reveal?</span>
                <a
                  href="/mattlab-reveal-setup.reg"
                  download
                  className="text-indigo-400 hover:text-indigo-300 underline font-medium shrink-0"
                >
                  Download .reg setup
                </a>
              </div>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-slate-500 hover:text-slate-300 ml-1 p-0.5 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
