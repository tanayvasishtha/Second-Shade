// YouCam API client: upload, run a task, poll until it finishes.
// Every finished task can be saved as a fixture keyed on the feature, its parameters and the
// image's SHA-256, so the app, tests and video run offline in replay mode and no unit is spent twice.
//
// Request and response shapes follow docs.perfectcorp.com (read 29 Oct 2026):
//   POST /s2s/v2.0/file {files:[{content_type,file_name,file_size}]} -> data.files[0].{file_id, requests[0].{url,method,headers}}
//   POST /s2s/v2.0/task/<feature> {src_file_id, ...} -> data.task_id
//   GET  /s2s/v2.0/task/<feature>/<task_id> -> data.task_status running | success | error

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeHex } from "../color";

export const BASE_URL = "https://yce-api-01.makeupar.com";

export type Feature = "skin-tone-analysis" | "makeup-vto";

// Units charged per successful task, from each feature's docs page on 29 Oct 2026.
export const UNITS: Record<Feature, number> = { "skin-tone-analysis": 20, "makeup-vto": 1 };

/** live: always call, save nothing. record: reuse a saved fixture, else call and save. replay: fixtures only. */
export type Mode = "live" | "record" | "replay";

export interface Image {
  bytes: Uint8Array;
  fileName: string;
  contentType: "image/jpeg" | "image/png";
}

export interface TaskRecord {
  key: string;
  feature: Feature;
  params: Record<string, unknown>;
  tag?: string;
  imageSha256: string;
  taskId: string;
  results: unknown;
  ms: number;
  units: number;
  recordedAt: string;
  /** Result image saved next to the fixture, relative to the fixtures directory. */
  resultImage?: string;
}

export interface TaskOutcome extends TaskRecord {
  source: "api" | "fixture";
}

export class YouCamError extends Error {
  constructor(
    public code: string,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "YouCamError";
  }
}

export class FixtureMissingError extends YouCamError {
  constructor(public file: string) {
    super("fixture_missing", `No recorded response at ${file}. Set YOUCAM_API_KEY and YOUCAM_MODE=record to record it.`);
    this.name = "FixtureMissingError";
  }
}

export interface ClientOptions {
  apiKey?: string;
  mode: Mode;
  fixturesDir: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  pollMs?: number;
  timeoutMs?: number;
  log?: (line: string) => void;
}

// Replies are read defensively: any field may be missing.
interface ApiReply {
  status?: number;
  error_code?: string;
  error?: string;
  data?: {
    task_id?: string;
    task_status?: string;
    results?: unknown;
    error?: string;
    error_message?: string;
    files?: { file_id?: string; requests?: { url?: string; method?: string; headers?: Record<string, string> }[] }[];
  };
}

export function modeFromEnv(env: Record<string, string | undefined> = process.env): Mode {
  const m = env.YOUCAM_MODE;
  if (m === "live" || m === "record" || m === "replay") return m;
  return env.YOUCAM_API_KEY ? "record" : "replay";
}

