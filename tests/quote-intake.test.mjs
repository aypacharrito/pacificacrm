import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanQuoteDetails,validBirthDate,recordQuoteEvidence} from '../app/lib/quote-intake.ts';
import {createQuoteToken,readQuoteToken} from '../app/lib/quote-intake-token.ts';
import {opportunityFor,rankOpportunities,revenuePlan,acceptQuoteSubmission} from '../app/lib/opportunities.ts';
import {mergeCloudContact} from '../app/lib/contact-sync.ts';
const now=new Date('2026-09-23T12:00:00Z');
const details={name:'Test Prospect',phone:'8185550123',email:'test@example.test',product:'Auto',address:'1 Test St',city:'Test City',state:'CA',zip:'91331',dateOfBirth:'1990-06-15',renewalDate:'2026-10-10',vin:'',contactPermission:true};
const submission={id:'request-1',linkId:'link-1',leadId:null,source:'Referral partner',submittedAt:now.toISOString(),status:'pending',details};
test('DOB requires a complete real date, not an age or month/year estimate',()=>{
 for(const value of ['1983-01','43','1983','2026-02-30','2030-01-01','1990-06-15-extra'])assert.equal(validBirthDate(value,now),false);
 assert.equal(validBirthDate('1992-02-29',now),true);
 assert.throws(()=>cleanQuoteDetails({...details,dateOfBirth:'1983-01'},false,now),/complete/);
 assert.throws(()=>cleanQuoteDetails({...details,dateOfBirth:'1990-06-15-extra'},false,now),/complete/);
 assert.throws(()=>cleanQuoteDetails({...details,renewalDate:'2025-01-01'},false,now),/upcoming/);
 assert.throws(()=>cleanQuoteDetails({...details,contactPermission:false},false,now),/Confirm/);
 assert.throws(()=>cleanQuoteDetails({...details,website:'spam'},false,now),/Unable/);
 assert.equal(cleanQuoteDetails(details,false,now).dateOfBirth,'1990-06-15');
});
test('manual evidence requires consent, attestation, ordered stages and stable retry IDs',()=>{
 const reviewed={...submission,status:'accepted',consentText:'Customer requested insurance contact.'};
 const base={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',stage:'carrier_quote',reference:'CARRIER-Q-1234',attested:true};
 assert.throws(()=>recordQuoteEvidence(submission,base,'agent-1',now),/Review and customer consent/);
 assert.throws(()=>recordQuoteEvidence(reviewed,{...base,attested:false},'agent-1',now),/personally reviewed/);
 assert.throws(()=>recordQuoteEvidence(reviewed,{...base,stage:'binder_evidence'},'agent-1',now),/preceding/);
 const first=recordQuoteEvidence(reviewed,base,'agent-1',now);
 assert.equal(first.evidence[0].provenance,'agency_attested_unverified');
 assert.equal(recordQuoteEvidence(first,base,'agent-1',now),first);
 assert.throws(()=>recordQuoteEvidence(first,{...base,reference:'DIFFERENT'},'agent-1',now),/already belongs/);
 assert.throws(()=>recordQuoteEvidence(first,{...base,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},'agent-1',now),/already recorded/);
});
test('quote-link tokens are opaque and reject alteration and key rotation',()=>{
 process.env.QUOTE_INTAKE_SECRET='test-key-only-'.repeat(4);
 const token=createQuoteToken('workspace-a','link-a');
 assert.deepEqual(readQuoteToken(token),{workspaceId:'workspace-a',linkId:'link-a'});
 assert.equal(Buffer.from(token,'base64url').toString().includes('workspace-a'),false);
 const tampered=Buffer.from(token,'base64url');tampered[35]^=1;
 assert.throws(()=>readQuoteToken(tampered.toString('base64url')),/invalid/);
 process.env.QUOTE_INTAKE_SECRET='different-key-'.repeat(4);assert.throws(()=>readQuoteToken(token),/invalid/);
});
test('review fills empty fields, preserves existing facts and does not opt anyone into SMS',()=>{
 const existing={id:1,name:'Existing Person',phone:details.phone,email:'',dateOfBirth:'',vin:'EXISTING',smsConsent:false,automationEnabled:true};
 const result=acceptQuoteSubmission([existing],submission,now);
 assert.equal(result.leads.length,1);assert.equal(result.leads[0].name,'Existing Person');assert.equal(result.leads[0].vin,'EXISTING');assert.equal(result.leads[0].dateOfBirth,details.dateOfBirth);assert.equal(result.leads[0].smsConsent,false);assert.equal(result.leads[0].automationEnabled,false);
 assert.equal(acceptQuoteSubmission(result.leads,submission,now).leads[0].quoteRequests.length,1);
 for(const flag of ['deletedAt','doNotCall','smsOptOut','emailOptOut'])assert.throws(()=>acceptQuoteSubmission([{...existing,[flag]:true}],submission,now),/restrictions/);
 assert.throws(()=>acceptQuoteSubmission([existing,{...existing,id:2}],submission,now),/Multiple/);
});
test('a stale browser cannot erase reviewed quote details or request evidence',()=>{
 const local={id:1,name:'Person',phone:details.phone,dateOfBirth:'',quoteRequests:[]};
 const remote={...local,dateOfBirth:details.dateOfBirth,quoteRequests:[{id:'r',requestedAt:now.toISOString(),source:'Website'}],quoteDetailsUpdatedAt:now.toISOString()};
 const merged=mergeCloudContact(local,remote);assert.equal(merged.dateOfBirth,details.dateOfBirth);assert.equal(merged.quoteRequests.length,1);
});
test('cold imports, STOP, and expired renewal dates are not fabricated warm leads',()=>{
 const base={id:1,name:'Prospect',phone:details.phone,source:'SmartFinancial',stage:'New lead',outcome:'Not contacted'};
 assert.equal(opportunityFor(base,now.getTime()),null);
 const renewal=opportunityFor({...base,renewalDate:'2026-10-10'},now.getTime());assert.equal(renewal.kind,'renewal');assert.equal(renewal.warm,false);
 assert.equal(opportunityFor({...base,renewalDate:'2025-10-10'},now.getTime()),null);
 assert.equal(opportunityFor({...base,smsOptOut:true,outcome:'Interested'},now.getTime()),null);
 const request={...base,quoteRequests:[{id:'r',requestedAt:now.toISOString(),source:'Website'}]};assert.equal(opportunityFor(request,now.getTime()).warm,true);
 assert.equal(rankOpportunities([{...base,id:2,renewalDate:'2026-10-10'},request],now.getTime())[0].lead.id,1);
 assert.equal(revenuePlan(1000000,500,20).requests,10000);assert.equal(revenuePlan(100,0,10),null);
});
