# Second Shade

**Swatch the wrong one. Get the right one.**

A shopper returning a foundation bought in the wrong shade stripes that bottle on their jaw and takes one photo. The bottle's colour is known, so the stripe works as a colour reference in the same light as their skin. Second Shade takes the light out of the photo, recommends the shade that matches, and shows the old and new shade on their own face with YouCam's makeup try-on. If nothing in the range fits, it says so and the refund stays one tap away.

Built for the YouCam API Skin AI & eCommerce VTO Hackathon, Skin AI track.

## The problem in numbers

| Fact | Number | Source |
|---|---|---|
| Neighbouring shades of a foundation range are close together | Median **2.31** CIEDE2000 across 537 shades in 23 ranges; **2.54** in the 18-shade range this demo uses | `research/shade_spacing.py` on The Pudding's shade data (2018); `scripts/range-spacing.ts` |
| An uncorrected phone photo of skin is off by more than that | Mean **6.99** CIEDE2000 | Kang, arXiv 2512.21988 (preprint) |
| So one selfie cannot tell neighbouring shades apart | A median of **7** other shades of the same range sit inside that error | `research/shade_spacing.py` |

## The idea

Every selfie shade finder guesses skin colour through an unknown camera and an unknown light. The shopper returning a foundation already holds an object of known colour, close to their skin colour.

- **Same light for both.** The stripe and the bare skin beside it sit in the same photo, so the light and the camera act on both roughly as one gain per linear RGB channel.
- **The correction.** `skin_true ≈ skin_seen × (stripe_known / stripe_seen)`, per channel.
- **The result.** The corrected skin colour is matched to the range by CIEDE2000, and the gap is put into words ("deeper and more golden than your bottle").

Printed colour cards do this with a card. Here the reference is already in the shopper's hand and already on their skin.

## What it does

1. **Pick the returned shade.** The order would supply this; the demo asks.
2. **Stripe and photo.** One solid stripe from jaw to neck, one photo.
3. **Tap the stripe, then the bare skin next to it.**
4. **Photo check.** Shine, a patchy stripe, clipping or darkness each get a specific fix and a retake.
5. **Result.** The measured skin colour, the recommended shade, how many shades deeper or lighter, and the exchange. The refund button is on the same card.
6. **Before and after.** YouCam makeup VTO renders the returned shade and the recommended shade on the shopper's own photo, and a slider compares them.
7. **No fit.** When no shade in the range is close enough, the app recommends the refund.

## YouCam APIs used

| API | What it does here |
|---|---|
| File API (`/s2s/v2.0/file`) | Uploads the photo, then the bytes go to the returned upload URL |
| AI Skin Tone Analysis (`skin-tone-analysis`) | Reads skin colour on the photo as taken and on the stripe-corrected photo, so the effect of the correction on YouCam's own reading is visible |
| AI Makeup Virtual Try-On (`makeup-vto`, foundation effect) | Renders the returned and the recommended shade on the shopper's face, with skin smoothing set to 0 so the render does not flatter |

Every task is uploaded, created and polled as the docs require. Each finished task can be saved as a fixture keyed on the feature, its parameters and the image hash, so the app and its tests replay without spending units.

<!-- RESULTS: replace this block with the E0/E1 tables from research/results once the lighting photos are run. -->

## Limits

- **Display colours.** The 18 shade colours are the swatch colours the brand publishes on its website. They are not lab measurements and were not checked against bottles. A shared bias in them mostly cancels, because the stripe and the recommendation use the same table; shade-to-shade errors do not.
- **One light at a time.** The correction assumes a single light. Mixed light (a window and a lamp) breaks it.
- **Measured once, early.** Foundation darkens over hours. The photo is taken two minutes after the stripe.
- **Only a clear mismatch is caught.** A wrong shade pick that differs mostly in depth looks like a change of exposure, so the photo check cannot catch it. In a real return the order names the shade.
- **Phone processing.** Phones edit photos region by region. The stripe sits next to the skin it corrects, which limits the damage, but does not remove it.
- **Provisional thresholds.** The photo-check limits were set by hand on generated images and still need tuning on real people.
- **Darker skin.** The darkness floor is set low so deep skin under a warm bulb is still measured, with a test to keep it that way. This range's deepest shade is still light for many people, and those shoppers get the honest no-fit result.

## Try it

**Live:** the deployed link is on the Devpost page.

**Locally:**

```bash
npm install
cp .env.example .env.local
npm test
npm run dev
```

Put a YouCam API key in `.env.local`. Without a key, YouCam calls replay from `fixtures/youcam/`, and the stripe measurement itself needs no key.

To run the whole flow without spending units, start the local stand-in for the API with `npx tsx scripts/mock-youcam.ts`. Then put these lines in `.env.development.local` and restart:

```
YOUCAM_BASE_URL=http://localhost:3200
YOUCAM_MODE=live
YOUCAM_API_KEY=mock
```

## Experiments

- **E0, lighting drift.** `npm run e0 -- data/photos/e0 --repeat` checks whether YouCam's skin tone reading moves when only the light changes, using one photo per light. Results go to `research/results/e0.md`.
- **Study photos.** These go in `data/photos/study/P1/window.jpg` and so on, one folder per person. Use codes, never names; the folder is git-ignored.
- **Tapping.** Open `/study` in development to tap each photo and set each person's bottle and true shade. Each photo is checked straight away.
- **E1 and E2, stability and accuracy.** `npm run e1 -- --youcam both` scores four methods on the same photos:
  - plain selfie pixels
  - the stripe correction
  - YouCam on the photo as taken
  - YouCam on the corrected photo

  It reports how often each method picks the same shade under every light, and how often it picks the true shade.

## Privacy

- **Shoppers' photos** are measured in memory and not stored.
- **Study photos and try-on renders** are photos of faces, so they stay on the machine that took them and are git-ignored.
- **Saved YouCam skin tone readings** hold colour numbers only.

## Layout

| Path | What it is |
|---|---|
| `lib/color.ts` | sRGB, linear RGB, CIELAB and CIEDE2000, tested against all 34 Sharma reference pairs |
| `lib/correction.ts` | The stripe correction, with guards for clipping, darkness and implausible gains |
| `lib/sample.ts` | Patch colour with clipped pixels dropped and shine and shadow trimmed |
| `lib/match.ts` | Nearest shades and the gap in words |
| `lib/measure.ts` | One match: photo check, correction, shade, decision, optional YouCam readings |
| `lib/study.ts` | E1 and E2 metrics |
| `lib/youcam/client.ts` | Upload, task, poll, with record and replay |
| `app/` | The shopper flow, the try-on slider, the API routes and the local study tool |
| `scripts/` | Experiments, the range spacing check and the YouCam stand-in |
| `research/` | The shade spacing analysis and its data |

## Licence and data

- **Code:** MIT.
- **Shade spacing data:** `research/data/shades.csv` is from The Pudding's makeup-shades project (MIT).
- **Demo shade colours:** the shade numbers and swatch colours of one drugstore range, as its brand publishes them. They are used only to demonstrate the method.
