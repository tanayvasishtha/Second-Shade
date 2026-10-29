import { DEMO_CATALOGUE } from "@/lib/catalogues";
import { StudyTool } from "./study-tool";

export const metadata = { title: "Study tool · Second Shade" };

export default function StudyPage() {
  if (process.env.NODE_ENV === "production")
    return <main className="mx-auto max-w-md px-4 py-16">The study tool runs only on the machine that holds the photos.</main>;
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Study tool</h1>
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Local only. For each photo, tap the middle of the stripe, then bare skin right next to it. Set each person&apos;s bottle and true shade. Every
          photo is checked as soon as it is tapped, so a retake can happen during the shoot. Run <code>npm run e1</code> for the tables.
        </p>
      </header>
      <StudyTool catalogue={DEMO_CATALOGUE} />
    </main>
  );
}
