import React, { useState, useEffect } from 'react';
import { X, Settings, RotateCcw, Check, Sparkles, Users, LogOut, ShieldCheck, User } from 'lucide-react';

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

  const nudgePresets = [0.05, 0.1, 0.25, 0.5, 1.0];
  const jumpPresets = [0.25, 0.5, 1.0, 2.0, 5.0];

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
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-950/70 border border-indigo-500/40 text-indigo-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">Settings & Preferences</h3>
              <p className="text-[11px] text-slate-400 leading-tight mt-0.5">Scrubbing, administration & account management</p>
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
        <div className="p-5 flex flex-col gap-5 overflow-y-auto">
          {/* Section 1: Playback & Scrubbing */}
          <div className="flex flex-col gap-3">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Audio Playback & Scrubbing</span>
            </div>

            {/* Card 1: Fine Nudge */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <span>Fine Nudge Step</span>
                    <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                      ← / →
                    </kbd>
                  </label>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Playhead step when tapping Left or Right arrow keys.
                  </p>
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

              {/* Presets */}
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[10px] text-slate-500 font-medium mr-1 uppercase tracking-wider">Presets:</span>
                {nudgePresets.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setLocalSettings({ ...localSettings, nudgeStep: val })}
                    className={`px-2 py-1 rounded text-[11px] font-mono transition cursor-pointer ${
                      localSettings.nudgeStep === val
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/60'
                    }`}
                  >
                    {val}s
                  </button>
                ))}
              </div>
            </div>

            {/* Card 2: Fast Jump */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <span>Fast Jump Step</span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                        Shift
                      </kbd>
                      <span className="text-slate-500 text-xs">+</span>
                      <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                        ← / →
                      </kbd>
                    </span>
                  </label>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Playhead jump when holding Shift with arrow keys.
                  </p>
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

              {/* Presets */}
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[10px] text-slate-500 font-medium mr-1 uppercase tracking-wider">Presets:</span>
                {jumpPresets.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setLocalSettings({ ...localSettings, fastJumpStep: val })}
                    className={`px-2 py-1 rounded text-[11px] font-mono transition cursor-pointer ${
                      localSettings.fastJumpStep === val
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/60'
                    }`}
                  >
                    {val}s
                  </button>
                ))}
              </div>
            </div>

            {/* Context Note */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-indigo-950/30 border border-indigo-500/20 text-[11px] text-indigo-200/90">
              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <span>
                In <strong>Trim Mode</strong>, Left and Right arrow keys scrub strictly within your marked In and Out boundaries.
              </span>
            </div>
          </div>

          {/* Section 2: Administration (Admin Only) */}
          {isAdmin && (
            <div className="flex flex-col gap-3 pt-1">
              <div className="text-[11px] font-bold text-amber-400/90 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Administration</span>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-xs font-semibold text-slate-200">User & Role Management</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    Create accounts, assign Admin or Member roles, and reset credentials.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenUserMgmt?.();
                  }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Manage Users</span>
                </button>
              </div>
            </div>
          )}

          {/* Section 3: Account & Session */}
          <div className="flex flex-col gap-3 pt-1">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Account & Session</span>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-xs text-white uppercase shrink-0 shadow-sm">
                  {(user?.display_name || user?.username || 'U')[0]}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
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
                  <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                    @{user?.username || 'user'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogout?.();
                }}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 transition cursor-pointer"
                title="Sign out of MattLab SFX"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-800 bg-slate-950/50 shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer px-2 py-1.5 rounded-lg hover:bg-slate-800"
            title="Reset playback scrub to default (0.1s Nudge / 0.5s Jump)"
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
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition cursor-pointer"
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
