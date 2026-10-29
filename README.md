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

To try the whole flow without spending units, run the local stand-in for the API with `npx tsx scripts/mock-youcam.ts`. Then put these lines in `.env.development.local` and restart the app:

```
YOUCAM_BASE_URL=http://localhost:3200
YOUCAM_MODE=live
YOUCAM_API_KEY=mock
```

## Experiments

- **E0, lighting drift.** `npm run e0 -- data/photos/e0` checks whether YouCam's skin tone reading moves when only the light changes.
  - Put one photo per light in the folder.
  - Each photo costs 20 units the first time; reruns use the saved reading.
  - Results go to `research/results/e0.md`.
- **The study.** Photos go in `data/photos/study/P1/window.jpg`, `P1/warm.jpg`, `P1/tube.jpg`, with one folder per person.
  - Use codes such as P1, never names.
  - The folder is git-ignored.
- **Tapping.** Open `/study` in development, tap the stripe and the skin on each photo, and set each person's bottle and true shade. Each photo is checked straight away, so retakes can happen during the shoot.
- **E1 and E2, stability and accuracy.** `npm run e1 -- --youcam both` scores four methods on the same photos:
  - plain selfie pixels
  - the stripe correction
  - YouCam on the photo as taken
  - YouCam on the corrected photo

  It reports whether each method picks the same shade under every light, and whether the pick is the person's true shade, overall and per tone. Results go to `research/results/e1.md`.
- **Shade spacing.** `python research/shade_spacing.py` measures how far apart neighbouring foundation shades are.

## Privacy

- Shoppers' photos are measured in memory and not stored.
- Study photos and try-on renders are photos of faces, so they stay on the machine that took them and are git-ignored.
- Saved YouCam skin tone readings hold colour numbers only.

## Layout

| Path | What it is |
|---|---|
| `lib/color.ts` | sRGB, linear RGB, CIELAB and CIEDE2000, tested against all 34 Sharma pairs |
| `lib/correction.ts` | The stripe correction: one gain per linear channel, with guards for clipping and implausible gains |
| `lib/sample.ts` | Robust patch colour: drops clipped pixels, trims shine and shadow |
| `lib/match.ts` | Nearest shades, and the gap in words (deeper, more golden) |
| `lib/measure.ts` | One match: photo checks, correction, shade, decision, optional YouCam readings |
| `lib/study.ts` | E1 and E2 metrics |
| `lib/youcam/client.ts` | Upload, task, poll, with record and replay |
| `app/api/measure`, `app/api/render` | Measure a photo; render two shades on it with YouCam makeup VTO |
| `app/study` | The local study tool |
| `scripts/e0.ts`, `scripts/e1.ts` | Experiments |
| `scripts/mock-youcam.ts` | A local stand-in for the YouCam API |

## Licence

MIT. Shade data in `research/data/shades.csv` is from The Pudding's makeup-shades project (MIT).
