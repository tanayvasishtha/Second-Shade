import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createYouCamClient, FixtureMissingError, YouCamError, type Image } from "../lib/youcam/client";

const image: Image = { bytes: new Uint8Array([1, 2, 3, 4]), fileName: "face.jpg", contentType: "image/jpeg" };

type Reply = { status?: number; json?: unknown; body?: Uint8Array };

/** A fake fetch that answers in order and records what was asked. */
function fakeFetch(replies: Reply[]) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const f = async (url: string | URL | Request, init?: RequestInit) => {
    const reply = replies.shift();
    if (!reply) throw new Error(`Unexpected request to ${url}`);
    calls.push({ url: String(url), method: init?.method ?? "GET", body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body });
    const status = reply.status ?? 200;
    const payload = reply.body ?? new TextEncoder().encode(JSON.stringify(reply.json ?? {}));
    return new Response(new Uint8Array(payload), { status });
  };
  return { fetch: f as typeof fetch, calls };
}

const uploadReplies = (): Reply[] => [
  { json: { status: 200, data: { files: [{ file_id: "file-1", requests: [{ url: "https://upload.test/put", method: "PUT", headers: { "Content-Type": "image/jpeg" } }] }] } } },
  { json: {} },
];

describe("youcam client", () => {
  it("uploads, polls to success, saves a fixture, then replays it with no network", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "youcam-"));
    const net = fakeFetch([
      ...uploadReplies(),
      { json: { status: 200, data: { task_id: "task-9" } } },
      { json: { status: 200, data: { task_status: "running" } } },
      { json: { status: 200, data: { task_status: "success", results: { color: { skin_color: "#B9947C" } } } } },
    ]);
    const live = createYouCamClient({ apiKey: "k", mode: "record", fixturesDir: dir, fetch: net.fetch, pollMs: 0 });
    const first = await live.skinTone(image);
    expect(first.skinColor).toBe("#b9947c");
    expect(first.task.source).toBe("api");
    expect(net.calls.map((c) => c.method)).toEqual(["POST", "PUT", "POST", "GET", "GET"]);
    expect(net.calls[2].body).toEqual({ face_angle_strictness_level: "high", src_file_id: "file-1" });
    expect(await readdir(path.join(dir, "skin-tone-analysis"))).toHaveLength(1);

    const offline = createYouCamClient({ mode: "replay", fixturesDir: dir, fetch: fakeFetch([]).fetch });
    const again = await offline.skinTone(image);
    expect(again.skinColor).toBe("#b9947c");
    expect(again.task.source).toBe("fixture");
    expect(again.task.taskId).toBe("task-9");
  });

  it("reuses a fixture in record mode instead of spending units again", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "youcam-"));
    const net = fakeFetch([
      ...uploadReplies(),
      { json: { data: { task_id: "t" } } },
      { json: { data: { task_status: "success", results: { color: { skin_color: "#aa8866" } } } } },
    ]);
    const client = createYouCamClient({ apiKey: "k", mode: "record", fixturesDir: dir, fetch: net.fetch, pollMs: 0 });
    await client.skinTone(image);
    const second = await client.skinTone(image);
    expect(second.task.source).toBe("fixture");
    expect(net.calls).toHaveLength(4);
  });

  it("treats a tag as a separate call, for measuring repeat noise", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "youcam-"));
    const success = (hex: string): Reply[] => [
      ...uploadReplies(),
      { json: { data: { task_id: "t" } } },
      { json: { data: { task_status: "success", results: { color: { skin_color: hex } } } } },
    ];
    const client = createYouCamClient({ apiKey: "k", mode: "record", fixturesDir: dir, fetch: fakeFetch([...success("#aa8866"), ...success("#ab8967")]).fetch, pollMs: 0 });
    const a = await client.skinTone(image);
    const b = await client.skinTone(image, { tag: "repeat-1" });
    expect([a.skinColor, b.skinColor]).toEqual(["#aa8866", "#ab8967"]);
  });

  it("fails clearly in replay mode when nothing was recorded", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "youcam-"));
    const client = createYouCamClient({ mode: "replay", fixturesDir: dir });
    await expect(client.skinTone(image)).rejects.toBeInstanceOf(FixtureMissingError);
  });

  it("surfaces a task error with its code", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "youcam-"));
    const net = fakeFetch([
      ...uploadReplies(),
      { json: { data: { task_id: "t" } } },
      { json: { data: { task_status: "error", error: "error_face_angle_upward", error_message: "tilt down" } } },
    ]);
    const client = createYouCamClient({ apiKey: "k", mode: "live", fixturesDir: dir, fetch: net.fetch, pollMs: 0 });
    const err = await client.skinTone(image).catch((e) => e);
    expect(err).toBeInstanceOf(YouCamError);
    expect(err.code).toBe("error_face_angle_upward");
  });

  it("sends a foundation effect with smoothing off and saves the rendered image", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "youcam-"));
    const net = fakeFetch([
      ...uploadReplies(),
      { json: { data: { task_id: "t" } } },
      { json: { data: { task_status: "success", results: { url: "https://result.test/out.jpg" } } } },
      { body: new Uint8Array([9, 9, 9]) },
    ]);
    const client = createYouCamClient({ apiKey: "k", mode: "record", fixturesDir: dir, fetch: net.fetch, pollMs: 0 });
    const out = await client.foundation(image, "#C08A62");
    const effects = (net.calls[2].body as { effects: { category: string; palettes?: { color: string }[] }[] }).effects;
    expect(effects[0]).toMatchObject({ category: "skin_smooth", skinSmoothStrength: 0 });
    expect(effects[1].palettes?.[0].color).toBe("#c08a62");
    expect(out.task.resultImage).toMatch(/^makeup-vto\/.+\.jpg$/);
  });
});
