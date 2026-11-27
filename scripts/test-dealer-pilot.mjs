import {spawnSync} from 'node:child_process';

// Provider-facing route tests use separate processes so each keeps its own synthetic fixture.
const suites = [
  {files: ['connected-briefing', 'crm-briefing', 'system-health-evidence']},
  {loader: 'v25-scan-loader', files: ['v25-scan']},
  {loader: 'attachment-review-loader', files: ['attachment-review']},
  {loader: 'ai-api-loader', files: ['member-callback-api', 'desktop-page-route']},
  {loader: 'desktop-loader', files: ['desktop-page-identity']},
];

for (const {loader, files} of suites) {
  const args = ['--import', 'tsx'];
  if (loader) args.push('--import', `./tests/review/${loader}.mjs`);
  args.push('--test', ...files.map(file => `tests/review/${file}.test.mjs`));
  const run = spawnSync(process.execPath, args, {stdio: 'inherit'});
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status ?? 1);
}
