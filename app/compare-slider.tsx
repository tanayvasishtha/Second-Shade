"use client";

import { useState } from "react";

/** Two renders of the same photo, one over the other; the slider moves the dividing line. */
export function CompareSlider({ left, right, leftLabel, rightLabel }: { left: string; right: string; leftLabel: string; rightLabel: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative select-none overflow-hidden rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element -- YouCam result images and saved renders */}
        <img src={left} alt={`Your photo with ${leftLabel}`} className="block h-auto w-full" />
        {/* eslint-disable-next-line @next/next/no-img-element -- YouCam result images and saved renders */}
        <img
          src={right}
          alt={`Your photo with ${rightLabel}`}
          className="absolute inset-0 h-full w-full"
          style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
        />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" style={{ left: `${pos}%` }} />
        <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">{leftLabel}</span>
        <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">{rightLabel}</span>
      </div>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label={`Slide between ${leftLabel} and ${rightLabel}`} />
    </div>
  );
}
