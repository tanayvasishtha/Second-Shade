// E0: does YouCam's skin tone reading move when only the light changes?
// One person, no makeup, same pose and distance, one photo per light (window, warm bulb, tube light).
// The face must fill more than 60% of the photo's width, or YouCam rejects it.
//
// Usage: npm run e0 -- <photo folder> [--repeat] [--dry]
//   --repeat  sends the first photo a second time to measure YouCam's own noise (20 more units)
//   --dry     prints the plan and unit cost without calling anything
//
// Each photo costs 20 units. Readings are saved as fixtures, so a rerun costs nothing.

import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ciede2000, hexToLab, type Lab } from "../lib/color";
import { puddingLine } from "../lib/catalogue";
import { rankShades } from "../lib/match";
import { createYouCamClient, FixtureMissingError, modeFromEnv, UNITS, YouCamError, type Image } from "../lib/youcam/client";

const NEIGHBOUR_GAP = 2.31; // median CIEDE2000 between neighbouring shades, research/shade_spacing.py
const PHONE_ERROR = 6.99; // uncorrected phone photo error, Kang, arXiv 2512.21988 (preprint)
const ROOT = path.resolve(import.meta.dirname, "..");

try {
  process.loadEnvFile(path.join(ROOT, ".env.local"));
} catch {
  // No .env.local: replay mode unless the environment has a key.
}

interface Reading {
  label: string;
  file: string;
  hex?: string;
  lab?: Lab;
  fitMe?: string;
  error?: string;
  source?: string;
  ms?: number;
  colourProfile: boolean;
}

