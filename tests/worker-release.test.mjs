import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {preparePacificaRelease} from '../scripts/pacifica-cloudflare-release.mjs';
import {sites} from '../build/sites-vite-plugin.ts';
import {checkWorkerArtifact} from '../scripts/check-worker-artifact.mjs';

const commit='a'.repeat(40);
const base={assets:{binding:'ASSETS',directory:'../client'},vars:{PACIFICA_SMS_SENDING_ENABLED:'true',PACIFICA_GMAIL_CRON_ENABLED:'true'},triggers:{crons:['* * * * *']}};

test('preview release cannot inherit sending or schedules, even when requested',()=>{
 const preview=preparePacificaRelease(base,'preview',commit,'codex/private-pilot',{gmailCron:true,connectedCron:true});
 assert.equal(preview.name,'onyx-pacificacrm');assert.equal(preview.workers_dev,true);
 assert.equal(preview.keep_vars,true);
 assert.deepEqual(preview.triggers.crons,[]);
 assert.equal(preview.vars.PACIFICA_SMS_SENDING_ENABLED,'false');
 assert.equal(preview.vars.PACIFICA_GMAIL_CRON_ENABLED,'false');
 assert.equal(preview.vars.PACIFICA_CONNECTED_SYNC_ENABLED,'false');
 assert.equal(preview.vars.NEXT_PUBLIC_APP_URL,preview.vars.ONYX_URL);
 assert.equal(base.vars.PACIFICA_SMS_SENDING_ENABLED,'true');
 assert.throws(()=>preparePacificaRelease({...base,vars:{RESEND_API_KEY:'synthetic'}},'preview',commit,'branch'),/provider variables/);
 assert.throws(()=>preparePacificaRelease({...base,vars:{TWILIO_AUTH_TOKEN:'synthetic'}},'preview',commit,'branch'),/provider variables/);
});

test('production release preserves its explicit schedule opt-in and existing SMS pause',()=>{
 const production=preparePacificaRelease(base,'production',commit,'main',{gmailCron:true});
 assert.equal(production.name,'onyx-pacificacrm-production');assert.equal(production.workers_dev,false);
 assert.equal(production.keep_vars,true);
 assert.deepEqual(production.triggers.crons,['*/5 * * * *']);
 assert.equal(production.vars.PACIFICA_SMS_SENDING_ENABLED,'false');
});

test('Sites plugin only packages an environment supplied manifest',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pacifica-sites-test-'));
 try{
  const plugin=sites();plugin.configResolved({root});await plugin.closeBundle();
  await assert.rejects(readFile(join(root,'dist','.openai','hosting.json'),'utf8'),{code:'ENOENT'});
  await mkdir(join(root,'.openai'));await writeFile(join(root,'.openai','hosting.json'),'{"d1":"DB"}\n');
  await plugin.closeBundle();
  assert.deepEqual(JSON.parse(await readFile(join(root,'dist','.openai','hosting.json'),'utf8')),{d1:'DB'});
 }finally{
  assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));
  await rm(root,{recursive:true,force:true});
 }
});

test('Cloudflare artifact validates main/fetch/assets without a Sites manifest',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pacifica-worker-test-'));
 try{
  await mkdir(join(root,'dist','server'),{recursive:true});
  await mkdir(join(root,'dist','client'),{recursive:true});
  await writeFile(join(root,'package.json'),'{"type":"module"}');
  await writeFile(join(root,'dist','server','index.js'),'export default {fetch(){return new Response("ok")}};');
  const config={main:'index.js',assets:{binding:'ASSETS',directory:'../client'},triggers:{crons:[]}};
  await writeFile(join(root,'dist','server','wrangler.json'),JSON.stringify(config));
  await checkWorkerArtifact(root);
  await writeFile(join(root,'dist','server','wrangler.json'),JSON.stringify({...config,main:'missing.js'}));
  await assert.rejects(checkWorkerArtifact(root));
  await writeFile(join(root,'dist','server','wrangler.json'),JSON.stringify(config));
  await mkdir(join(root,'.openai'));
  await writeFile(join(root,'.openai','hosting.json'),'{"d1":"DB"}');
  await assert.rejects(checkWorkerArtifact(root),{code:'ENOENT'});
  await mkdir(join(root,'dist','.openai'));
  await writeFile(join(root,'dist','.openai','hosting.json'),'{"d1":"DB"}');
  await checkWorkerArtifact(root);
 }finally{
  assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));
  await rm(root,{recursive:true,force:true});
 }
});
