// Shade catalogues. The Pudding's makeup-shades data (MIT, swatch colours sampled from brand
// images in May 2018) has colours but no shade names, so its shades are numbered light to deep.

import { normalizeHex } from "./color";
import { lightToDeep, type Shade } from "./match";

/** Minimal CSV parser: quoted fields, doubled quotes, commas inside quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

export function puddingLine(csvText: string, brand: string, product: string): Shade[] {
  const shades = parseCsv(csvText)
    .filter((r) => r.brand === brand && r.product === product)
    .map((r, i) => ({ id: `row${i}`, name: "", hex: normalizeHex(r.hex) }));
  // Neutral names, so no brand name reaches a screenshot or the video.
  return lightToDeep(shades).map((s, i) => ({ ...s, id: String(i + 1), name: `Shade ${i + 1}` }));
}
