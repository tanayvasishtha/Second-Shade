import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { hexToLinear, linearToRgb8, type Vec3 } from "../lib/color";
import { measure, type SkinToneReader } from "../lib/measure";
import type { Shade } from "../lib/match";

const W = 600;
const H = 800;
const WARM: Vec3 = [1.2, 0.95, 0.6];

const range: Shade[] = [
  { id: "1", name: "Ivory", hex: "#f0d0b6" },
  { id: "2", name: "Sand", hex: "#dcae8a" },
  { id: "3", name: "Honey", hex: "#c79570" },
  { id: "4", name: "Caramel", hex: "#b07b55" },
  { id: "5", name: "Mocha", hex: "#8a5a3c" },
];

const seen = (hex: string, gains = WARM, exposure = 0.85) =>
  linearToRgb8(hexToLinear(hex).map((c, i) => c * gains[i] * exposure) as unknown as Vec3).map(Math.round);

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  rgb: number[];
}

/** A PNG with a background and coloured rectangles, so no JPEG blur muddies the test. */
async function photo(regions: Region[], noise?: (x: number, y: number) => number[] | null) {
  const data = new Uint8Array(W * H * 3).fill(90);
  for (const r of regions)
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) data.set(noise?.(x, y) ?? r.rgb, (y * W + x) * 3);
  return new Uint8Array(await sharp(data, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer());
}

// Stripe of shade 2 (Sand) at left, bare skin that is truly Caramel at right, both under a warm light.
const scene = (skinHex = "#b07b55") => [
  { x: 100, y: 300, w: 120, h: 200, rgb: seen("#dcae8a") },
  { x: 300, y: 300, w: 200, h: 200, rgb: seen(skinHex) },
];
const taps = { stripe: { x: 160 / W, y: 400 / H }, skin: { x: 400 / W, y: 400 / H } };

describe("measure", () => {
  it("takes the light out and recommends the shade the skin actually is", async () => {
    const out = await measure({ photo: await photo(scene()), ...taps, returnedId: "2", catalogue: range });
    expect(out.ok).toBe(true);
    expect(out.recommended?.shade.id).toBe("4");
    expect(out.recommended?.steps).toBe(2);
    expect(out.decision).toBe("exchange");
    expect(out.gap?.words).toContain("deeper");
    expect(out.recommended!.dE).toBeLessThan(0.5);
  });

  it("says no shade fits when the range has nothing close", async () => {
    const out = await measure({ photo: await photo(scene("#5a3322")), ...taps, returnedId: "2", catalogue: range });
    expect(out.ok).toBe(true);
    expect(out.decision).toBe("no_fit");
  });

  it("says the bottle was right when the skin matches it", async () => {
    const out = await measure({ photo: await photo(scene("#dcae8a")), ...taps, returnedId: "2", catalogue: range });
    expect(out.decision).toBe("same_shade");
  });

  it("refuses shine on the stripe", async () => {
    const img = await photo(scene(), (x, y) => (x >= 100 && x < 220 && y >= 300 && y < 500 && (x + y) % 3 === 0 ? [255, 255, 255] : null));
    const out = await measure({ photo: img, ...taps, returnedId: "2", catalogue: range });
    expect(out.ok).toBe(false);
    expect(out.issues.map((i) => i.code)).toContain("stripe_shine");
  });

  it("refuses a patchy stripe", async () => {
    const patchy = (x: number, y: number) => (x >= 100 && x < 220 && y >= 300 && y < 500 ? (x % 4 < 2 ? seen("#dcae8a") : seen("#8a5a3c")) : null);
    const out = await measure({ photo: await photo(scene(), patchy), ...taps, returnedId: "2", catalogue: range });
    expect(out.issues.map((i) => i.code)).toContain("stripe_uneven");
  });

  it("refuses two taps on the same spot", async () => {
    const out = await measure({ photo: await photo(scene()), stripe: taps.stripe, skin: taps.stripe, returnedId: "2", catalogue: range });
    expect(out.issues.map((i) => i.code)).toEqual(["patches_overlap"]);
  });

  it("measures deep skin under a warm bulb instead of calling it too dark", async () => {
    const deep: Shade[] = [...range, { id: "6", name: "Espresso", hex: "#6b4430" }];
    const out = await measure({ photo: await photo(scene("#6b4430")), ...taps, returnedId: "2", catalogue: deep });
    expect(out.ok).toBe(true);
    expect(out.recommended?.shade.id).toBe("6");
  });

  it("refuses a stripe whose colour no ordinary light could make from the shade picked", async () => {
    const green = [{ x: 100, y: 300, w: 120, h: 200, rgb: [60, 190, 70] }, scene()[1]];
    const out = await measure({ photo: await photo(green), ...taps, returnedId: "2", catalogue: range });
    expect(out.ok).toBe(false);
    expect(out.issues.map((i) => i.code)).toContain("gain_out_of_range");
  });

  it("explains a file that is not an image", async () => {
    const out = await measure({ photo: new Uint8Array([1, 2, 3]), ...taps, returnedId: "2", catalogue: range });
    expect(out.issues.map((i) => i.code)).toEqual(["bad_photo"]);
  });

  it("asks YouCam about the raw and the corrected photo when told to", async () => {
    const sent: Uint8Array[] = [];
    const reader: SkinToneReader = {
      async skinTone(image) {
        sent.push(image.bytes);
        return { skinColor: sent.length === 1 ? "#c99a6a" : "#b17c56" };
      },
    };
    const out = await measure({ photo: await photo(scene()), ...taps, returnedId: "2", catalogue: range, youcam: { reader, readings: "both" } });
    expect(sent).toHaveLength(2);
    expect(Buffer.compare(Buffer.from(sent[0]), Buffer.from(sent[1]))).not.toBe(0);
    expect(out.youcam?.raw?.nearest?.id).toBe("3");
    expect(out.youcam?.corrected?.nearest?.id).toBe("4");
  });
});
