import test from 'node:test';
import assert from 'node:assert/strict';
import {GET,POST} from '../../app/api/calendar/member-callbacks/route.ts';
import {workspaceKey} from '../../app/lib/workspace-storage.ts';
import {resolveCallbackTime} from '../../app/lib/member-callbacks.ts';

const url='https://example.test/api/calendar/member-callbacks';
const post=(body,origin='https://example.test')=>POST(new Request(url,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));
const member=(workspace,id)=>{globalThis.pacificaTestWorkspace=workspace;globalThis.pacificaTestMember=id;globalThis.pacificaTestRole='agent';globalThis.pacificaTestAccess=true};

test('local wall time rejects missing and double DST hours without guessing the caller time zone',()=>{
  const before=Date.parse('2026-01-01T00:00:00Z');
  assert.throws(()=>resolveCallbackTime('2026-03-08T02:30','America/Los_Angeles',before),/does not exist/);
  assert.throws(()=>resolveCallbackTime('2026-11-01T01:30','America/Los_Angeles',before),/occurs twice/);
  assert.equal(resolveCallbackTime('2026-03-09T14:00','America/Los_Angeles',before),'2026-03-09T21:00:00.000Z');
});

test('member confirmation requires exact saved SMS, conflict review and stores one private callback on retry',async()=>{
  const old={fetch:globalThis.fetch,url:process.env.KV_REST_API_URL,token:process.env.KV_REST_API_TOKEN,workspace:globalThis.pacificaTestWorkspace,member:globalThis.pacificaTestMember,role:globalThis.pacificaTestRole,access:globalThis.pacificaTestAccess};
  process.env.KV_REST_API_URL='https://synthetic-redis.example.test';process.env.KV_REST_API_TOKEN='synthetic';
  const localTime=new Date(Date.now()+2*86_400_000).toISOString().slice(0,16),dueAt=localTime+':00.000Z';
  const sentAt=new Date(Date.now()-3600_000).toISOString();
  const fixture=(name)=>JSON.stringify({profile:{automationTimezone:'Etc/UTC',teamRoster:[{userId:'member-a',email:'a@example.test',name:'Dealer A',active:true,role:'agent'},{userId:'member-b',email:'b@example.test',name:'Dealer B',active:true,role:'agent'}]},leads:[
    {id:1,name,phone:'+15550000001',stage:'Follow-up',outcome:'Interested',assignedTo:'Dealer A',communications:[{id:'source-a',channel:'sms',direction:'inbound',body:'Sí, me interesa. Llámame el martes a las dos.',status:'received',sentAt}]},
    {id:2,name:'Other member',phone:'+15550000002',stage:'Follow-up',outcome:'Interested',assignedTo:'Dealer B',communications:[{id:'source-b',channel:'sms',direction:'inbound',body:'Call me',status:'received',sentAt}]},
  ],callLogs:[],officeItems:[{id:'existing-appointment',leadId:2,kind:'appointment',title:'Seeded CRM conflict',dueAt,amount:0,status:'open',reminderAt:'',reminderState:'off',createdAt:sentAt}]});
  const data=new Map([[workspaceKey('dealer-one'),fixture('Ana')],[workspaceKey('dealer-two'),fixture('Other Ana')]]),sets=[];
  globalThis.fetch=async(target,options)=>{
    assert.equal(target,process.env.KV_REST_API_URL);
    const [command,key,value,option]=JSON.parse(options.body);
    if(command==='GET')return Response.json({result:data.get(key)??null});
    if(command==='SMEMBERS')return Response.json({result:data.get(key)??[]});
    if(command==='SET'){sets.push(key);if(option==='NX'&&data.has(key))return Response.json({result:null});data.set(key,value);return Response.json({result:'OK'});}
    if(command==='SADD'){const items=data.get(key)||[];data.set(key,[...new Set([...items,value])]);return Response.json({result:1});}
    assert.fail('Unexpected Redis command '+command);
  };
  try{
    member('dealer-one','member-a');
    assert.equal((await post({action:'preview',leadId:2,messageId:'source-b',localTime})).status,404);
    assert.equal((await post({action:'preview',leadId:1,messageId:'missing',localTime})).status,404);
    assert.equal((await post({action:'preview',leadId:1,messageId:'source-a',localTime},'https://other.test')).status,403);
    const preview=(await (await post({action:'preview',leadId:1,messageId:'source-a',localTime})).json()).preview;
    assert.equal(preview.timezone,'Etc/UTC');assert.deepEqual(preview.conflicts.map(item=>item.id),['existing-appointment']);
    const request={action:'confirm',leadId:1,messageId:'source-a',localTime,fingerprint:preview.fingerprint};
    assert.equal((await post(request)).status,409);
    assert.equal((await post({...request,fingerprint:'old',acknowledgeConflict:true})).status,409);
    const approved=await (await post({...request,acknowledgeConflict:true})).json();assert.equal(approved.created,true);assert.equal(approved.item.privateMemberId,'member-a');
    const retried=await (await post({...request,acknowledgeConflict:true})).json();assert.equal(retried.created,false);assert.equal(retried.item.id,approved.item.id);
    const list=(await (await GET()).json()).items;assert.equal(list.length,1);assert.equal(list[0].sourceMessageId,'source-a');
    const complete=await (await post({action:'complete',id:approved.item.id})).json();assert.equal(complete.item.status,'done');
    assert.equal((await (await post({...request,acknowledgeConflict:true})).json()).item.status,'done');
    member('dealer-one','member-b');assert.deepEqual((await (await GET()).json()).items,[]);
    member('dealer-two','member-a');assert.deepEqual((await (await GET()).json()).items,[]);
    member('dealer-one','member-a');globalThis.pacificaTestAccess=false;assert.equal((await GET()).status,403);
    assert.equal(sets.filter(key=>key.includes('member-callback')).length,2);
  }finally{globalThis.fetch=old.fetch;for(const [key,value] of [['KV_REST_API_URL',old.url],['KV_REST_API_TOKEN',old.token]]){if(value===undefined)delete process.env[key];else process.env[key]=value}globalThis.pacificaTestWorkspace=old.workspace;globalThis.pacificaTestMember=old.member;globalThis.pacificaTestRole=old.role;globalThis.pacificaTestAccess=old.access}
});
