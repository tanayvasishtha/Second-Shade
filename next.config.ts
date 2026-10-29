import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Fixtures are read from disk at request time, so ship them with the server functions.
  outputFileTracingIncludes: {
    "/api/measure": ["./fixtures/youcam/**/*"],
    "/api/render": ["./fixtures/youcam/**/*"],
    "/api/fixture-image": ["./fixtures/youcam/**/*"],
  },
  turbopack: {
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
