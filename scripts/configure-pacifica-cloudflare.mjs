import {readFile,writeFile} from 'node:fs/promises';
import {preparePacificaRelease} from './pacifica-cloudflare-release.mjs';

const environment=process.argv[2];
const input=new URL('../dist/server/wrangler.json',import.meta.url);
const output=new URL('./wrangler.pacifica-release.json',input);
const generated=JSON.parse(await readFile(input,'utf8'));
const config=preparePacificaRelease(
 generated,
 environment,
 process.env.WORKERS_CI_COMMIT_SHA,
 process.env.WORKERS_CI_BRANCH,
 {
  gmailCron:process.env.PACIFICA_GMAIL_CRON_ENABLED==='true',
  connectedCron:process.env.PACIFICA_CONNECTED_SYNC_ENABLED==='true',
 },
);

await writeFile(output,`${JSON.stringify(config,null,2)}\n`);
console.log(`Prepared ${config.name} at commit ${config.vars.ONYX_COMMIT_SHA}.`);
