import {cleanCommunications} from "./communications";
import type { WorkspaceIndustry, WorkspaceProfile } from "./workspace-profile";

export const industryLabels: Record<WorkspaceIndustry,string> = {
  general:"General sales",
  insurance:"Insurance",
  automotive:"Automotive / dealership",
  "home-services":"Home services",
  legal:"Legal services",
  "real-estate":"Real estate",
  "financial-services":"Financial / mortgage",
  "health-beauty":"Health & beauty",
  custom:"Custom business",
};

export const industryObjectiveHints: Record<WorkspaceIndustry,string> = {
  general:"Qualify the lead, understand the need, and move the opportunity to the next appropriate sales step.",
  insurance:"Understand the coverage need, timing, and current situation, then move the lead toward a quote or appointment without inventing rates or coverage.",
  automotive:"Understand the vehicle, budget, trade-in, financing, timing, and visit preference, then move the shopper toward a useful dealership conversation or appointment.",
  "home-services":"Understand the project, property, urgency, location, and estimate needs, then move the lead toward a qualified estimate or appointment.",
  legal:"Understand the general service requested and urgency, then move the prospect toward an appropriate consultation without giving legal advice or promising outcomes.",
  "real-estate":"Understand whether the prospect is buying, selling, renting, or investing, plus timing and location, then move them toward the appropriate conversation or appointment.",
  "financial-services":"Understand the requested financial service, broad goals, and timing, then move the prospect toward a qualified conversation without promising approval, rates, returns, or outcomes.",
  "health-beauty":"Understand the requested service, goals, timing, and appointment preference, then move the prospect toward a suitable consultation or booking without making unsupported medical claims.",
  custom:"Follow the workspace owner's sales objective and business instructions using only facts supported by the workspace and lead record.",
};

const blockedKey = /(phone|mobile|email|address|street|ssn|social.?security|birth|dob|password|secret|token|routing|bank|card|license|passport|vin|policy.?number|account.?number)/i;
const systemKey = /^(id|notes|deletedAt|deletionUpdatedAt|communications|smsConsent|smsOptOut|emailConsent|emailOptOut|lastSmsAt|lastEmailAt|automation|clientReminderKeys)$/i;

function scalar(value:unknown){
  if(typeof value==="string")return value.trim().slice(0,400);
  if(typeof value==="number"&&Number.isFinite(value))return value;
  if(typeof value==="boolean")return value;
  return undefined;
}

function safeObject(value:unknown,limit=30){
  if(!value||typeof value!=="object"||Array.isArray(value))return {} as Record<string,string|number|boolean>;
  const result:Record<string,string|number|boolean>={};
  for(const [key,raw] of Object.entries(value as Record<string,unknown>)){
    if(Object.keys(result).length>=limit)break;
    if(blockedKey.test(key)||systemKey.test(key))continue;
    const clean=scalar(raw);if(clean===undefined||clean==="")continue;
    result[key.slice(0,80)]=clean;
  }
  return result;
}

export function businessAiContext(profile:WorkspaceProfile){
  const industry=profile.industry||"general";
  return {
    industry,
    industryLabel:profile.businessTypeLabel||industryLabels[industry],
    businessName:profile.businessName||"the business",
    representative:profile.agentName||"the sales team",
    businessDescription:profile.businessDescription||"",
    productsServices:profile.productsServices,
    idealCustomer:profile.idealCustomer||"",
    valueProposition:profile.valueProposition||"",
    salesObjective:profile.salesObjective||industryObjectiveHints[industry],
    outreachTone:profile.outreachTone,
    customAiInstructions:profile.customAiInstructions||"",
  };
}

export function leadAiContext(lead:Record<string,unknown>,includeNotes=false){
  const importedFields=safeObject(lead.importedFields,40);
  const providerFields=safeObject(lead.extraFields,40);
  const customFields=safeObject(lead,40);
  const product=String(lead.product||lead.vehicle||lead.service||lead.interest||"General inquiry").trim().slice(0,160);
  return {
    id:Number(lead.id)||0,
    name:String(lead.name||"Unknown lead").trim().slice(0,100),
    phone:String(lead.phone||"").trim().slice(0,40),
    smsConsent:lead.smsConsent===true,
    smsOptOut:lead.smsOptOut===true,
    city:String(lead.city||"").trim().slice(0,80),
    state:String(lead.state||"").trim().slice(0,40),
    product,
    source:String(lead.source||"Unknown").trim().slice(0,100),
    stage:String(lead.stage||"New lead").trim().slice(0,60),
    outcome:String(lead.outcome||"Not contacted").trim().slice(0,80),
    sourceDisposition:String(lead.sourceDisposition||"").trim().slice(0,100),
    followUp:String(lead.followUp||"").trim().slice(0,80),
    lastContact:String(lead.lastContact||"Never").trim().slice(0,100),
    received:String(lead.received||lead.importedAt||"").trim().slice(0,80),
    attempts:Math.max(0,Number(lead.attempts)||0),
    leadCost:Math.max(0,Number(lead.leadCost)||0),
    vehicle:String(lead.vehicle||"").trim().slice(0,160),
    brand:String(lead.brand||"").trim().slice(0,120),
    territory:String(lead.territory||"").trim().slice(0,120),
    importedFields,
    providerFields,
    customFields,
    recentMessages:includeNotes?cleanCommunications(lead.communications).slice(-5).map(message=>({id:message.id,channel:message.channel,direction:message.direction,subject:message.subject||"",body:message.body.slice(0,700),sentAt:message.sentAt,attachmentCount:message.attachments?.length||0})):[],
    notes:includeNotes?String(lead.notes||"").trim().slice(0,1200):"[not shared]",
  };
}

export function workspaceContextLine(profile:WorkspaceProfile){
  const context=businessAiContext(profile);
  const products=context.productsServices.length?` Products/services: ${context.productsServices.join(", ")}.`:"";
  const value=context.valueProposition?` Value proposition: ${context.valueProposition}.`:"";
  return `${context.businessName} is a ${context.industryLabel} workspace. Objective: ${context.salesObjective}.${products}${value}`;
}
