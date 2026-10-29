"use client";

import { useEffect, useState } from "react";
import type { Shade } from "@/lib/match";
import type { MeasureResult } from "@/lib/measure";
import type { Method, Pick } from "@/lib/study";
import type { PersonInfo, StudyPhoto, Taps } from "@/lib/study-store";
import { TapImage, tapHint, type Tap } from "../tap-image";

interface Check {
  result?: MeasureResult;
  picks?: Partial<Record<Method, Pick>>;
  error?: string;
  busy?: boolean;
}

const key = (p: StudyPhoto) => `${p.person}/${p.file}`;

export function StudyTool({ catalogue }: { catalogue: readonly Shade[] }) {
  const [photos, setPhotos] = useState<StudyPhoto[] | null>(null);
  const [people, setPeople] = useState<Record<string, PersonInfo>>({});
  const [taps, setTaps] = useState<Record<string, Taps>>({});
  const [pending, setPending] = useState<Record<string, Tap>>({});
  const [checks, setChecks] = useState<Record<string, Check>>({});

  useEffect(() => {
    fetch("/api/study")
      .then((r) => r.json())
      .then((d: { photos: StudyPhoto[]; people: Record<string, PersonInfo>; taps: Record<string, Taps> }) => {
        setPhotos(d.photos);
        setPeople(d.people);
        setTaps(d.taps);
      });
  }, []);

  async function check(p: StudyPhoto) {
    setChecks((c) => ({ ...c, [key(p)]: { busy: true } }));
    const res = await fetch("/api/study/measure", { method: "POST", body: JSON.stringify({ person: p.person, file: p.file }) });
    const body = await res.json();
    setChecks((c) => ({ ...c, [key(p)]: res.ok ? body : { error: body.error } }));
  }

  async function onTap(p: StudyPhoto, tap: Tap) {
    const k = key(p);
    const stripe = pending[k];
    if (!stripe) {
      setPending((s) => ({ ...s, [k]: tap }));
      setChecks((c) => ({ ...c, [k]: {} }));
      return;
    }
    const saved = { stripe, skin: tap };
    setPending((s) => {
      const rest = { ...s };
      delete rest[k];
      return rest;
    });
    setTaps((t) => ({ ...t, [k]: saved }));
    await fetch("/api/study", { method: "POST", body: JSON.stringify({ type: "taps", person: p.person, file: p.file, ...saved }) });
    if (people[p.person]?.stripeShade) await check(p);
  }

  async function savePerson(person: string, info: PersonInfo) {
    setPeople((all) => ({ ...all, [person]: info }));
    await fetch("/api/study", { method: "POST", body: JSON.stringify({ type: "person", person, info }) });
  }

  if (!photos) return <p>Loading…</p>;
  if (!photos.length)
    return (
      <p className="text-zinc-600 dark:text-zinc-400">
        No photos yet. Put them in <code>data/photos/study/P1/window.jpg</code>, <code>P1/warm.jpg</code>, <code>P1/tube.jpg</code>, one folder per person,
        then reload.
      </p>
    );

  const byPerson = Object.entries(Object.groupBy(photos, (p) => p.person)) as [string, StudyPhoto[]][];
  const shadeName = (id?: string) => catalogue.find((s) => s.id === id)?.name ?? "?";

  return (
    <div className="flex flex-col gap-10">
      <button
        type="button"
        className="self-start rounded-lg border border-black/20 px-3 py-2 text-sm dark:border-white/25"
        onClick={() => photos.filter((p) => taps[key(p)] && people[p.person]?.stripeShade).forEach(check)}
      >
        Check every tapped photo
      </button>
      {byPerson.map(([person, list]) => {
        const info = people[person] ?? {};
        return (
          <section key={person} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <h2 className="text-xl font-semibold">{person}</h2>
              {(
                [
                  ["stripeShade", "Bottle on the jaw"],
                  ["trueShade", "True shade"],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="flex flex-col text-sm">
                  {label}
                  <select
                    value={info[field] ?? ""}
                    onChange={(e) => savePerson(person, { ...info, [field]: e.target.value || undefined })}
                    className="rounded border border-black/20 bg-transparent px-2 py-1 dark:border-white/25"
                  >
                    <option value="">not set</option>
                    {catalogue.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="flex flex-col text-sm">
                Tone
                <select
                  value={info.tone ?? ""}
                  onChange={(e) => savePerson(person, { ...info, tone: e.target.value || undefined })}
                  className="rounded border border-black/20 bg-transparent px-2 py-1 dark:border-white/25"
                >
                  <option value="">not set</option>
                  {["light", "medium", "deep"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              {list.map((p) => {
                const k = key(p);
                const stripe = pending[k] ?? taps[k]?.stripe ?? null;
                const skin = pending[k] ? null : (taps[k]?.skin ?? null);
                const c = checks[k];
                return (
                  <div key={k} className="flex flex-col gap-2">
                    <div className="text-sm font-medium">{p.light}</div>
                    <TapImage
                      src={`/api/study/photo?person=${encodeURIComponent(p.person)}&file=${encodeURIComponent(p.file)}`}
                      alt={`${person} under ${p.light}`}
                      stripe={stripe}
                      skin={skin}
                      onTap={(t) => onTap(p, t)}
                    />
                    <p className="text-xs text-zinc-500">{tapHint(stripe, skin)}</p>
                    {c?.busy && <p className="text-sm">Checking…</p>}
                    {c?.error && <p className="text-sm text-red-700 dark:text-red-400">{c.error}</p>}
                    {c?.result && !c.result.ok && (
                      <ul className="list-disc pl-5 text-sm text-amber-800 dark:text-amber-300">
                        {c.result.issues.map((i) => (
                          <li key={i.code}>Retake: {i.message}</li>
                        ))}
                      </ul>
                    )}
                    {c?.result?.ok && c.picks && (
                      <ul className="text-sm">
                        <li>
                          Plain selfie picks {shadeName(c.picks.pixels?.shadeId)}
                          {info.trueShade && c.picks.pixels?.shadeId === info.trueShade ? " ✓" : ""}
                        </li>
                        <li>
                          Stripe picks {shadeName(c.picks.stripe?.shadeId)}
                          {info.trueShade && c.picks.stripe?.shadeId === info.trueShade ? " ✓" : ""} (ΔE {c.result.recommended?.dE.toFixed(2)})
                        </li>
                        <li className="text-xs text-zinc-500">
                          Stripe patch spread L* {c.result.stripe?.lightnessSd.toFixed(1)}, skin {c.result.skin?.lightnessSd.toFixed(1)}
                        </li>
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
