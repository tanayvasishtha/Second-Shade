import { describe, expect, it } from "vitest";
import { hexToLinear, hexToRgb8 } from "../lib/color";
import { samplePatch, type Pixels } from "../lib/sample";

function image(width: number, height: number, fill: string): Pixels {
  const [r, g, b] = hexToRgb8(fill);
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < data.length; i += 3) data.set([r, g, b], i);
  return { data, width, height, channels: 3 };
}

const set = (img: Pixels, x: number, y: number, rgb: number[]) => img.data.set(rgb, (y * img.width + x) * img.channels);

describe("samplePatch", () => {
  it("returns the colour of a uniform patch", () => {
    const s = samplePatch(image(10, 10, "#b9947c"), { x: 0, y: 0, w: 10, h: 10 });
    const want = hexToLinear("#b9947c");
    s.mean.forEach((c, i) => expect(c).toBeCloseTo(want[i], 6));
    expect(s.lightnessSd).toBeCloseTo(0, 6);
    expect(s.clippedShare).toBe(0);
  });

  it("drops shine and shadow before averaging", () => {
    const img = image(10, 10, "#b9947c");
    for (let x = 0; x < 5; x++) set(img, x, 0, [255, 255, 255]);
    for (let x = 0; x < 5; x++) set(img, x, 9, [20, 15, 10]);
    const s = samplePatch(img, { x: 0, y: 0, w: 10, h: 10 });
    expect(s.clippedShare).toBeCloseTo(0.05, 6);
    const want = hexToLinear("#b9947c");
    s.mean.forEach((c, i) => expect(c).toBeCloseTo(want[i], 6));
  });

  it("reports an uneven patch", () => {
    const img = image(10, 10, "#b9947c");
    for (let y = 0; y < 10; y++) for (let x = 0; x < 5; x++) set(img, x, y, hexToRgb8("#7a5a45") as unknown as number[]);
    expect(samplePatch(img, { x: 0, y: 0, w: 10, h: 10 }, 0).lightnessSd).toBeGreaterThan(5);
  });

  it("clips the rectangle to the image", () => {
    expect(samplePatch(image(4, 4, "#808080"), { x: 2, y: 2, w: 10, h: 10 }).total).toBe(4);
    expect(() => samplePatch(image(4, 4, "#808080"), { x: 9, y: 9, w: 2, h: 2 })).toThrow();
  });
});
