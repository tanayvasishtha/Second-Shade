// Robust mean colour of a rectangle of pixels: clipped pixels are dropped, then the darkest and
// brightest share (shadow, shine) is trimmed before averaging in linear RGB.

import { linearToLab, rgb8ToLinear, type Vec3 } from "./color";

export interface Pixels {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels: 3 | 4;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PatchStats {
  /** Mean linear RGB of the kept pixels. */
  mean: Vec3;
  total: number;
  kept: number;
  /** Share of pixels with any channel at 250 or above. */
  clippedShare: number;
  /** Standard deviation of L* across kept pixels: high means uneven, sheer or textured. */
  lightnessSd: number;
}

const CLIP_8BIT = 250;

export function samplePatch(img: Pixels, rect: Rect, trim = 0.1): PatchStats {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.floor(rect.x + rect.w));
  const y1 = Math.min(img.height, Math.floor(rect.y + rect.h));
  const px: { lin: Vec3; L: number }[] = [];
  let total = 0;
  let clipped = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * img.channels;
      const rgb: Vec3 = [img.data[i], img.data[i + 1], img.data[i + 2]];
      total++;
      if (rgb[0] >= CLIP_8BIT || rgb[1] >= CLIP_8BIT || rgb[2] >= CLIP_8BIT) {
        clipped++;
        continue;
      }
      const lin = rgb8ToLinear(rgb);
      px.push({ lin, L: linearToLab(lin)[0] });
    }
  }
  if (total === 0) throw new Error("Patch is outside the image");
  px.sort((p, q) => p.L - q.L);
  const cut = Math.floor(px.length * trim);
  const kept = px.slice(cut, px.length - cut);
  if (kept.length === 0) return { mean: [0, 0, 0], total, kept: 0, clippedShare: clipped / total, lightnessSd: 0 };

  const sum = [0, 0, 0];
  let sumL = 0;
  for (const p of kept) {
    sum[0] += p.lin[0];
    sum[1] += p.lin[1];
    sum[2] += p.lin[2];
    sumL += p.L;
  }
  const n = kept.length;
  const meanL = sumL / n;
  const varL = kept.reduce((s, p) => s + (p.L - meanL) ** 2, 0) / n;
  return {
    mean: [sum[0] / n, sum[1] / n, sum[2] / n],
    total,
    kept: n,
    clippedShare: clipped / total,
    lightnessSd: Math.sqrt(varL),
  };
}
