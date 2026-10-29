// A stand-in for the YouCam API on localhost, for testing the app without spending units.
// It follows the documented upload, task and poll shapes. Try-on "renders" are the uploaded photo
// with a translucent layer of the foundation colour; skin tone returns the photo's centre pixel.
//
// Usage: npx tsx scripts/mock-youcam.ts   then set YOUCAM_BASE_URL=http://localhost:3200,
// YOUCAM_MODE=live and any YOUCAM_API_KEY in .env.development.local, and restart the app.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import sharp from "sharp";
import { hexToRgb8, rgb8ToHex } from "../lib/color";

const PORT = Number(process.env.MOCK_PORT ?? 3200);
const BASE = `http://localhost:${PORT}`;
const files = new Map<string, Buffer>();
const tasks = new Map<string, { feature: string; body: Record<string, unknown>; polls: number }>();
let n = 0;

const read = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });

const json = (res: ServerResponse, body: unknown, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

async function render(task: { body: Record<string, unknown> }) {
  const bytes = files.get(String(task.body.src_file_id));
  if (!bytes) throw new Error("unknown file");
  const effects = (task.body.effects ?? []) as { category: string; palettes?: { color: string }[] }[];
  const hex = effects.find((e) => e.category === "foundation")?.palettes?.[0]?.color ?? "#c0a080";
  const [r, g, b] = hexToRgb8(hex);
  const { width = 1, height = 1 } = await sharp(bytes).metadata();
  return sharp(bytes)
    .composite([{ input: { create: { width, height, channels: 4, background: { r, g, b, alpha: 0.45 } } } }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", BASE);
  const parts = url.pathname.split("/").filter(Boolean);
  try {
    if (req.method === "POST" && url.pathname === "/s2s/v2.0/file") {
      const id = `file-${++n}`;
      return json(res, { status: 200, data: { files: [{ file_id: id, requests: [{ url: `${BASE}/upload/${id}`, method: "PUT", headers: { "Content-Type": "image/jpeg" } }] }] } });
    }
    if (req.method === "PUT" && parts[0] === "upload") {
      files.set(parts[1], await read(req));
      res.writeHead(200);
      return res.end();
    }
    if (parts[0] === "s2s" && parts[2] === "task") {
      const feature = parts[3];
      if (req.method === "POST") {
        const id = `mock-task-${++n}`;
        tasks.set(id, { feature, body: JSON.parse((await read(req)).toString() || "{}"), polls: 0 });
        return json(res, { status: 200, data: { task_id: id } });
      }
      const task = tasks.get(parts[4]);
      if (!task) return json(res, { status: 400, error_code: "InvalidTaskId" }, 400);
      if (task.polls++ < 1) return json(res, { status: 200, data: { task_status: "running" } });
      if (feature === "makeup-vto") return json(res, { status: 200, data: { task_status: "success", results: { url: `${BASE}/result/${parts[4]}` } } });
      if (feature === "skin-tone-analysis") {
        const img = sharp(files.get(String(task.body.src_file_id)));
        const { width = 1, height = 1 } = await img.metadata();
        const px = await img.extract({ left: width >> 1, top: height >> 1, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
        return json(res, { status: 200, data: { task_status: "success", results: { color: { skin_color: rgb8ToHex([px[0], px[1], px[2]]) } } } });
      }
    }
    if (req.method === "GET" && parts[0] === "result") {
      const task = tasks.get(parts[1]);
      if (!task) return json(res, { error: "not found" }, 404);
      res.writeHead(200, { "Content-Type": "image/jpeg", "Access-Control-Allow-Origin": "*" });
      return res.end(await render(task));
    }
    json(res, { error: "not mocked" }, 404);
  } catch (e) {
    json(res, { error: String(e) }, 500);
  }
}).listen(PORT, () => console.log(`Mock YouCam on ${BASE}`));
