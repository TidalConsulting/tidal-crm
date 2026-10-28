import type { NextConfig } from "next";

// cacheComponents is off: every page here is per-user and per-tenant, so plain
// dynamic rendering is simpler and leaves no risk of caching one tenant's data for another.
const nextConfig: NextConfig = {
  transpilePackages: ["@tidal/db", "@tidal/core"],
  serverExternalPackages: ["postgres"],
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
