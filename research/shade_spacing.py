"""How far apart are neighbouring foundation shades, compared with phone camera colour error?

Data: The Pudding, makeup-shades/shades.csv (MIT), hex values sampled from brand swatch images, May 2018.
Phone error reference: Kang, arXiv 2512.21988, uncorrected phone vs reference mean CIEDE2000 6.99.

Run: python research/shade_spacing.py
"""

import csv
import math
from pathlib import Path
from statistics import median

PHONE_ERROR_DE00 = 6.99
DATA = Path(__file__).parent / "data" / "shades.csv"


def srgb_to_lab(hex_code: str) -> tuple[float, float, float]:
    rgb = [int(hex_code[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    r, g, b = lin
    x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
    y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
    z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883

    def f(t: float) -> float:
        return t ** (1 / 3) if t > (6 / 29) ** 3 else t / (3 * (6 / 29) ** 2) + 4 / 29

    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def ciede2000(lab1, lab2) -> float:
    L1, a1, b1 = lab1
    L2, a2, b2 = lab2
    c1, c2 = math.hypot(a1, b1), math.hypot(a2, b2)
    cbar7 = ((c1 + c2) / 2) ** 7
    g = 0.5 * (1 - math.sqrt(cbar7 / (cbar7 + 25**7)))
    a1p, a2p = (1 + g) * a1, (1 + g) * a2
    c1p, c2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360 if c1p else 0.0
    h2p = math.degrees(math.atan2(b2, a2p)) % 360 if c2p else 0.0

    dLp = L2 - L1
    dCp = c2p - c1p
    if c1p * c2p == 0:
        dhp = 0.0
    elif abs(h2p - h1p) <= 180:
        dhp = h2p - h1p
    elif h2p - h1p > 180:
        dhp = h2p - h1p - 360
    else:
        dhp = h2p - h1p + 360
    dHp = 2 * math.sqrt(c1p * c2p) * math.sin(math.radians(dhp / 2))

    Lbp = (L1 + L2) / 2
    Cbp = (c1p + c2p) / 2
    if c1p * c2p == 0:
        hbp = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hbp = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        hbp = (h1p + h2p + 360) / 2
    else:
        hbp = (h1p + h2p - 360) / 2

    t = (
        1
        - 0.17 * math.cos(math.radians(hbp - 30))
        + 0.24 * math.cos(math.radians(2 * hbp))
        + 0.32 * math.cos(math.radians(3 * hbp + 6))
        - 0.20 * math.cos(math.radians(4 * hbp - 63))
    )
    d_theta = 30 * math.exp(-(((hbp - 275) / 25) ** 2))
    rc = 2 * math.sqrt(Cbp**7 / (Cbp**7 + 25**7))
    sl = 1 + 0.015 * (Lbp - 50) ** 2 / math.sqrt(20 + (Lbp - 50) ** 2)
    sc = 1 + 0.045 * Cbp
    sh = 1 + 0.015 * Cbp * t
    rt = -math.sin(math.radians(2 * d_theta)) * rc
    return math.sqrt(
        (dLp / sl) ** 2 + (dCp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dCp / sc) * (dHp / sh)
    )


# Sharma, Wu, Dalal (2005) test pairs 1, 7, 17, 25, 34.
SHARMA = [
    ((50.0, 2.6772, -79.7751), (50.0, 0.0, -82.7485), 2.0425),
    ((50.0, 0.0, 0.0), (50.0, -1.0, 2.0), 2.3669),
    ((50.0, 2.5, 0.0), (73.0, 25.0, -18.0), 27.1492),
    ((60.2574, -34.0099, 36.2677), (60.4626, -34.1751, 39.4387), 1.2644),
    ((2.0776, 0.0795, -1.1350), (0.9033, -0.0636, -0.5514), 0.9082),
]


def main() -> None:
    for lab1, lab2, want in SHARMA:
        got = ciede2000(lab1, lab2)
        assert abs(got - want) < 1e-4, (lab1, lab2, got, want)
    print(f"CIEDE2000 matches {len(SHARMA)} Sharma reference pairs to 1e-4\n")

    lines: dict[tuple[str, str], list[tuple[float, float, float]]] = {}
    with DATA.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            lines.setdefault((row["brand"], row["product"]), []).append(srgb_to_lab(row["hex"]))

    nn_all: list[float] = []
    within_all: list[int] = []
    rows = []
    for (brand, product), labs in lines.items():
        if len(labs) < 10:
            continue
        nn, within = [], []
        for i, lab in enumerate(labs):
            dists = [ciede2000(lab, other) for j, other in enumerate(labs) if j != i]
            nn.append(min(dists))
            within.append(sum(d <= PHONE_ERROR_DE00 for d in dists))
        nn_all += nn
        within_all += within
        rows.append((brand, product, len(labs), median(nn), median(within)))

    rows.sort(key=lambda r: -r[2])
    print(f"{'brand':<22}{'product':<34}{'shades':>7}{'median NN dE00':>16}{'median shades within 6.99':>27}")
    for brand, product, n, nn_med, w_med in rows:
        print(f"{brand[:21]:<22}{product[:33]:<34}{n:>7}{nn_med:>16.2f}{w_med:>27.1f}")

    print(f"\nLines with 10+ shades: {len(rows)}, shades: {len(nn_all)}")
    print(f"Median nearest-neighbour CIEDE2000 across all shades: {median(nn_all):.2f}")
    share_under = sum(d < PHONE_ERROR_DE00 for d in nn_all) / len(nn_all)
    print(f"Shades whose nearest neighbour is closer than {PHONE_ERROR_DE00}: {share_under:.0%}")
    print(f"Median other shades of the same line within {PHONE_ERROR_DE00}: {median(within_all):.0f}")


if __name__ == "__main__":
    main()
