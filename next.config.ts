import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Les imports CSV Revolut volumineux passent par une Server Action.
    serverActions: { bodySizeLimit: "4mb" },
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
