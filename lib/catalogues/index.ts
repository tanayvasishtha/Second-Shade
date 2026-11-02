import type { Shade } from "../match";
import storeRange from "./store-range.json";

/**
 * The demo store's range: 18 shades of a drugstore liquid foundation sold in India, with the swatch
 * colours the brand's own Indian website publishes for each shade (read 2 Nov 2026). These are the
 * brand's display colours, not lab measurements, and were not checked against bottles.
 * Shades go by number only, so no brand name reaches a screenshot or the video.
 */
export const DEMO_CATALOGUE: readonly Shade[] = storeRange;

export const DEMO_CATALOGUE_SOURCE = "18 shades with the swatch colours their brand publishes, shown by shade number.";
