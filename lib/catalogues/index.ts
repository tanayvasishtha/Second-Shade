import type { Shade } from "../match";
import fitMe2018 from "./fit-me-2018.json";

/** Stand-in until the current range is sampled with shade names and checked against bought bottles (E4). */
export const DEMO_CATALOGUE: readonly Shade[] = fitMe2018;

export const DEMO_CATALOGUE_SOURCE =
  "40 swatch colours of one drugstore range from The Pudding's makeup-shades data (May 2018), numbered light to deep.";
