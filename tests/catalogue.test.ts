import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hexToLab } from "../lib/color";
import { parseCsv, puddingLine } from "../lib/catalogue";

describe("parseCsv", () => {
  it("handles quotes, doubled quotes and commas inside quotes", () => {
    const rows = parseCsv('"a","b"\r\n"x, y","say ""hi"""\n1,2\n');
    expect(rows).toEqual([
      { a: "x, y", b: 'say "hi"' },
      { a: "1", b: "2" },
    ]);
  });
});

describe("puddingLine", () => {
  const csv = readFileSync(new URL("../research/data/shades.csv", import.meta.url), "utf8");

  it("loads the 40 Maybelline Fit Me shades, numbered light to deep", () => {
    const line = puddingLine(csv, "Maybelline", "Fit Me");
    expect(line).toHaveLength(40);
    expect(line[0].id).toBe("1");
    expect(hexToLab(line[0].hex)[0]).toBeGreaterThan(hexToLab(line[39].hex)[0]);
  });
});
