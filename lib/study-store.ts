// Local study data. Photos live in data/photos/study/<person>/<light>.jpg and never leave the machine
// (the folder is git-ignored). study.json holds the taps and each person's bottle and true shade.

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Point } from "./measure";

export interface PersonInfo {
  /** The shade of the bottle striped on the jaw. */
  stripeShade?: string;
  /** The shade a second person confirmed disappears on the jaw in daylight. */
  trueShade?: string;
  /** Light, medium or deep, for reporting results per tone. */
  tone?: string;
}

export interface Taps {
  stripe: Point;
  skin: Point;
}

export interface StudyFile {
  people: Record<string, PersonInfo>;
  taps: Record<string, Taps>;
}

export interface StudyPhoto {
  person: string;
  file: string;
  light: string;
}

const NAME = /^[A-Za-z0-9_-]{1,40}$/;
const PHOTO = /^[A-Za-z0-9_-]{1,40}\.(jpe?g|png)$/i;

export const studyDir = (root = process.cwd()) => path.join(root, "data", "photos", "study");

export function photoKey(person: string, file: string) {
  return `${person}/${file}`;
}

/** Resolves a study photo, refusing anything that is not a plain person/file name. */
export function photoPath(person: string, file: string, root?: string) {
  if (!NAME.test(person) || !PHOTO.test(file)) throw new Error("Bad study photo name");
  return path.join(studyDir(root), person, file);
}

export async function readStudy(root?: string): Promise<StudyFile> {
  const text = await readFile(path.join(studyDir(root), "study.json"), "utf8").catch(() => null);
  const parsed = text ? (JSON.parse(text) as Partial<StudyFile>) : {};
  return { people: parsed.people ?? {}, taps: parsed.taps ?? {} };
}

export async function writeStudy(study: StudyFile, root?: string) {
  await writeFile(path.join(studyDir(root), "study.json"), JSON.stringify(study, null, 2) + "\n");
}

export async function listPhotos(root?: string): Promise<StudyPhoto[]> {
  const dir = studyDir(root);
  const people = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const photos: StudyPhoto[] = [];
  for (const p of people) {
    if (!p.isDirectory() || !NAME.test(p.name)) continue;
    for (const f of (await readdir(path.join(dir, p.name))).sort()) {
      if (PHOTO.test(f)) photos.push({ person: p.name, file: f, light: path.parse(f).name });
    }
  }
  return photos;
}

export const isName = (s: unknown): s is string => typeof s === "string" && NAME.test(s);
export const isPhoto = (s: unknown): s is string => typeof s === "string" && PHOTO.test(s);
