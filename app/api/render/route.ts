// POST /api/render: the photo plus up to two shade ids. YouCam makeup VTO puts each shade on the
// shopper's own face, with smoothing off. 1 unit per render, reused from fixtures when recorded.

import { DEMO_CATALOGUE } from "@/lib/catalogues";
import { preparePhoto } from "@/lib/measure";
import { FixtureMissingError, YouCamError } from "@/lib/youcam/client";
import { youcamFromEnv } from "@/lib/youcam/env";

export const maxDuration = 60;

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File) || photo.size === 0 || photo.size > 10 * 1024 * 1024) return Response.json({ error: "Add a photo under 10 MB." }, { status: 400 });

  const ids = String(form?.get("shades") ?? "").split(",").filter(Boolean).slice(0, 2);
  const shades = ids.map((id) => DEMO_CATALOGUE.find((s) => s.id === id));
  if (!shades.length || shades.some((s) => !s)) return Response.json({ error: "Pick one or two shades." }, { status: 400 });

  let jpeg: Buffer;
  try {
    ({ jpeg } = await preparePhoto(new Uint8Array(await photo.arrayBuffer())));
  } catch {
    return Response.json({ error: "We couldn't read that photo. Try a JPEG or PNG." }, { status: 400 });
  }

  const client = youcamFromEnv();
  const renders = await Promise.all(
    shades.map(async (shade) => {
      const id = shade!.id;
      try {
        const out = await client.foundation({ bytes: jpeg, fileName: "face.jpg", contentType: "image/jpeg" }, shade!.hex);
        const src = out.task.resultImage ? `/api/fixture-image?path=${encodeURIComponent(out.task.resultImage)}` : out.url;
        return { id, src, taskId: out.task.taskId, ms: out.task.ms, source: out.task.source };
      } catch (e) {
        if (e instanceof FixtureMissingError) return { id, error: "not_recorded" };
        if (e instanceof YouCamError) return { id, error: e.code };
        throw e;
      }
    }),
  );
  return Response.json({ renders, youcamMode: client.mode });
}