async function prepare(file: string): Promise<{ image: Image; colourProfile: boolean }> {
  const meta = await sharp(file).metadata();
  // Rotate by EXIF, fit inside 1080 px (YouCam resizes anything larger anyway), and convert to sRGB,
  // which also turns Display P3 phone photos into the colour space our maths assumes.
  const bytes = await sharp(file)
    .rotate()
    .resize({ width: 1080, height: 1080, fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .jpeg({ quality: 95 })
    .toBuffer();
  return {
    image: { bytes, fileName: path.parse(file).name + ".jpg", contentType: "image/jpeg" },
    colourProfile: Boolean(meta.icc),
  };
}

function maxPairwise(labs: Lab[]): number {
  let max = 0;
  for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) max = Math.max(max, ciede2000(labs[i], labs[j]));
  return max;
}

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--"));
  const repeat = args.includes("--repeat");
  const dry = args.includes("--dry");
  if (!dir) {
    console.error("Usage: npm run e0 -- <photo folder> [--repeat] [--dry]");
    process.exit(1);
  }

  const files = (await readdir(dir)).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
  if (files.length < 2) {
    console.error(`Need at least two photos (one per light) in ${dir}. HEIC is not read: export JPEG.`);
    process.exit(1);
  }

  const mode = modeFromEnv();
  const calls = files.length + (repeat ? 1 : 0);
  console.log(`E0: ${files.length} photos, mode ${mode}, up to ${calls * UNITS["skin-tone-analysis"]} units if nothing is recorded yet`);
  if (dry) {
    for (const f of files) console.log(`  ${path.parse(f).name}`);
    return;
  }

  const client = createYouCamClient({
    apiKey: process.env.YOUCAM_API_KEY,
    mode,
    fixturesDir: path.join(ROOT, "fixtures", "youcam"),
    log: (line) => console.log(`  ${line}`),
  });
  const fitMe = puddingLine(await readFile(path.join(ROOT, "research", "data", "shades.csv"), "utf8"), "Maybelline", "Fit Me");

  const readings: Reading[] = [];
  const missing: string[] = [];
  for (const f of files) {
    const file = path.join(dir, f);
    const { image, colourProfile } = await prepare(file);
    const r: Reading = { label: path.parse(f).name, file: f, colourProfile };
    try {
      const out = await client.skinTone(image);
      r.hex = out.skinColor;
      r.lab = hexToLab(out.skinColor);
      r.fitMe = rankShades(r.lab, fitMe)[0].shade.id;
      r.source = out.task.source;
      r.ms = out.task.ms;
    } catch (e) {
      if (e instanceof FixtureMissingError) missing.push(f);
      else if (e instanceof YouCamError) r.error = e.code;
      else throw e;
    }
    readings.push(r);
  }

  if (missing.length) {
    console.error(`\nNo recorded reading for: ${missing.join(", ")}.`);
    console.error(`Add YOUCAM_API_KEY to .env.local to record them (${missing.length * UNITS["skin-tone-analysis"]} units).`);
    process.exit(2);
  }

  let repeatNoise: number | undefined;
  const first = readings.find((r) => r.lab);
  if (repeat && first?.lab) {
    const { image } = await prepare(path.join(dir, first.file));
    const again = await client.skinTone(image, { tag: "repeat-1" });
    repeatNoise = ciede2000(first.lab, hexToLab(again.skinColor));
  }

  const ok = readings.filter((r): r is Reading & { lab: Lab; hex: string; fitMe: string } => Boolean(r.lab));
  const spread = maxPairwise(ok.map((r) => r.lab));
  const picks = new Set(ok.map((r) => r.fitMe));

  let verdict: string;
  if (ok.length < 2) verdict = "Not enough readings to compare. Fix the rejected photos and run again.";
  else if (repeatNoise !== undefined && repeatNoise >= spread / 2)
    verdict = `Inconclusive: YouCam's own repeat noise (${repeatNoise.toFixed(2)}) is at least half the change across lights. Retake with a steadier setup.`;
  else if (spread < NEIGHBOUR_GAP && picks.size === 1)
    verdict = `Stable: the reading moved ${spread.toFixed(2)} across lights, under the ${NEIGHBOUR_GAP} gap between neighbouring shades, and every light picks the same shade. Apply the fallback in IDEA.md: drop the stripe.`;
  else
    verdict = `Moves: the reading changed by up to ${spread.toFixed(2)} across lights (${(spread / NEIGHBOUR_GAP).toFixed(1)} times the ${NEIGHBOUR_GAP} gap between neighbouring shades) and picked ${picks.size} different Fit Me shades. The stripe has room to help. Go to E1.`;

  const lines = [
    "# E0: YouCam skin tone across lights",
    "",
    `Run ${new Date().toISOString()}. ${ok.length} of ${readings.length} photos read. Positions are in Maybelline Fit Me, 40 shades from The Pudding's 2018 swatch data, numbered light to deep.`,
    "",
    "| Light | YouCam skin_color | L* | a* | b* | Nearest Fit Me | dE00 to first | Embedded colour profile |",
    "|---|---|---|---|---|---|---|---|",
    ...readings.map((r) =>
      r.lab
        ? `| ${r.label} | ${r.hex} | ${r.lab[0].toFixed(1)} | ${r.lab[1].toFixed(1)} | ${r.lab[2].toFixed(1)} | #${r.fitMe} of 40 | ${ciede2000(ok[0].lab, r.lab).toFixed(2)} | ${r.colourProfile ? "yes" : "no"} |`
        : `| ${r.label} | rejected: ${r.error} | | | | | | ${r.colourProfile ? "yes" : "no"} |`,
    ),
    "",
    `- Largest difference between two lights: **${spread.toFixed(2)}** CIEDE2000. Neighbouring shades: ${NEIGHBOUR_GAP}. Uncorrected phone error in the literature: ${PHONE_ERROR}.`,
    ...(repeatNoise !== undefined ? [`- Same photo sent twice: ${repeatNoise.toFixed(2)} CIEDE2000.`] : []),
    `- Verdict: ${verdict}`,
    "",
  ];
  const outDir = path.join(ROOT, "research", "results");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "e0.md"), lines.join("\n"));
  await writeFile(path.join(outDir, "e0.json"), JSON.stringify({ readings, spread, repeatNoise, picks: [...picks], verdict }, null, 2) + "\n");
  console.log("\n" + lines.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
