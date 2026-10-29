"use client";

import type { MouseEvent } from "react";

export type Tap = { x: number; y: number };

/** First tap marks the stripe, second the skin; a third starts over. */
export function nextTaps(stripe: Tap | null, skin: Tap | null, tap: Tap): { stripe: Tap; skin: Tap | null } {
  return !stripe || skin ? { stripe: tap, skin: null } : { stripe, skin: tap };
}

export function tapHint(stripe: Tap | null, skin: Tap | null) {
  return !stripe ? "Tap the middle of the stripe." : !skin ? "Now tap bare skin right next to it." : "Tap again to redo.";
}

/** A photo you tap on. Positions are shares of the displayed size, which matches the EXIF-rotated photo. */
export function TapImage({ src, alt, stripe, skin, onTap }: { src: string; alt: string; stripe: Tap | null; skin: Tap | null; onTap: (t: Tap) => void }) {
  function click(e: MouseEvent<HTMLImageElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    onTap({ x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height });
  }
  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* eslint-disable-next-line @next/next/no-img-element -- local photos and blob previews, not served assets */}
      <img src={src} alt={alt} onClick={click} className="block h-auto w-full cursor-crosshair" />
      {[
        { t: stripe, label: "Stripe" },
        { t: skin, label: "Skin" },
      ].map(
        ({ t, label }) =>
          t && (
            <div
              key={label}
              className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
            >
              <div className="h-6 w-6 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.6)]" />
              <span className="mt-1 rounded bg-black/70 px-1.5 text-xs text-white">{label}</span>
            </div>
          ),
      )}
    </div>
  );
}
