/** The study tool reads photos of real people from disk, so it answers only in development. */
export function devOnly(): Response | null {
  return process.env.NODE_ENV === "production" ? new Response("Not found", { status: 404 }) : null;
}
