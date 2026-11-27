import test from 'node:test';import assert from 'node:assert/strict';
import {GET} from '../../app/api/desktop/page-identity/route.ts';
test('desktop page identity comes from authenticated session, not request parameters',async()=>{
 const old={access:globalThis.pacificaTestAccess,workspace:globalThis.pacificaTestWorkspace,member:globalThis.pacificaTestMember};
 try{
  globalThis.pacificaTestAccess=false;assert.equal((await GET()).status,403);
  globalThis.pacificaTestAccess=true;globalThis.pacificaTestWorkspace='workspace-a';globalThis.pacificaTestMember='member-a';
  const first=await GET();assert.equal(first.headers.get('cache-control'),'no-store');assert.deepEqual(await first.json(),{workspaceId:'workspace-a',memberId:'member-a'});
  globalThis.pacificaTestMember='member-b';assert.deepEqual(await (await GET()).json(),{workspaceId:'workspace-a',memberId:'member-b'});
 }finally{globalThis.pacificaTestAccess=old.access;globalThis.pacificaTestWorkspace=old.workspace;globalThis.pacificaTestMember=old.member}
});
