import {cleanWarming,defaultWarming,type WarmingSettings} from "./lead-warming-policy";
// PACIFICA_VERTICAL_PLATFORM_V1
export type WorkspaceMode="sales"|"insurance";
export type WorkspaceIndustry="general"|"insurance"|"automotive"|"home-services"|"legal"|"real-estate"|"financial-services"|"health-beauty"|"custom";
export type OutreachTone="professional-friendly"|"casual"|"concise"|"consultative"|"luxury";
export type WorkspaceAppearance="light"|"dark";
const workspaceIndustries=new Set<WorkspaceIndustry>(["general","insurance","automotive","home-services","legal","real-estate","financial-services","health-beauty","custom"]);
export type WorkspaceDisplaySize="comfortable"|"large"|"extra-large";
export type CommunicationTemplate={id:string;name:string;channel:"sms"|"email";subject:string;body:string;updatedAt:string};
export type AutomationChannel="sms"|"email"|"task";
export type AutomationTrigger="new-lead"|"no-answer"|"interested";
export type AutomationStep={id:string;channel:AutomationChannel;delayMinutes:number;templateId:string;enabled:boolean};
export type AutomationSequence={id:string;name:string;trigger:AutomationTrigger;active:boolean;stopOnReply:boolean;steps:AutomationStep[]};
export type WorkspaceTeamMember={userId:string;email:string;name:string;role:"manager"|"agent";active:boolean};
export type LiveCallSession={leadId:number|null;name:string;phone:string;line:"life"|"home-auto";status:"dialing"|"connected";startedAt:string;updatedAt:string};
export type DialerRunState={ids:number[];completed:number;total:number;startedAt:string;updatedAt:string}; // PACIFICA_STABLE_DIALER_RUN_V2
export type MinerAutoFeedSettings={enabled:boolean;personalAuto:boolean;home:boolean;commercial:boolean;zipCodes:string[];commercialCategories:string[];batchSize:number;lastRunAt:string;lastRunStatus:string;lastAdded:number;cursor:number};

export const defaultAutomationSequences:AutomationSequence[]=[
  {id:"speed-to-lead",name:"Fresh lead follow-up",trigger:"new-lead",active:true,stopOnReply:true,steps:[
    {id:"fresh-sms",channel:"sms",delayMinutes:5,templateId:"starter-speed-to-lead",enabled:true},
    {id:"fresh-email",channel:"email",delayMinutes:120,templateId:"starter-email-follow-up",enabled:true},
    {id:"fresh-task",channel:"task",delayMinutes:1440,templateId:"",enabled:true},
    {id:"fresh-check-in",channel:"sms",delayMinutes:4320,templateId:"starter-gentle-follow-up",enabled:true},
  ]},
  {id:"missed-call",name:"No-answer recovery",trigger:"no-answer",active:true,stopOnReply:true,steps:[
    {id:"missed-sms",channel:"sms",delayMinutes:120,templateId:"starter-gentle-follow-up",enabled:true},
    {id:"missed-email",channel:"email",delayMinutes:1440,templateId:"starter-email-check-in",enabled:true},
    {id:"missed-task",channel:"task",delayMinutes:4320,templateId:"",enabled:true},
  ]},
];

export type WorkspaceProfile={
  leadWarming:WarmingSettings;
  mode:WorkspaceMode;
  industry:WorkspaceIndustry;
  onboardingCompleted:boolean;
  businessTypeLabel:string;
  customerType:"consumer"|"business"|"both";
  businessDescription:string;
  productsServices:string[];
  idealCustomer:string;
  valueProposition:string;
  salesObjective:string;
  outreachTone:OutreachTone;
  customAiInstructions:string;
  aiPersonalizationEnabled:boolean;
  maxAutomatedTouchesPerLeadPerDay:number;
  appearance:WorkspaceAppearance;
  dialerLightBackdropUrl:string;
  dialerDarkBackdropUrl:string;
  dialerBackdropMotion:boolean;
  displaySize:WorkspaceDisplaySize;
  quietDialing:boolean;
  dialerRingTimeoutSeconds:20|30;
  smsConsentSources:string[];
  smsConsentPolicyVersion:number;
  emailConsentSources:string[];
  businessName:string;
  agentName:string;
  callbackNumber:string;
  replyToEmail:string;
  emailSignature:string;
  businessAddress:string;
  teamMembers:string[];
  serverAutomationEnabled:boolean;
  automationTimezone:string;
  communicationTemplates:CommunicationTemplate[];
  automationSequences:AutomationSequence[];
  providerFallbackEnabled:boolean;
  minerAutoFeed:MinerAutoFeedSettings;
  assignmentStrategy:"manual"|"round-robin";
  teamRoster:WorkspaceTeamMember[];
  callRecordingEnabled:boolean;
  callAiSummaryEnabled:boolean;
  clientRemindersEnabled:boolean;
  customerReminderSmsEnabled:boolean;
  ownerReminderSmsEnabled:boolean;
  ownerReminderPhone:string;
  liveCallSession:LiveCallSession|null;
  dialerRuns:{life:DialerRunState|null;"home-auto":DialerRunState|null};
  expoPushToken:string;
};

