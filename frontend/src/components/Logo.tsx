import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ size = 28, className = '', showText = false }) => {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 128 128"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-[0_0_12px_rgba(99,102,241,0.4)]"
      >
        <defs>
          <radialGradient id="ml-bg" cx="50%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#1e1b4b" />
            <stop offset="60%" stopColor="#0b0f19" />
            <stop offset="100%" stopColor="#020617" />
          </radialGradient>
          <linearGradient id="ml-border" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#312e81" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="ml-wave" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="35%" stopColor="#818cf8" />
            <stop offset="70%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
          <radialGradient id="ml-glow" cx="50%" cy="50%" r="45%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </radialGradient>
          <filter id="ml-neon" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Squircle Shell */}
        <rect x="2" y="2" width="124" height="124" rx="28" fill="url(#ml-bg)" stroke="url(#ml-border)" strokeWidth="2.5" />

        {/* Core Radial Flare */}
        <circle cx="64" cy="64" r="42" fill="url(#ml-glow)" />

        {/* Audio Spectrum Equalizer Bars */}
        <g filter="url(#ml-neon)">
          <rect x="20" y="52" width="6.5" height="24" rx="3.25" fill="url(#ml-wave)" opacity="0.65" />
          <rect x="32" y="40" width="6.5" height="48" rx="3.25" fill="url(#ml-wave)" opacity="0.8" />
          <rect x="44" y="28" width="6.5" height="72" rx="3.25" fill="url(#ml-wave)" opacity="0.95" />
          <rect x="56" y="16" width="6.5" height="96" rx="3.25" fill="url(#ml-wave)" />
          <rect x="66" y="24" width="6.5" height="80" rx="3.25" fill="url(#ml-wave)" />
          <rect x="78" y="34" width="6.5" height="60" rx="3.25" fill="url(#ml-wave)" opacity="0.95" />
          <rect x="90" y="44" width="6.5" height="40" rx="3.25" fill="url(#ml-wave)" opacity="0.8" />
          <rect x="102" y="54" width="6.5" height="20" rx="3.25" fill="url(#ml-wave)" opacity="0.65" />
        </g>

        {/* Sonic Spark Wave Contour */}
        <path
          d="M 18 64 Q 38 64 48 50 T 64 36 T 80 78 T 110 64"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.9"
          filter="url(#ml-neon)"
        />
      </svg>

      {showText && (
        <div className="flex flex-col">
          <span className="text-lg font-bold tracking-tight text-white leading-tight">MattLab SFX</span>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-indigo-400">Audio Studio</span>
        </div>
      )}
    </div>
  );
};
