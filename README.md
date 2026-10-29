# Second Shade

Swatch the wrong one. Get the right one.

Returning a foundation in the wrong shade? Stripe it on your jaw and take one photo. The bottle's colour is known, so the stripe acts as a colour reference in the same light as your skin. Second Shade takes the light out of the photo and recommends the shade that matches.

Work in progress for the YouCam API Skin AI & eCommerce VTO Hackathon.

## Run

```bash
npm install
cp .env.example .env.local   # add YOUCAM_API_KEY to call the API
npm test
npm run dev
```

Without a key, YouCam calls are answered from recorded fixtures in `fixtures/youcam/` (replay mode).

## Experiments

- `npm run e0 -- data/photos/e0` checks whether YouCam's skin tone reading moves when only the light changes. Put one photo per light in the folder. Each photo costs 20 units the first time; reruns use the saved reading. Results go to `research/results/e0.md`.
- `python research/shade_spacing.py` measures how far apart neighbouring foundation shades are.

## Layout

| Path | What it is |
|---|---|
| `lib/color.ts` | sRGB, linear RGB, CIELAB and CIEDE2000, tested against all 34 Sharma pairs |
| `lib/correction.ts` | The stripe correction: one gain per linear channel, with guards for clipping and implausible gains |
| `lib/sample.ts` | Robust patch colour: drops clipped pixels, trims shine and shadow |
| `lib/match.ts` | Nearest shades, and the gap in words (deeper, more golden) |
| `lib/youcam/client.ts` | Upload, task, poll, with record and replay |
| `scripts/e0.ts` | Experiment E0 |

## Licence

MIT. Shade data in `research/data/shades.csv` is from The Pudding's makeup-shades project (MIT).
