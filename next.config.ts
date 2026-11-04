import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The dev server allows localhost. Browsers that open 127.0.0.1 need this too.
  allowedDevOrigins: ["127.0.0.1"],
  // SAM's parser is ESM-only. resvg is a native SVG rasterizer. Keep both out of the bundle.
  serverExternalPackages: ["@meta-sam/parser", "@resvg/resvg-js"],
  // The analyze route reads demo images and the committed model cache from disk.
  outputFileTracingIncludes: {
    "/api/analyze": ["./public/demo/*.png", "./data/cache/**"],
  },
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