export function sha256(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createYouCamClient(opts: ClientOptions) {
  const baseUrl = opts.baseUrl ?? BASE_URL;
  const doFetch = opts.fetch ?? fetch;
  const pollMs = opts.pollMs ?? 1000;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const log = opts.log ?? (() => {});

  async function api(method: "GET" | "POST", pathname: string, body?: unknown): Promise<ApiReply> {
    const res = await doFetch(baseUrl + pathname, {
      method,
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: ApiReply;
    try {
      json = JSON.parse(text) as ApiReply;
    } catch {
      throw new YouCamError(`http_${res.status}`, `Non-JSON reply from ${pathname}: ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      const code = json?.error_code ?? json?.error ?? `http_${res.status}`;
      throw new YouCamError(String(code), `${method} ${pathname} failed with ${res.status}`, json);
    }
    return json;
  }

  async function upload(image: Image): Promise<string> {
    const meta = await api("POST", "/s2s/v2.0/file", {
      files: [{ content_type: image.contentType, file_name: image.fileName, file_size: image.bytes.byteLength }],
    });
    const file = meta?.data?.files?.[0];
    const req = file?.requests?.[0];
    if (!file?.file_id || !req?.url) throw new YouCamError("bad_upload_reply", "File API reply had no file_id or upload url", meta);
    const put = await doFetch(req.url, {
      method: req.method ?? "PUT",
      headers: req.headers ?? { "Content-Type": image.contentType },
      body: new Uint8Array(image.bytes),
    });
    if (!put.ok) throw new YouCamError(`upload_http_${put.status}`, "Upload to the file URL failed");
    return file.file_id;
  }

  async function runTask(feature: Feature, body: Record<string, unknown>) {
    const t0 = Date.now();
    const created = await api("POST", `/s2s/v2.0/task/${feature}`, body);
    const taskId = created?.data?.task_id;
    if (!taskId) throw new YouCamError("bad_task_reply", "Task reply had no task_id", created);
    // Polling within the retention period is required, or the task times out and still costs units.
    for (;;) {
      if (Date.now() - t0 > timeoutMs) throw new YouCamError("poll_timeout", `${feature} task ${taskId} did not finish`);
      await sleep(pollMs);
      const got = await api("GET", `/s2s/v2.0/task/${feature}/${encodeURIComponent(taskId)}`);
      const data = got.data;
      if (data?.task_status === "success") return { taskId: String(taskId), results: data.results, ms: Date.now() - t0 };
      if (data?.task_status === "error")
        throw new YouCamError(String(data.error ?? "task_error"), data.error_message ?? `${feature} task failed`, data);
    }
  }

  async function task(feature: Feature, params: Record<string, unknown>, image: Image, tag?: string): Promise<TaskOutcome> {
    const imageSha256 = sha256(image.bytes);
    const key = sha256(JSON.stringify({ feature, params, imageSha256, tag: tag ?? null })).slice(0, 24);
    const file = path.join(opts.fixturesDir, feature, `${key}.json`);

    if (opts.mode !== "live") {
      const saved = await readFile(file, "utf8").catch(() => null);
      if (saved) return { ...(JSON.parse(saved) as TaskRecord), source: "fixture" };
      if (opts.mode === "replay") throw new FixtureMissingError(file);
    }
    if (!opts.apiKey) throw new YouCamError("no_api_key", "YOUCAM_API_KEY is not set");

    const fileId = await upload(image);
    const { taskId, results, ms } = await runTask(feature, { ...params, src_file_id: fileId });
    const record: TaskRecord = {
      key,
      feature,
      params,
      ...(tag ? { tag } : {}),
      imageSha256,
      taskId,
      results,
      ms,
      units: UNITS[feature],
      recordedAt: new Date().toISOString(),
    };
    log(`${feature} ${taskId} ${ms} ms, ${UNITS[feature]} units`);

    if (opts.mode === "record") {
      await mkdir(path.dirname(file), { recursive: true });
      const url = (results as { url?: unknown } | undefined)?.url;
      if (typeof url === "string") {
        // Result URLs expire, so keep the image itself.
        const img = await doFetch(url);
        if (img.ok) {
          const name = `${key}.jpg`;
          await writeFile(path.join(path.dirname(file), name), new Uint8Array(await img.arrayBuffer()));
          record.resultImage = `${feature}/${name}`;
        }
      }
      await writeFile(file, JSON.stringify(record, null, 2) + "\n");
    }
    return { ...record, source: "api" };
  }

  return {
    mode: opts.mode,

    /** AI Facial Color Tones Analyzer. Returns the skin colour as #rrggbb. 20 units. */
    async skinTone(image: Image, options: { strictness?: "strict" | "high" | "medium" | "low" | "flexible"; tag?: string } = {}) {
      const out = await task("skin-tone-analysis", { face_angle_strictness_level: options.strictness ?? "high" }, image, options.tag);
      const hex = (out.results as { color?: { skin_color?: unknown } } | undefined)?.color?.skin_color;
      if (typeof hex !== "string") throw new YouCamError("bad_result", "Result had no color.skin_color", out.results);
      return { skinColor: normalizeHex(hex), task: out };
    },

    /** Makeup VTO with one foundation colour and smoothing off, so the render does not flatter. 1 unit. */
    async foundation(image: Image, hex: string, options: { colorIntensity?: number; coverageIntensity?: number; glowIntensity?: number } = {}) {
      const out = await task(
        "makeup-vto",
        {
          version: "1.0",
          effects: [
            { category: "skin_smooth", skinSmoothStrength: 0, skinSmoothColorIntensity: 0 },
            {
              category: "foundation",
              palettes: [
                {
                  color: normalizeHex(hex),
                  colorIntensity: options.colorIntensity ?? 60,
                  glowIntensity: options.glowIntensity ?? 10,
                  coverageIntensity: options.coverageIntensity ?? 60,
                },
              ],
            },
          ],
        },
        image,
      );
      const url = (out.results as { url?: unknown } | undefined)?.url;
      if (typeof url !== "string") throw new YouCamError("bad_result", "Result had no url", out.results);
      return { url, task: out };
    },
  };
}

export type YouCamClient = ReturnType<typeof createYouCamClient>;
