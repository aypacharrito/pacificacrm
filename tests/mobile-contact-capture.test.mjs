import test from "node:test";
import assert from "node:assert/strict";
import * as mobileModule from "../mobile/src/lib/contact-capture.ts";
// Expo is CommonJS; Node 22 exposes these TypeScript exports under default.
const {capturedContact,cleanContactDraft,matchingContact}=mobileModule.default||mobileModule;

test("photo contact requires a reviewed way to reach the person",()=>{
 assert.throws(()=>capturedContact(cleanContactDraft({name:"Sam"}),1),/contact details or a name with readable ID\/address details/);
 assert.throws(()=>capturedContact(cleanContactDraft({phone:"123"}),1),/full phone/);
 const contact=capturedContact(cleanContactDraft({phone:"8185550100",line:"home-auto"}),22);
 assert.equal(contact.name,"8185550100");assert.equal(contact.id,22);
 assert.equal(contact.smsConsent,false);assert.equal(contact.emailConsent,false);
 assert.equal(contact.line,"home-auto");assert.equal(contact.stage,"New lead");
});
test("capture detects formatted phone/email duplicates including deleted and do-not-call contacts",()=>{
 const draft=cleanContactDraft({name:"Sam",phone:"+1 (818) 555-0100"});
 const existing={...capturedContact(draft,10),phone:"8185550100",doNotCall:true,deletedAt:"2026-09-11"};
 assert.equal(matchingContact([existing],draft),existing);
 assert.equal(matchingContact([{...existing,email:"Sam@Example.com"}],cleanContactDraft({email:"sam@example.com"}))?.id,10);
 assert.equal(matchingContact([existing],cleanContactDraft({phone:"5550101"})),undefined);
});
