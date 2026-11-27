import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export async function checkWorkerArtifact(root){
 const workerPath=resolve(root,'dist/server/index.js');
 const config=JSON.parse(await readFile(resolve(root,'dist/server/wrangler.json'),'utf8'));
 assert.equal(config.assets?.binding,'ASSETS');
 assert.equal(config.assets?.directory,'../client');
 assert.ok((await stat(resolve(root,'dist/client'))).isDirectory());
 assert.equal(resolve(root,'dist/server',config.main),workerPath);
 assert.ok((await stat(workerPath)).isFile());

 const sourceManifest=resolve(root,'.openai/hosting.json');
 try{
  await stat(sourceManifest);
  JSON.parse(await readFile(resolve(root,'dist/.openai/hosting.json'),'utf8'));
 }catch(error){if(error?.code!=='ENOENT'||await fileExists(sourceManifest))throw error}

 const url=pathToFileURL(workerPath);
 url.searchParams.set('artifact-validation',`${process.pid}-${Date.now()}`);
 const worker=await import(url.href);
 assert.equal(typeof worker.default?.fetch,'function');
}

async function fileExists(path){try{await stat(path);return true}catch(error){if(error?.code==='ENOENT')return false;throw error}}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 await checkWorkerArtifact(process.argv[2]||process.cwd());
 console.log('Validated Cloudflare artifact: Worker main/default.fetch and ASSETS binding are present.');
}
