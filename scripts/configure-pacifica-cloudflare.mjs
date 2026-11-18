import { readFile, writeFile } from "node:fs/promises";

const deployments = {
  preview: {
    name: "onyx-pacificacrm",
    origin: "https://onyx-pacificacrm.pacificalegalinsurance.workers.dev",
    workers_dev: true,
  },
  production: {
    name: "onyx-pacificacrm-production",
    origin: "https://pacificacrm.com",
    workers_dev: false,
  },
};

const environment = process.argv[2];
if (!Object.hasOwn(deployments, environment)) {
  throw new Error("Choose the preview or production deployment.");
}
const deployment = deployments[environment];
const commit = process.env.WORKERS_CI_COMMIT_SHA;
const branch = process.env.WORKERS_CI_BRANCH;
if (!/^[a-f0-9]{40}$/.test(commit ?? "") || !branch) {
  throw new Error("The build must identify the Git commit and branch being deployed.");
}

const input = new URL("../dist/server/wrangler.json", import.meta.url);
const output = new URL("./wrangler.pacifica-release.json", input);
const config = JSON.parse(await readFile(input, "utf8"));
if (config.assets?.binding !== "ASSETS" || config.assets.directory !== "../client") {
  throw new Error("The generated Worker configuration must bind the compiled client assets.");
}

config.name = deployment.name;
config.workers_dev = deployment.workers_dev;
config.preview_urls = false;
config.keep_vars = true;
config.triggers = { crons: [] };
config.vars = {
  ...config.vars,
  ONYX_ENV: environment,
  ONYX_URL: deployment.origin,
  ONYX_BRANCH: branch,
  ONYX_COMMIT_SHA: commit,
};
if (environment === "production") {
  config.vars.NEXT_PUBLIC_APP_URL = deployment.origin;
  config.vars.PACIFICA_HOSTING = "cloudflare";
  config.vars.PACIFICA_SMS_SENDING_ENABLED = "false";
}

await writeFile(output, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Prepared ${deployment.name} at commit ${commit}.`);
