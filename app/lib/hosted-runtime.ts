/**
 * True on every real host (Vercel, or Cloudflare Workers through Onyx). A hosted CRM requires its real sign-in and
 * storage and never falls back to the local owner. Fail-closed: a Worker counts as hosted even when no host setting
 * was given; only a developer's own machine is not hosted (`next dev`, tests, or `PACIFICA_LOCAL_DEV=1` for a local
 * Worker preview).
 */
export function isHostedRuntime(): boolean {
  if (process.env.VERCEL || process.env.PACIFICA_HOSTING || process.env.ONYX_ENV) return true;
  if (process.env.PACIFICA_LOCAL_DEV === "1") return false;
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

/** Facts about the running deploy, from whichever host ran it (Vercel's names first, then Onyx's). */
export function deployInfo() {
  return {
    release: (process.env.VERCEL_GIT_COMMIT_SHA || process.env.ONYX_COMMIT_SHA || "").slice(0, 8) || "local",
    branch: process.env.VERCEL_GIT_COMMIT_REF || process.env.ONYX_BRANCH || "local",
    environment: process.env.VERCEL_ENV || process.env.ONYX_ENV || "local",
    url: process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || process.env.ONYX_URL || "local",
  };
}
