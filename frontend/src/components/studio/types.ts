export interface StudioClip {
  id: string;
  soundId: number;
  name: string;
  filename: string;
  startTime: number; // in seconds
  duration: number; // in seconds
  volume: number; // 0.0 to 1.5, default 1.0
  trackId: number; // 0 to 3
  category?: string;
}

export interface StudioTrack {
  id: number;
  name: string;
  tag: string;
  colorBorder: string;
  colorBg: string;
  colorText: string;
  colorClip: string;
  muted: boolean;
  solo: boolean;
  volume: number; // 0.0 to 1.5
}

export const DEFAULT_TRACKS: StudioTrack[] = [
  {
    id: 0,
    name: 'Impacts & Hits',
    tag: 'T1',
    colorBorder: 'border-rose-500/40',
    colorBg: 'bg-rose-950/20',
    colorText: 'text-rose-400',
    colorClip: 'bg-gradient-to-r from-rose-600/80 to-pink-600/80 border-rose-400/50 text-white',
    muted: false,
    solo: false,
    volume: 1.0,
  },
  {
    id: 1,
    name: 'Whooshes & Sweeps',
    tag: 'T2',
    colorBorder: 'border-amber-500/40',
    colorBg: 'bg-amber-950/20',
    colorText: 'text-amber-400',
    colorClip: 'bg-gradient-to-r from-amber-600/80 to-orange-600/80 border-amber-400/50 text-white',
    muted: false,
    solo: false,
    volume: 1.0,
  },
  {
    id: 2,
    name: 'Foley & Movement',
    tag: 'T3',
    colorBorder: 'border-emerald-500/40',
    colorBg: 'bg-emerald-950/20',
    colorText: 'text-emerald-400',
    colorClip: 'bg-gradient-to-r from-emerald-600/80 to-teal-600/80 border-emerald-400/50 text-white',
    muted: false,
    solo: false,
    volume: 1.0,
  },
  {
    id: 3,
    name: 'Ambience & Atmos',
    tag: 'T4',
    colorBorder: 'border-indigo-500/40',
    colorBg: 'bg-indigo-950/20',
    colorText: 'text-indigo-400',
    colorClip: 'bg-gradient-to-r from-indigo-600/80 to-violet-600/80 border-indigo-400/50 text-white',
    muted: false,
    solo: false,
    volume: 1.0,
  },
];
