// Writes the stand-in demo catalogue from The Pudding's shade data, so the app bundles it as JSON.
// Usage: npx tsx scripts/build-catalogue.ts

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { puddingLine } from "../lib/catalogue";

async function main() {
  const root = path.resolve(import.meta.dirname, "..");
  const csv = await readFile(path.join(root, "research", "data", "shades.csv"), "utf8");
  const line = puddingLine(csv, "Maybelline", "Fit Me");
  await writeFile(path.join(root, "lib", "catalogues", "fit-me-2018.json"), JSON.stringify(line, null, 2) + "\n");
  console.log(`Wrote ${line.length} shades`);
}

main();
