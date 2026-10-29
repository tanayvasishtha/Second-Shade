// One match, from a photo with a stripe of the returned foundation on the jaw to a recommendation.
// The shopper taps the stripe and the bare skin beside it. Coordinates are shares (0..1) of the
// photo's width and height as displayed, which browsers show already rotated by EXIF.

import sharp from "sharp";
import { hexToLab, linearToHex, type Lab } from "./color";
import { correctPixels, estimateSkin, type CorrectionFailure } from "./correction";
import { describeGap, rankShades, stepsBetween, type Gap, type Shade } from "./match";
import { samplePatch, type PatchStats, type Pixels } from "./sample";
import { FixtureMissingError, YouCamError, type Image } from "./youcam/client";

export interface Point {
  x: number;
  y: number;
}

// Provisional thresholds. E2 and E3 measure them on real people and the README reports the tuning.
export const GATE = {
  /** Side of each sampled square, as a share of the photo's shorter side. */
  patchFraction: 0.03,
  maxClippedShare: 0.2,
  /** L* standard deviation inside the patch. */
  maxStripeSd: 6,
  maxSkinSd: 8,
  /** No shade of the range within this CIEDE2000 of the skin means nothing fits. */
  noFitDE: 4,
} as const;

export type IssueCode =
  | CorrectionFailure
  | "stripe_shine"
  | "stripe_uneven"
  | "skin_shine"
  | "skin_uneven"
  | "patches_overlap"
  | "bad_photo";

export interface Issue {
  code: IssueCode;
  message: string;
}

const MESSAGES: Record<IssueCode, string> = {
  stripe_shine: "There's shine on the stripe. Blot it with a tissue, or turn a little away from the light.",
  stripe_uneven: "The stripe looks patchy or sheer. Add a second layer so no skin shows through.",
  skin_shine: "There's shine on the bare skin you tapped. Blot it, or tap a spot without shine.",
  skin_uneven: "The skin you tapped has a shadow or mark in it. Tap a smoother patch right next to the stripe.",
  stripe_clipped: "The stripe is too bright to measure. Take a step back from the light.",
  skin_clipped: "Your skin is too bright to measure. Take a step back from the light.",
  stripe_too_dark: "The photo is too dark. Face a window or a brighter light.",
  skin_too_dark: "The photo is too dark. Face a window or a brighter light.",
  gain_out_of_range: "The stripe doesn't look like the shade you picked. Check the shade, and that the stripe is the foundation you're returning.",
  patches_overlap: "Tap the stripe and the bare skin in two different places.",
  bad_photo: "We couldn't read that photo. Try a JPEG or PNG.",
};

const issue = (code: IssueCode): Issue => ({ code, message: MESSAGES[code] });

/** Anything with YouCam's skin tone call. The real client fits, and tests pass a fake. */
export interface SkinToneReader {
  skinTone(image: Image): Promise<{ skinColor: string }>;
}

export type YouCamReadings = "none" | "corrected" | "both";

export interface YouCamReading {
  hex?: string;
  nearest?: { id: string; name: string; dE: number };
  error?: string;
}

export interface MeasureInput {
  photo: Uint8Array;
  stripe: Point;
  skin: Point;
  returnedId: string;
  catalogue: readonly Shade[];
  youcam?: { reader: SkinToneReader; readings: YouCamReadings };
}

export interface PatchSummary {
  seenHex: string;
  lightnessSd: number;
  clippedShare: number;
}

export interface MeasureResult {
  ok: boolean;
  issues: Issue[];
  photo?: { width: number; height: number };
  returned: Shade;
  stripe?: PatchSummary & { knownHex: string };
  skin?: PatchSummary;
  estimate?: { hex: string; lab: Lab; gains: readonly [number, number, number] };
  recommended?: { shade: Shade; dE: number; steps: number };
  alternatives?: { shade: Shade; dE: number }[];
  /** How the skin differs from the returned shade. */
  gap?: Gap;
  decision?: "exchange" | "no_fit" | "same_shade";
  youcam?: { raw?: YouCamReading; corrected?: YouCamReading };
}

function square(p: Point, px: Pixels) {
  const side = Math.max(8, Math.round(Math.min(px.width, px.height) * GATE.patchFraction));
  return { x: p.x * px.width - side / 2, y: p.y * px.height - side / 2, w: side, h: side, side };
}

const summary = (s: PatchStats): PatchSummary => ({ seenHex: linearToHex(s.mean), lightnessSd: s.lightnessSd, clippedShare: s.clippedShare });

