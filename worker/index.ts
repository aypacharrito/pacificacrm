/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  ONYX_URL?: string;
  CRON_SECRET?: string;
  PACIFICA_GMAIL_CRON_ENABLED?: string;
  PACIFICA_CONNECTED_SYNC_ENABLED?: string;
  IMAGES?: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async scheduled(_event: unknown, env: Env, ctx: ExecutionContext) {
    if (!env.ONYX_URL || !env.CRON_SECRET) return;
    const paths = [
      ...(env.PACIFICA_GMAIL_CRON_ENABLED !== "false" ? ["/api/cron/gmail-triage"] : []),
      ...(env.PACIFICA_CONNECTED_SYNC_ENABLED === "true" ? ["/api/cron/connected-accounts"] : []),
    ];
    for (const path of paths) {
      const request = new Request(new URL(path, env.ONYX_URL), {headers: {Authorization: "Bearer " + env.CRON_SECRET.trim()}});
      ctx.waitUntil(worker.fetch(request, env, ctx).then(response => {
        if (!response.ok) throw new Error("Pacifica scheduled request failed (" + response.status + ")");
      }));
    }
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      if (!env.IMAGES) {
        // No Cloudflare Images binding on this host: serve the original file, and only from this site.
        const src = url.searchParams.get("url") || "";
        if (!src.startsWith("/") || src.startsWith("//") || src.startsWith("/\\")) return new Response("Bad image address", { status: 400 });
        return env.ASSETS.fetch(new Request(new URL(src, request.url)));
      }
      const images = env.IMAGES;
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await images.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
