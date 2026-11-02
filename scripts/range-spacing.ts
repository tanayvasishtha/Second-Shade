// Prints the demo range light to deep and how far apart neighbouring shades are.
// Usage: npx tsx scripts/range-spacing.ts
import { ciede2000, hexToLab } from "../lib/color";
import { DEMO_CATALOGUE } from "../lib/catalogues";
import { lightToDeep } from "../lib/match";
import { median } from "../lib/study";

const sorted = lightToDeep(DEMO_CATALOGUE);
const nn = sorted.map((s) => Math.min(...sorted.filter((o) => o !== s).map((o) => ciede2000(hexToLab(s.hex), hexToLab(o.hex)))));
console.log(sorted.map((s) => `${s.id} L*${hexToLab(s.hex)[0].toFixed(0)}`).join(", "));
console.log(`Nearest-neighbour CIEDE2000: median ${median(nn)!.toFixed(2)}, min ${Math.min(...nn).toFixed(2)}, max ${Math.max(...nn).toFixed(2)}`);
