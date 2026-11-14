import React, { useState } from 'react';
import { User as UserIcon, Lock, ShieldCheck, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Logo } from './Logo';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { hasUsers, login, setupAdmin } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSetupMode = !hasUsers;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!username.trim()) {
      setErrorMsg('Please enter a username.');
      return;
    }
    if (!password) {
      setErrorMsg('Please enter a password.');
      return;
    }

    if (isSetupMode) {
      if (password.length < 6) {
        setErrorMsg('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (isSetupMode) {
        await setupAdmin(username.trim(), password, displayName.trim());
      } else {
        await login(username.trim(), password);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background Ambient Glows */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800/90 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl z-10 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center gap-2">
          <div className="p-2.5 rounded-2xl bg-indigo-950/60 border border-indigo-500/30 shadow-lg shadow-indigo-600/20 mb-1">
            <Logo size={42} showText={false} />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>MattLab SFX</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xs leading-relaxed">
            {isSetupMode
              ? 'Create your workspace account to initialize the sound library.'
              : 'Sign in to access search, sound previews, project bins & downloads.'}
          </p>
        </div>

        {/* Error Alert Box */}
        {errorMsg && (
          <div className="bg-rose-950/50 border border-rose-500/50 text-rose-200 text-xs rounded-xl p-3 flex items-start gap-2.5 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-snug">{errorMsg}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {/* Username Input */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-300">Username</label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoFocus
                autoComplete="username"
                className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
          </div>

          {/* Setup-Only: Display Name Input */}
          {isSetupMode && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">
                Display Name <span className="text-slate-500 text-[10px]">(Optional)</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
                className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
          )}

          {/* Password Input */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-300">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSetupMode ? 'Create a password (min 6 characters)' : 'Enter your password'}
                autoComplete={isSetupMode ? 'new-password' : 'current-password'}
                className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-9 pr-10 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Setup-Only: Confirm Password */}
          {isSetupMode && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">Confirm Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold text-xs sm:text-sm py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <span>{isSetupMode ? 'Creating account...' : 'Signing in...'}</span>
            ) : (
              <>
                <span>{isSetupMode ? 'Create Account' : 'Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5 border-t border-slate-800/80 pt-4">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
          <span>Studio-grade audio workspace · Private & secure</span>
        </div>
      </div>
    </div>
  );
};