export const defaultWorkspaceProfile:WorkspaceProfile={
  leadWarming:{...defaultWarming},
  mode:"sales",
  industry:"general",
  onboardingCompleted:false,
  businessTypeLabel:"",
  customerType:"both",
  businessDescription:"",
  productsServices:[],
  idealCustomer:"",
  valueProposition:"",
  salesObjective:"",
  outreachTone:"professional-friendly",
  customAiInstructions:"",
  aiPersonalizationEnabled:true,
  maxAutomatedTouchesPerLeadPerDay:1,
  appearance:"dark",
  dialerLightBackdropUrl:"",
  dialerDarkBackdropUrl:"",
  dialerBackdropMotion:true,
  displaySize:"large",
  quietDialing:true,
  dialerRingTimeoutSeconds:20,
  smsConsentSources:[],
  smsConsentPolicyVersion:0,
  emailConsentSources:[],
  businessName:"",
  agentName:"",
  callbackNumber:"",
  replyToEmail:"",
  emailSignature:"",
  businessAddress:"",
  teamMembers:[],
  serverAutomationEnabled:false,
  automationTimezone:"America/Los_Angeles",
  communicationTemplates:[],
  automationSequences:defaultAutomationSequences,
  providerFallbackEnabled:true,
  minerAutoFeed:{enabled:false,personalAuto:true,home:true,commercial:true,zipCodes:[],commercialCategories:[],batchSize:20,lastRunAt:"",lastRunStatus:"Not run yet",lastAdded:0,cursor:0},
  assignmentStrategy:"round-robin",
  teamRoster:[],
  callRecordingEnabled:false,
  callAiSummaryEnabled:false,
  clientRemindersEnabled:false,
  customerReminderSmsEnabled:false,
  ownerReminderSmsEnabled:false,
  ownerReminderPhone:"",
  liveCallSession:null,
  dialerRuns:{life:null,"home-auto":null},
  expoPushToken:"",
};

function cleanSequence(raw:unknown,index:number):AutomationSequence|null{
  if(!raw||typeof raw!=="object")return null;
  const sequence=raw as Partial<AutomationSequence>;
  const trigger:AutomationTrigger=sequence.trigger==="no-answer"?"no-answer":sequence.trigger==="interested"?"interested":"new-lead";
  const steps=Array.isArray(sequence.steps)?sequence.steps.slice(0,12).flatMap((value,stepIndex)=>{
    if(!value||typeof value!=="object")return [];
    const step=value as Partial<AutomationStep>;
    const channel:AutomationChannel=step.channel==="email"?"email":step.channel==="task"?"task":"sms";
    return [{id:String(step.id||`step-${stepIndex}`).slice(0,100),channel,delayMinutes:Math.min(43200,Math.max(0,Math.round(Number(step.delayMinutes)||0))),templateId:String(step.templateId||"").slice(0,100),enabled:step.enabled!==false}];
  }):[];
  if(!steps.length)return null;
  return {id:String(sequence.id||`sequence-${index}`).slice(0,100),name:String(sequence.name||"Follow-up sequence").trim().slice(0,100),trigger,active:sequence.active!==false,stopOnReply:sequence.stopOnReply!==false,steps};
}

function cleanDialerRun(value:unknown):DialerRunState|null{
  if(!value||typeof value!=="object")return null;
  const run=value as Partial<DialerRunState>;
  const ids=Array.isArray(run.ids)?Array.from(new Set(run.ids.map(Number).filter(id=>Number.isFinite(id)&&id>0))).slice(0,10000):[];
  if(!ids.length)return null;
  const total=Math.max(ids.length,Math.round(Number(run.total)||ids.length));
  const completed=Math.min(total,Math.max(0,Math.round(Number(run.completed)||0)));
  return {ids,completed,total,startedAt:String(run.startedAt||new Date().toISOString()),updatedAt:String(run.updatedAt||new Date().toISOString())};
}

