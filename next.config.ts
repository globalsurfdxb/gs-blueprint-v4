import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in a parent folder makes Next infer the wrong workspace root.
  turbopack: {
    root: import.meta.dirname,
  },
  experimental: {
    // Turbopack's on-disk dev cache kept serving stale compiled route handlers after a dev-server
    // restart (every /api/* route 404'd until .next was deleted). Off trades a slower cold start
    // for restarts that always pick up the current code and .env.
    turbopackFileSystemCacheForDev: false,
    serverActions: {
      // Bug screenshot uploads (PRD 8.2.4) go through a Server Action and can be up to 5MB
      // per image. Next's default body limit is 1MB, which would reject them before our own
      // validation runs — raise it so legitimate images reach the action, where the real
      // ≤5MB / PNG-JPG-WebP / max-3 checks live. Anything larger is still hard-blocked here.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
