// The stripe of a foundation whose colour we know sits next to bare skin in the same photo.
// Under a single light, the light and the camera act on both roughly as one gain per linear
// RGB channel (a diagonal, von Kries model). So skin_true = skin_seen * (stripe_known / stripe_seen).
// The model breaks under mixed light, on clipped pixels and where the phone edits regions
// differently; the guards below reject what we can detect and the study reports the rest.

import { hexToLinear, linearToHex, linearToLab, linearToSrgb, srgbToLinear, type Lab, type Vec3 } from "./color";

export const LIMITS = {
  // Patch means below this are mostly sensor noise. Kept low on purpose: deep skin under a warm
  // bulb has a weak blue channel, and a higher floor would refuse exactly those shoppers.
  minLinear: 0.004,
  // 0.98 in sRGB. Anything brighter is treated as clipped.
  maxLinear: srgbToLinear(0.98),
  // A gain outside this range means the stripe and the catalogue colour do not belong together,
  // or the photo is far too dark or bright to trust. It cannot catch a wrong shade that differs
  // mostly in depth, which looks like a change of exposure; in a real return the order names the shade.
  minGain: 0.2,
  maxGain: 5,
} as const;

export type CorrectionFailure = "stripe_clipped" | "skin_clipped" | "stripe_too_dark" | "skin_too_dark" | "gain_out_of_range";

export type GainResult = { ok: true; gains: Vec3 } | { ok: false; reason: CorrectionFailure; detail: string };

export function channelGains(stripeSeen: Vec3, stripeKnown: Vec3): GainResult {
  for (let i = 0; i < 3; i++) {
    if (stripeSeen[i] >= LIMITS.maxLinear)
      return { ok: false, reason: "stripe_clipped", detail: `channel ${"RGB"[i]} is at the top of the range` };
    if (stripeSeen[i] < LIMITS.minLinear)
      return { ok: false, reason: "stripe_too_dark", detail: `channel ${"RGB"[i]} is too dark to measure` };
  }
  const gains: Vec3 = [stripeKnown[0] / stripeSeen[0], stripeKnown[1] / stripeSeen[1], stripeKnown[2] / stripeSeen[2]];
  const bad = gains.findIndex((g) => g < LIMITS.minGain || g > LIMITS.maxGain);
  if (bad >= 0)
    return { ok: false, reason: "gain_out_of_range", detail: `channel ${"RGB"[bad]} needs a gain of ${gains[bad].toFixed(2)}` };
  return { ok: true, gains };
}

export function applyGains(lin: Vec3, gains: Vec3): Vec3 {
  return [lin[0] * gains[0], lin[1] * gains[1], lin[2] * gains[2]];
}

export type SkinEstimate =
  | { ok: true; gains: Vec3; skinLinear: Vec3; skinHex: string; skinLab: Lab }
  | { ok: false; reason: CorrectionFailure; detail: string };

/** Skin colour with the light taken out, from mean linear RGB of the skin and stripe patches. */
export function estimateSkin(input: { skinSeen: Vec3; stripeSeen: Vec3; stripeKnownHex: string }): SkinEstimate {
  const { skinSeen } = input;
  for (let i = 0; i < 3; i++) {
    if (skinSeen[i] >= LIMITS.maxLinear)
      return { ok: false, reason: "skin_clipped", detail: `channel ${"RGB"[i]} is at the top of the range` };
    if (skinSeen[i] < LIMITS.minLinear)
      return { ok: false, reason: "skin_too_dark", detail: `channel ${"RGB"[i]} is too dark to measure` };
  }
  const g = channelGains(input.stripeSeen, hexToLinear(input.stripeKnownHex));
  if (!g.ok) return g;
  const skinLinear = applyGains(skinSeen, g.gains);
  return { ok: true, gains: g.gains, skinLinear, skinHex: linearToHex(skinLinear), skinLab: linearToLab(skinLinear) };
}

/** One 256-entry lookup table per channel: 8-bit sRGB in, gained and clamped 8-bit sRGB out. */
export function gainLuts(gains: Vec3): [Uint8Array, Uint8Array, Uint8Array] {
  const lut = (gain: number) => {
    const out = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      const lin = Math.min(1, srgbToLinear(v / 255) * gain);
      out[v] = Math.round(linearToSrgb(lin) * 255);
    }
    return out;
  };
  return [lut(gains[0]), lut(gains[1]), lut(gains[2])];
}

/** Applies the gains to every pixel of an 8-bit RGB or RGBA buffer. Alpha is copied unchanged. */
export function correctPixels(data: Uint8Array | Uint8ClampedArray, channels: 3 | 4, gains: Vec3): Uint8Array {
  const [r, g, b] = gainLuts(gains);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += channels) {
    out[i] = r[data[i]];
    out[i + 1] = g[data[i + 1]];
    out[i + 2] = b[data[i + 2]];
    if (channels === 4) out[i + 3] = data[i + 3];
  }
  return out;
}
