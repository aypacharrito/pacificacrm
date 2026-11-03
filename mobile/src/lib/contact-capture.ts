import type {Lead} from "./types";

export const documentContactFields=["address","zip","dateOfBirth","licenseNumber","licenseState","licenseExpiration","carrier","policyNumber","policyEffectiveDate","policyExpirationDate","policyPremium","policyTermMonths","billingFrequency","installmentAmount","vin","vehicle"] as const;
export type ContactDraft=Record<typeof documentContactFields[number],string>&{name:string;phone:string;email:string;city:string;state:string;product:string;line:"life"|"home-auto";notes:string};
export function cleanContactDraft(value:Partial<ContactDraft>):ContactDraft{
  const text=(input:unknown,max:number)=>String(input||"").trim().slice(0,max);
  const fields=Object.fromEntries(documentContactFields.map(key=>[key,text(value[key],240)])) as Record<typeof documentContactFields[number],string>;
  return {...fields,name:text(value.name,140),phone:text(value.phone,40),email:text(value.email,180),city:text(value.city,120),state:text(value.state,40),product:text(value.product,140),line:value.line==="home-auto"?"home-auto":"life",notes:text(value.notes,20000)};
}
function phoneKey(value:string){const digits=value.replace(/\D/g,"");return digits.length===11&&digits.startsWith("1")?digits.slice(1):digits}
export function matchingContact(leads:Lead[],draft:ContactDraft){
  const phone=phoneKey(draft.phone),email=draft.email.trim().toLowerCase();
  return leads.find(lead=>(phone.length>=7&&phoneKey(lead.phone||"")===phone)||(email&&String(lead.email||"").trim().toLowerCase()===email));
}
export function capturedContact(value:ContactDraft,id:number):Lead{
  const draft=cleanContactDraft(value);
  if(!draft.phone&&!draft.email&&!(draft.name&&(draft.licenseNumber||draft.address||draft.dateOfBirth)))throw new Error("Add contact details or a name with readable ID/address details.");
  if(draft.phone&&phoneKey(draft.phone).length<7)throw new Error("Check the full phone number before saving.");
  const amount=(value:string)=>{const clean=value.replace(/[$,\s]/g,"");return /^\d+(\.\d{1,2})?$/.test(clean)?Number(clean):0};
  return {...draft,importedFields:Object.fromEntries(documentContactFields.filter(key=>draft[key]).map(key=>[key,draft[key]])),policyPremium:amount(draft.policyPremium),policyTermMonths:amount(draft.policyTermMonths),installmentAmount:amount(draft.installmentAmount),id,name:draft.name||draft.phone||draft.email,status:"Ready",stage:"New lead",outcome:"Not contacted",followUp:"",doNotCall:false,lastContact:"Never",source:"Mobile AI capture",leadCost:0,sourceDisposition:"",importedAt:new Date().toISOString(),smsConsent:false,emailConsent:false,automationEnabled:false};
}
