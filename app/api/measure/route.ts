// POST /api/measure: a multipart form with the photo, the two taps and the returned shade.
// The photo is processed in memory and never stored. Only colour numbers are kept.

import { DEMO_CATALOGUE } from "@/lib/catalogues";
import { measure, type YouCamReadings } from "@/lib/measure";
import { youcamFromEnv } from "@/lib/youcam/env";

export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

function share(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

const fail = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Send the photo as a form upload.");
  }

  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return fail("Add a photo.");
  if (photo.size > MAX_BYTES) return fail("That photo is over 10 MB.", 413);

  const [sx, sy, kx, ky] = ["stripeX", "stripeY", "skinX", "skinY"].map((k) => share(form.get(k)));
  if (sx === null || sy === null || kx === null || ky === null) return fail("Tap the stripe, then the bare skin next to it.");

  const returnedId = String(form.get("returnedId") ?? "");
  if (!DEMO_CATALOGUE.some((s) => s.id === returnedId)) return fail("Pick the shade you're returning.");

  const asked = form.get("youcam");
  const readings: YouCamReadings = asked === "both" || asked === "corrected" ? asked : "none";
  const reader = youcamFromEnv();

  const result = await measure({
    photo: new Uint8Array(await photo.arrayBuffer()),
    stripe: { x: sx, y: sy },
    skin: { x: kx, y: ky },
    returnedId,
    catalogue: DEMO_CATALOGUE,
    youcam: { reader, readings },
  });
  return Response.json({ ...result, youcamMode: reader.mode });
}
