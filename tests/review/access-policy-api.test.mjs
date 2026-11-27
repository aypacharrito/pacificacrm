import test from 'node:test';
import assert from 'node:assert/strict';
import {getPacificaAccess,workspaceAutomationAccess,isPacificaOwnerApi} from '../../app/lib/clerk-access.ts';
import {archonWorkspaceUrl,canOpenArchon} from '../../app/lib/archon-owner.ts';
const owner=metadata=>({id:'owner-id',primaryEmailAddress:{emailAddress:'test@example.com'},emailAddresses:[],privateMetadata:metadata});
test('workspace owners and their team lose API and cron access when trial expires or is locked',async()=>{
 globalThis.paid=false;globalThis.identity=owner({pacificaManaged:true,pacificaTrialEndsAt:'2000-01-01'});globalThis.workspaceOwner=globalThis.identity;
 assert.equal((await getPacificaAccess()).allowed,false);assert.equal(await workspaceAutomationAccess('owner-id'),false);assert.equal(await isPacificaOwnerApi(),false);
 globalThis.identity={...owner({pacificaRole:'agent',pacificaWorkspaceId:'owner-id'}),id:'agent-id'};assert.equal((await getPacificaAccess()).allowed,false);
 globalThis.workspaceOwner=owner({pacificaManaged:true,pacificaTrialEndsAt:'2099-01-01'});assert.equal((await getPacificaAccess()).role,'agent');assert.equal((await getPacificaAccess()).allowed,true);assert.equal(await workspaceAutomationAccess('owner-id'),true);
 globalThis.workspaceOwner.privateMetadata.pacificaAccessPaused=true;assert.equal((await getPacificaAccess()).allowed,false);assert.equal(await workspaceAutomationAccess('owner-id'),false);
 globalThis.paid=true;assert.equal((await getPacificaAccess()).allowed,false);delete globalThis.workspaceOwner.privateMetadata.pacificaAccessPaused;globalThis.workspaceOwner.privateMetadata.pacificaTrialEndsAt='2000-01-01';assert.equal((await getPacificaAccess()).allowed,true);
});
test('permanent grants work for the owner and team; limited scopes also constrain cron',async()=>{
 globalThis.paid=false;globalThis.identity=owner({pacificaManaged:true,pacificaPermanentAccess:true});globalThis.workspaceOwner=globalThis.identity;
 assert.equal((await getPacificaAccess()).allowed,true);assert.equal(await workspaceAutomationAccess('owner-id'),true);
 globalThis.workspaceOwner.privateMetadata.pacificaAccessScope='miner-only';assert.equal(await workspaceAutomationAccess('owner-id'),false);assert.equal(await workspaceAutomationAccess('owner-id','miner'),false);
 globalThis.identity={...owner({pacificaRole:'agent',pacificaWorkspaceId:'owner-id'}),id:'agent-id'};assert.equal((await getPacificaAccess()).allowed,true);
 globalThis.workspaceOwner.privateMetadata.pacificaAccessScope='read-only';assert.equal(await workspaceAutomationAccess('owner-id','miner'),false);
 globalThis.workspaceOwner.privateMetadata.pacificaAccessPaused=true;assert.equal((await getPacificaAccess()).allowed,false);
});
test('only the Pacifica platform owner can run Miner automation',async()=>{
 globalThis.optionalFeatures={miner:true,industryTools:false};
 globalThis.identity={...owner({pacificaManaged:true,pacificaPermanentAccess:true}),primaryEmailAddress:{emailAddress:'pacificalegalinsurance@gmail.com'}};globalThis.workspaceOwner=globalThis.identity;
 assert.equal(await workspaceAutomationAccess('owner-id','miner'),true);
 globalThis.optionalFeatures={miner:false,industryTools:false};assert.equal(await workspaceAutomationAccess('owner-id','miner'),false);assert.equal(await workspaceAutomationAccess('owner-id','crm'),true);
});

test('Archon requires the exact authenticated owner and workspace with full access',async t=>{
  const permitted = {pacificaManaged:true,pacificaPermanentAccess:true};
  const fields = ['PACIFICA_ARCHON_OWNER_USER_ID','PACIFICA_ARCHON_WORKSPACE_ID'];
  const previous = fields.map(key=>process.env[key]);
  t.after(()=>fields.forEach((key,index)=>{
    if(previous[index]===undefined) delete process.env[key];
    else process.env[key]=previous[index];
  }));
  process.env.PACIFICA_ARCHON_OWNER_USER_ID='owner-id';
  process.env.PACIFICA_ARCHON_WORKSPACE_ID='owner-id';
  globalThis.identity=owner(permitted);
  globalThis.workspaceOwner=globalThis.identity;
  assert.equal(canOpenArchon(await getPacificaAccess()),true);

  for(const role of ['agent','manager']) {
    globalThis.identity={...owner({pacificaRole:role,pacificaWorkspaceId:'owner-id'}),id:`${role}-id`};
    assert.equal((await getPacificaAccess()).allowed,true);
    assert.equal(canOpenArchon(await getPacificaAccess()),false);
  }
  globalThis.identity={...owner(permitted),id:'other-owner'};
  assert.equal(canOpenArchon(await getPacificaAccess()),false);
  globalThis.identity=owner({...permitted,pacificaWorkspaceId:'other-workspace'});
  assert.equal(canOpenArchon(await getPacificaAccess()),false);
  globalThis.identity=owner({...permitted,pacificaAccessScope:'read-only'});
  assert.equal(canOpenArchon(await getPacificaAccess()),false);
  globalThis.identity=owner({...permitted,pacificaAccessPaused:true});
  assert.equal(canOpenArchon(await getPacificaAccess()),false);
  globalThis.identity=undefined;
  assert.equal(canOpenArchon(await getPacificaAccess()),false);
  delete process.env.PACIFICA_ARCHON_WORKSPACE_ID;
  globalThis.identity=owner(permitted);
  assert.equal(canOpenArchon(await getPacificaAccess()),false);
});

test('Archon links require HTTPS and discard credential-bearing URLs',t=>{
  const key='PACIFICA_ARCHON_WORKSPACE_URL';
  const previous=process.env[key];
  t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous;});
  delete process.env[key];
  assert.equal(archonWorkspaceUrl(),null);
  for(const url of ['http://archon.example.test','https://token@archon.example.test/','https://archon.example.test/?key=test','https://archon.example.test/#key=test']) {
    process.env[key]=url;
    assert.equal(archonWorkspaceUrl(),null);
  }
  process.env[key]='https://archon.example.test/archon/';
  assert.equal(archonWorkspaceUrl()?.pathname,'/archon/');
});
