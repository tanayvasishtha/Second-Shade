// E1 and E2 metrics. Each method measures a colour from the same photo and picks a shade:
// plain skin pixels (what a selfie finder sees), our stripe correction, and YouCam's skin tone
// reading on the photo as taken and on the corrected photo.
// E1 asks whether the pick holds still when only the light changes. E2 asks whether it is right.

import { ciede2000, hexToLab } from "./color";
import { rankShades, stepsBetween, type Shade } from "./match";
import type { MeasureResult } from "./measure";

export const METHODS = ["pixels", "stripe", "youcamRaw", "youcamCorrected"] as const;
export type Method = (typeof METHODS)[number];

export const METHOD_LABELS: Record<Method, string> = {
  pixels: "Plain selfie (skin pixels as photographed)",
  stripe: "Second Shade (skin corrected by the stripe)",
  youcamRaw: "YouCam skin tone, photo as taken",
  youcamCorrected: "YouCam skin tone, corrected photo",
};

export interface Pick {
  shadeId: string;
  /** The colour the method measured. */
  hex: string;
}

export interface Observation {
  person: string;
  light: string;
  picks: Partial<Record<Method, Pick>>;
}

export interface MethodSummary {
  method: Method;
  /** People with at least two lights measured by this method. */
  people: number;
  /** Of those, how many got the same shade under every light. */
  stableAcrossLights: number;
  /** Median over people of the largest CIEDE2000 between two of their lights. */
  medianSpread: number | null;
  /** Photos with both a pick and a known true shade. */
  photos: number;
  exact: number;
  withinOne: number;
  /** Median CIEDE2000 between the measured colour and the true shade's colour. */
  medianToTrue: number | null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function maxPairwise(hexes: string[]): number {
  const labs = hexes.map(hexToLab);
  let max = 0;
  for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) max = Math.max(max, ciede2000(labs[i], labs[j]));
  return max;
}

/**
 * The shade each method picks for one photo. Photos the gate refused give no picks at all,
 * so every method is scored on the same photos; refusals are counted separately (E3).
 */
export function picksFrom(result: MeasureResult, catalogue: readonly Shade[]): Partial<Record<Method, Pick>> {
  if (!result.ok || !result.skin || !result.estimate || !result.recommended) return {};
  const nearest = (hex: string) => rankShades(hexToLab(hex), catalogue)[0].shade.id;
  const picks: Partial<Record<Method, Pick>> = {
    pixels: { shadeId: nearest(result.skin.seenHex), hex: result.skin.seenHex },
    stripe: { shadeId: result.recommended.shade.id, hex: result.estimate.hex },
  };
  const raw = result.youcam?.raw;
  const corrected = result.youcam?.corrected;
  if (raw?.hex && raw.nearest) picks.youcamRaw = { shadeId: raw.nearest.id, hex: raw.hex };
  if (corrected?.hex && corrected.nearest) picks.youcamCorrected = { shadeId: corrected.nearest.id, hex: corrected.hex };
  return picks;
}

export function summarise(obs: Observation[], trueShade: Record<string, string | undefined>, catalogue: readonly Shade[]): MethodSummary[] {
  return METHODS.map((method) => {
    const byPerson = new Map<string, Pick[]>();
    for (const o of obs) {
      const p = o.picks[method];
      if (p) byPerson.set(o.person, [...(byPerson.get(o.person) ?? []), p]);
    }
    let people = 0;
    let stable = 0;
    const spreads: number[] = [];
    for (const picks of byPerson.values()) {
      if (picks.length < 2) continue;
      people++;
      if (new Set(picks.map((p) => p.shadeId)).size === 1) stable++;
      spreads.push(maxPairwise(picks.map((p) => p.hex)));
    }

    let photos = 0;
    let exact = 0;
    let withinOne = 0;
    const toTrue: number[] = [];
    for (const o of obs) {
      const p = o.picks[method];
      const truth = catalogue.find((s) => s.id === trueShade[o.person]);
      if (!p || !truth) continue;
      photos++;
      const steps = stepsBetween(truth.id, p.shadeId, catalogue);
      if (steps === 0) exact++;
      if (Math.abs(steps) <= 1) withinOne++;
      toTrue.push(ciede2000(hexToLab(p.hex), hexToLab(truth.hex)));
    }
    return { method, people, stableAcrossLights: stable, medianSpread: median(spreads), photos, exact, withinOne, medianToTrue: median(toTrue) };
  });
}
