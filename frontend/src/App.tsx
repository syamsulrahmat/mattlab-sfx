import React, { useState, useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause, Search, Folder, Volume2, Copy, Check, RefreshCw, Zap, Tag, X, Edit2, Wand2 } from 'lucide-react';

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
  const [scanning, setScanning] = useState(false);
  const [categories, setCategories] = useState<{ category: string; sub_category: string; count: number }[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [listeningId, setListeningId] = useState<number | null>(null);

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
        height: 60,
      });

      wavesurfer.current.on('play', () => setIsPlaying(true));
      wavesurfer.current.on('pause', () => setIsPlaying(false));
      wavesurfer.current.on('finish', () => setIsPlaying(false));
    }

    return () => {
      wavesurfer.current?.destroy();
      wavesurfer.current = null;
    };
  }, []);

  // Fetch search results
  const fetchResults = async (q: string, cat: string) => {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}&limit=100`);
      const data = await res.json();
      setResults(data.results || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch categories
  const fetchCategories = async () => {
    try {
      const catRes = await fetch('/api/categories');
      setCategories(await catRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchResults(query, category);
  }, [query, category]);

  useEffect(() => {
    fetchCategories();
  }, []);

  // Load and play selected track
  const selectTrack = async (item: AudioItem) => {
    setSelectedId(item.id);
    if (!wavesurfer.current) return;

    try {
      const peakRes = await fetch(`/api/peaks/${item.id}`);
      const peaks = await peakRes.json();
      const audioUrl = `/api/stream/${item.id}`;

      wavesurfer.current.load(audioUrl, [peaks]);
      wavesurfer.current.once('ready', () => {
        wavesurfer.current?.play();
      });
    } catch (e) {
      console.error('Error loading audio:', e);
    }
  };

  // Keyboard navigation, playback controls & search shortcut
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, selectedId, editingId]);

  const copySMB = (item: AudioItem) => {
    navigator.clipboard.writeText(item.smb_path);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
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

  const triggerScan = async () => {
    setScanning(true);
    await fetch('/api/scan', { method: 'POST' });
    setTimeout(() => {
      fetchResults(query, category);
      fetchCategories();
      setScanning(false);
    }, 2000);
  };

  const currentItem = results.find((r) => r.id === selectedId);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Sidebar: Categories */}
      <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col p-4">
        <div className="flex items-center gap-2 mb-4 px-2">
          <Zap className="w-6 h-6 text-indigo-400" />
          <h1 className="text-xl font-bold tracking-tight text-white">MattLab SFX</h1>
        </div>

        <button
          onClick={triggerScan}
          disabled={scanning}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2 px-3 text-sm font-medium transition mb-5 shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning...' : 'Rescan Library'}
        </button>

        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 px-2 flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5" />
          Categories
        </h2>

        {/* Categories List */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          <button
            onClick={() => setCategory('')}
            className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition ${
              category === '' ? 'bg-indigo-600/20 text-indigo-300 font-medium' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            All Sounds ({total})
          </button>
          {categories.map((c) => (
            <button
              key={c.category}
              onClick={() => setCategory(category === c.category ? '' : c.category)}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-sm transition ${
                category === c.category ? 'bg-indigo-600/20 text-indigo-300 font-medium' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <span>{c.sub_category || c.category}</span>
              <span className="text-xs text-slate-500">{c.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Search Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex flex-col gap-2">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-2.5 w-5 h-5 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search 33,000+ sound effects (e.g. explosion, whoosh, zipper, electric)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-lg pl-11 pr-24 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
              <div className="absolute right-3 top-2.5 flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-700/60 rounded border border-slate-600">/</kbd>
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-700/60 rounded border border-slate-600">Ctrl+K</kbd>
              </div>
            </div>
            <div className="text-xs text-slate-400 whitespace-nowrap">
              <span className="font-semibold text-slate-200">{total}</span> sounds
            </div>
          </div>

          {/* Active Category Pill */}
          {category && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-slate-500">Filtered by:</span>
              <span className="inline-flex items-center gap-1.5 bg-slate-800 text-slate-300 border border-slate-700 text-xs px-2.5 py-1 rounded-full">
                <Tag className="w-3 h-3" />
                Category: <strong className="font-semibold">{category}</strong>
                <button onClick={() => setCategory('')} className="hover:text-white ml-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            </div>
          )}
        </div>

        {/* SFX Table List */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase sticky top-0 backdrop-blur z-10 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4 w-12">Play</th>
                <th className="py-2.5 px-4">Sound Effect Name</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">Duration</th>
                <th className="py-2.5 px-4">Sample Rate</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
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
                    <td className="py-2.5 px-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSelected) {
                            wavesurfer.current?.playPause();
                          } else {
                            selectTrack(item);
                          }
                        }}
                        className="w-8 h-8 rounded-full bg-slate-800 hover:bg-indigo-600 flex items-center justify-center text-slate-300 hover:text-white transition"
                      >
                        {isSelected && isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                      </button>
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-200">
                      <div className="flex items-center gap-2">
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
                            className="bg-slate-800 border border-indigo-500 rounded px-2 py-0.5 text-sm text-white focus:outline-none"
                          />
                        ) : (
                          <span
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingId(item.id);
                              setEditValue(item.display_name || item.filename);
                            }}
                            className="font-semibold text-slate-100 hover:text-indigo-300 transition"
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
                          className="opacity-40 group-hover:opacity-100 hover:text-indigo-400 text-slate-400 p-1 rounded hover:bg-slate-800 transition"
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
                          className="opacity-40 group-hover:opacity-100 hover:text-amber-400 text-slate-400 p-1 rounded hover:bg-slate-800 transition"
                          title="AI Listen: Detect sound type from audio waveform"
                        >
                          <Wand2 className={`w-3.5 h-3.5 ${isListening ? 'animate-spin text-amber-400' : ''}`} />
                        </button>
                      </div>

                      {/* Subtitle: Original filename */}
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-slate-500">{item.filename}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="inline-block bg-slate-800 text-slate-300 text-xs px-2 py-0.5 rounded">
                        {item.sub_category || item.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">{item.duration ? `${item.duration}s` : '-'}</td>
                    <td className="py-2.5 px-4 text-slate-400">{item.sample_rate ? `${item.sample_rate} Hz` : '-'}</td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copySMB(item);
                        }}
                        title="Copy Windows SMB Path for DAW/Video Editor"
                        className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                      >
                        {copiedId === item.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bottom Audio Player Bar */}
        <div className="h-28 border-t border-slate-800 bg-slate-900/90 backdrop-blur p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => wavesurfer.current?.playPause()}
                disabled={!selectedId}
                className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white flex items-center justify-center transition"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
              <div>
                <div className="text-sm font-semibold text-white">
                  {currentItem ? (currentItem.display_name || currentItem.filename) : 'Select a sound effect to preview'}
                </div>
                <div className="text-xs text-slate-400">
                  {currentItem ? `${currentItem.filename} • [Space] to Play/Pause, [Arrows] to Navigate` : 'Shortcut keys enabled'}
                </div>
              </div>
            </div>

            {currentItem && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => aiListen(currentItem.id)}
                  disabled={listeningId === currentItem.id}
                  className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-amber-300 px-3 py-1.5 rounded-lg border border-slate-700 transition"
                  title="Detect sound type with AI"
                >
                  <Wand2 className={`w-3.5 h-3.5 ${listeningId === currentItem.id ? 'animate-spin' : ''}`} />
                  AI Listen
                </button>
                <button
                  onClick={() => copySMB(currentItem)}
                  className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-indigo-300 px-3 py-1.5 rounded-lg border border-slate-700 transition"
                >
                  {copiedId === currentItem.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy SMB Path
                </button>
              </div>
            )}
          </div>

          <div ref={waveformRef} className="w-full" />
        </div>
      </div>
    </div>
  );
}
