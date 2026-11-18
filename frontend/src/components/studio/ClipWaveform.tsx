import React, { useState, useEffect } from 'react';

const peaksCache = new Map<number, number[]>();

interface ClipWaveformProps {
  soundId: number;
  trimIn?: number;
  duration?: number;
  originalDuration?: number;
}

export const ClipWaveform: React.FC<ClipWaveformProps> = React.memo(({
  soundId,
  trimIn = 0,
  duration,
  originalDuration,
}) => {
  const [peaks, setPeaks] = useState<number[] | null>(() => peaksCache.get(soundId) || null);

  useEffect(() => {
    if (peaksCache.has(soundId)) {
      setPeaks(peaksCache.get(soundId)!);
      return;
    }

    let isMounted = true;
    fetch(`/api/peaks/${soundId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Peaks not found');
        return res.json();
      })
      .then((data: number[]) => {
        if (Array.isArray(data)) {
          peaksCache.set(soundId, data);
          if (isMounted) setPeaks(data);
        }
      })
      .catch(() => {
        // Fallback silently if peak generation fails
      });

    return () => {
      isMounted = false;
    };
  }, [soundId]);

  if (!peaks || peaks.length === 0) return null;

  const totalLen = peaks.length;
  const safeTrimIn = Math.max(0, trimIn);
  const totalDuration = originalDuration && originalDuration > 0
    ? originalDuration
    : duration
    ? safeTrimIn + duration
    : 1.0;

  const visibleDuration = duration && duration > 0 ? duration : Math.max(0.1, totalDuration - safeTrimIn);

  // Compute peak slice based on trimIn and duration
  const startFrac = Math.max(0, Math.min(1, safeTrimIn / totalDuration));
  const endFrac = Math.max(startFrac + 0.01, Math.min(1, (safeTrimIn + visibleDuration) / totalDuration));

  const startIdx = Math.floor(startFrac * (totalLen - 1));
  const endIdx = Math.min(totalLen - 1, Math.max(startIdx + 2, Math.ceil(endFrac * (totalLen - 1))));
  const slicedPeaks = peaks.slice(startIdx, endIdx + 1);
  const len = slicedPeaks.length;

  const mid = 15;
  let topPath = `M 0 ${mid}`;
  let botPath = `L 100 ${mid}`;

  for (let i = 0; i < len; i++) {
    const x = len > 1 ? (i / (len - 1)) * 100 : 50;
    const h = Math.max(0.4, slicedPeaks[i] * 13.5);
    topPath += ` L ${x.toFixed(1)} ${(mid - h).toFixed(1)}`;
  }
  for (let i = len - 1; i >= 0; i--) {
    const x = len > 1 ? (i / (len - 1)) * 100 : 50;
    const h = Math.max(0.4, slicedPeaks[i] * 13.5);
    botPath += ` L ${x.toFixed(1)} ${(mid + h).toFixed(1)}`;
  }

  const d = `${topPath} ${botPath} Z`;

  return (
    <div className="absolute inset-x-0 bottom-0 top-3 opacity-35 pointer-events-none overflow-hidden">
      <svg className="w-full h-full text-white" preserveAspectRatio="none" viewBox="0 0 100 30">
        <path d={d} fill="currentColor" />
      </svg>
    </div>
  );
});
