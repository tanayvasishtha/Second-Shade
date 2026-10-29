// POST {person, file}: measure one study photo with its saved taps, no YouCam units spent.
// This is the live check during the shoot: it says at once whether a photo needs a retake.

import { readFile } from "node:fs/promises";
import { DEMO_CATALOGUE } from "@/lib/catalogues";
import { devOnly } from "@/lib/dev-only";
import { measure } from "@/lib/measure";
import { picksFrom } from "@/lib/study";
import { isName, isPhoto, photoKey, photoPath, readStudy } from "@/lib/study-store";

export async function POST(request: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;
  const body = (await request.json().catch(() => null)) as { person?: unknown; file?: unknown } | null;
  if (!body || !isName(body.person) || !isPhoto(body.file)) return Response.json({ error: "Bad photo" }, { status: 400 });

  const study = await readStudy();
  const taps = study.taps[photoKey(body.person, body.file)];
  const stripeShade = study.people[body.person]?.stripeShade;
  if (!taps) return Response.json({ error: "Tap the stripe and the skin first." }, { status: 400 });
  if (!stripeShade) return Response.json({ error: "Set the bottle on the jaw for this person." }, { status: 400 });

  const photo = new Uint8Array(await readFile(photoPath(body.person, body.file)));
  const result = await measure({ photo, ...taps, returnedId: stripeShade, catalogue: DEMO_CATALOGUE });
  return Response.json({ result, picks: picksFrom(result, DEMO_CATALOGUE) });
}
