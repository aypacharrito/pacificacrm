import test from 'node:test';
import assert from 'node:assert/strict';
import {getPacificaAccess,workspaceAutomationAccess,isPacificaOwnerApi} from '../../app/lib/clerk-access.ts';
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
