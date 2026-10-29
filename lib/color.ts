// Colour maths for shade matching.
// sRGB and linear RGB channels are 0..1 unless a name says 8-bit. White point D65.

export type Vec3 = readonly [number, number, number];
export type Lab = Vec3;

export function hexToRgb8(hex: string): Vec3 {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a #RRGGBB colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgb8ToHex(rgb: Vec3): string {
  const c = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

export function normalizeHex(hex: string): string {
  return rgb8ToHex(hexToRgb8(hex));
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

export function rgb8ToLinear(rgb: Vec3): Vec3 {
  return [srgbToLinear(rgb[0] / 255), srgbToLinear(rgb[1] / 255), srgbToLinear(rgb[2] / 255)];
}

/** Clamps to the sRGB gamut, so out-of-range colours lose information. */
export function linearToRgb8(lin: Vec3): Vec3 {
  const c = (v: number) => linearToSrgb(Math.min(1, Math.max(0, v))) * 255;
  return [c(lin[0]), c(lin[1]), c(lin[2])];
}

export function hexToLinear(hex: string): Vec3 {
  return rgb8ToLinear(hexToRgb8(hex));
}

export function linearToHex(lin: Vec3): string {
  return rgb8ToHex(linearToRgb8(lin));
}

// sRGB primaries to XYZ, IEC 61966-2-1.
export function linearToXyz([r, g, b]: Vec3): Vec3 {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
}

const WHITE: Vec3 = [0.95047, 1, 1.08883];
const EPS = (6 / 29) ** 3;

function labF(t: number): number {
  return t > EPS ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29;
}

export function xyzToLab([x, y, z]: Vec3): Lab {
  const fx = labF(x / WHITE[0]);
  const fy = labF(y / WHITE[1]);
  const fz = labF(z / WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function linearToLab(lin: Vec3): Lab {
  return xyzToLab(linearToXyz(lin));
}

export function hexToLab(hex: string): Lab {
  return linearToLab(hexToLinear(hex));
}

/** Lightness L*, chroma C*ab and hue angle h_ab in degrees (0..360). */
export function labToLch([L, a, b]: Lab): Vec3 {
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return [L, Math.hypot(a, b), h < 0 ? h + 360 : h];
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** CIEDE2000 colour difference (Sharma, Wu, Dalal 2005), with kL = kC = kH = 1. */
export function ciede2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const cbar7 = ((Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(cbar7 / (cbar7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const hue = (b: number, ap: number, cp: number) => (cp === 0 ? 0 : (deg(Math.atan2(b, ap)) + 360) % 360);
  const h1p = hue(b1, a1p, c1p);
  const h2p = hue(b2, a2p, c2p);

  const dLp = L2 - L1;
  const dCp = c2p - c1p;
  let dhp = 0;
  if (c1p * c2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dhp / 2));

  const Lbp = (L1 + L2) / 2;
  const Cbp = (c1p + c2p) / 2;
  let hbp = h1p + h2p;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbp = (h1p + h2p + 360) / 2;
    else hbp = (h1p + h2p - 360) / 2;
  }

  const t =
    1 -
    0.17 * Math.cos(rad(hbp - 30)) +
    0.24 * Math.cos(rad(2 * hbp)) +
    0.32 * Math.cos(rad(3 * hbp + 6)) -
    0.2 * Math.cos(rad(4 * hbp - 63));
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const sc = 1 + 0.045 * Cbp;
  const sh = 1 + 0.015 * Cbp * t;
  const rt = -Math.sin(rad(2 * dTheta)) * rc;
  return Math.sqrt((dLp / sl) ** 2 + (dCp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dCp / sc) * (dHp / sh));
}
