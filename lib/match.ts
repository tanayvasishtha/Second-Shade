// Nearest shades by CIEDE2000, and the gap between two colours in words a shopper uses.

import { ciede2000, hexToLab, labToLch, type Lab } from "./color";

export interface Shade {
  id: string;
  name: string;
  hex: string;
}

export interface RankedShade {
  shade: Shade;
  lab: Lab;
  dE: number;
}

export function rankShades(target: Lab, shades: readonly Shade[]): RankedShade[] {
  return shades
    .map((shade) => {
      const lab = hexToLab(shade.hex);
      return { shade, lab, dE: ciede2000(target, lab) };
    })
    .sort((p, q) => p.dE - q.dE);
}

// Below these, the difference is too small to put into words.
export const GAP_WORDS = { lightness: 1.0, hueDegrees: 2.0 } as const;

export interface Gap {
  /** L* of `to` minus L* of `from`. Negative means `to` is deeper. */
  dL: number;
  /** Hue angle of `to` minus `from`, in degrees. Positive means more yellow (golden), negative more red (pink). */
  dHue: number;
  dE: number;
  words: string[];
}

/** How `to` differs from `from`, for example skin compared with the returned shade. */
export function describeGap(from: Lab, to: Lab): Gap {
  const [L1, , h1] = labToLch(from);
  const [L2, , h2] = labToLch(to);
  let dHue = h2 - h1;
  if (dHue > 180) dHue -= 360;
  if (dHue < -180) dHue += 360;
  const dL = L2 - L1;
  const words: string[] = [];
  if (dL <= -GAP_WORDS.lightness) words.push("deeper");
  if (dL >= GAP_WORDS.lightness) words.push("lighter");
  if (dHue >= GAP_WORDS.hueDegrees) words.push("more golden");
  if (dHue <= -GAP_WORDS.hueDegrees) words.push("more pink");
  return { dL, dHue, dE: ciede2000(from, to), words };
}

/** Shades of the range ordered light to deep by L*. */
export function lightToDeep(shades: readonly Shade[]): Shade[] {
  return [...shades].sort((p, q) => hexToLab(q.hex)[0] - hexToLab(p.hex)[0]);
}

/** Positive when `to` sits deeper in the range than `from`, counted in shades. */
export function stepsBetween(fromId: string, toId: string, shades: readonly Shade[]): number {
  const order = lightToDeep(shades).map((s) => s.id);
  const a = order.indexOf(fromId);
  const b = order.indexOf(toId);
  if (a < 0 || b < 0) throw new Error(`Unknown shade id: ${a < 0 ? fromId : toId}`);
  return b - a;
}
