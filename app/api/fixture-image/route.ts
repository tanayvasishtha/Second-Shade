// GET ?path=makeup-vto/<key>.jpg: a try-on render saved in record mode, so replay works after the YouCam URL expires.

import { readFile } from "node:fs/promises";
import path from "node:path";

const SAFE = /^makeup-vto\/[a-f0-9]{24}\.jpg$/;

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams.get("path") ?? "";
  if (!SAFE.test(p)) return new Response("Bad path", { status: 400 });
  const bytes = await readFile(path.join(process.cwd(), "fixtures", "youcam", p)).catch(() => null);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" } });
}
