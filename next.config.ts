import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {NEXT_PUBLIC_PACIFICA_BUILD: process.env.VERCEL_GIT_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA || "v57"},
  // Cloudflare deployments provide this runtime module. Keep it external in
  // Vercel's webpack build so Redis-backed routes can compile and run there.
  webpack(config){
    config.externals.push("cloudflare:workers", "cloudflare:sockets");
    return config;
  },
};

export default nextConfig;