/** Rotated by EXIF, inside 1080 px, sRGB, as raw pixels plus the JPEG we would send to YouCam. */
async function preparePhoto(photo: Uint8Array) {
  const base = sharp(photo).rotate().resize({ width: 1080, height: 1080, fit: "inside", withoutEnlargement: true }).toColourspace("srgb");
  const { data, info } = await base.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const jpeg = await base.clone().jpeg({ quality: 95 }).toBuffer();
  const pixels: Pixels = { data, width: info.width, height: info.height, channels: 3 };
  return { pixels, jpeg };
}

async function readYouCam(reader: SkinToneReader, image: Image, catalogue: readonly Shade[]): Promise<YouCamReading> {
  try {
    const { skinColor } = await reader.skinTone(image);
    const top = rankShades(hexToLab(skinColor), catalogue)[0];
    return { hex: skinColor, nearest: { id: top.shade.id, name: top.shade.name, dE: top.dE } };
  } catch (e) {
    if (e instanceof FixtureMissingError) return { error: "not_recorded" };
    if (e instanceof YouCamError) return { error: e.code };
    throw e;
  }
}

export async function measure(input: MeasureInput): Promise<MeasureResult> {
  const returned = input.catalogue.find((s) => s.id === input.returnedId);
  if (!returned) throw new Error(`Unknown shade id: ${input.returnedId}`);

  let prepared: Awaited<ReturnType<typeof preparePhoto>>;
  try {
    prepared = await preparePhoto(input.photo);
  } catch {
    return { ok: false, issues: [issue("bad_photo")], returned };
  }
  const { pixels, jpeg } = prepared;
  const photo = { width: pixels.width, height: pixels.height };

  const stripeBox = square(input.stripe, pixels);
  const skinBox = square(input.skin, pixels);
  if (Math.hypot(stripeBox.x - skinBox.x, stripeBox.y - skinBox.y) < stripeBox.side)
    return { ok: false, issues: [issue("patches_overlap")], photo, returned };

  const stripeStats = samplePatch(pixels, stripeBox);
  const skinStats = samplePatch(pixels, skinBox);
  const stripe = { ...summary(stripeStats), knownHex: returned.hex };
  const skin = summary(skinStats);

  const issues: Issue[] = [];
  if (stripeStats.clippedShare > GATE.maxClippedShare) issues.push(issue("stripe_shine"));
  else if (stripeStats.lightnessSd > GATE.maxStripeSd) issues.push(issue("stripe_uneven"));
  if (skinStats.clippedShare > GATE.maxClippedShare) issues.push(issue("skin_shine"));
  else if (skinStats.lightnessSd > GATE.maxSkinSd) issues.push(issue("skin_uneven"));

  const est = estimateSkin({ skinSeen: skinStats.mean, stripeSeen: stripeStats.mean, stripeKnownHex: returned.hex });
  if (!est.ok) issues.push(issue(est.reason));
  if (issues.length || !est.ok) return { ok: false, issues, photo, returned, stripe, skin };

  const ranked = rankShades(est.skinLab, input.catalogue);
  const top = ranked[0];
  const decision = top.dE > GATE.noFitDE ? "no_fit" : top.shade.id === returned.id ? "same_shade" : "exchange";

  const result: MeasureResult = {
    ok: true,
    issues,
    photo,
    returned,
    stripe,
    skin,
    estimate: { hex: est.skinHex, lab: est.skinLab, gains: est.gains },
    recommended: { shade: top.shade, dE: top.dE, steps: stepsBetween(returned.id, top.shade.id, input.catalogue) },
    alternatives: ranked.slice(1, 4).map((r) => ({ shade: r.shade, dE: r.dE })),
    gap: describeGap(hexToLab(returned.hex), est.skinLab),
    decision,
  };

  const yc = input.youcam;
  if (yc && yc.readings !== "none") {
    result.youcam = {};
    if (yc.readings === "both")
      result.youcam.raw = await readYouCam(yc.reader, { bytes: jpeg, fileName: "raw.jpg", contentType: "image/jpeg" }, input.catalogue);
    const corrected = await sharp(correctPixels(pixels.data, 3, est.gains), { raw: { width: pixels.width, height: pixels.height, channels: 3 } })
      .jpeg({ quality: 95 })
      .toBuffer();
    result.youcam.corrected = await readYouCam(yc.reader, { bytes: corrected, fileName: "corrected.jpg", contentType: "image/jpeg" }, input.catalogue);
  }
  return result;
}
