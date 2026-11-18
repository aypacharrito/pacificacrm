import { WorkspaceLoadError } from "./workspace-load";

export function workspaceRedisConfig() {
  // Use the URL and token from the same connection.
  const kvUrl = process.env.KV_REST_API_URL?.trim() || "";
  const kvToken = process.env.KV_REST_API_TOKEN?.trim() || "";
  return kvUrl || kvToken
    ? { url: kvUrl, token: kvToken }
    : {
        url: process.env.UPSTASH_REDIS_REST_URL?.trim() || "",
        token: process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || "",
      };
}

export async function workspaceRedis(command: Array<string | number>) {
  const { url, token } = workspaceRedisConfig();
  if (!url && !token) return null;
  if (!url || !token) throw new WorkspaceLoadError("STORAGE_NOT_CONFIGURED", 503);

  let response: Response;
  let data: { result?: unknown; error?: string };
  try {
    response = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    data = await response.json();
  } catch {
    throw new WorkspaceLoadError("STORAGE_UNAVAILABLE", 503, "", true);
  }

  if (!data || typeof data !== "object") {
    throw new WorkspaceLoadError("STORAGE_UNAVAILABLE", 503, "", true);
  }
  if (!response.ok || data.error) {
    const status = response.status;
    const providerError = data.error || "";
    if (status === 401 || status === 403 || /unauth|wrongpass|invalid.*token/i.test(providerError)) {
      throw new WorkspaceLoadError("STORAGE_AUTH_FAILED", 503, "", status >= 500);
    }
    if (status === 429 || /quota|limit exceeded|too many requests/i.test(providerError)) {
      throw new WorkspaceLoadError("STORAGE_LIMIT", 503, "", status >= 500);
    }
    throw new WorkspaceLoadError("STORAGE_UNAVAILABLE", 503, "", status >= 500);
  }
  if (!Object.hasOwn(data, "result")) {
    throw new WorkspaceLoadError("STORAGE_UNAVAILABLE", 503, "", true);
  }
  return data.result;
}
