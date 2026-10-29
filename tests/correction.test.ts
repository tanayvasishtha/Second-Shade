import { describe, expect, it } from "vitest";
import { ciede2000, hexToLab, hexToLinear, hexToRgb8, linearToLab, linearToRgb8, type Vec3 } from "../lib/color";
import { channelGains, correctPixels, estimateSkin } from "../lib/correction";

const SKIN = "#c08a6a";
const STRIPE = "#d1a27f";

// A warm bulb and an under-exposed phone: one gain per linear channel.
const light = (lin: Vec3, g: Vec3 = [1.25, 0.95, 0.55], exposure = 0.8): Vec3 => [
  lin[0] * g[0] * exposure,
  lin[1] * g[1] * exposure,
  lin[2] * g[2] * exposure,
];

describe("estimateSkin", () => {
  it("recovers the true skin colour when stripe and skin share one light", () => {
    const out = estimateSkin({ skinSeen: light(hexToLinear(SKIN)), stripeSeen: light(hexToLinear(STRIPE)), stripeKnownHex: STRIPE });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(ciede2000(out.skinLab, hexToLab(SKIN))).toBeLessThan(0.01);
    expect(out.skinHex).toBe(SKIN);
  });

  it("is needed: under this light the raw reading is several shades off", () => {
    expect(ciede2000(linearToLab(light(hexToLinear(SKIN))), hexToLab(SKIN))).toBeGreaterThan(5);
  });

  it("refuses a clipped stripe", () => {
    const out = estimateSkin({ skinSeen: [0.3, 0.2, 0.15], stripeSeen: [0.97, 0.5, 0.3], stripeKnownHex: STRIPE });
    expect(out).toMatchObject({ ok: false, reason: "stripe_clipped" });
  });

  it("refuses clipped skin", () => {
    const out = estimateSkin({ skinSeen: [0.99, 0.6, 0.4], stripeSeen: [0.4, 0.3, 0.2], stripeKnownHex: STRIPE });
    expect(out).toMatchObject({ ok: false, reason: "skin_clipped" });
  });

  it("refuses a stripe too dark to measure", () => {
    expect(channelGains([0.2, 0.1, 0.002], hexToLinear(STRIPE))).toMatchObject({ ok: false, reason: "stripe_too_dark" });
  });

  it("refuses a gain no real light would need", () => {
    expect(channelGains([0.6, 0.02, 0.5], hexToLinear(STRIPE))).toMatchObject({ ok: false, reason: "gain_out_of_range" });
  });
});

describe("correctPixels", () => {
  it("maps the stripe as seen back to its known colour, and keeps alpha", () => {
    const seen = light(hexToLinear(STRIPE));
    const g = channelGains(seen, hexToLinear(STRIPE));
    if (!g.ok) throw new Error(g.reason);
    const seen8 = linearToRgb8(seen).map(Math.round);
    const out = correctPixels(new Uint8Array([...seen8, 200]), 4, g.gains);
    const want = hexToRgb8(STRIPE);
    for (let i = 0; i < 3; i++) expect(Math.abs(out[i] - want[i])).toBeLessThanOrEqual(2);
    expect(out[3]).toBe(200);
  });
});
