import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ciede2000, hexToLab, hexToRgb8, linearToSrgb, normalizeHex, rgb8ToHex, srgbToLinear, type Lab } from "../lib/color";

// Sharma, Wu, Dalal (2005), all 34 pairs, from the authors' published test data.
const pairs = readFileSync(new URL("./data/ciede2000_sharma.txt", import.meta.url), "utf8")
  .trim()
  .split(/\r?\n/)
  .map((line) => line.trim().split(/\s+/).map(Number));

describe("ciede2000", () => {
  it("has all 34 reference pairs", () => expect(pairs).toHaveLength(34));

  it.each(pairs.map((p, i) => [i + 1, p] as const))("matches Sharma pair %i to 1e-4", (_, p) => {
    const a: Lab = [p[0], p[1], p[2]];
    const b: Lab = [p[3], p[4], p[5]];
    expect(Math.abs(ciede2000(a, b) - p[6])).toBeLessThan(1e-4);
    expect(Math.abs(ciede2000(b, a) - p[6])).toBeLessThan(1e-4);
  });

  it("is zero for identical colours", () => expect(ciede2000([62, 14, 20], [62, 14, 20])).toBe(0));
});

describe("conversions", () => {
  it("round-trips hex", () => {
    for (const hex of ["#000000", "#ffffff", "#b9947c", "#8d5524"]) expect(rgb8ToHex(hexToRgb8(hex))).toBe(hex);
    expect(normalizeHex("B9947C")).toBe("#b9947c");
  });

  it("round-trips the sRGB transfer curve", () => {
    for (let v = 0; v <= 1; v += 0.05) expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 10);
  });

  it("puts white at L* 100 with near-zero a* and b*", () => {
    const [L, a, b] = hexToLab("#ffffff");
    expect(L).toBeCloseTo(100, 3);
    expect(Math.abs(a)).toBeLessThan(0.02);
    expect(Math.abs(b)).toBeLessThan(0.02);
  });

  it("rejects malformed hex", () => expect(() => hexToRgb8("#12345")).toThrow());
});
