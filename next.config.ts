import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The dev server allows localhost. Browsers that open 127.0.0.1 need this too.
  allowedDevOrigins: ["127.0.0.1"],
  // SAM's parser is ESM-only. Keep it out of the bundle and load it only for live calls.
  serverExternalPackages: ["@meta-sam/parser"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
