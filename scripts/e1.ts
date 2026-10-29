// E1 and E2 from the study photos tapped in /study.
// E1: does each method pick the same shade when only the light changes?
// E2: is the pick the person's true shade?
//
// Usage: npm run e1 -- [--youcam none|corrected|both] [--dry]
//   Our own measurement costs nothing. YouCam costs 20 units per reading the first time:
//   corrected is one reading per photo, both is two. Saved readings are reused.
//
// Person folders should be codes (P1, P2...), never names: the tables go in the README.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEMO_CATALOGUE } from "../lib/catalogues";
import { measure, type YouCamReadings } from "../lib/measure";
import { METHOD_LABELS, METHODS, picksFrom, summarise, type MethodSummary, type Observation } from "../lib/study";
import { listPhotos, photoKey, photoPath, readStudy } from "../lib/study-store";
import { createYouCamClient, modeFromEnv, UNITS } from "../lib/youcam/client";

const ROOT = path.resolve(import.meta.dirname, "..");

try {
  process.loadEnvFile(path.join(ROOT, ".env.local"));
} catch {
  // No .env.local: replay mode unless the environment has a key.
}

const fmt = (n: number | null, digits = 2) => (n === null ? "n/a" : n.toFixed(digits));
const frac = (k: number, n: number) => (n ? `${k} of ${n}` : "n/a");

function summaryTable(rows: MethodSummary[]) {
  return [
    "| Method | Same shade under every light | Median spread across lights (ΔE00) | Exact | Within one shade | Median ΔE00 to true shade |",
    "|---|---|---|---|---|---|",
    ...rows
      .filter((r) => r.people || r.photos)
      .map(
        (r) =>
          `| ${METHOD_LABELS[r.method]} | ${frac(r.stableAcrossLights, r.people)} people | ${fmt(r.medianSpread)} | ${frac(r.exact, r.photos)} | ${frac(r.withinOne, r.photos)} | ${fmt(r.medianToTrue)} |`,
      ),
  ];
}

async function main() {
  const args = process.argv.slice(2);
  const asked = args[args.indexOf("--youcam") + 1];
  const readings: YouCamReadings = args.includes("--youcam") && (asked === "corrected" || asked === "both") ? asked : "none";
  const dry = args.includes("--dry");

  const [photos, study] = await Promise.all([listPhotos(ROOT), readStudy(ROOT)]);
  const ready = photos.filter((p) => study.taps[photoKey(p.person, p.file)] && study.people[p.person]?.stripeShade);
  const perPhoto = readings === "both" ? 2 : readings === "corrected" ? 1 : 0;
  console.log(
    `E1/E2: ${ready.length} of ${photos.length} photos tapped and ready. YouCam: ${readings}, up to ${ready.length * perPhoto * UNITS["skin-tone-analysis"]} units if nothing is recorded yet.`,
  );
  if (dry || !ready.length) return;

  const client = createYouCamClient({
    apiKey: process.env.YOUCAM_API_KEY,
    mode: modeFromEnv(),
    fixturesDir: path.join(ROOT, "fixtures", "youcam"),
    log: (line) => console.log(`  ${line}`),
  });

  const obs: Observation[] = [];
  const refused: string[] = [];
  const youcamErrors: string[] = [];
  for (const p of ready) {
    const info = study.people[p.person];
    const result = await measure({
      photo: new Uint8Array(await readFile(photoPath(p.person, p.file, ROOT))),
      ...study.taps[photoKey(p.person, p.file)],
      returnedId: info.stripeShade!,
      catalogue: DEMO_CATALOGUE,
      youcam: perPhoto ? { reader: client, readings } : undefined,
    });
    if (!result.ok) refused.push(`${p.person} ${p.light}: ${result.issues.map((i) => i.code).join(", ")}`);
    for (const [which, r] of Object.entries(result.youcam ?? {})) if (r?.error) youcamErrors.push(`${p.person} ${p.light} ${which}: ${r.error}`);
    obs.push({ person: p.person, light: p.light, picks: picksFrom(result, DEMO_CATALOGUE) });
  }

  const truth = Object.fromEntries(Object.entries(study.people).map(([k, v]) => [k, v.trueShade]));
  const rows = summarise(obs, truth, DEMO_CATALOGUE);
  const tones = [...new Set(Object.values(study.people).map((p) => p.tone).filter(Boolean))] as string[];
  const name = (id?: string) => (id ? `Shade ${id}` : "");

  const lines = [
    "# E1 and E2: plain selfie, stripe correction and YouCam, across lights",
    "",
    `Run ${new Date().toISOString()}. ${ready.length} photos of ${new Set(ready.map((p) => p.person)).size} people, ${refused.length} refused by the photo check. Shades are the demo catalogue, numbered light to deep.`,
    "",
    ...summaryTable(rows),
    "",
    ...tones.flatMap((tone) => {
      const people = new Set(Object.entries(study.people).filter(([, v]) => v.tone === tone).map(([k]) => k));
      return [`## ${tone[0].toUpperCase()}${tone.slice(1)} skin`, "", ...summaryTable(summarise(obs.filter((o) => people.has(o.person)), truth, DEMO_CATALOGUE)), ""];
    }),
    "## Every photo",
    "",
    `| Person | Tone | Light | ${METHODS.map((m) => METHOD_LABELS[m]).join(" | ")} | True shade |`,
    `|---|---|---|${METHODS.map(() => "---").join("|")}|---|`,
    ...obs.map((o) => {
      const info = study.people[o.person];
      const cells = METHODS.map((m) => {
        const pick = o.picks[m];
        return pick ? `${name(pick.shadeId)}${pick.shadeId === info.trueShade ? " ✓" : ""}` : "";
      });
      return `| ${o.person} | ${info.tone ?? ""} | ${o.light} | ${cells.join(" | ")} | ${name(info.trueShade)} |`;
    }),
    "",
    ...(refused.length ? ["## Refused by the photo check", "", ...refused.map((r) => `- ${r}`), ""] : []),
    ...(youcamErrors.length ? ["## YouCam readings not available", "", ...youcamErrors.map((r) => `- ${r}`), ""] : []),
  ];

  const outDir = path.join(ROOT, "research", "results");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "e1.md"), lines.join("\n"));
  await writeFile(path.join(outDir, "e1.json"), JSON.stringify({ rows, obs, refused, youcamErrors }, null, 2) + "\n");
  console.log("\n" + lines.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
