import path from "node:path";
import { createYouCamClient, modeFromEnv } from "./client";

/** The client the server routes use, configured from the environment. YOUCAM_BASE_URL points it at a mock for tests. */
export function youcamFromEnv(root = process.cwd(), log?: (line: string) => void) {
  return createYouCamClient({
    apiKey: process.env.YOUCAM_API_KEY,
    mode: modeFromEnv(),
    baseUrl: process.env.YOUCAM_BASE_URL || undefined,
    fixturesDir: path.join(root, "fixtures", "youcam"),
    log,
  });
}
