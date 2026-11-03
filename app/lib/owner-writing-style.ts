import {cleanCommunications} from './communications';
/** Derive only non-content style signals from explicitly human-authored messages.
 * Legacy/provider messages, generated drafts and inbound text never become training data. */
export function ownerWritingStyle(leads:unknown[],profile:{learnWritingStyle?:boolean;writingStyleSince?:string;outreachTone?:string}){
 const seen=new Set<string>(),since=Date.parse(profile.writingStyleSince||'')||0;
 const samples=leads.flatMap(raw=>cleanCommunications((raw as {communications?:unknown})?.communications))
  .filter(m=>{const key=m.providerId||m.id;if(seen.has(key))return false;seen.add(key);return m.authorship==='owner'&&m.direction==='outbound'&&!['failed','undelivered','draft','task'].includes(m.status)&&Date.parse(m.sentAt)>=since&&m.body.length>=8&&m.body.length<=1500})
  .sort((a,b)=>Date.parse(b.sentAt)-Date.parse(a.sentAt)).slice(0,80);
 const base={enabled:profile.learnWritingStyle!==false,samples:samples.length,tone:profile.outreachTone||'professional-friendly',ready:false,instructions:'Use the owner-selected tone. Not enough confirmed human messages to learn a style yet.'};
 if(!base.enabled)return {...base,instructions:'Use the owner-selected tone; style learning is off.'};
 if(samples.length<5)return base;
 const words=samples.map(m=>m.body.trim().split(/\s+/).length),average=Math.round(words.reduce((a,b)=>a+b,0)/words.length);
 const rate=(pattern:RegExp)=>samples.filter(m=>pattern.test(m.body)).length/samples.length;
 const instructions=[average<22?'Prefer very short, direct messages.':average<50?'Prefer concise conversational sentences.':'Use complete, measured sentences, without becoming wordy.',
  rate(/\b(hi|hey|hello|hola|buenos)\b/i)>.5?'Usually open with a brief greeting.':'Avoid adding a greeting to every reply.',
  rate(/\b\w+['’](?:m|re|ll|ve|d|t)\b/i)>.3?'Natural contractions fit the owner’s style.':'Prefer clear plain language.',
  rate(/!/)>.4?'Occasional enthusiasm is natural.':'Use restrained punctuation.',
  'These are style statistics, never permission to invent facts, mimic a customer, omit required disclosures, or loosen message limits.'].join(' ');
 return {...base,ready:true,averageWords:average,instructions};
}
