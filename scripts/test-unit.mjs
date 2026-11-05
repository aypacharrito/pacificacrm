import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Route tests need their own isolated authentication/provider loaders.
const separateSuites = new Set([
  "rendered-html.test.mjs",
  "ai-outreach-server.test.mjs",
  "call-detection-webhook.test.mjs",
  "messaging-webhooks.test.mjs",
]);
const files = readdirSync(new URL("../tests/", import.meta.url))
  .filter(name => /\.test\.(mjs|ts)$/.test(name) && !separateSuites.has(name))
  .sort()
  .map(name => `tests/${name}`);
if (!files.length) throw new Error("No unit tests found");
const result = spawnSync(process.execPath, ["--import", "tsx", "--import", "./tests/unit-loader.mjs", "--test", ...files], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
