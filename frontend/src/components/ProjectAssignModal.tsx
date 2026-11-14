import React, { useState } from 'react';
import { X, FolderPlus, Check, Plus, Folder } from 'lucide-react';
import { AudioItem } from './AudioPlayer';

export interface ProjectCollection {
  id: number;
  name: string;
  description: string;
  color: string;
  sound_count: number;
  created_at?: string;
}

interface ProjectAssignModalProps {
  sound: AudioItem | null;
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectCollection[];
  assignedProjectIds: number[];
  onToggleAssign: (projectId: number, soundId: number, isCurrentlyAssigned: boolean) => Promise<void>;
  onCreateProject: (name: string, color: string) => Promise<number | null>;
}

const COLOR_PALETTE = [
  '#f59e0b', // Amber
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#f43f5e', // Rose
  '#a855f7', // Purple
  '#3b82f6', // Blue
  '#eab308', // Yellow
];

export const ProjectAssignModal: React.FC<ProjectAssignModalProps> = ({
  sound,
  isOpen,
  onClose,
  projects,
  assignedProjectIds,
  onToggleAssign,
  onCreateProject,
}) => {
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLOR_PALETTE[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen || !sound) return null;

  const assignedSet = new Set(assignedProjectIds);

  const handleCreateAndAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newProjectName.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a project name');
      return;
    }
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      const newId = await onCreateProject(trimmed, selectedColor);
      if (newId) {
        await onToggleAssign(newId, sound.id, false);
        setNewProjectName('');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-5 flex flex-col gap-4 text-slate-200 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white tracking-tight leading-snug">
                Organize into Projects
              </h3>
              <p className="text-xs text-slate-400 truncate mt-0.5" title={sound.display_name || sound.filename}>
                {sound.display_name || sound.filename}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Existing Projects List */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium px-1">
            <span>Select project collections</span>
            <span>{assignedSet.size} assigned</span>
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 border border-slate-800/80 rounded-xl p-2 bg-slate-950/40">
            {projects.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500 flex flex-col items-center gap-1.5">
                <Folder className="w-6 h-6 text-slate-600 stroke-[1.5]" />
                <span>No project collections yet.</span>
                <span className="text-[11px] text-slate-600">Create one below to group your sounds!</span>
              </div>
            ) : (
              projects.map((p) => {
                const isAssigned = assignedSet.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => onToggleAssign(p.id, sound.id, isAssigned)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer border ${
                      isAssigned
                        ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                        : 'bg-slate-800/50 hover:bg-slate-800 border-slate-700/60 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                        style={{ backgroundColor: p.color || '#f59e0b' }}
                      />
                      <span className="truncate font-semibold">{p.name}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-slate-400 font-mono">
                        {p.sound_count} {p.sound_count === 1 ? 'sound' : 'sounds'}
                      </span>
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center transition border ${
                          isAssigned
                            ? 'bg-amber-500 border-amber-400 text-slate-950'
                            : 'border-slate-600 bg-slate-900/60'
                        }`}
                      >
                        {isAssigned && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Create New Project Section */}
        <form onSubmit={handleCreateAndAssign} className="flex flex-col gap-2 pt-2 border-t border-slate-800">
          <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
            <span>+ Create new project</span>
            {errorMsg && <span className="text-[11px] text-rose-400">{errorMsg}</span>}
          </label>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="e.g. Sci-Fi Film, Horror Trailer, Ambient"
              value={newProjectName}
              onChange={(e) => {
                setNewProjectName(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              className="flex-1 bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />

            <button
              type="submit"
              disabled={isSubmitting || !newProjectName.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium text-xs px-3 py-1.5 rounded-lg transition shrink-0 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>

          {/* Color Presets */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-slate-500 font-medium">Color:</span>
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedColor(c)}
                style={{ backgroundColor: c }}
                className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                  selectedColor === c ? 'scale-125 ring-2 ring-white/60' : 'opacity-70 hover:opacity-100'
                }`}
                title={c}
              />
            ))}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-1 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
