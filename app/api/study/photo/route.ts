// GET ?person=P1&file=window.jpg: one study photo, in development only.

import { readFile } from "node:fs/promises";
import { devOnly } from "@/lib/dev-only";
import { photoPath } from "@/lib/study-store";

export async function GET(request: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;
  const q = new URL(request.url).searchParams;
  let file: string;
  try {
    file = photoPath(q.get("person") ?? "", q.get("file") ?? "");
  } catch {
    return new Response("Bad name", { status: 400 });
  }
  const bytes = await readFile(file).catch(() => null);
  if (!bytes) return new Response("Not found", { status: 404 });
  const type = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": type, "Cache-Control": "no-store" } });
}
