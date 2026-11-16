import React, { useState, useEffect } from 'react';
import { X, Settings, RotateCcw, Check, Sparkles, Users, LogOut, User } from 'lucide-react';

export interface UserSettings {
  nudgeStep: number;
  fastJumpStep: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  nudgeStep: 0.1,
  fastJumpStep: 0.5,
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onSave: (newSettings: UserSettings) => void;
  user?: {
    username: string;
    role: string;
    display_name?: string;
  } | null;
  isAdmin?: boolean;
  onOpenUserMgmt?: () => void;
  onLogout?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  user,
  isAdmin = false,
  onOpenUserMgmt,
  onLogout,
}) => {
  const [localSettings, setLocalSettings] = useState<UserSettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const clampedNudge = Math.max(0.01, Math.min(10.0, Number(localSettings.nudgeStep) || 0.1));
    const clampedJump = Math.max(0.05, Math.min(30.0, Number(localSettings.fastJumpStep) || 0.5));
    const updated = {
      nudgeStep: Number(clampedNudge.toFixed(2)),
      fastJumpStep: Number(clampedJump.toFixed(2)),
    };
    onSave(updated);
    onClose();
  };

  const handleReset = () => {
    setLocalSettings(DEFAULT_SETTINGS);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/40 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-950/70 border border-indigo-500/40 text-indigo-400">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">Settings & Preferences</h3>
              <p className="text-[10px] text-slate-400 leading-tight">Playback scrubbing, account & administration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Close [Esc]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 flex flex-col gap-3.5">
          {/* Section 1: Playback Scrubbing */}
          <div className="flex flex-col gap-1.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span>Playback Scrubbing</span>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex flex-col gap-2.5">
              {/* Row 1: Fine Nudge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                    ← / →
                  </kbd>
                  <span className="text-xs font-medium text-slate-200">Fine Nudge Step</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0.01"
                    max="10"
                    step="0.05"
                    value={localSettings.nudgeStep}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, nudgeStep: parseFloat(e.target.value) || 0.1 })
                    }
                    className="w-16 px-2 py-1 text-xs font-mono text-center bg-slate-900 border border-indigo-500/50 rounded-lg text-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-400 font-mono">s</span>
                </div>
              </div>

              {/* Row 2: Fast Jump */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                      Shift
                    </kbd>
                    <span className="text-slate-500 text-xs">+</span>
                    <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                      ← / →
                    </kbd>
                  </span>
                  <span className="text-xs font-medium text-slate-200">Fast Jump Step</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0.05"
                    max="30"
                    step="0.1"
                    value={localSettings.fastJumpStep}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, fastJumpStep: parseFloat(e.target.value) || 0.5 })
                    }
                    className="w-16 px-2 py-1 text-xs font-mono text-center bg-slate-900 border border-indigo-500/50 rounded-lg text-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-400 font-mono">s</span>
                </div>
              </div>

              {/* Subtle 1-line Hint */}
              <div className="flex items-center gap-1.5 pt-1 border-t border-slate-800/40 text-[10px] text-indigo-300/80">
                <Sparkles className="w-3 h-3 text-indigo-400 shrink-0" />
                <span>In Trim Mode, scrubbing stays strictly within In/Out marks.</span>
              </div>
            </div>
          </div>

          {/* Section 2: Account & Session */}
          <div className="flex flex-col gap-1.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3 h-3 text-slate-400" />
              <span>Account & Session</span>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-xs text-white uppercase shrink-0 shadow-sm">
                  {(user?.display_name || user?.username || 'U')[0]}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-white truncate">
                      {user?.display_name || user?.username || 'User'}
                    </span>
                    <span
                      className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                        isAdmin
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                      }`}
                    >
                      {user?.role || 'member'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate leading-tight mt-0.5">
                    @{user?.username || 'user'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenUserMgmt?.();
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition cursor-pointer"
                    title="Manage users & roles"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Users</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogout?.();
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 transition cursor-pointer"
                  title="Sign out of MattLab SFX"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 bg-slate-950/50 shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer px-2 py-1 rounded-lg hover:bg-slate-800"
            title="Reset playback scrub to default (0.10s Nudge / 0.50s Jump)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
