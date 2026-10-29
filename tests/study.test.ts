import { describe, expect, it } from "vitest";
import type { Shade } from "../lib/match";
import type { MeasureResult } from "../lib/measure";
import { median, picksFrom, summarise, type Observation } from "../lib/study";

const range: Shade[] = [
  { id: "1", name: "Shade 1", hex: "#f0d0b6" },
  { id: "2", name: "Shade 2", hex: "#dcae8a" },
  { id: "3", name: "Shade 3", hex: "#c79570" },
  { id: "4", name: "Shade 4", hex: "#b07b55" },
  { id: "5", name: "Shade 5", hex: "#8a5a3c" },
];
const hex = (id: string) => range.find((s) => s.id === id)!.hex;
const pick = (id: string) => ({ shadeId: id, hex: hex(id) });

describe("median", () => {
  it("handles odd, even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("summarise", () => {
  // Two people under three lights. The plain selfie drifts with the light; the stripe holds.
  const obs: Observation[] = [
    { person: "P1", light: "window", picks: { pixels: pick("3"), stripe: pick("3") } },
    { person: "P1", light: "warm", picks: { pixels: pick("2"), stripe: pick("3") } },
    { person: "P1", light: "tube", picks: { pixels: pick("4"), stripe: pick("3") } },
    { person: "P2", light: "window", picks: { pixels: pick("5"), stripe: pick("4") } },
    { person: "P2", light: "warm", picks: { pixels: pick("4"), stripe: pick("4") } },
    { person: "P2", light: "tube", picks: { pixels: pick("4"), stripe: pick("5") } },
  ];
  const rows = summarise(obs, { P1: "3", P2: "4" }, range);
  const row = (m: string) => rows.find((r) => r.method === m)!;

  it("counts people who got one shade under every light", () => {
    expect(row("pixels")).toMatchObject({ people: 2, stableAcrossLights: 0 });
    expect(row("stripe")).toMatchObject({ people: 2, stableAcrossLights: 1 });
    expect(row("stripe").medianSpread!).toBeLessThan(row("pixels").medianSpread!);
  });

  it("scores picks against the true shade, exactly and within one", () => {
    expect(row("pixels")).toMatchObject({ photos: 6, exact: 3, withinOne: 6 });
    expect(row("stripe")).toMatchObject({ photos: 6, exact: 5, withinOne: 6 });
  });

  it("leaves methods with no data empty rather than zero", () => {
    expect(row("youcamRaw")).toMatchObject({ people: 0, photos: 0, medianSpread: null, medianToTrue: null });
  });

  it("skips people whose true shade is unknown", () => {
    expect(summarise(obs, { P1: "3" }, range).find((r) => r.method === "stripe")!.photos).toBe(3);
  });
});

describe("picksFrom", () => {
  const base = {
    ok: true,
    issues: [],
    returned: range[1],
    skin: { seenHex: "#c18a60", lightnessSd: 1, clippedShare: 0 },
    estimate: { hex: "#b07b56", lab: [55, 15, 25] as const, gains: [1, 1, 1] as const },
    recommended: { shade: range[3], dE: 0.1, steps: 2 },
  } satisfies MeasureResult;

  it("takes the pixel and stripe picks, plus YouCam when present", () => {
    const picks = picksFrom({ ...base, youcam: { corrected: { hex: "#b07b55", nearest: { id: "4", name: "Shade 4", dE: 0 } }, raw: { error: "not_recorded" } } }, range);
    expect(picks.stripe).toEqual({ shadeId: "4", hex: "#b07b56" });
    expect(picks.pixels?.shadeId).toBe("3");
    expect(picks.youcamCorrected?.shadeId).toBe("4");
    expect(picks.youcamRaw).toBeUndefined();
  });

  it("gives nothing for a refused photo", () => {
    expect(picksFrom({ ok: false, issues: [{ code: "stripe_shine", message: "" }], returned: range[1] }, range)).toEqual({});
  });
});
