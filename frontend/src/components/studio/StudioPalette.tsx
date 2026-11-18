import React, { useState, useEffect, useRef } from 'react';
import { Search, Play, Pause, Zap, Volume2, Sparkles, Filter, Loader2, X } from 'lucide-react';

export interface SoundItem {
  id: number;
  filename: string;
  display_name: string;
  category: string;
  duration: number;
  ai_tags?: string;
}

interface StudioPaletteProps {
  onSpotSound: (sound: SoundItem) => void;
  selectedTrackTag: string;
}

export const StudioPalette: React.FC<StudioPaletteProps> = React.memo(({
  onSpotSound,
  selectedTrackTag,
}) => {
  const [query, setQuery] = useState('');
  const [selectedCat, setSelectedCat] = useState('');
  const [results, setResults] = useState<SoundItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [selectedSoundId, setSelectedSoundId] = useState<number | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const categories = [
    { label: 'All', value: '' },
    { label: 'Impacts', value: 'HIT' },
    { label: 'Whoosh', value: 'WSH' },
    { label: 'Foley', value: 'FOY' },
    { label: 'Ambience', value: 'AMB' },
    { label: 'Sci-Fi', value: 'SCI' },
    { label: 'Weapons', value: 'WPN' },
    { label: 'UI', value: 'UI' },
  ];

  // Debounced search
  useEffect(() => {
    let isCancelled = false;
    const fetchSounds = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          q: query,
          category: selectedCat,
          limit: '50',
          sort_by: query ? 'default' : 'name',
          sort_order: 'asc',
        });
        const res = await fetch(`/api/search?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to search');
        const data = await res.json();
        if (!isCancelled) {
          const list: SoundItem[] = data.results || [];
          setResults(list);
          if (list.length > 0 && (selectedSoundId === null || !list.some(s => s.id === selectedSoundId))) {
            setSelectedSoundId(list[0].id);
          }
        }
      } catch (e) {
        console.error('Studio palette search error:', e);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    const timer = setTimeout(fetchSounds, 180);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [query, selectedCat]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Hotkey listener for Spotting [S]
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.key === 's' || e.key === 'S') {
        const activeSound = results.find((r) => r.id === selectedSoundId) || results[0];
        if (activeSound) {
          e.preventDefault();
          onSpotSound(activeSound);
        }
      } else if (e.key === 'ArrowDown' && results.length > 0) {
        e.preventDefault();
        const currIdx = results.findIndex((r) => r.id === selectedSoundId);
        const nextIdx = Math.min(results.length - 1, currIdx + 1);
        setSelectedSoundId(results[nextIdx].id);
      } else if (e.key === 'ArrowUp' && results.length > 0) {
        e.preventDefault();
        const currIdx = results.findIndex((r) => r.id === selectedSoundId);
        const prevIdx = Math.max(0, currIdx - 1);
        setSelectedSoundId(results[prevIdx].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, selectedSoundId, onSpotSound]);

  const handlePlayToggle = (sound: SoundItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSoundId(sound.id);

    if (playingId === sound.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(`/api/stream/${sound.id}`);
    audio.volume = 0.8;
    audio.play();
    audio.onended = () => setPlayingId(null);
    audioRef.current = audio;
    setPlayingId(sound.id);
  };

  const handleSpot = (sound: SoundItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onSpotSound(sound);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/90 border-l border-slate-800">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 bg-slate-950/40 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Sound Palette</h4>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {results.length} sounds
          </span>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search 32,500+ sound effects..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()} // Prevent shortcut collisions while typing
            className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
          {query ? (
            <button
              onClick={() => {
                setQuery('');
                searchInputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          ) : isLoading ? (
            <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2" />
          ) : null}
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pt-2 pb-0.5 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCat(cat.value)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition shrink-0 cursor-pointer ${
                selectedCat === cat.value
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sound List */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
        {results.length === 0 && !isLoading ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            No sound effects found. Try another query or category.
          </div>
        ) : (
          results.map((sound) => {
            const isPlaying = playingId === sound.id;
            const isSelected = selectedSoundId === sound.id;

            return (
              <div
                key={sound.id}
                onClick={() => setSelectedSoundId(sound.id)}
                className={`flex items-center justify-between p-2 rounded-xl border transition cursor-pointer group ${
                  isSelected
                    ? 'bg-slate-800/90 border-indigo-500/60 shadow-sm ring-1 ring-indigo-500/30'
                    : 'bg-slate-950/40 border-slate-800/60 hover:bg-slate-850 hover:border-slate-700'
                }`}
              >
                {/* Left: Play button + Info */}
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <button
                    onClick={(e) => handlePlayToggle(sound, e)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition cursor-pointer ${
                      isPlaying
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/60'
                    }`}
                    title={isPlaying ? 'Pause' : 'Audition sound'}
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                  </button>

                  <div className="min-w-0">
                    <p
                      className="text-xs font-medium text-slate-200 truncate group-hover:text-white leading-tight"
                      title={sound.display_name || sound.filename}
                    >
                      {sound.display_name || sound.filename}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-slate-500 font-mono">
                        {sound.duration ? `${sound.duration.toFixed(1)}s` : '0.0s'}
                      </span>
                      {sound.category && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/50 font-mono">
                          {sound.category}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Spot to Video Button */}
                <button
                  onClick={(e) => handleSpot(sound, e)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/15 text-amber-300 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/30 transition shrink-0 cursor-pointer shadow-sm"
                  title={`Spot sound to active track [${selectedTrackTag}] at video playhead (Hotkey: S)`}
                >
                  <Zap className="w-3 h-3" />
                  <span>Spot</span>
                  <kbd className="text-[9px] font-mono px-1 py-0.2 rounded bg-black/30 border border-amber-500/40">
                    S
                  </kbd>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});
