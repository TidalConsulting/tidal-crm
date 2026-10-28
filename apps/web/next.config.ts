import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { fileURLToPath } from "node:url";

// One .env at the repo root serves the web app and the packages.
loadEnvConfig(fileURLToPath(new URL("../..", import.meta.url)));

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
