import { DEMO_CATALOGUE, DEMO_CATALOGUE_SOURCE } from "@/lib/catalogues";
import { MeasureFlow } from "./measure-flow";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Second Shade</h1>
        <p className="text-lg">Swatch the wrong one. Get the right one.</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          The bottle you&apos;re returning has a known colour. A stripe of it next to your bare skin, in the same light, lets us take the light
          out of the photo.
        </p>
      </header>
      <MeasureFlow catalogue={DEMO_CATALOGUE} />
      <footer className="text-xs text-zinc-500">
        Demo catalogue: {DEMO_CATALOGUE_SOURCE} Your photo is measured in memory and not stored.
      </footer>
    </main>
  );
}
