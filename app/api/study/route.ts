// GET: the study photos, taps and people. POST: save taps for a photo, or a person's details.

import { devOnly } from "@/lib/dev-only";
import { isName, isPhoto, listPhotos, photoKey, readStudy, writeStudy, type PersonInfo } from "@/lib/study-store";

export async function GET() {
  const blocked = devOnly();
  if (blocked) return blocked;
  const [photos, study] = await Promise.all([listPhotos(), readStudy()]);
  return Response.json({ photos, ...study });
}

const isShare = (v: unknown) => typeof v === "number" && v >= 0 && v <= 1;
const isPoint = (p: unknown): p is { x: number; y: number } =>
  typeof p === "object" && p !== null && isShare((p as { x: unknown }).x) && isShare((p as { y: unknown }).y);

export async function POST(request: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isName(body.person)) return Response.json({ error: "Bad person" }, { status: 400 });
  const study = await readStudy();

  if (body.type === "taps") {
    if (!isPhoto(body.file) || !isPoint(body.stripe) || !isPoint(body.skin)) return Response.json({ error: "Bad taps" }, { status: 400 });
    study.taps[photoKey(body.person, body.file)] = { stripe: body.stripe, skin: body.skin };
  } else if (body.type === "person") {
    const info = (body.info ?? {}) as Record<string, unknown>;
    const clean: PersonInfo = {};
    for (const k of ["stripeShade", "trueShade", "tone"] as const) if (typeof info[k] === "string" && info[k]) clean[k] = info[k] as string;
    study.people[body.person] = clean;
  } else return Response.json({ error: "Unknown update" }, { status: 400 });

  await writeStudy(study);
  return Response.json({ ok: true });
}
