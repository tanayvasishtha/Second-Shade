import { describe, expect, it } from "vitest";
import { hexToLab } from "../lib/color";
import { describeGap, lightToDeep, rankShades, stepsBetween, type Shade } from "../lib/match";

const range: Shade[] = [
  { id: "110", name: "Porcelain", hex: "#f1d3bd" },
  { id: "220", name: "Natural Beige", hex: "#d9a982" },
  { id: "310", name: "Sun Beige", hex: "#c08a62" },
  { id: "330", name: "Toffee", hex: "#a8714b" },
  { id: "355", name: "Coconut", hex: "#7c4a2d" },
];

describe("rankShades", () => {
  it("puts the closest shade first", () => {
    const ranked = rankShades(hexToLab("#bf8b63"), range);
    expect(ranked[0].shade.id).toBe("310");
    expect(ranked[0].dE).toBeLessThan(ranked[1].dE);
  });
});

describe("describeGap", () => {
  it("says deeper when the skin is darker than the shade", () => {
    expect(describeGap(hexToLab("#d9a982"), hexToLab("#a8714b")).words).toContain("deeper");
  });

  it("says lighter when the skin is paler", () => {
    expect(describeGap(hexToLab("#a8714b"), hexToLab("#d9a982")).words).toContain("lighter");
  });

  it("names a hue shift towards yellow as more golden and towards red as more pink", () => {
    const base = [65, 15, 20] as const;
    expect(describeGap(base, [65, 12, 24]).words).toEqual(["more golden"]);
    expect(describeGap(base, [65, 19, 17]).words).toEqual(["more pink"]);
  });

  it("stays quiet below the thresholds", () => {
    expect(describeGap([65, 15, 20], [65.5, 15.1, 20.1]).words).toEqual([]);
  });
});

describe("range order", () => {
  it("orders light to deep and counts steps", () => {
    expect(lightToDeep(range).map((s) => s.id)).toEqual(["110", "220", "310", "330", "355"]);
    expect(stepsBetween("220", "330", range)).toBe(2);
    expect(stepsBetween("330", "220", range)).toBe(-2);
    expect(() => stepsBetween("999", "220", range)).toThrow();
  });
});
