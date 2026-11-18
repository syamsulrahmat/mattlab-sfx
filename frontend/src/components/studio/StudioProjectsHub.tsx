import React, { useState, useEffect, useCallback } from 'react';
import {
  Film,
  Plus,
  Search,
  Clock,
  Music,
  Trash2,
  Copy,
  Edit2,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Sparkles,
  Layers,
  ChevronRight,
  Loader2,
  Check,
  X
} from 'lucide-react';
import { StudioProject, StudioProjectSummary, DEFAULT_TRACKS } from './types';

interface StudioProjectsHubProps {
  onOpenProject: (project: StudioProject) => void;
  onNewBlankProject: () => void;
  onBackToLibrary: () => void;
}

export const StudioProjectsHub: React.FC<StudioProjectsHubProps> = ({
  onOpenProject,
  onNewBlankProject,
  onBackToLibrary,
}) => {
  const [projects, setProjects] = useState<StudioProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals & Inline edits
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/studio/projects');
      if (!res.ok) throw new Error('Failed to load studio projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (e: any) {
      setError(e.message || 'Error loading projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const title = newTitle.trim() || 'Untitled Studio Project';
    try {
      setIsCreating(true);
      const res = await fetch('/api/studio/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          tracks: DEFAULT_TRACKS,
          clips: [],
        }),
      });
      if (!res.ok) throw new Error('Failed to create project');
      const data = await res.json();
      setNewModalOpen(false);
      setNewTitle('');
      onOpenProject(data.project);
    } catch (err: any) {
      alert(err.message || 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpen = async (id: string) => {
    try {
      setOpeningId(id);
      const res = await fetch(`/api/studio/projects/${id}`);
      if (!res.ok) throw new Error('Failed to open project');
      const data = await res.json();
      onOpenProject(data.project);
    } catch (err: any) {
      alert(err.message || 'Failed to load project details');
      setOpeningId(null);
    }
  };

  const handleDuplicate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setDuplicatingId(id);
      const res = await fetch(`/api/studio/projects/${id}/duplicate`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to duplicate project');
      await fetchProjects();
    } catch (err: any) {
      alert(err.message || 'Error duplicating project');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleSaveRename = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    try {
      const res = await fetch(`/api/studio/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) throw new Error('Failed to rename project');
      setEditingId(null);
      fetchProjects();
    } catch (err: any) {
      alert(err.message || 'Error renaming project');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setIsDeleting(true);
      const res = await fetch(`/api/studio/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete project');
      setDeletingId(null);
      fetchProjects();
    } catch (err: any) {
      alert(err.message || 'Error deleting project');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredProjects = projects.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      (p.video_filename && p.video_filename.toLowerCase().includes(q))
    );
  });

  const formatRelativeTime = (timestamp: string) => {
    if (!timestamp) return 'Just now';
    try {
      const d = new Date(timestamp + 'Z');
      const diffSecs = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diffSecs < 60) return 'Just now';
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString();
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden select-none">
      {/* Top Navigation Bar */}
      <div className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 sm:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToLibrary}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Return to Main Sound Library"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Library</span>
          </button>

          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md">
              <Film className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                <span>Studio Projects Hub</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-400 border border-indigo-800/60 font-normal">
                  {projects.length} Saved
                </span>
              </h1>
            </div>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Search filter */}
          <div className="relative hidden md:block">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 lg:w-64 bg-slate-950/80 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <button
            onClick={() => setNewModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-md hover:shadow-indigo-500/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Welcome Banner / Hero */}
          <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-slate-900 border border-indigo-900/40 rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="relative z-10 space-y-1">
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Multi-Track Sound Design Canvas</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Your Studio Projects
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-xl">
                Save, organize, and resume your multi-track timeline sessions with synchronized video guides, custom layers, and trimmed audio waveforms.
              </p>
            </div>

            <div className="relative z-10 flex items-center gap-2 shrink-0">
              <button
                onClick={() => setNewModalOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Project</span>
              </button>
            </div>

            {/* Decorative background glow */}
            <div className="absolute right-0 top-0 bottom-0 w-80 bg-gradient-to-l from-indigo-600/10 to-transparent pointer-events-none" />
          </div>

          {/* Loading State */}
          {loading && (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-xs font-medium">Loading your studio projects...</p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && filteredProjects.length === 0 && (
            <div className="py-16 text-center space-y-4 border border-dashed border-slate-800 rounded-2xl bg-slate-900/30 p-8">
              <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700 mx-auto flex items-center justify-center text-slate-400">
                <FolderOpen className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-200">
                  {searchQuery ? 'No matching projects found' : 'No Studio Projects Yet'}
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {searchQuery
                    ? `No projects matching "${searchQuery}". Try a different keyword.`
                    : 'Start a fresh multi-track sound design project to spot sound effects, trim clips, and score to video.'}
                </p>
              </div>
              <div>
                <button
                  onClick={() => setNewModalOpen(true)}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs inline-flex items-center gap-1.5 shadow-md transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Project</span>
                </button>
              </div>
            </div>
          )}

          {/* Projects Grid */}
          {!loading && !error && filteredProjects.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {filteredProjects.map((p) => {
                const isOpening = openingId === p.id;
                const isDuplicating = duplicatingId === p.id;
                const isEditing = editingId === p.id;

                return (
                  <div
                    key={p.id}
                    onClick={() => handleOpen(p.id)}
                    className="group bg-slate-900/70 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/60 rounded-xl p-4 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-indigo-500/10 cursor-pointer relative overflow-hidden"
                  >
                    {/* Header: Title and Quick Actions */}
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        {isEditing ? (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1.5 flex-1"
                          >
                            <input
                              type="text"
                              value={editTitle}
                              autoFocus
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRename(p.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="bg-slate-950 border border-indigo-500 rounded px-2 py-1 text-xs text-white w-full focus:outline-none"
                            />
                            <button
                              onClick={(e) => handleSaveRename(p.id, e)}
                              className="p-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingId(null);
                              }}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <h3
                              className="font-bold text-sm text-slate-200 group-hover:text-white truncate"
                              title={p.title}
                            >
                              {p.title}
                            </h3>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingId(p.id);
                                setEditTitle(p.title);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-slate-200 transition rounded hover:bg-slate-800 shrink-0"
                              title="Rename Project"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 shrink-0"
                        >
                          <button
                            onClick={(e) => handleDuplicate(p.id, e)}
                            disabled={isDuplicating}
                            className="p-1 text-slate-500 hover:text-indigo-400 transition rounded hover:bg-slate-800"
                            title="Duplicate Project"
                          >
                            {isDuplicating ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingId(p.id);
                            }}
                            className="p-1 text-slate-500 hover:text-rose-400 transition rounded hover:bg-slate-800"
                            title="Delete Project"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Video Guide Badge or Audio-Only */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {p.video_filename ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/40 border border-amber-500/30 text-amber-300 text-[10px] font-medium max-w-[200px] truncate"
                            title={`Video Guide: ${p.video_filename}`}
                          >
                            <Film className="w-3 h-3 text-amber-400 shrink-0" />
                            <span className="truncate">{p.video_filename}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/60 border border-slate-700/50 text-slate-400 text-[10px] font-medium">
                            <Music className="w-3 h-3 text-slate-400" />
                            <span>Audio Timeline</span>
                          </span>
                        )}

                        {p.video_duration > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{p.video_duration.toFixed(1)}s</span>
                          </span>
                        )}
                      </div>

                      {/* Stats: Tracks & Clips */}
                      <div className="flex items-center gap-3 text-xs text-slate-400 pt-1">
                        <span className="flex items-center gap-1 text-[11px]">
                          <Layers className="w-3 h-3 text-indigo-400" />
                          <span>4 Tracks</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-[11px]">
                          <Music className="w-3 h-3 text-emerald-400" />
                          <span>{p.clip_count} {p.clip_count === 1 ? 'Clip' : 'Clips'}</span>
                        </span>
                      </div>
                    </div>

                    {/* Card Footer: Timestamp & Action */}
                    <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-500">
                        {formatRelativeTime(p.updated_at)}
                      </span>

                      <div className="flex items-center gap-1 text-xs font-semibold text-indigo-400 group-hover:text-indigo-300 transition">
                        {isOpening ? (
                          <span className="flex items-center gap-1 text-[11px]">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Opening...</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 text-[11px]">
                            <span>Open Project</span>
                            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* New Project Modal */}
      {newModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                  <Film className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Create New Studio Project</h3>
                  <p className="text-xs text-slate-400">Start a fresh multi-track sound design canvas</p>
                </div>
              </div>
              <button
                onClick={() => setNewModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Project Title</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. Cinematic Teaser v1, Product Explainer"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create & Open Canvas</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-rose-950/60 border border-rose-800 text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Delete Project?</h3>
                <p className="text-xs text-slate-400">
                  This will permanently delete this project and its saved timeline tracks. Sound effects in your library remain untouched.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeletingId(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                disabled={isDeleting}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