function cleanDialerBackdropUrl(value:unknown){
  const raw=String(value||"").trim().slice(0,1200);if(!raw)return "";if(raw.startsWith("/"))return raw;
  try{const parsed=new URL(raw);return parsed.protocol==="https:"?raw:""}catch{return ""}
}

export function cleanWorkspaceProfile(value:unknown):WorkspaceProfile{
  const profile=value&&typeof value==="object"?value as Partial<WorkspaceProfile>:{};
  const rawLiveCall=profile.liveCallSession&&typeof profile.liveCallSession==="object"?profile.liveCallSession:null;
  const rawDialerRuns=profile.dialerRuns&&typeof profile.dialerRuns==="object"?profile.dialerRuns as Partial<Record<"life"|"home-auto",DialerRunState>>:{};
  const rawMiner=profile.minerAutoFeed&&typeof profile.minerAutoFeed==="object"?profile.minerAutoFeed as Partial<MinerAutoFeedSettings>:{};
  return {
    mode:profile.mode==="insurance"?"insurance":"sales",
    industry:workspaceIndustries.has(profile.industry as WorkspaceIndustry)?profile.industry as WorkspaceIndustry:profile.mode==="insurance"?"insurance":"general",
    onboardingCompleted:profile.onboardingCompleted===true||Boolean(String(profile.businessName||"").trim()||String(profile.businessDescription||"").trim()||(Array.isArray(profile.productsServices)&&profile.productsServices.length)),
    businessTypeLabel:String(profile.businessTypeLabel||"").trim().slice(0,120),
    customerType:profile.customerType==="consumer"||profile.customerType==="business"?profile.customerType:"both",
    businessDescription:String(profile.businessDescription||"").trim().slice(0,1200),
    productsServices:Array.isArray(profile.productsServices)?Array.from(new Set(profile.productsServices.map(value=>String(value).trim().slice(0,120)).filter(Boolean))).slice(0,30):[],
    idealCustomer:String(profile.idealCustomer||"").trim().slice(0,800),
    valueProposition:String(profile.valueProposition||"").trim().slice(0,800),
    salesObjective:String(profile.salesObjective||"").trim().slice(0,1200),
    outreachTone:profile.outreachTone==="casual"||profile.outreachTone==="concise"||profile.outreachTone==="consultative"||profile.outreachTone==="luxury"?profile.outreachTone:"professional-friendly",
    customAiInstructions:String(profile.customAiInstructions||"").trim().slice(0,2000),
    aiPersonalizationEnabled:profile.aiPersonalizationEnabled!==false,
    leadWarming:cleanWarming(profile.leadWarming),
    maxAutomatedTouchesPerLeadPerDay:Math.min(3,Math.max(1,Math.round(Number(profile.maxAutomatedTouchesPerLeadPerDay)||1))),
    appearance:profile.appearance==="light"?"light":"dark",
    dialerLightBackdropUrl:cleanDialerBackdropUrl(profile.dialerLightBackdropUrl),
    dialerDarkBackdropUrl:cleanDialerBackdropUrl(profile.dialerDarkBackdropUrl),
    dialerBackdropMotion:profile.dialerBackdropMotion!==false,
    displaySize:profile.displaySize==="comfortable"?"comfortable":profile.displaySize==="extra-large"?"extra-large":"large",
    quietDialing:profile.quietDialing!==false,
    dialerRingTimeoutSeconds:Number(profile.dialerRingTimeoutSeconds)===30?30:20,
    smsConsentSources:!profile.smsConsentPolicyVersion&&String(profile.businessName||'').toLowerCase().replace(/[^a-z]/g,'')==='davidsinsurance'
      ?Array.from(new Set([...cleanConsentSources(profile.smsConsentSources),'SmartFinancial',"David's Insurance",'Website']))
      :cleanConsentSources(profile.smsConsentSources),
    smsConsentPolicyVersion:1,
    emailConsentSources:cleanConsentSources(profile.emailConsentSources),
    businessName:String(profile.businessName||"").trim().slice(0,100),
    agentName:String(profile.agentName||"").trim().slice(0,80),
    callbackNumber:String(profile.callbackNumber||"").trim().slice(0,40),
    replyToEmail:String(profile.replyToEmail||"").trim().slice(0,160),
    emailSignature:String(profile.emailSignature||"").trim().slice(0,500),
    businessAddress:String(profile.businessAddress||"").trim().slice(0,300),
    teamMembers:Array.isArray(profile.teamMembers)?Array.from(new Set(profile.teamMembers.map(value=>String(value).trim().slice(0,80)).filter(Boolean))):[],
    serverAutomationEnabled:profile.serverAutomationEnabled===true,
    automationTimezone:String(profile.automationTimezone||"America/Los_Angeles").trim().slice(0,80),
    communicationTemplates:Array.isArray(profile.communicationTemplates)?profile.communicationTemplates.slice(0,100).flatMap(raw=>{
      if(!raw||typeof raw!=="object")return [];
      const template=raw as Partial<CommunicationTemplate>;
      const body=String(template.body||"").trim().slice(0,10000);if(!body)return [];
      return [{id:String(template.id||crypto.randomUUID()).slice(0,100),name:String(template.name||"Saved template").trim().slice(0,100),channel:template.channel==="email"?"email" as const:"sms" as const,subject:String(template.subject||"").trim().slice(0,200),body,updatedAt:String(template.updatedAt||new Date().toISOString())}];
    }):[],
    automationSequences:(Array.isArray(profile.automationSequences)?profile.automationSequences:defaultAutomationSequences).slice(0,20).flatMap((raw,index)=>{const sequence=cleanSequence(raw,index);return sequence?[sequence]:[]}),
    providerFallbackEnabled:profile.providerFallbackEnabled!==false,
    minerAutoFeed:{
      enabled:rawMiner.enabled===true,
      personalAuto:rawMiner.personalAuto!==false,
      home:rawMiner.home!==false,
      commercial:rawMiner.commercial!==false,
      zipCodes:Array.isArray(rawMiner.zipCodes)?Array.from(new Set(rawMiner.zipCodes.map(value=>String(value).trim()).filter(value=>/^\d{5}(?:-\d{4})?$/.test(value)))).slice(0,30):[],
      commercialCategories:Array.isArray(rawMiner.commercialCategories)?Array.from(new Set(rawMiner.commercialCategories.map(value=>String(value).trim().slice(0,80)).filter(Boolean))).slice(0,30):[],
      batchSize:Math.min(50,Math.max(5,Math.round(Number(rawMiner.batchSize)||20))),
      lastRunAt:String(rawMiner.lastRunAt||"").slice(0,80),
      lastRunStatus:String(rawMiner.lastRunStatus||"Not run yet").slice(0,240),
      lastAdded:Math.max(0,Math.round(Number(rawMiner.lastAdded)||0)),
      cursor:Math.max(0,Math.round(Number(rawMiner.cursor)||0)),
    },
    assignmentStrategy:profile.assignmentStrategy==="manual"?"manual":"round-robin",
    teamRoster:Array.isArray(profile.teamRoster)?profile.teamRoster.flatMap(raw=>{
      if(!raw||typeof raw!=="object")return [];
      const member=raw as Partial<WorkspaceTeamMember>;const email=String(member.email||"").trim().toLowerCase();const userId=String(member.userId||"").trim();
      if(!email||!userId)return [];
      return [{userId:userId.slice(0,160),email:email.slice(0,160),name:String(member.name||email).trim().slice(0,100),role:member.role==="manager"?"manager" as const:"agent" as const,active:member.active!==false}];
    }):[],
    callRecordingEnabled:profile.callRecordingEnabled===true,
    callAiSummaryEnabled:profile.callAiSummaryEnabled===true,
    clientRemindersEnabled:profile.clientRemindersEnabled===true,
    customerReminderSmsEnabled:profile.customerReminderSmsEnabled===true,
    ownerReminderSmsEnabled:profile.ownerReminderSmsEnabled===true,
    ownerReminderPhone:String(profile.ownerReminderPhone||"").trim().slice(0,40),
    liveCallSession:rawLiveCall&&String(rawLiveCall.phone||"").trim()?{leadId:Number.isFinite(Number(rawLiveCall.leadId))?Number(rawLiveCall.leadId):null,name:String(rawLiveCall.name||"Active call").trim().slice(0,120),phone:String(rawLiveCall.phone||"").trim().slice(0,40),line:rawLiveCall.line==="life"?"life":"home-auto",status:rawLiveCall.status==="connected"?"connected":"dialing",startedAt:String(rawLiveCall.startedAt||new Date().toISOString()),updatedAt:String(rawLiveCall.updatedAt||new Date().toISOString())}:null,
    dialerRuns:{life:cleanDialerRun(rawDialerRuns.life),"home-auto":cleanDialerRun(rawDialerRuns["home-auto"])},
    expoPushToken:/^ExponentPushToken\[[^\]]+\]$/.test(String(profile.expoPushToken||""))?String(profile.expoPushToken):"",
  };
}

function cleanConsentSources(value:unknown):string[]{return Array.isArray(value)?Array.from(new Set(value.filter(item=>typeof item==="string").map(item=>item.trim().slice(0,100)).filter(Boolean))).slice(0,50):[]}
