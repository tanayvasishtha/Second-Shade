"use client";

import { useState } from "react";
import { hexToLab } from "@/lib/color";
import type { Shade } from "@/lib/match";
import type { MeasureResult, YouCamReading, YouCamReadings } from "@/lib/measure";
import { CompareSlider } from "./compare-slider";
import { nextTaps, TapImage, tapHint, type Tap } from "./tap-image";

type Result = MeasureResult & { youcamMode?: string };

const YOUCAM_CHOICES: { value: YouCamReadings; label: string }[] = [
  { value: "none", label: "Our measurement only" },
  { value: "corrected", label: "Also YouCam on the corrected photo (20 units)" },
  { value: "both", label: "YouCam on the raw and corrected photo (40 units)" },
];

function joinWords(words: string[]) {
  return words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function Swatch({ hex, label, sub }: { hex: string; label: string; sub?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 text-center">
      <div className="h-16 w-full rounded-lg border border-black/10" style={{ background: hex }} />
      <div className="text-sm font-medium">{label}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function Reading({ title, r }: { title: string; r?: YouCamReading }) {
  if (!r) return null;
  return (
    <li>
      {title}: {r.hex ? `${r.hex}, nearest ${r.nearest?.name} (ΔE ${r.nearest?.dE.toFixed(2)})` : `not available (${r.error})`}
    </li>
  );
}

export function MeasureFlow({ catalogue }: { catalogue: readonly Shade[] }) {
  const [returnedId, setReturnedId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stripe, setStripe] = useState<Tap | null>(null);
  const [skin, setSkin] = useState<Tap | null>(null);
  const [youcam, setYoucam] = useState<YouCamReadings>("none");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const returned = catalogue.find((s) => s.id === returnedId);

  function onPhoto(f: File | undefined) {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
    setFile(f ?? null);
    setStripe(null);
    setSkin(null);
    setResult(null);
    setError(null);
  }

  function onTap(tap: Tap) {
    const next = nextTaps(stripe, skin, tap);
    setStripe(next.stripe);
    setSkin(next.skin);
    setResult(null);
  }

  async function submit() {
    if (!file || !stripe || !skin || !returnedId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const form = new FormData();
    form.set("photo", file);
    form.set("stripeX", String(stripe.x));
    form.set("stripeY", String(stripe.y));
    form.set("skinX", String(skin.x));
    form.set("skinY", String(skin.y));
    form.set("returnedId", returnedId);
    form.set("youcam", youcam);
    try {
      const res = await fetch("/api/measure", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "Something went wrong.");
      else setResult(body as Result);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const ready = Boolean(file && stripe && skin && returnedId) && !busy;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">1. Which shade are you returning?</h2>
        <div className="grid grid-cols-8 gap-1.5">
          {catalogue.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setReturnedId(s.id)}
              aria-label={s.name}
              aria-pressed={s.id === returnedId}
              className={`aspect-square rounded-md border text-[10px] leading-none ${s.id === returnedId ? "ring-2 ring-offset-2 ring-zinc-900 dark:ring-zinc-100" : "border-black/10"}`}
              style={{ background: s.hex, color: hexToLab(s.hex)[0] > 60 ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.85)" }}
            >
              {s.id}
            </button>
          ))}
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{returned ? `Returning ${returned.name}.` : "Pick the bottle in your hand."}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">2. Stripe it, then take one photo</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Draw one solid stripe of it from your jaw down onto your neck, with no skin showing through. Wait two minutes. Face a window and take a
          photo with the stripe and bare skin both in view.
        </p>
        <input
          type="file"
          accept="image/jpeg,image/png"
          capture="user"
          onChange={(e) => onPhoto(e.target.files?.[0])}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-white dark:file:bg-zinc-100 dark:file:text-zinc-900"
        />
        {preview && (
          <div className="flex flex-col gap-2">
            <TapImage src={preview} alt="Your photo. Tap the stripe, then the bare skin." stripe={stripe} skin={skin} onTap={onTap} />
            <p className="text-sm font-medium">{tapHint(stripe, skin)}</p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">3. Find the shade</h2>
        <fieldset className="flex flex-col gap-1 text-sm">
          {YOUCAM_CHOICES.map((c) => (
            <label key={c.value} className="flex items-center gap-2">
              <input type="radio" name="youcam" value={c.value} checked={youcam === c.value} onChange={() => setYoucam(c.value)} />
              {c.label}
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          disabled={!ready}
          onClick={submit}
          className="rounded-lg bg-zinc-900 px-4 py-3 font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "Measuring…" : "Find my shade"}
        </button>
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      </section>

      {result && file && <ResultCard result={result} file={file} />}
    </div>
  );
}

interface Render {
  id: string;
  src?: string;
  error?: string;
  taskId?: string;
}

function TryOn({ file, returned, recommended }: { file: File; returned: Shade; recommended: Shade }) {
  const [state, setState] = useState<{ busy?: boolean; renders?: Render[]; error?: string }>({});

  async function run() {
    setState({ busy: true });
    const form = new FormData();
    form.set("photo", file);
    form.set("shades", `${returned.id},${recommended.id}`);
    try {
      const res = await fetch("/api/render", { method: "POST", body: form });
      const body = await res.json();
      setState(res.ok ? { renders: body.renders } : { error: body.error });
    } catch {
      setState({ error: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  const [a, b] = state.renders ?? [];
  const failed = state.renders?.find((r) => r.error);
  return (
    <div className="flex flex-col gap-2">
      {!state.renders && (
        <button type="button" onClick={run} disabled={state.busy} className="rounded-lg border border-black/20 px-4 py-3 font-medium disabled:opacity-40 dark:border-white/25">
          {state.busy ? "Rendering both shades…" : "See both on your face"}
        </button>
      )}
      {state.error && <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p>}
      {failed && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {failed.error === "not_recorded"
            ? "This try-on hasn't been recorded yet. It needs a YouCam key to render."
            : `YouCam couldn't render it (${failed.error}).`}
        </p>
      )}
      {a?.src && b?.src && (
        <>
          <CompareSlider left={a.src} right={b.src} leftLabel={returned.name} rightLabel={recommended.name} />
          <p className="text-xs text-zinc-500">YouCam makeup try-on with smoothing off. Tasks {a.taskId} and {b.taskId}.</p>
        </>
      )}
    </div>
  );
}

function ResultCard({ result, file }: { result: Result; file: File }) {
  const { returned, recommended, estimate, gap, decision } = result;

  if (!result.ok)
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
        <h2 className="text-lg font-semibold">Let&apos;s retake that</h2>
        <ul className="list-disc pl-5 text-sm">
          {result.issues.map((i) => (
            <li key={i.code}>{i.message}</li>
          ))}
        </ul>
        <RefundButton />
      </section>
    );

  const words = joinWords(gap?.words ?? []);
  const steps = recommended?.steps ?? 0;
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-black/10 p-4 dark:border-white/15">
      {decision === "exchange" && recommended && (
        <>
          <h2 className="text-xl font-semibold">
            Your skin is {words || "a little different from"}
            {words ? " than" : ""} {returned.name}.
          </h2>
          <p>
            Try <strong>{recommended.shade.name}</strong>, {Math.abs(steps)} {Math.abs(steps) === 1 ? "shade" : "shades"} {steps > 0 ? "deeper" : "lighter"} in
            this range.
          </p>
        </>
      )}
      {decision === "same_shade" && (
        <h2 className="text-xl font-semibold">In this light, {returned.name} matches your skin. If it looks wrong once worn, the finish may be the problem.</h2>
      )}
      {decision === "no_fit" && (
        <h2 className="text-xl font-semibold">Nothing in this range is close enough to your skin. A refund is the right call.</h2>
      )}

      <div className="flex gap-3">
        <Swatch hex={returned.hex} label={returned.name} sub="Returning" />
        {estimate && <Swatch hex={estimate.hex} label="Your skin" sub="Measured" />}
        {recommended && decision !== "no_fit" && <Swatch hex={recommended.shade.hex} label={recommended.shade.name} sub={`ΔE ${recommended.dE.toFixed(2)}`} />}
      </div>

      {decision === "exchange" && recommended && <TryOn file={file} returned={returned} recommended={recommended.shade} />}

      <div className="flex flex-col gap-2 sm:flex-row">
        {decision === "exchange" && recommended && (
          <button type="button" className="flex-1 rounded-lg bg-zinc-900 px-4 py-3 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
            Exchange for {recommended.shade.name}
          </button>
        )}
        <RefundButton />
      </div>

      <details className="text-sm text-zinc-600 dark:text-zinc-400">
        <summary className="cursor-pointer">How we measured it</summary>
        <ul className="mt-2 list-disc pl-5">
          <li>
            Stripe in the photo {result.stripe?.seenHex}, known colour {result.stripe?.knownHex}. Light correction per channel:{" "}
            {estimate?.gains.map((g) => g.toFixed(2)).join(", ")}.
          </li>
          <li>
            Bare skin in the photo {result.skin?.seenHex}, corrected {estimate?.hex}.
          </li>
          {result.alternatives && <li>Next closest: {result.alternatives.map((a) => `${a.shade.name} (ΔE ${a.dE.toFixed(2)})`).join(", ")}.</li>}
          <Reading title="YouCam on the raw photo" r={result.youcam?.raw} />
          <Reading title="YouCam on the corrected photo" r={result.youcam?.corrected} />
          {result.youcamMode && <li>YouCam mode: {result.youcamMode}.</li>}
        </ul>
      </details>
    </section>
  );
}

function RefundButton() {
  return (
    <button type="button" className="flex-1 rounded-lg border border-black/20 px-4 py-3 font-medium dark:border-white/25">
      Refund instead
    </button>
  );
}
