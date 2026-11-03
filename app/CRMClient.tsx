"use client";
import {useLanguage,LanguageSelect} from "./components/LanguageProvider";
import {loadWorkspaceSnapshot} from "./lib/workspace-snapshot";
import {useWorkspaceAppearance} from "./hooks/use-workspace-appearance";
import LeadCampaignPanel from "./components/LeadCampaignPanel";
import {defaultPlatformFeatures,type PlatformFeatures} from "./lib/platform-features";
import {fetchWorkspaceSnapshot,workspaceLoadFailure,type WorkspaceLoadError} from "./lib/workspace-load";
import {normalizeContactRecord} from "./lib/contact-record";
import {documentImageForAi} from "./lib/document-image";
import {documentMissingFields,combineDocumentReads} from "./lib/document-review";
import DialerBackdrop from "./components/DialerBackdrop";
import {DialerLayout,DialerLayoutMenu,DialerPanel,DialerQueueLabel} from "./components/DialerLayout";
import ReleaseUpdateNotice from "./components/ReleaseUpdateNotice";
import WorkspaceChromeMetrics from "./components/WorkspaceChromeMetrics";
import MobileNavigation from "./components/MobileNavigation";
import SettingsUpdateCheck from "./components/SettingsUpdateCheck";
import CallTimer from "./components/CallTimer";
import {callDurationSeconds,formatCallDuration} from "./lib/call-duration";
import {hasContactPermission} from "./lib/contact-permission";
import {policyMoney} from "./lib/policy-money";
import dynamic from "next/dynamic";
import {desktopNotifications,type DesktopMessage} from "./lib/desktop-notifications";
import WorkspaceTour from "./components/WorkspaceTour";
import CalendarAlerts from "./components/CalendarAlerts";

import {createCallScreening} from "./lib/call-screening";
import type {ContactCallDetection} from "./lib/call-detection";
import {mergeIncomingContacts,contactMatches} from "./lib/contact-sync";
import {createWorkspaceSaveQueue} from "./lib/workspace-save-queue";

import { useCallback, useDeferredValue, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useDialogFocus } from "./hooks/use-dialog-focus";
import type { Call, Device } from "@twilio/voice-sdk";
import WorkspaceLoadGate from "./components/WorkspaceLoadGate";
import {mergeRecordingUpdates} from "./lib/recording-updates";
import {desktopOutcomes,desktopWrapDraft} from "./lib/desktop-wrap-up";
import FloatingCallWindow from "./components/FloatingCallWindow";
import LocalFolderImport from "./components/LocalFolderImport";
import {enrichFolderContacts,newFolderContacts,type FolderContact} from "./lib/folder-contact";
import AiVoicePilot,{type VoicePilotSnapshot,type VoicePilotControls} from "./components/AiVoicePilot";
import {mergeLeadDeletions,scheduledFollowUps} from "./lib/lead-deletion";
import ActiveCallBar from "./components/ActiveCallBar";
import DialerKeypad from "./components/DialerKeypad";
import {createCallDigitQueue} from "./lib/call-digits";
import { attachQuietCallAudio } from "./lib/quiet-call-audio";
import { hasLeadDetail, supplementalLeadDetails, displayBirthDate } from "./lib/lead-presentation";
import type {CallLog} from "./components/CallLogReport";
import type {AiAction,AiCreateLead} from "./components/AiCommandCenter";

import {contactsCsv,downloadContactsCsv} from "./lib/contact-export";

import type {QuoteRequestEvidence} from "./lib/quote-intake";
import TodayWorkspace from "./components/TodayWorkspace";
import LeadGrowthPanel from "./components/LeadGrowthPanel";
import PwaInstallButton from "./components/PwaInstallButton";
import PhoneWorkspaceSetup from "./components/PhoneWorkspaceSetup";
import PostCallDispositionModal from "./components/PostCallDispositionModal";
import EmailWorkspaceSetup from "./components/EmailWorkspaceSetup";
import TeamManagement from "./components/TeamManagement";
import SystemHealthPanel from "./components/SystemHealthPanel";
import WorkspaceProfileSettings from "./components/WorkspaceProfileSettings";
import WorkspaceAppearanceSettings from "./components/WorkspaceAppearanceSettings";
import DialerBackgroundSettings from "./components/DialerBackgroundSettings";
import {contactIntakePatch,contactIntakeCanSave} from "./lib/contact-intake";

import BusinessOnboarding from "./components/BusinessOnboarding";
import type {MinerMode} from "./components/MinerPanel";
import VinLookupField from "./components/VinLookupField";
import ClerkTopAuth from "./components/ClerkTopAuth";
import PlanComparison from "./components/PlanComparison";
import { pacificaPlans } from "./lib/plans";
import { cleanWorkspaceProfile, defaultWorkspaceProfile, type WorkspaceMode, type WorkspaceProfile } from "./lib/workspace-profile";
import { crmFieldsForDisposition, dateValue, isDialerEligibleLead, leadCreatedAt, leadLineForProduct, leadPriority, rankLeads, rankDialerLeads, refreshDialerRun, sourceDispositionForOutcome, suggestedRetryAt, validReceivedDate } from "./lib/lead-priority";
import { mergeProviderLeads, type ProviderLeadRecord } from "./lib/provider-lead-merge";
import { deduplicateCsvLeads, mergeCsvLeads, normalizedCsvEmail, normalizedCsvPhone } from "./lib/csv-lead-merge";
import { calendarIcs, googleCalendarUrl } from "./lib/calendar";
import { nextAutomationAfterAttempt, refreshAutomation } from "./lib/lead-automation";
import { postCallDraftForEnd, selectPostCallOutcome, type PostCallDraft } from "./lib/post-call";
import { cleanCommunications, type StoredCommunication } from "./lib/communications";
import { createCallStartGate, dialDigits, findDialedContact } from "./lib/call-start-gate";
import {openCallMicrophone,configureCallAudio,callSetupMessage} from "./lib/call-audio-setup";
import { readAudioPreferences,saveAudioPreferences } from "./audio-preferences";
import { PacificaClearVoiceProcessor, supportsClearVoice, warmClearVoice } from "./clearvoice";
import { playDialTone } from "./lib/dtmf-tone";
import {documentLeadCompletenessScore,documentLeadImportedFields,documentLeadName,type DocumentLeadExtraction} from "./lib/document-lead";
import {scanDocumentLocally} from "./lib/local-document-scanner";

const PhoneSettings=dynamic(()=>import("./components/PhoneSettings"),{loading:()=> <p role="status">Loading phone settings…</p>});
const MinerStudio=dynamic(()=>import("./components/MinerStudio"),{loading:()=> <p role="status">Loading Miner…</p>});
const MessagesCenter=dynamic(()=>import("./components/MessagesCenter"),{loading:()=> <p role="status">Loading messages…</p>});
const AiCommandCenter=dynamic(()=>import("./components/AiCommandCenter"),{loading:()=> <p role="status">Loading Pacifica AI…</p>});
const PhoneNumberCenter=dynamic(()=>import("./components/PhoneNumberCenter"),{loading:()=> <p role="status">Loading phone numbers…</p>});
const CallLogReport=dynamic(()=>import("./components/CallLogReport"),{loading:()=> <p role="status">Loading reports…</p>});

const OfficeDesk=dynamic(()=>import("./components/OfficeDesk"),{loading:()=> <p role="status">Loading…</p>});

const AccountAccessPanel=dynamic(()=>import("./components/AccountAccessPanel"),{loading:()=> <p role="status">Loading…</p>});

const IndustryTools=dynamic(()=>import("./components/IndustryTools"),{loading:()=> <p role="status">Loading…</p>});

const OpportunityDesk=dynamic(()=>import("./components/OpportunityDesk"),{loading:()=> <p role="status">Loading…</p>});

const ClientPortfolio=dynamic(()=>import("./components/ClientPortfolio"),{loading:()=> <p role="status">Loading…</p>});

const MinerPanel=dynamic(()=>import("./components/MinerPanel"),{loading:()=> <p role="status">Loading…</p>});
function preloadView(view:string){
  const load=view==="office"?()=>import("./components/OfficeDesk"):view==="miner"?()=>import("./components/MinerPanel"):view==="clients"?()=>import("./components/ClientPortfolio"):view==="quotes"?()=>import("./components/IndustryTools"):view==="activity"?()=>import("./components/CallLogReport"):view==="settings"?()=>import("./components/PhoneSettings"):null;
  if(load)void load().catch(()=>{});
}


type LeadLine = "life" | "home-auto";
type DialerScope="crm"|"miner-personal-auto"|"miner-home"|"miner-commercial";
type Lead = ContactCallDetection & { backupReplyDisabled?:boolean; notesUpdatedAt?:string; replyReviews?:import("./lib/reply-interest").ReplyReviews;workflowUpdatedAt?:string; quoteRequests?:QuoteRequestEvidence[];quoteDetailsUpdatedAt?:string; deletedAt?:string;deletionUpdatedAt?:string;id:number; name:string; phone:string; city:string; status:string; email:string; stage:string; outcome:string; notes:string; followUp:string; followUpUtc?:string; doNotCall:boolean; lastContact:string; line:LeadLine; queueOverride?:boolean; source:string; leadCost:number; product:string; sourceDisposition:string; importedAt:string; vendorId?:string; sourceSyncStatus?:string; providerUpdatedAt?:string; address?:string; state?:string; zip?:string; territory?:string; brand?:string; profileName?:string; received?:string; returnStatus?:string; employeeCount?:string; searchPro?:string; extraFields?:Record<string,string>; csvFileName?:string; csvUpdatedAt?:string; importedFields?:Record<string,string>; smsConsent?:boolean; smsOptOut?:boolean; lastSmsAt?:string; emailConsent?:boolean; emailOptOut?:boolean; lastEmailAt?:string; communications?:StoredCommunication[]; attempts?:number; lastAttemptAt?:string; lastConnectedAt?:string; priorityOverride?:"auto"|"high"|"low"; assignedTo?:string; estimatedValue?:number; closedRevenue?:number; closedAt?:string; automationEnabled?:boolean; automationSequenceId?:string; automationStep?:number; automationNextAt?:string; automationStatus?:string; automationDeliveryFailures?:number; automationLastError?:string; automationDeadLetterAt?:string; automationUpdatedAt?:string; lastInboundAt?:string; clientStatus?:"active"|"inactive"; dateOfBirth?:string; policyNumber?:string; policyEffectiveDate?:string; policyExpirationDate?:string; renewalDate?:string; policyPremium?:number; policyTermMonths?:number; clientReminderKeys?:string[]; licenseNumber?:string; licenseState?:string; licenseExpiration?:string; vin?:string; vehicle?:string };
type View = "office" | "today" | "dialer" | "leads" | "miner" | "messages" | "ai" | "quotes" | "clients" | "activity" | "settings";
type SettingsSection = "accounts" | "billing" | "workspace" | "appearance" | "team" | "phone" | "integrations" | "system";
type NewLeadDraft={name:string;phone:string;email:string;city:string;address:string;state:string;zip:string;product:string;source:string;leadCost:string;dateOfBirth:string;licenseNumber:string;licenseState:string;licenseExpiration:string;policyNumber:string;policyEffectiveDate:string;policyExpirationDate:string;policyPremium:string;policyTermMonths:string;vin:string;vehicle:string;documentType:string;documentFields:Record<string,string>};
const emptyNewLead:NewLeadDraft={name:"",phone:"",email:"",city:"",address:"",state:"",zip:"",product:"",source:"Manual",leadCost:"",dateOfBirth:"",licenseNumber:"",licenseState:"",licenseExpiration:"",policyNumber:"",policyEffectiveDate:"",policyExpirationDate:"",policyPremium:"",policyTermMonths:"",vin:"",vehicle:"",documentType:"",documentFields:{}};

const starterLeads: Lead[] = [];
const emptyLead: Lead = {id:0,name:"Choose a contact",phone:"",city:"",status:"Empty",email:"",stage:"New lead",outcome:"Not contacted",notes:"",followUp:"",doNotCall:false,lastContact:"Never",line:"life",source:"Manual",leadCost:0,product:"",sourceDisposition:"",importedAt:""};

function queueLabel(line:LeadLine,mode:WorkspaceMode){
  if(mode==="insurance")return line==="life"?"Life leads":"Home & Auto leads";
  return line==="life"?"Priority leads":"General leads";
}
function followUpInDays(days:number){const date=new Date();date.setDate(date.getDate()+days);date.setHours(9,0,0,0);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}T${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`}
function isDocumentFile(file:File){return ["image/jpeg","image/png","image/webp","application/pdf"].includes(file.type)||/\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(file.name)}

function mergeDocumentExtractions(local:DocumentLeadExtraction,ai:DocumentLeadExtraction,localMethod:string){return localMethod==="PDF417 barcode"?combineDocumentReads(local,ai):combineDocumentReads(ai,local)}

async function scanDocumentWithAi(files:File[]){
  const file=files[0];
  const isPdf=file.type==="application/pdf"||/\.pdf$/i.test(file.name);
  if(isPdf&&file.size>2_800_000)throw new Error("AI PDF scanning supports files up to 2.8 MB; larger PDFs use local text extraction.");
  const payload=isPdf?{pdf:await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Unable to read PDF"));reader.readAsDataURL(file)})}:{images:await Promise.all(files.map(file=>documentImageForAi(file)))};
  const response=await fetch("/api/ai/document-lead",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,fileName:file.name})});
  const data=await response.json() as {extraction?:DocumentLeadExtraction;error?:string;detail?:string};
  if(!response.ok||!data.extraction)throw new Error(data.error||data.detail||"AI vision could not read this document");
  return data.extraction;
}

function normalizeSavedLeads(value:unknown):Lead[]{
  if(!Array.isArray(value))return [];
  const contacts=value.map(normalizeContactRecord) as Partial<Lead>[];
  const normalized=contacts.map((lead,index)=>({notesUpdatedAt:lead.notesUpdatedAt||"",replyReviews:lead.replyReviews,workflowUpdatedAt:lead.workflowUpdatedAt||"",quoteRequests:Array.isArray(lead.quoteRequests)?lead.quoteRequests:[],quoteDetailsUpdatedAt:lead.quoteDetailsUpdatedAt||"",lastCallResult:lead.lastCallResult,lastCallStartedAt:lead.lastCallStartedAt,lastCallDetectionAt:lead.lastCallDetectionAt,lastDetectedCallSid:lead.lastDetectedCallSid,deletedAt:lead.deletedAt||"",deletionUpdatedAt:lead.deletionUpdatedAt||"",id:lead.id||Date.now()+index,name:lead.name||`Lead ${index+1}`,phone:lead.phone||"",city:lead.city||"Imported",status:lead.status||"Ready",email:lead.email||"",stage:lead.stage||"New lead",outcome:lead.outcome||"Not contacted",notes:lead.notes||"",followUp:lead.followUp||"",followUpUtc:lead.followUpUtc||"",doNotCall:Boolean(lead.doNotCall),lastContact:lead.lastContact||"Never",line:lead.line==="home-auto"?"home-auto":"life",queueOverride:Boolean(lead.queueOverride),source:lead.source||"Existing CRM",leadCost:Number(lead.leadCost)||0,product:lead.product||"Service inquiry",sourceDisposition:lead.sourceDisposition||"",importedAt:lead.importedAt||"",vendorId:lead.vendorId||"",sourceSyncStatus:lead.sourceSyncStatus||"",providerUpdatedAt:lead.providerUpdatedAt||"",address:lead.address||"",state:lead.state||"",zip:lead.zip||"",territory:lead.territory||"",brand:lead.brand||"",profileName:lead.profileName||"",received:lead.received||"",returnStatus:lead.returnStatus||"",employeeCount:lead.employeeCount||"",searchPro:lead.searchPro||"",extraFields:lead.extraFields&&typeof lead.extraFields==="object"?lead.extraFields:{},csvFileName:lead.csvFileName||"",csvUpdatedAt:lead.csvUpdatedAt||"",importedFields:lead.importedFields&&typeof lead.importedFields==="object"?lead.importedFields:{},smsConsent:Boolean(lead.smsConsent),smsOptOut:Boolean(lead.smsOptOut),lastSmsAt:lead.lastSmsAt||"",emailConsent:Boolean(lead.emailConsent),emailOptOut:Boolean(lead.emailOptOut),lastEmailAt:lead.lastEmailAt||"",communications:cleanCommunications(lead.communications),attempts:Math.max(0,Number(lead.attempts)||0),lastAttemptAt:lead.lastAttemptAt||"",lastConnectedAt:lead.lastConnectedAt||"",priorityOverride:lead.priorityOverride==="high"||lead.priorityOverride==="low"?lead.priorityOverride:"auto",assignedTo:lead.assignedTo||"",estimatedValue:Math.max(0,Number(lead.estimatedValue)||0),closedRevenue:Math.max(0,Number(lead.closedRevenue)||0),closedAt:lead.closedAt||"",backupReplyDisabled:lead.backupReplyDisabled===true,automationEnabled:lead.automationEnabled!==false,automationSequenceId:lead.automationSequenceId||"",automationStep:Math.max(0,Number(lead.automationStep)||0),automationNextAt:lead.automationNextAt||"",automationStatus:lead.automationStatus||"",automationDeliveryFailures:Math.max(0,Number(lead.automationDeliveryFailures)||0),automationLastError:lead.automationLastError||"",automationDeadLetterAt:lead.automationDeadLetterAt||"",automationUpdatedAt:lead.automationUpdatedAt||"",lastInboundAt:lead.lastInboundAt||"",clientStatus:lead.clientStatus==="active"?"active":lead.clientStatus==="inactive"?"inactive":undefined,dateOfBirth:lead.dateOfBirth||"",policyNumber:lead.policyNumber||"",policyEffectiveDate:lead.policyEffectiveDate||"",policyExpirationDate:lead.policyExpirationDate||"",renewalDate:lead.renewalDate||"",clientReminderKeys:Array.isArray(lead.clientReminderKeys)?lead.clientReminderKeys.map(String).slice(-60):[],licenseNumber:lead.licenseNumber||"",licenseState:lead.licenseState||"",licenseExpiration:lead.licenseExpiration||"",vin:lead.vin||"",vehicle:lead.vehicle||""})) as Lead[];
  const sourceById=new Map((value as Partial<Lead>[]).map(lead=>[lead.id,lead]));
  return deduplicateCsvLeads(normalized).leads.map(lead=>({...lead,policyPremium:policyMoney(sourceById.get(lead.id)?.policyPremium)??0,policyTermMonths:Math.max(0,Number(sourceById.get(lead.id)?.policyTermMonths)||0)}));
}


function Icon({name}:{name:string}) {
  const paths:Record<string,React.ReactNode> = {
    dial:<><path d="M6.6 3.8 9 7.6 7.5 9.1c1.1 2.3 2.9 4.1 5.2 5.2l1.5-1.5 3.8 2.4c.5.3.7.9.5 1.5-.5 1.6-2 2.7-3.7 2.6C8.2 18.7 3.3 13.8 2.7 7.2c-.1-1.7 1-3.2 2.6-3.7.5-.2 1.1 0 1.3.3Z"/></>,
    users:<><path d="M16 19v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V19"/><circle cx="9" cy="6.5" r="3.5"/><path d="M16 4.2a3.5 3.5 0 0 1 0 6.6M18 13.7a4 4 0 0 1 4 3.8V19"/></>,
    list:<><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/></>,
    calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18M7 15h3M14 15h3"/></>,
    bulb:<><path d="M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/></>,
    chart:<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    gear:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    pickaxe:<><path d="m4 20 10-10M3 7c5-5 12-4 17 3-6-3-9-3-12 0L3 7Z"/></>,
    robot:<><rect x="4" y="7" width="16" height="14" rx="4"/><path d="M12 3v4M1 12v5M23 12v5M9 17h6"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/></>,
    download:<><path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/></>,
    upload:<><path d="M12 16V3M7 8l5-5 5 5"/><path d="M4 14v6h16v-6"/></>,
    pause:<><path d="M8 5v14M16 5v14"/></>,
    play:<><path d="m8 5 11 7-11 7Z"/></>,
    mic:<><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>,
    mute:<><path d="M11 5 6 9H3v6h3l5 4ZM16 9l5 6M21 9l-5 6"/></>,
    keypad:<><circle cx="6" cy="5" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="18" cy="5" r="1"/><circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/><circle cx="6" cy="19" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="18" cy="19" r="1"/></>,
    end:<><path d="M5 15a11 11 0 0 1 14 0l-2 4-4-2v-3h-2v3l-4 2Z"/></>,
    wifi:<><path d="M2 8a15 15 0 0 1 20 0M5 12a10.5 10.5 0 0 1 14 0M8.5 15.5a5.3 5.3 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/></>,
    bell:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    shield:<><path d="M12 3 4.5 6v5.2c0 4.7 3.1 8 7.5 9.8 4.4-1.8 7.5-5.1 7.5-9.8V6Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
    spark:<><path d="m12 3 1.4 4.2L18 9l-4.6 1.8L12 15l-1.4-4.2L6 9l4.6-1.8Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/></>,
    chat:<><path d="M4 5h16v11H9l-5 4Z"/><path d="M8 9h8M8 12h5"/></>,
    mail:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></>,
    camera:<><path d="M4 7h4l1.5-2h5L16 7h4v12H4Z"/><circle cx="12" cy="13" r="3.5"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function Page({clerkEnabled=false,isOwner=false,isPlatformOwner=false,featureAccess=defaultPlatformFeatures,workspaceId="local",currentUserName="Pacifica user",currentUserEmail="",userRole="owner"}:{clerkEnabled?:boolean;isOwner?:boolean;isPlatformOwner?:boolean;featureAccess?:PlatformFeatures;workspaceId?:string;currentUserName?:string;currentUserEmail?:string;userRole?:string}){
  const [view,setView]=useState<View>("today");
  const [enabledTools,setEnabledTools]=useState(featureAccess);
  useEffect(()=>{if((view==="miner"&&!enabledTools.miner)||(view==="quotes"&&!enabledTools.industryTools))setView("leads")},[view,enabledTools.miner,enabledTools.industryTools]);
  const [quoteRequestLeadId,setQuoteRequestLeadId]=useState<number|null>(null);
  const [settingsSection,setSettingsSection]=useState<SettingsSection>("workspace");
  const [allLeads,setLeads]=useState<Lead[]>(starterLeads);
  const minerLeads=useMemo(()=>allLeads.filter(item=>!item.deletedAt&&/^Pacifica Miner\b/i.test(item.source)),[allLeads]);
  const leads=useMemo(()=>allLeads.filter(item=>!item.deletedAt&&!/^Pacifica Miner\b/i.test(item.source)),[allLeads]);
  const [deletedLead,setDeletedLead]=useState<Lead|null>(null);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
  useEffect(()=>{let canceled=false;queueMicrotask(()=>{if(canceled)return;try{const saved=localStorage.getItem("pacifica:sidebar-collapsed")==="true";document.documentElement.dataset.sidebarCollapsed=String(saved);setSidebarCollapsed(saved)}catch{}});return()=>{canceled=true}},[]);
  function toggleSidebar(){const next=!sidebarCollapsed;document.documentElement.dataset.sidebarCollapsed=String(next);try{localStorage.setItem("pacifica:sidebar-collapsed",String(next))}catch{}setSidebarCollapsed(next)}
  const [dialing,setDialing]=useState(false);
  const aiVoiceActive=useRef(false);
  const [folderMounted,setFolderMounted]=useState(false),[folderOpen,setFolderOpen]=useState(false),[folderInstruction,setFolderInstruction]=useState("");
  const openFolder=(goal?:string)=>{if(goal)setFolderInstruction(goal);setView("ai");setFolderMounted(true);setFolderOpen(true)};
  const [avaOpen,setAvaOpen]=useState(false),[ava,setAva]=useState<VoicePilotSnapshot>({active:false,name:"",number:"",status:"",human:false,connectedAt:null,muted:false,paused:false});
  const avaControls=useRef<VoicePilotControls|null>(null);
  const setAvaControls=useCallback((controls:VoicePilotControls|null)=>{avaControls.current=controls},[]);
  const openAva=()=>{setView("dialer");setAvaOpen(true)};
  const [connected,setConnected]=useState(false);
  const [index,setIndex]=useState(0);
  const [callConnectedAt,setCallConnectedAt]=useState<number|null>(null);
  const [toast,setToast]=useState("");
  const [provider]=useState("Browser / Wi-Fi");
  const [dialNumber,setDialNumber]=useState("");
  const [manualCall,setManualCall]=useState(false);
  const [selectedLead,setSelectedLead]=useState<number|null>(null);
  const [growthLeadId,setGrowthLeadId]=useState<number|null>(null); // PACIFICA_PRODUCT_SYSTEM_V3
  const [aiActivity,setAiActivity]=useState<"idle"|"working"|"sending"|"ready">("idle");
  const [messageTarget,setMessageTarget]=useState<{leadId:number;channel:"sms"|"email"}|null>(null);
  const [search,setSearch]=useState("");
  const [stageFilter,setStageFilter]=useState("All stages");
  const [sourceFilter,setSourceFilter]=useState("All sources");
  const [ownerFilter,setOwnerFilter]=useState("All owners");
  const [leadSort,setLeadSort]=useState("Newest");
  const [contactPage,setContactPage]=useState({key:"",page:0});
  const [phoneReady,setPhoneReady]=useState(false);
  const [phoneStatus,setPhoneStatus]=useState("Checking Twilio setup…");
  const [muted,setMuted]=useState(false);

  const [dtmfDisplay,setDtmfDisplay]=useState("");
  const [dtmfFeedback,setDtmfFeedback]=useState({message:"",error:false});
  const [callDigits]=useState(createCallDigitQueue);
  useEffect(()=>()=>callDigits.clear(),[callDigits]);
  const [keypadOpen,setKeypadOpen]=useState(false);
  useEffect(()=>{if(keypadOpen&&view==="dialer"&&window.innerWidth>760)document.getElementById("manual-dial-number")?.focus({preventScroll:true})},[keypadOpen,view]);
  const [callerId,setCallerId]=useState("Twilio number");
  const [showPhoneSettings,setShowPhoneSettings]=useState(false);
  const [callLogs,setCallLogs]=useState<CallLog[]>([]);
  const [activeLine,setActiveLine]=useState<LeadLine>("home-auto");
  const [minerMode,setMinerMode]=useState<MinerMode>("commercial");
  const [dialerScope,setDialerScope]=useState<DialerScope>("crm");
  const [minerRunIds,setMinerRunIds]=useState<number[]>([]);
  const [autoDialing,setAutoDialing]=useState(false);
  const [checkoutPlan,setCheckoutPlan]=useState("");
  const [leadFeedStatus,setLeadFeedStatus]=useState("Checking the secure inbound queue…");
  const [importReport,setImportReport]=useState("");
  const [workspaceHydrated,setWorkspaceHydrated]=useState(false);
  const [workspaceLoadError,setWorkspaceLoadError]=useState<WorkspaceLoadError|null>(null);
  const [workspaceLoadAttempt,setWorkspaceLoadAttempt]=useState(0);
  const [postCallLeadId,setPostCallLeadId]=useState<number|null>(null);
  const [floatingWindowOpen,setFloatingWindowOpen]=useState(false);
  const [manualWrap,setManualWrap]=useState<{lead:Lead;logId:string}|null>(null);
  const [postCallDraft,setPostCallDraft]=useState<PostCallDraft>({crmStage:"Follow-up",crmOutcome:"Completed",sourceDisposition:"Contacted",appointmentAt:"",notes:""});
  const [postCallTechnicalOutcome,setPostCallTechnicalOutcome]=useState("Completed");
  const [postCallConnected,setPostCallConnected]=useState(false);
  const postCallLeadSnapshotRef=useRef<Lead|null>(null);
  const [sourceSyncing,setSourceSyncing]=useState(false);
  const [showNewLead,setShowNewLead]=useState(false);
  const [newLead,setNewLead]=useState<NewLeadDraft>(emptyNewLead);
  const [scanBusy,setScanBusy]=useState(false);
  const [fileDragActive,setFileDragActive]=useState(false);
  const [phoneAvailable,setPhoneAvailable]=useState(false);
  const [incomingCall,setIncomingCall]=useState<Call|null>(null);
  const [incomingNumber,setIncomingNumber]=useState("");
  const incomingCallRef=useRef<Call|null>(null);
  const [resumeAfterWrap,setResumeAfterWrap]=useState(false);
  const [workspaceProfile,setWorkspaceProfile]=useState<WorkspaceProfile>(defaultWorkspaceProfile);
  const [priorityNow,setPriorityNow]=useState(()=>Date.now());
  const [workspaceSyncStatus,setWorkspaceSyncStatus]=useState("Loading workspace…");
  const [workspaceSavePulse,setWorkspaceSavePulse]=useState(0);
  const [messageUnreadCount,setMessageUnreadCount]=useState(0);
  const [currentCallLeadId,setCurrentCallLeadId]=useState<number|null>(null);
  const [loadedLeadId,setLoadedLeadId]=useState<number|null>(null);
  const [recordingSid,setRecordingSid]=useState("");
  const [recordingBusy,setRecordingBusy]=useState(false);
  const inputRef=useRef<HTMLInputElement>(null);

  const scanInputRef=useRef<HTMLInputElement>(null);
  const fileDragDepthRef=useRef(0);
  const deviceRef=useRef<Device|null>(null);
  const deviceInitPromiseRef=useRef<Promise<Device>|null>(null);
  const audioDeviceChangeTimerRef=useRef<number|undefined>(undefined);
  const callStartGateRef=useRef(createCallStartGate());
  const clearVoiceProcessorRef=useRef<PacificaClearVoiceProcessor|null>(null);
  const callRef=useRef<Call|null>(null);
  const screeningRef=useRef<ReturnType<typeof createCallScreening>|null>(null);
  const quietCallAudioRef=useRef<ReturnType<typeof attachQuietCallAudio>|null>(null);
  const quietDialingRef=useRef(true);
  const voiceRouteTokenRef=useRef("");
  const watchdogRef=useRef<number|undefined>(undefined);
  const savedPostCallRef=useRef("");
  const postCallLogIdRef=useRef("");
  const [desktopWrapError,setDesktopWrapError]=useState("");
  const currentLogRef=useRef<(CallLog & { connectedAt?:number; finalized?:boolean })|null>(null);
  const callLogsRef=useRef<CallLog[]>([]);
  const leadsRef=useRef<Lead[]>(starterLeads);
  const activeLineRef=useRef<LeadLine>("home-auto");
  const dialerScopeRef=useRef<DialerScope>("crm");
  const minerRunIdsRef=useRef<number[]>([]);
  const skipQueuePreferenceSaveRef=useRef(true);
  const autoDialRef=useRef(false);
  const advancingRef=useRef(false);
  const nextCallTimerRef=useRef<number|undefined>(undefined);
  const workspaceSaveQueue=useMemo(()=>({workspaceId,queue:createWorkspaceSaveQueue<string>(async body=>{
    const response=await fetch("/api/crm/workspace",{method:"PUT",headers:{"Content-Type":"application/json"},body});
    if(!response.ok)throw new Error("Cloud save failed");
  })}),[workspaceId]);
  useEffect(()=>()=>workspaceSaveQueue.queue.cancelPending(),[workspaceSaveQueue]);
  const workspaceSaveTimerRef=useRef<number|undefined>(undefined);
  const flushLocalSaveRef=useRef<(()=>void)|null>(null);
  useEffect(()=>()=>flushLocalSaveRef.current?.(),[]);
  const resumeAfterWrapRef=useRef(false);
  const callAttemptRef=useRef(0);
  const establishedAttemptRef=useRef(0);
  const sessionAttemptedLeadIdsRef=useRef<Set<number>>(new Set());
  const leadFeedSyncRef=useRef(false);
  const latestInboundRef=useRef(0);
  const dialerRunsRef=useRef(workspaceProfile.dialerRuns); // PACIFICA_STABLE_DIALER_RUN_V2
  const lineLeads=useMemo(()=>leads.filter(item=>item.line===activeLine),[leads,activeLine]);
  const scopedDialerLeads=useMemo(()=>dialerScope==="miner-personal-auto"?minerLeads.filter(item=>/Personal Auto/i.test(item.source)):dialerScope==="miner-home"?minerLeads.filter(item=>/Pacifica Miner\s*·\s*Home/i.test(item.source)):dialerScope==="miner-commercial"?minerLeads.filter(item=>/Commercial/i.test(item.source)):lineLeads,[dialerScope,minerLeads,lineLeads]);
  const activeDialerRun=dialerScope==="crm"?workspaceProfile.dialerRuns[activeLine]:null;
  const dynamicCallableLeads=useMemo(()=>rankDialerLeads(scopedDialerLeads.filter(item=>isDialerEligibleLead(item,priorityNow)&&normalizedCsvPhone(item.phone).length>=7),priorityNow),[scopedDialerLeads,priorityNow]);
  const callableLeads=useMemo(()=>{
    if(dialerScope!=="crm")return minerRunIds.length?refreshDialerRun(minerRunIds,dynamicCallableLeads,priorityNow):dynamicCallableLeads;
    if(!activeDialerRun?.ids.length)return dynamicCallableLeads;
    const eligibleById=new Map(lineLeads.filter(item=>isDialerEligibleLead(item,priorityNow)&&normalizedCsvPhone(item.phone).length>=7).map(item=>[item.id,item] as const));
    return refreshDialerRun(activeDialerRun.ids,Array.from(eligibleById.values()),priorityNow);
  },[dialerScope,minerRunIds,activeDialerRun,dynamicCallableLeads,lineLeads,priorityNow]);
  const queuedLead=(activeDialerRun?callableLeads[0]:callableLeads[index%Math.max(callableLeads.length,1)])||emptyLead;
  const livePostCallLead=postCallLeadId?leads.find(item=>item.id===postCallLeadId):undefined;
  const snapshotPostCallLead=postCallLeadId&&postCallLeadSnapshotRef.current?.id===postCallLeadId?postCallLeadSnapshotRef.current:undefined;
  const postCallLead=manualWrap?.lead||livePostCallLead||snapshotPostCallLead;
  const loadedLead=loadedLeadId?leads.find(item=>item.id===loadedLeadId):undefined;
  const lead=postCallLead||(currentCallLeadId?leads.find(item=>item.id===currentCallLeadId):undefined)||loadedLead||queuedLead;
  useEffect(()=>{
    if(!loadedLeadId||dialing||postCallLeadId)return;
    const current=leads.find(item=>item.id===loadedLeadId);
    if(!current||current.outcome==="Interested"){
      let canceled=false;
      queueMicrotask(()=>{if(canceled)return;setLoadedLeadId(null);setIndex(0);if(current)setToast(`${current.name} removed from the dialer queue`)});
      return()=>{canceled=true};
    }
  },[loadedLeadId,leads,dialing,postCallLeadId,priorityNow]);
  const incomingDialogRef=useRef<HTMLElement>(null);
  useDialogFocus(incomingDialogRef,Boolean(incomingCall));
  const newLeadDialogRef=useRef<HTMLFormElement>(null);
  const contactDialogRef=useRef<HTMLElement>(null);
  const quoteDialogRef=useRef<HTMLDivElement>(null);
  useDialogFocus(newLeadDialogRef,showNewLead,()=>setShowNewLead(false));
  useDialogFocus(contactDialogRef,allLeads.some(item=>item.id===selectedLead),()=>setSelectedLead(null));
  useDialogFocus(quoteDialogRef,growthLeadId!==null,()=>setGrowthLeadId(null));
  const importedLeadDetails=useMemo(()=>supplementalLeadDetails(lead),[lead]);
  const upNextLeads=useMemo(()=>{const next:Lead[]=[];for(const item of callableLeads){if(item.id!==lead.id)next.push(item);if(next.length===3)break}return next},[callableLeads,lead.id]);
  const leadQueuePosition=activeDialerRun?Math.min(activeDialerRun.completed,Math.max(0,activeDialerRun.total-1)):Math.max(0,callableLeads.findIndex(item=>item.id===lead.id));
  const leadQueueTotal=activeDialerRun?.total||(dialerScope==="crm"?callableLeads.length:Math.max(minerRunIds.length,callableLeads.length));
  const leadQueueRemaining=callableLeads.length;

  useEffect(()=>{let canceled=false;let saved:LeadLine="home-auto";try{if(localStorage.getItem(`pacifica:${workspaceId}:last-lead-queue`)==="life")saved="life"}catch{}activeLineRef.current=saved;skipQueuePreferenceSaveRef.current=true;queueMicrotask(()=>{if(!canceled)setActiveLine(saved)});return()=>{canceled=true}},[workspaceId]);
  useEffect(()=>{if(skipQueuePreferenceSaveRef.current){skipQueuePreferenceSaveRef.current=false;return}try{localStorage.setItem(`pacifica:${workspaceId}:last-lead-queue`,activeLine)}catch{}},[activeLine,workspaceId]);
  useEffect(()=>{if(scanInputRef.current)scanInputRef.current.accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"},[]);
  useEffect(()=>{ if(!toast)return; const t=setTimeout(()=>setToast(""),2600); return()=>clearTimeout(t)},[toast]);
  useEffect(()=>{
    let canceled=false,loading=false,complete=false,attempts=0;
    let retryTimer:ReturnType<typeof setTimeout>|undefined;
    const controller=new AbortController();
    async function hydrate(){
      if(canceled||loading||complete)return;
      loading=true;attempts++;
      clearTimeout(retryTimer);
      setWorkspaceLoadError(null);
      setWorkspaceSyncStatus("Opening workspace…");
      try{
        let localLeads:Lead[]=[],localLogs:CallLog[]=[],localProfile=defaultWorkspaceProfile;
        if(clerkEnabled){
          const data=await fetchWorkspaceSnapshot({signal:controller.signal});
          localLeads=normalizeSavedLeads(data.leads);
          localLogs=data.callLogs as CallLog[];
          localProfile=cleanWorkspaceProfile(data.profile);
        }else{
          try{
            localLeads=normalizeSavedLeads(JSON.parse(localStorage.getItem(`pacifica:${workspaceId}:leads`)||"[]"));
            const parsedLogs=JSON.parse(localStorage.getItem(`pacifica:${workspaceId}:call-logs`)||"[]");
            localLogs=Array.isArray(parsedLogs)?parsedLogs:[];
            localProfile=cleanWorkspaceProfile(JSON.parse(localStorage.getItem(`pacifica:${workspaceId}:profile`)||"{}"));
          }catch{}
        }
        if(canceled)return;
        setLeads(localLeads);setCallLogs(localLogs);setWorkspaceProfile(localProfile);
        if(localProfile.industry==="legal"||new URLSearchParams(window.location.search).has("calendar"))setView("office");
        complete=true;
        setWorkspaceHydrated(true);
        setWorkspaceSyncStatus(clerkEnabled?"Cloud workspace synced":"Saved in this browser");
      }catch(error){
        if(canceled)return;
        const failure=workspaceLoadFailure(error);
        setWorkspaceLoadError(failure);
        setWorkspaceSyncStatus("Offline · workspace could not load");
        // Retry only transient reads, with a limit. Never enable autosave on failure.
        if(failure.retryable&&attempts<3)retryTimer=setTimeout(()=>void hydrate(),attempts*2000);
      }finally{loading=false;}
    }
    const reconnect=()=>{if(!canceled&&!loading){attempts=0;void hydrate()}};
    void hydrate();
    window.addEventListener("online",reconnect);
    return()=>{canceled=true;controller.abort();clearTimeout(retryTimer);window.removeEventListener("online",reconnect)};
  },[clerkEnabled,workspaceId,workspaceLoadAttempt]);
  useEffect(()=>{
    flushLocalSaveRef.current=null;
    if(!workspaceHydrated)return;
    let saved=false;
    const persistLocal=()=>{if(saved)return;try{localStorage.setItem(`pacifica:${workspaceId}:leads`,JSON.stringify(allLeads));localStorage.setItem(`pacifica:${workspaceId}:call-logs`,JSON.stringify(callLogs.slice(0,500)));localStorage.setItem(`pacifica:${workspaceId}:profile`,JSON.stringify(workspaceProfile));saved=true}catch{}};
    if(!clerkEnabled){
      flushLocalSaveRef.current=persistLocal;
      const timer=window.setTimeout(()=>{persistLocal();setWorkspaceSyncStatus("Saved in this browser")},600);
      window.addEventListener("pagehide",persistLocal);
      return()=>{window.clearTimeout(timer);window.removeEventListener("pagehide",persistLocal)};
    }
    queueMicrotask(()=>setWorkspaceSyncStatus("Saving changes…"));
    workspaceSaveTimerRef.current=window.setTimeout(()=>{workspaceSaveTimerRef.current=undefined;void workspaceSaveQueue.queue.save(JSON.stringify({leads:allLeads,callLogs:callLogs.slice(0,500),profile:workspaceProfile})).then(latest=>{if(latest)setWorkspaceSyncStatus(`Saved ${new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}`)}).catch(()=>setWorkspaceSyncStatus("Offline · automatic retry pending"))},600);
    return()=>{if(workspaceSaveTimerRef.current){window.clearTimeout(workspaceSaveTimerRef.current);workspaceSaveTimerRef.current=undefined}};
  },[allLeads,callLogs,workspaceProfile,workspaceHydrated,clerkEnabled,workspaceId,workspaceSavePulse,workspaceSaveQueue]);
  useEffect(()=>{if(!workspaceHydrated||!workspaceSyncStatus.startsWith("Offline"))return;const retry=window.setTimeout(()=>setWorkspaceSavePulse(value=>value+1),5000);return()=>window.clearTimeout(retry)},[workspaceSyncStatus,workspaceHydrated]);
  const resolvedAppearance=useWorkspaceAppearance(workspaceProfile,workspaceHydrated);
  useEffect(()=>{leadsRef.current=allLeads},[allLeads]);
  useEffect(()=>{dialerRunsRef.current=workspaceProfile.dialerRuns},[workspaceProfile.dialerRuns]);
  useEffect(()=>{dialerScopeRef.current=dialerScope},[dialerScope]);
  useEffect(()=>{minerRunIdsRef.current=minerRunIds},[minerRunIds]);
  useEffect(()=>{callLogsRef.current=callLogs},[callLogs]);
  useEffect(()=>{quietDialingRef.current=workspaceProfile.quietDialing;quietCallAudioRef.current?.setQuiet(workspaceProfile.quietDialing)},[workspaceProfile.quietDialing]);
  useEffect(()=>()=>{quietCallAudioRef.current?.dispose();screeningRef.current?.dispose()},[]);
  useEffect(()=>{if(!workspaceHydrated||!clerkEnabled)return;let canceled=false;let refreshing=false;let previousSnapshot:unknown=null;const seenKey=`pacifica:${workspaceId}:messages-seen`;const refresh=()=>{if(refreshing)return;refreshing=true;void loadWorkspaceSnapshot(workspaceId).then(data=>{if(canceled||data===previousSnapshot)return;previousSnapshot=data;if(Array.isArray(data.callLogs))setCallLogs(current=>mergeRecordingUpdates(current,data.callLogs as CallLog[]));const remoteLeads=normalizeSavedLeads(data.leads);setLeads(current=>mergeIncomingContacts(current,remoteLeads));let seen=0;try{seen=Number(localStorage.getItem(seenKey))||0}catch{}const inbound=remoteLeads.flatMap(item=>(item.communications||[]).filter(comm=>String(comm.direction||"").toLowerCase().includes("in")).map(comm=>({lead:item,time:new Date(String(comm.sentAt||"")).getTime()||0,body:String(comm.body||comm.subject||"New message"),channel:comm.channel==="email"?"email" as const:"sms" as const,id:String(comm.providerId||comm.id)}))).filter(item=>item.time>seen).sort((a,b)=>b.time-a.time);setMessageUnreadCount(inbound.length);const latest=inbound[0];if(latest&&latest.time>latestInboundRef.current){if(latestInboundRef.current){for(const item of inbound.filter(x=>x.time>latestInboundRef.current).slice(0,10).reverse()){const desktop=desktopNotifications();if(desktop?.notifyMessage)desktop.notifyMessage({id:item.id,leadId:item.lead.id,name:item.lead.name,body:item.body,channel:item.channel,theme:document.documentElement.dataset.theme||"light"});else if(typeof Notification!=="undefined"&&Notification.permission==="granted")new Notification(`New message from ${item.lead.name}`,{body:item.body,icon:"/pacifica-icon-192.png"})}}latestInboundRef.current=latest.time}if(!latestInboundRef.current)latestInboundRef.current=Date.now()}).catch(()=>undefined).finally(()=>{refreshing=false})};const initial=window.setTimeout(refresh,1500);const timer=window.setInterval(refresh,5000);return()=>{canceled=true;window.clearTimeout(initial);window.clearInterval(timer)}},[clerkEnabled,workspaceHydrated,workspaceId]);
  function openView(id:View){if(id==="miner"&&(!isPlatformOwner||!enabledTools.miner)||id==="quotes"&&!enabledTools.industryTools)return;if(id==="dialer"){dialerScopeRef.current="crm";setDialerScope("crm");minerRunIdsRef.current=[];setMinerRunIds([])}if(id==="messages"){try{localStorage.setItem(`pacifica:${workspaceId}:messages-seen`,String(Date.now()))}catch{}setMessageUnreadCount(0);if(!desktopNotifications()?.isDesktop&&typeof Notification!=="undefined"&&Notification.permission==="default")void Notification.requestPermission()}setGrowthLeadId(null);setSelectedLead(null);setView(id)}
  useEffect(()=>{const onKeyDown=(event:KeyboardEvent)=>{if(event.key!=="Escape")return;if(growthLeadId!==null){setGrowthLeadId(null);return}if(selectedLead!==null){setSelectedLead(null);return}if(showNewLead)setShowNewLead(false)};window.addEventListener("keydown",onKeyDown);return()=>window.removeEventListener("keydown",onKeyDown)},[growthLeadId,selectedLead,showNewLead]);
  useEffect(()=>{if(!workspaceHydrated||workspaceProfile.assignmentStrategy!=="round-robin")return;const members=workspaceProfile.teamRoster.filter(member=>member.active);if(!members.length)return;const initial=window.setTimeout(()=>setLeads(list=>{const counts=new Map(members.map(member=>[member.name,list.filter(lead=>lead.assignedTo===member.name&&lead.stage!=="Closed").length]));let changed=false;const next=list.map(lead=>{if(lead.assignedTo||lead.stage==="Closed"||lead.doNotCall)return lead;const member=members.toSorted((left,right)=>(counts.get(left.name)||0)-(counts.get(right.name)||0)||left.name.localeCompare(right.name))[0];counts.set(member.name,(counts.get(member.name)||0)+1);changed=true;return {...lead,assignedTo:member.name}});return changed?next:list}),0);return()=>window.clearTimeout(initial)},[workspaceHydrated,workspaceProfile.assignmentStrategy,workspaceProfile.teamRoster]);
  useEffect(()=>{const refresh=()=>setPriorityNow(Date.now());const reconnect=()=>{refresh();setWorkspaceSavePulse(value=>value+1)};const timer=window.setInterval(refresh,15000);window.addEventListener("focus",refresh);window.addEventListener("online",reconnect);document.addEventListener("visibilitychange",refresh);return()=>{window.clearInterval(timer);window.removeEventListener("focus",refresh);window.removeEventListener("online",reconnect);document.removeEventListener("visibilitychange",refresh)}},[]);
  useEffect(()=>{if(!workspaceHydrated||!workspaceProfile.serverAutomationEnabled)return;const refresh=()=>setLeads(list=>{let changed=false;const next=list.map(item=>{const updated=refreshAutomation(item);if(updated!==item)changed=true;return updated});return changed?next:list});const initial=window.setTimeout(refresh,0);const timer=window.setInterval(refresh,60000);return()=>{window.clearTimeout(initial);window.clearInterval(timer)}},[workspaceHydrated,workspaceProfile.serverAutomationEnabled]);
  useEffect(()=>{if(!workspaceHydrated)return;const throttleKey=`pacifica:${workspaceId}:automation-browser-run`;const run=()=>{if(document.hidden||!navigator.onLine||workspaceSaveTimerRef.current)return;let lastRun=0;try{lastRun=Number(localStorage.getItem(throttleKey))||0}catch{}if(Date.now()-lastRun<270000)return;try{localStorage.setItem(throttleKey,String(Date.now()))}catch{}void fetch("/api/automation/run",{method:"POST"}).then(response=>{if(!response.ok)throw new Error("Automation check failed");return fetch("/api/crm/workspace",{cache:"no-store"})}).then(response=>response.json()).then(data=>{if(Array.isArray(data.leads))setLeads(current=>mergeIncomingContacts(current,normalizeSavedLeads(data.leads)))}).catch(()=>undefined)};const initial=window.setTimeout(run,5000);const timer=window.setInterval(run,300000);window.addEventListener("focus",run);return()=>{window.clearTimeout(initial);window.clearInterval(timer);window.removeEventListener("focus",run)}},[workspaceHydrated,workspaceProfile.serverAutomationEnabled,workspaceId]);
  useEffect(()=>{if(!workspaceHydrated)return;const clean=()=>setLeads(list=>{const result=deduplicateCsvLeads(list);if(result.removed)setImportReport(`${result.removed} historical duplicate${result.removed===1?"":"s"} merged automatically · lead totals and spend recalculated`);return result.leads});const initial=window.setTimeout(clean,0);const timer=window.setInterval(clean,2*60*60*1000);window.addEventListener("focus",clean);return()=>{window.clearTimeout(initial);window.clearInterval(timer);window.removeEventListener("focus",clean)}},[workspaceHydrated]);
  useEffect(()=>{if(!workspaceHydrated||!clerkEnabled||view!=="activity")return;let canceled=false;let refreshCount=0;const refresh=()=>{void (async()=>{const response=await fetch("/api/crm/workspace",{cache:"no-store"});const data=await response.json();if(!canceled&&Array.isArray(data.callLogs))setCallLogs(current=>mergeRecordingUpdates(current,data.callLogs as CallLog[]));refreshCount+=1;if(refreshCount%6!==1)return;const recordingSids=callLogsRef.current.filter(log=>log.recordingSid&&!log.recordingUrl).map(log=>String(log.recordingSid)).slice(0,20);if(!recordingSids.length)return;const syncResponse=await fetch("/api/twilio/recordings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"sync",recordingSids})});const synced=await syncResponse.json();if(!canceled&&syncResponse.ok&&Array.isArray(synced.callLogs))setCallLogs(current=>mergeRecordingUpdates(current,synced.callLogs as CallLog[]))})().catch(()=>undefined)};const initial=window.setTimeout(refresh,0);const timer=window.setInterval(refresh,5000);return()=>{canceled=true;window.clearTimeout(initial);window.clearInterval(timer)}},[clerkEnabled,view,workspaceHydrated]);
  const fetchToken=useCallback(async()=>{const response=await fetch("/api/twilio/token",{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Twilio is not configured");voiceRouteTokenRef.current=String(data.routeToken||"");return String(data.token)},[]);
  const configureClearVoice=useCallback(async(device:Device)=>{
    const preferences=readAudioPreferences();
    const audio=device.audio;
    if(!audio)return false;
    const current=clearVoiceProcessorRef.current;
    const needsReplacement=Boolean(current&&current.mode!==preferences.clearVoiceMode);
    if(current&&(!preferences.clearVoiceEnabled||needsReplacement)){
      await audio.removeProcessor(current,false).catch(()=>undefined);
      clearVoiceProcessorRef.current=null;
    }
    const baseConstraints:MediaTrackConstraints={echoCancellation:true,autoGainControl:true,noiseSuppression:!preferences.clearVoiceEnabled,channelCount:1,sampleRate:{ideal:48000}};
    await audio.setAudioConstraints(baseConstraints).catch(()=>undefined);
    if(!preferences.clearVoiceEnabled)return false;
    if(!supportsClearVoice()){
      await audio.setAudioConstraints({echoCancellation:true,autoGainControl:true,noiseSuppression:true}).catch(()=>undefined);
      return false;
    }
    if(!clearVoiceProcessorRef.current){
      const processor=new PacificaClearVoiceProcessor(preferences.clearVoiceMode);
      try{await warmClearVoice(preferences.clearVoiceMode).catch(()=>false);await audio.addProcessor(processor,false);clearVoiceProcessorRef.current=processor}
      catch{await audio.setAudioConstraints({echoCancellation:true,autoGainControl:true,noiseSuppression:true}).catch(()=>undefined);return false}
    }
    return true;
  },[]);
  const ensureDevice=useCallback(async()=>{
    if(deviceInitPromiseRef.current)return deviceInitPromiseRef.current;
    const initialization=(async()=>{
      const token=await fetchToken();
      let device=deviceRef.current;
      if(!device){
        const sdk=await import("@twilio/voice-sdk");
        device=new sdk.Device(token,{logLevel:1,closeProtection:true,allowIncomingWhileBusy:true});deviceRef.current=device;
        device.on("tokenWillExpire",async()=>{try{device?.updateToken(await fetchToken())}catch(error){setPhoneStatus(error instanceof Error?error.message:"Token refresh failed")}});
        device.on("error",error=>{const code="code" in error?` ${String(error.code)}`:"";setPhoneStatus(`Twilio${code}: ${error.message}`);setToast(`Twilio${code}: ${error.message}`)});
        device.on("registered",()=>{setPhoneAvailable(true);setPhoneStatus("Secure line available")});
        device.on("unregistered",()=>{setPhoneAvailable(false);setPhoneStatus("Inbound calls paused · outbound still ready")});
        device.on("incoming",call=>{
          if(incomingCallRef.current){call.reject();return}
          const from=call.customParameters.get("From")||call.parameters.From||"Unknown caller";
          incomingCallRef.current=call;setIncomingNumber(from);setIncomingCall(call);setPhoneStatus(`Incoming call from ${from}`);
          let notice:Notification|undefined;
          try{
            if(!desktopNotifications()?.supportsDesktopWrapUp&&typeof Notification!=="undefined"&&Notification.permission==="granted"){
              notice=new Notification("Incoming Pacifica call",{body:`${from} · Open Pacifica to answer`,tag:"pacifica-incoming",requireInteraction:true,icon:"/pacifica-icon-192.png"});
              notice.onclick=()=>{window.focus();notice?.close()};
            }
          }catch{/* The in-app and native overlays remain available. */}
          const clear=(message:string)=>{
            notice?.close();
            if(incomingCallRef.current!==call)return;
            incomingCallRef.current=null;setIncomingCall(null);setIncomingNumber("");setPhoneStatus(message);
          };
          call.on("cancel",()=>clear("Missed incoming call"));
          call.on("reject",()=>clear("Incoming call declined"));
          call.on("disconnect",()=>clear("Incoming call ended"));
          call.on("accept",()=>clear("Incoming call answered"));
          call.on("error",(error:Error)=>clear(error.message||"Incoming call failed"));
        });
        device.audio?.outgoing(false);
        device.audio?.disconnect(false);
        device.audio?.on("deviceChange",()=>{
          if(audioDeviceChangeTimerRef.current)window.clearTimeout(audioDeviceChangeTimerRef.current);
          audioDeviceChangeTimerRef.current=window.setTimeout(()=>{
            audioDeviceChangeTimerRef.current=undefined;
            const active=deviceRef.current;if(!active)return;
            const preferences=readAudioPreferences();
            void configureCallAudio(active.audio,preferences).then(async recovered=>{
              if(Object.keys(recovered).length){saveAudioPreferences(recovered);setToast("Audio source changed · Pacifica switched the missing device to Windows default")}
              await configureClearVoice(active);
              setPhoneStatus(callRef.current?"Audio source changed · call audio re-routed":"Audio source changed · phone ready");
            }).catch(error=>{
              const message=callSetupMessage(error);
              setPhoneStatus(message);setToast("Audio source changed · open Calling settings if you cannot hear the call");
            });
          },400);
        });
      }else device.updateToken(token);
      await configureClearVoice(device);
      return device;
    })();
    deviceInitPromiseRef.current=initialization;
    try{return await initialization}
    finally{if(deviceInitPromiseRef.current===initialization)deviceInitPromiseRef.current=null}
  },[configureClearVoice,fetchToken]);
  const refreshPhoneStatus=useCallback(async()=>{
    try{
      const response=await fetch("/api/twilio/status",{cache:"no-store"});const data=await response.json();
      setPhoneReady(Boolean(data.configured));if(data.phoneNumber)setCallerId(String(data.phoneNumber));
      setPhoneStatus(data.configured?`${data.phoneNumber} ready over Wi-Fi`:data.phoneNumber==="No number assigned"?"Assign this workspace a number in Phone Number Center":"Secure API key still needed");
      if(data.configured&&!deviceRef.current)void ensureDevice().then(async device=>{
        const nativeDesktop=Boolean((window as unknown as {pacificaDesktop?:{isDesktop?:boolean}}).pacificaDesktop?.isDesktop);
        if(nativeDesktop){
          try{await device.register();setPhoneAvailable(true);setPhoneStatus(`${data.phoneNumber} ready · incoming calls on`)}
          catch(error){setPhoneAvailable(false);setPhoneStatus(error instanceof Error?error.message:"Incoming-call registration needs attention")}
        }else setPhoneStatus(`${data.phoneNumber} ready · one-click dialing enabled`);
      }).catch(error=>setPhoneStatus(error instanceof Error?error.message:"Phone setup needs attention"));
    }catch{setPhoneStatus("Unable to check Twilio setup")}
  },[ensureDevice]);
  useEffect(()=>{const timer=window.setTimeout(()=>void refreshPhoneStatus(),0);return()=>{window.clearTimeout(timer);if(nextCallTimerRef.current)window.clearTimeout(nextCallTimerRef.current);if(audioDeviceChangeTimerRef.current)window.clearTimeout(audioDeviceChangeTimerRef.current);audioDeviceChangeTimerRef.current=undefined;deviceRef.current?.destroy();deviceRef.current=null;deviceInitPromiseRef.current=null;clearVoiceProcessorRef.current=null}},[refreshPhoneStatus]);
  function finalizeLog(outcome:string,status:string,errorCode?:string){
    const current=currentLogRef.current;if(!current||current.finalized)return;current.finalized=true;
    const duration=callDurationSeconds(current.connectedAt);
    const complete:CallLog={...current,duration,outcome,status,errorCode,callSid:callRef.current?.parameters?.CallSid||current.callSid};
    delete (complete as CallLog & {connectedAt?:number;finalized?:boolean}).connectedAt;delete (complete as CallLog & {connectedAt?:number;finalized?:boolean}).finalized;
    setCallLogs(list=>{const same=(log:CallLog)=>log.id===complete.id||Boolean(complete.callSid&&log.callSid===complete.callSid);const previous=list.find(same);const merged=previous?mergeRecordingUpdates([complete],[previous])[0]:complete;return [merged,...list.filter(log=>!same(log))].slice(0,500)});currentLogRef.current=null;
  }
  function stopAutoDial(message="Auto dial paused"){
    autoDialRef.current=false;setAutoDialing(false);
    if(nextCallTimerRef.current)window.clearTimeout(nextCallTimerRef.current);
    nextCallTimerRef.current=undefined;setToast(message);
  }
  function setDialerRunState(line:LeadLine,run:WorkspaceProfile["dialerRuns"][LeadLine]){
    dialerRunsRef.current={...dialerRunsRef.current,[line]:run};
    setWorkspaceProfile(profile=>({...profile,dialerRuns:{...profile.dialerRuns,[line]:run}}));
  }
  function scopeForLead(item:Lead):DialerScope{return /Pacifica Miner\s*·\s*Personal Auto/i.test(item.source)?"miner-personal-auto":/Pacifica Miner\s*·\s*Home/i.test(item.source)?"miner-home":/Pacifica Miner\s*·\s*Commercial/i.test(item.source)?"miner-commercial":"crm"}
  function dialerQueueLabel(scope=dialerScopeRef.current){return scope==="miner-personal-auto"?"Miner · Personal Auto":scope==="miner-home"?"Miner · Homeowners":scope==="miner-commercial"?"Miner · Commercial":queueLabel(activeLineRef.current,workspaceProfile.mode)}
  function eligibleDialerLeads(line:LeadLine){
    const scope=dialerScopeRef.current;
    if(scope!=="crm")return leadsRef.current.filter(item=>!item.deletedAt&&scopeForLead(item)===scope&&isDialerEligibleLead(item)&&normalizedCsvPhone(item.phone).length>=7);
    return leadsRef.current.filter(item=>!item.deletedAt&&scopeForLead(item)==="crm"&&item.line===line&&isDialerEligibleLead(item)&&normalizedCsvPhone(item.phone).length>=7);
  }
  function createDialerRun(line:LeadLine){
    const ranked=rankDialerLeads(eligibleDialerLeads(line),Date.now());
    if(dialerScopeRef.current!=="crm"){
      const ids=ranked.map(item=>item.id);minerRunIdsRef.current=ids;setMinerRunIds(ids);return ranked;
    }
    if(!ranked.length){setDialerRunState(line,null);return ranked}
    const stamp=new Date().toISOString();
    setDialerRunState(line,{ids:ranked.map(item=>item.id),completed:0,total:ranked.length,startedAt:stamp,updatedAt:stamp});
    return ranked;
  }
  function remainingDialerRunLeads(line:LeadLine){
    if(dialerScopeRef.current!=="crm"){
      const eligible=eligibleDialerLeads(line);if(!minerRunIdsRef.current.length)return [] as Lead[];
      const remaining=refreshDialerRun(minerRunIdsRef.current,eligible);
      const ids=remaining.map(item=>item.id);if(ids.join(",")!==minerRunIdsRef.current.join(",")){minerRunIdsRef.current=ids;setMinerRunIds(ids)}
      return remaining;
    }
    const run=dialerRunsRef.current[line];if(!run)return [] as Lead[];
    const eligibleById=new Map(eligibleDialerLeads(line).map(item=>[item.id,item] as const));
    const remaining=refreshDialerRun(run.ids,Array.from(eligibleById.values()));
    if(remaining.map(item=>item.id).join(",")!==run.ids.join(",")){
      const removed=run.ids.filter(id=>!eligibleById.has(id)).length;
      const added=remaining.filter(item=>!run.ids.includes(item.id)).length;
      const next=remaining.length?{...run,ids:remaining.map(item=>item.id),total:run.total+added,completed:Math.min(run.total,run.completed+removed),updatedAt:new Date().toISOString()}:null;
      setDialerRunState(line,next);
    }
    return remaining;
  }
  function completeDialerRunLead(leadId:number,line:LeadLine){
    if(dialerScopeRef.current!=="crm"){
      const remaining=minerRunIdsRef.current.filter(id=>id!==leadId);minerRunIdsRef.current=remaining;setMinerRunIds(remaining);return null;
    }
    const run=dialerRunsRef.current[line];if(!run||!run.ids.includes(leadId))return run;
    const eligibleIds=new Set(eligibleDialerLeads(line).map(item=>item.id));
    const remainingIds=run.ids.filter(id=>id!==leadId&&eligibleIds.has(id));
    const removed=Math.max(1,run.ids.length-remainingIds.length);
    const next=remainingIds.length?{...run,ids:remainingIds,completed:Math.min(run.total,run.completed+removed),updatedAt:new Date().toISOString()}:null;
    setDialerRunState(line,next);return next;
  }
  function scheduleNextAuto(){
    if(!autoDialRef.current)return;
    if(nextCallTimerRef.current)window.clearTimeout(nextCallTimerRef.current);
    const queue=remainingDialerRunLeads(activeLineRef.current);
    if(!queue.length){stopAutoDial(`${dialerQueueLabel()} run completed · Start calling creates a fresh queue`);return}
    const nextLead=queue[0];setIndex(0);setPhoneStatus(`Calling ${nextLead.name} next…`);setToast("");
    nextCallTimerRef.current=window.setTimeout(()=>{nextCallTimerRef.current=undefined;if(autoDialRef.current)void placeCall(nextLead.phone,false,nextLead)},450);
  }
  function openPostCall(leadId:number,resumeQueue:boolean,technicalOutcome:string,wasConnected:boolean){
    const completedLead=leadsRef.current.find(item=>item.id===leadId);if(!completedLead)return;
    resumeAfterWrapRef.current=resumeQueue;setResumeAfterWrap(resumeQueue);autoDialRef.current=false;setAutoDialing(false);
    setDesktopWrapError("");
    setPostCallTechnicalOutcome(technicalOutcome);setPostCallConnected(wasConnected);
    setPostCallDraft(postCallDraftForEnd(completedLead,technicalOutcome,wasConnected));
    postCallLeadSnapshotRef.current=completedLead;
    setPostCallLeadId(leadId);setPhoneStatus(`Wrap up ${completedLead.name}, then continue`);
    updateLead(leadId,{lastContact:new Date().toLocaleString(),...(wasConnected?{lastConnectedAt:new Date().toISOString()}:{})});
  }
  function choosePostCallOutcome(outcome:string){
    if(!postCallLead)return;
    setPostCallDraft(draft=>selectPostCallOutcome(draft,postCallLead.source,outcome,new Date(),postCallLead.stage==="Closed"&&draft.crmStage==="Closed"));
  }
  async function syncLeadDisposition(completedLead:Lead,patch:{sourceDisposition:string;stage:string;outcome:string;followUp:string;notes:string},callEnded=false){
    if(/smart[\s_-]*financial/i.test(completedLead.source)&&!callEnded)return completedLead.sourceSyncStatus||"Saved in Pacifica · SmartFinancial updates after an outbound call";
    try{
      const response=await fetch("/api/integrations/dispositions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:callEnded?"call-ended":"contact-saved",source:completedLead.source,vendorId:completedLead.vendorId,leadName:completedLead.name,phone:completedLead.phone,disposition:patch.sourceDisposition,crmStage:patch.stage,crmOutcome:patch.outcome,appointmentAt:patch.followUp,notes:patch.notes})});
      const data=await response.json() as {synced?:boolean;message?:string;error?:string};
      if(!response.ok)throw new Error(data.error||"Lead-source update failed");
      const message=data.message||(data.synced?`${completedLead.source} updated`:"Saved in Pacifica · source sync not connected");
      updateLead(completedLead.id,{sourceSyncStatus:message});return message;
    }catch(error){const message=`Saved in Pacifica · ${error instanceof Error?error.message:"source update failed"}`;updateLead(completedLead.id,{sourceSyncStatus:message});return message}
  }
  async function savePostCall(next:"queue"|"again"="queue",desktopDraft?:typeof postCallDraft){
    if(!postCallLeadId||sourceSyncing)return;
    if(manualWrap){
      const result=desktopDraft||postCallDraft,number=manualWrap.lead.phone;
      const saveId=`${callAttemptRef.current}:${postCallLeadId}`;if(savedPostCallRef.current===saveId)return;savedPostCallRef.current=saveId;
      setCallLogs(list=>list.map(log=>log.id===manualWrap.logId?{...log,outcome:result.crmOutcome,notes:result.notes,followUp:result.appointmentAt}:log));
      setManualWrap(null);postCallLeadSnapshotRef.current=null;setPostCallLeadId(null);setDesktopWrapError("");setPhoneStatus("Call result saved");
      if(next==="again"){setDialNumber(number);void placeCall(number,true)}
      return;
    }
    const snapshot=postCallLeadSnapshotRef.current;
    const completedLead=leadsRef.current.find(item=>item.id===postCallLeadId)||(snapshot?findDialedContact(leadsRef.current,snapshot.phone):undefined);
    if(!completedLead){
      postCallLeadSnapshotRef.current=null;setPostCallLeadId(null);setSourceSyncing(false);setDesktopWrapError("");
      setPhoneStatus("Wrap-up cleared");setToast("The call result could not be matched to the refreshed contact, so Pacifica unlocked the dialer.");
      return;
    }
    const saveId=`${callAttemptRef.current}:${completedLead.id}`;if(savedPostCallRef.current===saveId)return;
    savedPostCallRef.current=saveId;
    const resultDraft=desktopDraft||postCallDraft;
    const markedLogId=postCallLogIdRef.current;if(markedLogId){setCallLogs(list=>list.map(log=>log.id===markedLogId?{...log,outcome:resultDraft.crmOutcome,status:"Disposition saved"}:log));postCallLogIdRef.current=""}
    setSourceSyncing(true);
    const won=resultDraft.crmOutcome==="Sold / Won";const now=new Date();
    const missed=["No answer","Voicemail"].includes(resultDraft.crmOutcome);const terminal=resultDraft.crmStage==="Closed"||["Not interested","Wrong number","Sold / Won"].includes(resultDraft.crmOutcome);const humanFollowUp=resultDraft.crmOutcome==="Interested";
    const automation:Partial<Lead>=missed&&!terminal?{automationEnabled:true,automationSequenceId:"missed-call",automationStep:0,automationNextAt:new Date(now.getTime()+120*60_000).toISOString(),automationStatus:"scheduled",automationDeliveryFailures:0,automationLastError:"",automationUpdatedAt:now.toISOString()}:terminal||humanFollowUp?{automationEnabled:!terminal,automationStatus:terminal?"complete":"waiting for salesperson",automationNextAt:"",automationUpdatedAt:now.toISOString()}:{};
    const patch:Partial<Lead>={stage:resultDraft.crmStage,outcome:resultDraft.crmOutcome,sourceDisposition:resultDraft.sourceDisposition,followUpUtc:resultDraft.appointmentAt&&Number.isFinite(Date.parse(resultDraft.appointmentAt))?new Date(resultDraft.appointmentAt).toISOString():"",followUp:resultDraft.crmStage==="Closed"?"":resultDraft.appointmentAt,notes:resultDraft.notes,status:resultDraft.crmStage==="Closed"?"Closed":"Ready",lastContact:now.toLocaleString(),closedAt:won?now.toISOString():completedLead.closedAt,...automation};
    updateLead(completedLead.id,patch);
    completeDialerRunLead(completedLead.id,completedLead.line);
    const sourcePatch={sourceDisposition:resultDraft.sourceDisposition,stage:resultDraft.crmStage,outcome:resultDraft.crmOutcome,followUp:patch.followUp||"",notes:resultDraft.notes};
    const resume=resumeAfterWrapRef.current&&next!=="again";
    resumeAfterWrapRef.current=false;setResumeAfterWrap(false);postCallLeadSnapshotRef.current=null;setPostCallLeadId(null);setSourceSyncing(false);
    if(next==="again"){
      autoDialRef.current=false;setAutoDialing(false);setToast("");
      if(nextCallTimerRef.current)window.clearTimeout(nextCallTimerRef.current);
      setView("dialer");void placeCall(completedLead.phone,false,{...completedLead,...patch});
    }
    else if(resume){autoDialRef.current=true;setAutoDialing(true);scheduleNextAuto()}
    else setToast("Call result saved in Pacifica");
    // Provider status sync must never hold the salesperson or the next call hostage.
    void syncLeadDisposition(completedLead,sourcePatch);
  }
  function finishCall(wasManual:boolean,leadId?:number,message="Call ended — save an outcome, then resume",outcome="Completed",errorCode?:string,attemptId=callAttemptRef.current,automaticSkip=false){
    if(attemptId!==callAttemptRef.current||advancingRef.current)return;advancingRef.current=true;
    screeningRef.current?.dispose();screeningRef.current=null;
    const endedLog=currentLogRef.current;
    postCallLogIdRef.current=endedLog?.id||"";
    const wasConnected=Boolean(endedLog?.connectedAt);const shouldResume=autoDialRef.current;
    const listenThroughMode=workspaceProfile.dialerRingTimeoutSeconds===30;
    // Fast Skip may use the historical Completed -> No answer fallback.
    // Listen Through never guesses: only confirmed No answer auto-advances.
    if(!wasConnected&&outcome==="Completed"&&!listenThroughMode)outcome="No answer";
    const autoUnconnected=Boolean(!wasManual&&shouldResume&&!wasConnected&&(!listenThroughMode||outcome==="No answer"));
    automaticSkip=Boolean(automaticSkip||autoUnconnected);
    const attemptWasEstablished=establishedAttemptRef.current===attemptId;
    if(attemptWasEstablished&&leadId&&endedLog?.campaign!=="Inbound"){
      const attemptedLead=leadsRef.current.find(item=>item.id===leadId);
      if(attemptedLead&&/smart[\s_-]*financial/i.test(attemptedLead.source)){
        void syncLeadDisposition(attemptedLead,{sourceDisposition:"Attempted Contact",stage:attemptedLead.stage,outcome:attemptedLead.outcome,followUp:attemptedLead.followUp,notes:attemptedLead.notes},true);
      }
    }
    if(watchdogRef.current)window.clearTimeout(watchdogRef.current);watchdogRef.current=undefined;finalizeLog(outcome,message,errorCode);
    quietCallAudioRef.current?.dispose();quietCallAudioRef.current=null;
    callDigits.clear();callRef.current=null;callStartGateRef.current.finish();setCurrentCallLeadId(null);setLoadedLeadId(!attemptWasEstablished&&!wasManual&&leadId?leadId:null);setRecordingSid("");setIndex(0);setDialing(false);setConnected(false);setCallConnectedAt(null);setMuted(false);setDtmfDisplay("");setDtmfFeedback({message:"",error:false});setManualCall(false);setWorkspaceProfile(profile=>({...profile,liveCallSession:null}));
    if(automaticSkip&&leadId&&shouldResume){
      const item=leadsRef.current.find(contact=>contact.id===leadId);
      if(item){
        const patch:Partial<Lead>={...(attemptWasEstablished?{}:{attempts:(item.attempts||0)+1,lastAttemptAt:new Date().toISOString()}),lastCallResult:outcome,lastContact:`${outcome} · ${new Date().toLocaleString()}`};
        if(!item.deletedAt&&!item.lastInboundAt&&["New lead","Follow-up","Open"].includes(item.stage)&&["Not contacted","No answer","Voicemail"].includes(item.outcome)&&["No answer","Voicemail"].includes(outcome))patch.outcome=outcome;
        updateLead(leadId,patch);completeDialerRunLead(leadId,item.line);
      }
      setPhoneStatus(`${outcome} · continuing`);scheduleNextAuto();return;
    }
    if(leadId&&attemptWasEstablished){openPostCall(leadId,shouldResume,outcome,wasConnected);setToast(`${wasConnected?"Conversation":"Call attempt"} complete · save the result before continuing`);return}
    if(wasManual&&attemptWasEstablished&&endedLog){
      const summary=normalizeSavedLeads([{id:-Date.now(),name:endedLog.phone,phone:endedLog.phone,source:"Manual keypad",line:activeLineRef.current}])[0];
      postCallLeadSnapshotRef.current=summary;
      setManualWrap({lead:summary,logId:endedLog.id});setPostCallLeadId(summary.id);setPostCallDraft(postCallDraftForEnd(summary,outcome,wasConnected));setPostCallTechnicalOutcome(outcome);setPostCallConnected(wasConnected);setResumeAfterWrap(false);resumeAfterWrapRef.current=false;setDesktopWrapError("");setPhoneStatus("Choose a call result");return;
    }
    setPhoneStatus(message);
    if(!wasManual&&shouldResume)stopAutoDial(`${message} · queue paused so the failed setup cannot skip a lead`);
    setToast(message);
  }
  async function placeCall(number:string,wasManual:boolean,queuedLead:Lead=lead){
    if(aiVoiceActive.current){setToast("Stop AI Autopilot before starting another call.");return}
    if(!wasManual&&queuedLead.doNotCall){setToast("This contact is marked Do Not Call");return}
    if(dialing||!callStartGateRef.current.tryStart())return;
    const attemptId=++callAttemptRef.current;
    quietCallAudioRef.current?.dispose();quietCallAudioRef.current=null;
    callDigits.clear();setDtmfDisplay("");setDtmfFeedback({message:"",error:false});
    advancingRef.current=false;
    setManualCall(wasManual);setCurrentCallLeadId(wasManual?null:queuedLead.id);setDialing(true);setConnected(false);setMuted(false);setCallConnectedAt(null);setPhoneStatus("Checking microphone…");const callStartedAt=new Date().toISOString();setWorkspaceProfile(profile=>({...profile,liveCallSession:{leadId:wasManual?null:queuedLead.id,name:wasManual?"Manual call":queuedLead.name,phone:number,line:queuedLead.line,status:"dialing",startedAt:callStartedAt,updatedAt:callStartedAt}}));
    const currentLeadId=wasManual?findDialedContact(leadsRef.current.filter(item=>!item.deletedAt),number)?.id:queuedLead.id;
    currentLogRef.current={id:crypto.randomUUID(),name:wasManual?"Manual call":queuedLead.name,phone:number,startedAt:new Date().toISOString(),duration:0,outcome:"Dialing",status:"Connecting",campaign:dialerQueueLabel(),source:wasManual?"Manual keypad":autoDialRef.current?"CRM auto dial":"CRM manual call"};
    watchdogRef.current=window.setTimeout(()=>finishCall(wasManual,currentLeadId,"Call setup timed out. Check microphone access and Calling settings, then retry.","Failed",undefined,attemptId),30000);
    try{
      const audioPreferences=readAudioPreferences();
      const microphone=await openCallMicrophone(audioPreferences,constraints=>navigator.mediaDevices.getUserMedia(constraints));
      microphone.stream.getTracks().forEach(track=>track.stop());
      if(attemptId!==callAttemptRef.current||advancingRef.current)return;
      setPhoneStatus("Connecting to phone service…");
      const device=await ensureDevice();
      const recovered=await configureCallAudio(device.audio,{...audioPreferences,input:microphone.input});
      if(microphone.input!==audioPreferences.input)recovered.input=microphone.input;
      if(Object.keys(recovered).length){saveAudioPreferences(recovered);setToast("Audio device changed · using your current default")}
      const clearVoiceActive=await configureClearVoice(device);
      if(attemptId!==callAttemptRef.current||advancingRef.current)return;
      let signalingExpired=false;let signalingTimer:number|undefined;
      const connectPromise=device.connect({params:{To:number,RouteToken:voiceRouteTokenRef.current,RingTimeout:String(workspaceProfile.dialerRingTimeoutSeconds)}}).then(call=>{if(signalingExpired||attemptId!==callAttemptRef.current||advancingRef.current)call.disconnect();return call});
      const call=await Promise.race([connectPromise,new Promise<never>((_,reject)=>{signalingTimer=window.setTimeout(()=>{signalingExpired=true;reject(new Error("Twilio signaling timed out after 15 seconds"))},15000)})]).finally(()=>window.clearTimeout(signalingTimer));
      if(attemptId!==callAttemptRef.current||advancingRef.current){call.disconnect();return}
      callRef.current=call;
      const listenThroughCall=!wasManual&&autoDialRef.current&&workspaceProfile.dialerRingTimeoutSeconds===30;
      const screenThisCall=!wasManual&&autoDialRef.current;
      // The voice route uses answerOnBridge=true: SDK accept is the audio signal.
      // Never mute the microphone behind the user's back while polling HTTP status.
      quietCallAudioRef.current=attachQuietCallAudio(call,quietDialingRef.current);
      const isCurrentCall=()=>attemptId===callAttemptRef.current&&!advancingRef.current&&callRef.current===call;
      const markConnected=()=>{
        if(!isCurrentCall()||currentLogRef.current?.connectedAt)return;
        markAttempt();
        quietCallAudioRef.current?.release();
        setMuted(call.isMuted());
        if(watchdogRef.current)window.clearTimeout(watchdogRef.current);watchdogRef.current=undefined;
        if(currentLogRef.current)currentLogRef.current.connectedAt=Date.now();
        if(currentLeadId)updateLead(currentLeadId,{lastConnectedAt:new Date().toISOString()});
        setWorkspaceProfile(profile=>profile.liveCallSession?{...profile,liveCallSession:{...profile.liveCallSession,status:"connected",updatedAt:new Date().toISOString()}}:profile);
        setConnected(true);setCallConnectedAt(currentLogRef.current?.connectedAt??Date.now());
        setPhoneStatus(listenThroughCall?"Answered · audio on":clearVoiceActive?`Live call · ClearVoice ${clearVoiceProcessorRef.current?.engineLabel||"active"}`:"Live call over Wi-Fi");
        setToast("Recording available · give the disclosure, then tap Record");
      };
      const callScreen=screenThisCall?createCallScreening({
        callSid:()=>String(call.parameters?.CallSid||""),
        read:async sid=>{const response=await fetch(`/api/twilio/status?callSid=${encodeURIComponent(sid)}`,{cache:"no-store",signal:AbortSignal.timeout(1800)});if(!response.ok)throw new Error("Call screening unavailable");return (await response.json()).result},
        connect:markConnected,
        skip:result=>{if(!isCurrentCall())return;finishCall(wasManual,currentLeadId,`${result} · continuing`,result,undefined,attemptId,true);call.disconnect()},
      }):null;
      screeningRef.current=callScreen;
      const markAttempt=()=>{
        if(attemptId!==callAttemptRef.current||advancingRef.current||establishedAttemptRef.current===attemptId)return;
        establishedAttemptRef.current=attemptId;
        if(currentLeadId){sessionAttemptedLeadIdsRef.current.add(currentLeadId);const attemptAt=new Date();setLeads(list=>list.map(item=>{if(item.id!==currentLeadId)return item;const attempts=(item.attempts||0)+1;return {...item,attempts,lastAttemptAt:attemptAt.toISOString(),lastContact:`Attempted ${attemptAt.toLocaleString()}`,...(isDialerEligibleLead(item)?{automationEnabled:true,automationSequenceId:"missed-call",automationStep:0,automationNextAt:nextAutomationAfterAttempt(1,attemptAt.getTime()),automationStatus:"scheduled"}:{})}}))}
      };
      call.on("ringing",()=>{if(!isCurrentCall()||currentLogRef.current?.connectedAt)return;markAttempt();setPhoneStatus(quietDialingRef.current?"Ringing · silent until answered":"Ringing · audible")});
      if(watchdogRef.current)window.clearTimeout(watchdogRef.current);
      const effectiveRingWindow=workspaceProfile.dialerRingTimeoutSeconds===30?45:20;
      const onAccept=()=>{if(!isCurrentCall())return;markAttempt();if(callScreen)callScreen.accept();else markConnected()};
      watchdogRef.current=window.setTimeout(()=>{
        if(!isCurrentCall())return;
        // A missed event must not disconnect an already open conversation.
        if(call.status()==="open"){onAccept();return}
        finishCall(wasManual,currentLeadId,`No answer after ${effectiveRingWindow}-second ring window`,"No answer",undefined,attemptId,Boolean(!wasManual&&autoDialRef.current));call.disconnect();
      },(effectiveRingWindow+5)*1000);
      call.on("accept",onAccept);
      call.on("disconnect",()=>{if(!isCurrentCall())return;void (async()=>{
        if(callScreen&&await callScreen.ended())return;
        if(!isCurrentCall())return;
        const neverConnected=!currentLogRef.current?.connectedAt;
        if(listenThroughCall&&neverConnected){
          const sid=String(call.parameters?.CallSid||"");
          let terminal="";
          for(let check=0;check<8&&sid&&!terminal&&isCurrentCall();check++){
            try{
              const response=await fetch(`/api/twilio/status?callSid=${encodeURIComponent(sid)}`,{cache:"no-store",signal:AbortSignal.timeout(1800)});
              if(response.ok){
                const data=await response.json() as {result?:{detectionStatus?:string}|null};
                const status=String(data.result?.detectionStatus||"").toLowerCase();
                if(["no-answer","busy","failed","canceled","completed"].includes(status))terminal=status;
              }
            }catch{}
            if(!terminal)await new Promise(resolve=>window.setTimeout(resolve,250));
          }
          if(!isCurrentCall())return;
          const trueNoAnswer=terminal==="no-answer";
          const terminalOutcome=terminal==="busy"?"Busy":terminal==="failed"?"Failed":terminal==="canceled"?"Canceled":trueNoAnswer?"No answer":"Unknown";
          finishCall(wasManual,currentLeadId,trueNoAnswer?"No answer · continuing":terminal?`Call ended · ${terminalOutcome}`:"Call ended · review result",terminalOutcome,undefined,attemptId,trueNoAnswer);
          return;
        }
        finishCall(wasManual,currentLeadId,neverConnected&&autoDialRef.current?"No answer · continuing":autoDialRef.current?"Call ended":"Call ended — save an outcome, then resume",neverConnected?"No answer":"Completed",undefined,attemptId,Boolean(neverConnected&&!wasManual&&autoDialRef.current));
      })()});
      const onUnconnectedEnd=(message:string,outcome:string)=>{if(!isCurrentCall())return;void (async()=>{if(callScreen&&await callScreen.ended())return;if(!isCurrentCall())return;const autoUnconnected=!wasManual&&autoDialRef.current&&!currentLogRef.current?.connectedAt&&!listenThroughCall;finishCall(wasManual,currentLeadId,autoUnconnected?`${message} · continuing`:message,outcome,undefined,attemptId,autoUnconnected)})()};
      call.on("cancel",()=>onUnconnectedEnd("Call canceled","Canceled"));
      call.on("reject",()=>onUnconnectedEnd("Call was rejected","Rejected"));
      call.on("error",error=>{const code="code" in error?String(error.code):undefined;finishCall(wasManual,currentLeadId,error.message||"Call failed","Failed",code,attemptId)});
      if(call.status()==="open")onAccept();
    }catch(error){
      if(attemptId!==callAttemptRef.current||advancingRef.current)return;
      deviceRef.current?.disconnectAll();
      const detail=callSetupMessage(error);
      const permission=error instanceof DOMException&&["NotAllowedError","PermissionDeniedError"].includes(error.name);
      finishCall(wasManual,currentLeadId,permission?"Microphone permission was blocked. Allow it in the browser address bar, then retry.":detail,"Failed",undefined,attemptId);
      setPhoneStatus(permission?"Microphone permission blocked":detail);
    }
  }
  function start(){
    if(aiVoiceActive.current){setAvaOpen(true);return}
    if(postCallLeadId){setToast("Save the call result before continuing");return}
    let queue:Lead[]=[];
    if(!loadedLead){queue=remainingDialerRunLeads(activeLine);if(!queue.length)queue=createDialerRun(activeLine)}
    const nextLead=loadedLead||queue[0]||lead;
    if((!loadedLead&&!queue.length)||normalizedCsvPhone(nextLead.phone).length<7){setView("leads");setToast(lineLeads.length?"No open contacts are eligible to dial":`Import ${queueLabel(activeLine,workspaceProfile.mode)} first`);return}
    sessionAttemptedLeadIdsRef.current.clear();autoDialRef.current=!loadedLead;setAutoDialing(!loadedLead);void placeCall(nextLead.phone,false,nextLead);
  }
  function startMinerDialer(mode:MinerMode){
    if(aiVoiceActive.current){setAvaOpen(true);return}
    if(dialing||postCallLeadId){setToast("Finish the current call and save its result first");return}
    const scope:DialerScope=mode==="personal-auto"?"miner-personal-auto":mode==="home"?"miner-home":"miner-commercial";setMinerMode(mode);dialerScopeRef.current=scope;setDialerScope(scope);setLoadedLeadId(null);minerRunIdsRef.current=[];setMinerRunIds([]);
    const queue=createDialerRun(activeLineRef.current);if(!queue.length){setToast(`No ${mode==="personal-auto"?"personal-auto":mode==="home"?"homeowner":"commercial"} Miner prospects are ready to dial`);return}
    sessionAttemptedLeadIdsRef.current.clear();autoDialRef.current=true;setAutoDialing(true);void placeCall(queue[0].phone,false,queue[0]);
  }
  function hangup(){
    screeningRef.current?.dispose();screeningRef.current=null;
    const call=callRef.current;
    if(call){call.disconnect();return}
    const attemptId=callAttemptRef.current;
    finishCall(manualCall,manualCall?undefined:lead.id,"Call canceled before connection","Canceled",undefined,attemptId);
    callAttemptRef.current=attemptId+1;
  }
  function deleteLead(item:Lead){
    if(postCallLeadId===item.id){setToast("Save the call result before deleting this contact.");return}
    if(dialing&&item.id===currentCallLeadId){setToast("Finish the current call before deleting this contact.");return}
    const now=new Date().toISOString(),phone=normalizedCsvPhone(item.phone),email=normalizedCsvEmail(item.email);
    setLeads(list=>list.map(lead=>{const same=lead.id===item.id||(phone.length>=7&&normalizedCsvPhone(lead.phone)===phone)||(email.includes("@")&&normalizedCsvEmail(lead.email)===email);return same?{...lead,deletedAt:now,deletionUpdatedAt:now,automationEnabled:false,automationNextAt:"",automationStatus:"deleted"}:lead}));
    if(loadedLeadId===item.id)setLoadedLeadId(null);
    setSelectedLead(null);setDeletedLead(item);
  }
  function undoDelete(){
    if(!deletedLead)return;
    const now=new Date().toISOString(),phone=normalizedCsvPhone(deletedLead.phone),email=normalizedCsvEmail(deletedLead.email);
    setLeads(list=>list.map(lead=>{const same=lead.id===deletedLead.id||(phone.length>=7&&normalizedCsvPhone(lead.phone)===phone)||(email.includes("@")&&normalizedCsvEmail(lead.email)===email);return same?{...lead,deletedAt:"",deletionUpdatedAt:now,automationEnabled:deletedLead.automationEnabled,automationNextAt:deletedLead.automationNextAt,automationStatus:deletedLead.automationStatus}:lead}));
    setDeletedLead(null);
  }
  function toggleMute(){const call=callRef.current;if(!call)return;const next=!call.isMuted();call.mute(next);setMuted(next)}
  async function toggleRecording(){
    const sid=callRef.current?.parameters?.CallSid||"";if(!sid||recordingBusy)return;
    if(!recordingSid&&!window.confirm("Confirm that every person on this call has received the legally required recording disclosure and consented. Start recording?"))return;
    setRecordingBusy(true);
    try{const response=await fetch("/api/twilio/recordings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:recordingSid?"stop":"start",callSid:sid,recordingSid,leadId:currentCallLeadId||0,consentConfirmed:!recordingSid})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Recording request failed");if(recordingSid){if(currentLogRef.current)currentLogRef.current.recordingStatus="processing";setRecordingSid("");setToast("Recording stopped · processing securely for Reports")}else{const nextSid=String(data.recordingSid||"");if(currentLogRef.current){currentLogRef.current.recordingSid=nextSid;currentLogRef.current.recordingStatus="in-progress"}setRecordingSid(nextSid);setToast("Recording started after consent confirmation")}}catch(error){setToast(error instanceof Error?error.message:"Recording request failed")}finally{setRecordingBusy(false)}
  }
  function pauseQueue(){resumeAfterWrapRef.current=false;setResumeAfterWrap(false);stopAutoDial("Auto dialing paused — finish the current call or wrap-up safely")}
  function callTypedNumber(){
    if(postCallLeadId){setToast("Save the call result or choose Call again first");return}
    if(dialDigits(dialNumber).length<7){setToast("Enter a complete phone number");return}
    const matched=findDialedContact(leadsRef.current,dialNumber);
    if(matched?.doNotCall){setToast(`${matched.name} is marked Do Not Call`);return}
    stopAutoDial(matched?`Calling ${matched.name}`:"Manual call mode");
    if(matched){
      activeLineRef.current=matched.line;setActiveLine(matched.line);
      const queue=rankLeads(leadsRef.current.filter(item=>item.line===matched.line&&item.stage!=="Closed"&&!item.doNotCall));
      setIndex(Math.max(0,queue.findIndex(item=>item.id===matched.id)));
      void placeCall(matched.phone,false,matched);return;
    }
    void placeCall(dialNumber,true);
  }
  async function togglePhoneAvailability(){
    if(!desktopNotifications()?.isDesktop&&typeof Notification!=="undefined"&&Notification.permission==="default")void Notification.requestPermission().catch(()=>undefined);
    try{
      const device=await ensureDevice();
      if(phoneAvailable){setPhoneStatus("Pausing incoming calls…");await device.unregister();setPhoneAvailable(false);setPhoneStatus("Inbound calls paused · outbound still ready");return}
      setPhoneStatus("Going available for incoming calls…");await device.register();setPhoneAvailable(true);setPhoneStatus("Secure line available · incoming calls on");
    }catch(error){const message=error instanceof Error?error.message:"Unable to start inbound calling";setPhoneAvailable(false);setPhoneStatus(message);setToast(message)}
  }
  function rejectIncoming(){incomingCallRef.current?.reject();incomingCallRef.current=null;setIncomingCall(null);setIncomingNumber("");setPhoneStatus("Incoming call declined")}
  function acceptIncoming(){
    const call=incomingCallRef.current;if(!call)return;
    avaControls.current?.stop();
    incomingCallRef.current=null;
    const previousCall=callRef.current;
    if(currentLogRef.current?.campaign!=="Inbound"&&establishedAttemptRef.current===callAttemptRef.current){
      const attemptedLead=leadsRef.current.find(item=>item.id===currentCallLeadId);
      if(attemptedLead&&/smart[\s_-]*financial/i.test(attemptedLead.source))void syncLeadDisposition(attemptedLead,{sourceDisposition:"Attempted Contact",stage:attemptedLead.stage,outcome:attemptedLead.outcome,followUp:attemptedLead.followUp,notes:attemptedLead.notes},true);
    }
    // Preserve the interrupted call before replacing its log and audio state.
    finalizeLog(currentLogRef.current?.connectedAt?"Completed":"Canceled","Replaced by incoming call");
    if(watchdogRef.current)window.clearTimeout(watchdogRef.current);watchdogRef.current=undefined;
    callDigits.clear();setDtmfDisplay("");setDtmfFeedback({message:"",error:false});
    setRecordingSid("");setConnected(false);setMuted(false);setCallConnectedAt(null);
    const attemptId=++callAttemptRef.current;
    stopAutoDial("Inbound call answered");
    screeningRef.current?.dispose();screeningRef.current=null;
    quietCallAudioRef.current?.dispose();quietCallAudioRef.current=null;
    advancingRef.current=false;establishedAttemptRef.current=attemptId;
    if(previousCall&&previousCall!==call){try{previousCall.disconnect()}catch{}}
    callRef.current=call;setDialing(true);setIncomingCall(null);setDialNumber(incomingNumber);setIncomingNumber("");
    const matched=findDialedContact(leadsRef.current,incomingNumber);
    setManualCall(!matched);
    setCurrentCallLeadId(matched?.id||null);const inboundStartedAt=new Date().toISOString();setWorkspaceProfile(profile=>({...profile,liveCallSession:{leadId:matched?.id||null,name:matched?.name||"Inbound caller",phone:incomingNumber,line:matched?.line||activeLineRef.current,status:"dialing",startedAt:inboundStartedAt,updatedAt:inboundStartedAt}}));
    currentLogRef.current={id:crypto.randomUUID(),name:matched?.name||"Inbound caller",phone:incomingNumber,callSid:String(call.parameters.CallSid||""),startedAt:new Date().toISOString(),duration:0,outcome:"Incoming",status:"Ringing",campaign:"Inbound",source:"Pacifica softphone"};
    call.on("accept",()=>{if(attemptId!==callAttemptRef.current||advancingRef.current||callRef.current!==call)return;setMuted(call.isMuted());if(currentLogRef.current)currentLogRef.current.connectedAt=Date.now();setWorkspaceProfile(profile=>profile.liveCallSession?{...profile,liveCallSession:{...profile.liveCallSession,status:"connected",updatedAt:new Date().toISOString()}}:profile);setConnected(true);setCallConnectedAt(currentLogRef.current?.connectedAt??Date.now());setPhoneStatus(`Live inbound call${matched?` · ${matched.name}`:""}`);setToast("Recording available · give the disclosure, then tap Record");if(matched){activeLineRef.current=matched.line;setActiveLine(matched.line);const queue=rankLeads(leadsRef.current.filter(item=>item.line===matched.line&&isDialerEligibleLead(item)));setIndex(Math.max(0,queue.findIndex(item=>item.id===matched.id)));setView("dialer");updateLead(matched.id,{lastContact:new Date().toLocaleString(),lastConnectedAt:new Date().toISOString()})}});
    call.on("disconnect",()=>{if(attemptId!==callAttemptRef.current||advancingRef.current)return;finishCall(!matched,matched?.id,"Inbound call ended","Completed",undefined,attemptId);if(matched)setSelectedLead(matched.id)});
    call.on("reject",()=>finishCall(!matched,matched?.id,"Inbound call declined","Rejected",undefined,attemptId));
    call.on("error",error=>finishCall(!matched,matched?.id,error.message||"Inbound call failed","Failed","code" in error?String(error.code):undefined,attemptId));
    call.accept();
  }
  function callLeadById(id:number){const item=leadsRef.current.find(candidate=>candidate.id===id);if(!item)return;const nextScope=scopeForLead(item);dialerScopeRef.current=nextScope;setDialerScope(nextScope);if(postCallLeadId){setToast("Save the call result or choose Call again first");return}if(item.doNotCall||normalizedCsvPhone(item.phone).length<7){setToast(item.doNotCall?"This contact is marked Do Not Call":"Enter a complete phone number");return}sessionAttemptedLeadIdsRef.current.clear();autoDialRef.current=false;setAutoDialing(false);activeLineRef.current=item.line;setActiveLine(item.line);const queue=rankLeads(leadsRef.current.filter(candidate=>candidate.line===item.line&&isDialerEligibleLead(candidate)));setIndex(Math.max(0,queue.findIndex(candidate=>candidate.id===id)));if(nextScope==="crm")setView("dialer");void placeCall(item.phone,false,item)}
  function loadLeadInDialer(item:Lead){
    if(dialing||postCallLeadId){setToast("Finish the current call and save its result first");return}
    if(item.doNotCall||normalizedCsvPhone(item.phone).length<7){setToast(item.doNotCall?"This contact is marked Do Not Call":"This contact needs a complete phone number");return}
    stopAutoDial(`${item.name} loaded for a one-off call`);const nextScope=scopeForLead(item);dialerScopeRef.current=nextScope;setDialerScope(nextScope);activeLineRef.current=item.line;setActiveLine(item.line);setLoadedLeadId(item.id);setDialNumber(item.phone);setManualCall(false);setSelectedLead(null);setView(nextScope==="crm"?"dialer":"miner");
  }
  function pressKey(digits:string){
    if(dialing||callRef.current){
      callDigits.send(callRef.current,digits,{
        onSent:digit=>{setDtmfDisplay(value=>(value+digit).slice(-32));setDtmfFeedback({message:`Sent ${digit} to this call`,error:false})},
        onError:message=>setDtmfFeedback({message,error:true}),
      });return;
    }
    if(!/^[0-9*#]+$/.test(digits))return;
    for(const digit of digits)void playDialTone(digit);
    setDialNumber(value=>value+digits);setDtmfFeedback({message:"",error:false});
  }
  function openCallKeypad(){setView("dialer");setKeypadOpen(true)}
  function parseRow(row:string,delimiter:string){
    const values:string[]=[];let value="";let quoted=false;
    for(let i=0;i<row.length;i++){const char=row[i];if(char==='"'&&quoted&&row[i+1]==='"'){value+='"';i++;continue}if(char==='"'){quoted=!quoted;continue}if(char===delimiter&&!quoted){values.push(value.trim());value="";continue}value+=char}
    values.push(value.trim());return values;
  }
  async function syncLeadFeed(notify=true){
    if(leadFeedSyncRef.current)return;leadFeedSyncRef.current=true;
    try{
      const response=await fetch("/api/integrations/leads",{cache:"no-store"});
      const data=await response.json() as {error?:string;leads?:ProviderLeadRecord[]};
      if(!response.ok)throw new Error(data.error||"Connection failed");
      const create=(item:ProviderLeadRecord,position:number):Lead=>{const mapped=crmFieldsForDisposition(item.disposition);return {id:Date.now()+position,vendorId:item.vendorId||item.id,name:item.name,phone:item.phone,email:item.email||"",city:item.city||"Imported",status:mapped.stage==="Closed"?"Closed":"Ready",stage:mapped.stage,outcome:mapped.outcome,notes:item.notes||"",followUp:"",doNotCall:false,lastContact:"Never",line:item.line==="home-auto"?"home-auto":"life",source:item.source||"Lead provider",leadCost:Number(item.cost)||0,product:item.product||"Service inquiry",sourceDisposition:item.disposition||"",importedAt:item.createdAt||new Date().toISOString(),providerUpdatedAt:new Date().toISOString(),address:item.address||"",state:item.state||"",zip:item.zip||"",territory:item.territory||"",brand:item.brand||"",profileName:item.profileName||"",received:item.received||"",returnStatus:item.returnStatus||"",employeeCount:item.employeeCount||"",searchPro:item.searchPro||"",extraFields:item.extraFields||{}}};
      const merged=mergeProviderLeads(leadsRef.current,data.leads||[],create);
      const {added,updated}=merged;if(added||updated)setLeads(current=>mergeLeadDeletions(mergeProviderLeads(current,data.leads||[],create).leads,current));
      setLeadFeedStatus(`Live · refreshes every 20 seconds${added?` · ${added} new`:updated?` · ${updated} updated`:""}`);
      if(notify)setToast(added?`${added} new provider lead${added===1?"":"s"} added`:updated?`${updated} provider lead${updated===1?"":"s"} refreshed`:"Lead feed is current");
    }
    catch(error){setLeadFeedStatus(error instanceof Error?error.message:"Connection failed");if(notify)setToast("Lead feed connection failed")}
    finally{leadFeedSyncRef.current=false}
  }
  // Provider secrets stay server-side. The authenticated owner checks the inbound queue.
  useEffect(()=>{if(!workspaceHydrated||!isOwner)return;const refresh=()=>{setPriorityNow(Date.now());if(!document.hidden)void syncLeadFeed(false)};const initial=window.setTimeout(refresh,0);const timer=window.setInterval(refresh,20000);window.addEventListener("focus",refresh);window.addEventListener("online",refresh);document.addEventListener("visibilitychange",refresh);return()=>{window.clearTimeout(initial);window.clearInterval(timer);window.removeEventListener("focus",refresh);window.removeEventListener("online",refresh);document.removeEventListener("visibilitychange",refresh)}},[workspaceHydrated,isOwner]);
  useEffect(()=>{
    if(!workspaceHydrated)return;
    const sync=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.workspaceId!==workspaceId||!Array.isArray(detail.leads))return;const incoming=normalizeSavedLeads(detail.leads);setLeads(current=>mergeIncomingContacts(current,incoming))};
    const open=(event:Event)=>{
      const detail=(event as CustomEvent).detail;if(detail?.workspaceId!==workspaceId||typeof detail.phone!=="string")return;
      const reveal=(item:Lead)=>{if(item.deletedAt){if(!detail.restore){setToast("This contact was deleted. Use Restore contact on the inbound notification.");return}setLeads(current=>current.map(lead=>lead.id===item.id?{...lead,deletedAt:"",deletionUpdatedAt:new Date().toISOString()}:lead))}activeLineRef.current=item.line;setActiveLine(item.line);setSearch("");setSourceFilter("All sources");setOwnerFilter("All owners");setStageFilter("All stages");setView("leads");setSelectedLead(item.id)};
      const item=findDialedContact(leadsRef.current,detail.phone);
      if(item){reveal(item);return}
      void fetch("/api/crm/workspace",{cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error("Workspace refresh failed");const data=await response.json();const incoming=normalizeSavedLeads(data.leads);const saved=findDialedContact(incoming,detail.phone);if(!saved)throw new Error("The contact is still syncing. Refresh Contacts in a moment.");setLeads(current=>mergeIncomingContacts(current,incoming));reveal(saved)}).catch(error=>setToast(error instanceof Error?error.message:"Could not open contact"));
    };
    window.addEventListener("pacifica:inbound-synced",sync);window.addEventListener("pacifica:open-contact",open);
    return()=>{window.removeEventListener("pacifica:inbound-synced",sync);window.removeEventListener("pacifica:open-contact",open)};
  },[workspaceHydrated,workspaceId]);
  function saveLeadFeedConnection(){void syncLeadFeed(true)}
  function csvRecords(text:string){
    const records:string[]=[];let record="";let quoted=false;
    for(let index=0;index<text.length;index++){const char=text[index];if(char==='"'){record+=char;if(quoted&&text[index+1]==='"'){record+=text[++index];continue}quoted=!quoted;continue}if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[index+1]==='\n')index++;if(record.trim())records.push(record);record="";continue}record+=char}
    if(record.trim())records.push(record);return records;
  }
  function importFile(file?: File, minerType?: MinerMode) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "").replace(/^\uFEFF/, "");
      const rows = csvRecords(text);
      if (!rows.length) {
        setToast("That file is empty");
        setImportReport("The selected file was empty.");
        return;
      }

      const first = rows[0];
      const delimiter = first.includes("\t") ? "\t" : first.includes(";") && !first.includes(",") ? ";" : first.includes("|") && !first.includes(",") ? "|" : ",";
      const firstCells=parseRow(first,delimiter);
      const normalizedHeader = firstCells.map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, ""));
      const hasHeader = normalizedHeader.some((value) => ["phone", "phonenumber", "prospect", "name", "fullname", "email", "type", "product", "disposition", "cost"].includes(value));
      const seenHeaders=new Map<string,number>();
      const displayHeaders=(hasHeader?firstCells:firstCells.map((_,index)=>`Column ${index+1}`)).map((value,index)=>{const base=value.trim()||`Column ${index+1}`;const seen=(seenHeaders.get(base)||0)+1;seenHeaders.set(base,seen);return seen===1?base:`${base} (${seen})`});
      const header=hasHeader?normalizedHeader:displayHeaders.map(value=>value.toLowerCase().replace(/[^a-z0-9]/g,""));
      const find = (...names: string[]) => header.findIndex((value) => names.includes(value));
      const get = (cells: string[], position: number) => (position >= 0 ? cells[position]?.trim() || "" : "");

      const firstNameIndex = find("firstname", "first");
      const lastNameIndex = find("lastname", "last", "surname");
      const nameIndex = find("prospect", "name", "fullname", "customername", "leadname", "contactname");
      const phoneIndex = find("phone", "phonenumber", "primaryphone", "telephone", "mobile", "cellphone");
      const emailIndex = find("email", "emailaddress");
      const typeIndex = find("type", "product", "leadtype", "category", "vertical", "insurancetype");
      const dispositionIndex = find("disposition", "status", "leadstatus", "outcome");
      const costIndex = find("cost", "leadcost", "price", "leadprice");
      const cityIndex = find("city", "location");
      const notesIndex = find("notes", "note", "comments");
      const sourceIndex = find("source", "leadsource", "provider", "vendor", "publisher");
      const addressIndex = find("address", "streetaddress", "address1");
      const stateIndex = find("state", "province");
      const zipIndex = find("zipcode", "zip", "postalcode");
      const territoryIndex = find("territory", "market");
      const brandIndex = find("brand", "agency", "company");
      const profileIndex = find("profilename", "profile", "campaign");
      const receivedIndex = find("received", "receivedat", "date", "createdat");
      const returnIndex = find("return", "returnstatus");
      const employeesIndex = find("numberofemployees", "employees", "employeecount");
      const searchProIndex = find("searchpro");
      const vendorIdIndex = find("vendorid", "leadid", "deliveryid", "externalid", "referenceid");
      const priorityIndex=find("priority","leadpriority","tier","temperature");
      const ownerIndex=find("owner","assignedto","assignee","agent","salesperson","representative");
      const estimatedValueIndex=find("estimatedvalue","dealvalue","opportunityvalue","pipelinevalue");
      const closedRevenueIndex=find("closedrevenue","revenue","wonrevenue","saleamount");
      const fileSource = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "CSV import";
      const detectedSource=minerType?`Pacifica Miner · ${minerType==="personal-auto"?"Personal Auto":minerType==="home"?"Home":"Commercial"}`:header.includes("searchpro")&&header.includes("profilename")&&header.includes("territory")?"SmartFinancial":fileSource;
      const importStartedAt=new Date().toISOString();
      let invalid = 0;
      let detectedLife = 0;
      let detectedHomeAuto = 0;
      const parsed: Lead[] = [];

      rows.slice(hasHeader ? 1 : 0).forEach((row, rowIndex) => {
        const cells = parseRow(row, delimiter);
        const phone = (hasHeader ? get(cells, phoneIndex) : cells[1] || cells[0] || "").trim();
        const email=(hasHeader ? get(cells, emailIndex) : cells[3]) || "";
        const vendorId=get(cells,vendorIdIndex);
        if (normalizedCsvPhone(phone).length < 7&&!normalizedCsvEmail(email).includes("@")&&!vendorId) {
          invalid++;
          return;
        }
        const product = hasHeader ? get(cells, typeIndex) : "Service inquiry";
        const importedPriority=get(cells,priorityIndex).toLowerCase();
        const line: LeadLine = workspaceProfile.mode==="insurance"?(minerType?"home-auto":leadLineForProduct(product,activeLine)):/^(a|high|hot|priority)/.test(importedPriority)?"life":activeLine;
        if (line === "life") detectedLife++;
        else detectedHomeAuto++;
        const disposition = hasHeader ? get(cells, dispositionIndex) : "";
        const mapped = crmFieldsForDisposition(disposition);
        const combinedName = hasHeader ? [get(cells, firstNameIndex), get(cells, lastNameIndex)].filter(Boolean).join(" ") : "";
        const received=get(cells,receivedIndex);
        const importedFields=Object.fromEntries(displayHeaders.map((field,index)=>[field,cells[index]?.trim()||""]));

        parsed.push({
          id: Date.now() + rowIndex,
          vendorId,
          name: (hasHeader ? get(cells, nameIndex) : cells[0]) || combinedName || "Lead " + (rowIndex + 1),
          phone,
          city: (hasHeader ? get(cells, cityIndex) : cells[2]) || "Imported",
          email,
          status: mapped.stage === "Closed" ? "Closed" : "Ready",
          stage: mapped.stage,
          outcome: mapped.outcome,
          notes: (hasHeader ? get(cells, notesIndex) : "") || "",
          followUp: "",
          doNotCall: false,
          lastContact: "Never",
          line,
          source: (hasHeader ? get(cells, sourceIndex) : "") || detectedSource,
          leadCost: Number((hasHeader ? get(cells, costIndex) : "0").replace(/[^0-9.-]/g, "")) || 0,
          product: product || (minerType==="personal-auto"?"Auto insurance prospect":minerType==="home"?"Home insurance prospect":minerType==="commercial"?"Commercial insurance prospect":"Service inquiry"),
          sourceDisposition: disposition,
          importedAt: received?validReceivedDate(received):new Date().toISOString(),
          address: get(cells, addressIndex),
          state: get(cells, stateIndex),
          zip: get(cells, zipIndex),
          territory: get(cells, territoryIndex),
          brand: get(cells, brandIndex),
          profileName: get(cells, profileIndex),
          received,
          returnStatus: get(cells, returnIndex),
          employeeCount: get(cells, employeesIndex),
          searchPro: get(cells, searchProIndex),
          priorityOverride:/^(a|high|hot|priority)/.test(importedPriority)?"high":"auto",
          assignedTo:get(cells,ownerIndex),
          estimatedValue:Math.max(0,Number(get(cells,estimatedValueIndex).replace(/[^0-9.-]/g,""))||0),
          closedRevenue:Math.max(0,Number(get(cells,closedRevenueIndex).replace(/[^0-9.-]/g,""))||0),
          csvFileName:file.name,
          csvUpdatedAt:importStartedAt,
          importedFields,
          automationEnabled:!minerType,
        });
      });

      const dominantLine: LeadLine = detectedHomeAuto > detectedLife ? "home-auto" : "life";
      if (detectedLife + detectedHomeAuto && ((activeLine === "life" && detectedLife === 0) || (activeLine === "home-auto" && detectedHomeAuto === 0))) {
        activeLineRef.current = dominantLine;
        setActiveLine(dominantLine);
        setIndex(0);
      }
      setView(minerType?"miner":"leads");

      if (parsed.length) {
        const merged=mergeCsvLeads(leadsRef.current,parsed,importStartedAt);
        const cleaned=deduplicateCsvLeads(merged.leads,importStartedAt);
        if(merged.added||merged.updated||cleaned.removed)setLeads(cleaned.leads);
        setIndex(0);
        const duplicateCount=merged.matched+cleaned.removed;
        const summary = `${merged.added.toLocaleString()} new · ${merged.updated.toLocaleString()} enriched · ${merged.unchanged.toLocaleString()} already current${duplicateCount?` · ${duplicateCount.toLocaleString()} duplicates safely merged`:""}${invalid?` · ${invalid} invalid rows`:""}`;
        setImportReport(summary);
        setToast(summary);
      } else {
        const summary = "No usable phone numbers, emails, or provider IDs found" + (invalid ? " · " + invalid + " rows rejected" : "");
        setImportReport(summary);
        setToast(summary);
      }
    };
    reader.readAsText(file);
  }
  // The desktop view sends decisions back to the same CRM state and save path.
  useEffect(()=>{
    const desktop=(window as unknown as {pacificaDesktop?:{isDesktop?:boolean;supportsDesktopWrapUp?:boolean;syncCallState?:(state:Record<string,unknown>)=>Promise<boolean>;setCallState?:(state:Record<string,unknown>)=>void}}).pacificaDesktop;
    if(!desktop?.isDesktop||!desktop.setCallState)return;
    if(!desktop.supportsDesktopWrapUp){desktop.setCallState({active:false});return;}
    const desktopIncoming=incomingNumber?findDialedContact(leads,incomingNumber):undefined;
    const wrapUp=desktop.supportsDesktopWrapUp&&postCallLead?{
      id:`${callAttemptRef.current}:${postCallLead.id}`,name:postCallLead.name,number:postCallLead.phone,
      category:postCallLead.product||queueLabel(postCallLead.line,workspaceProfile.mode),draft:postCallDraft,
      outcomes:desktopOutcomes,resume:resumeAfterWrap,saving:sourceSyncing,doNotCall:postCallLead.doNotCall,
      wasClosed:postCallLead.stage==="Closed",error:desktopWrapError,
    }:null;
    const state={active:dialing,name:manualCall?"Manual call":lead.name,number:manualCall?dialNumber:lead.phone,
      category:manualCall?"Manual call":lead.product||queueLabel(lead.line,workspaceProfile.mode),connected,muted,elapsed:formatCallDuration(callConnectedAt),
      queueRunning:autoDialing,statusText:phoneStatus,theme:resolvedAppearance,wrapUp,
      incoming:incomingCall?{name:desktopIncoming?.name||"Unknown caller",number:incomingNumber,category:desktopIncoming?.product||"Incoming Pacifica call",busy:dialing}:null};
    let canceled=false;
    const sync=()=>{
      const update=ava.active?{...state,active:true,mode:"ava",name:ava.name,number:ava.number,category:"Ava · Auto + Home",connected:Boolean(ava.connectedAt),muted:ava.muted,human:ava.human,paused:ava.paused,queueRunning:true,statusText:ava.status,elapsed:formatCallDuration(ava.connectedAt),wrapUp:null}:{...state,elapsed:formatCallDuration(callConnectedAt)};
      if(desktop.syncCallState)void desktop.syncCallState(update).catch(()=>{if(!canceled)setToast("Desktop call controls could not connect. Restart Pacifica after saving your call result.")});
      else desktop.setCallState?.(update);
    };
    sync();
    const timer=connected||ava.connectedAt?window.setInterval(sync,1000):undefined;
    return()=>{canceled=true;window.clearInterval(timer);};
  },[phoneStatus,dialing,manualCall,lead.name,lead.phone,lead.product,lead.line,dialNumber,connected,muted,callConnectedAt,autoDialing,workspaceProfile.mode,resolvedAppearance,postCallLead,postCallDraft,resumeAfterWrap,sourceSyncing,desktopWrapError,incomingCall,incomingNumber,leads,ava]);
  useEffect(()=>{
    const desktop=(window as unknown as {pacificaDesktop?:{onWrapAction?:(callback:(action:unknown)=>void)=>(()=>void)}}).pacificaDesktop;
    if(!desktop?.onWrapAction)return;
    return desktop.onWrapAction(action=>{
      if(!postCallLead)return;
      const result=desktopWrapDraft(action,`${callAttemptRef.current}:${postCallLead.id}`,postCallDraft,postCallLead.source,postCallLead.stage==="Closed");
      if(!result){setDesktopWrapError("Choose a valid result and try again.");return}
      setDesktopWrapError("");
      if(result.kind==="pause"){setPostCallDraft(result.draft);resumeAfterWrapRef.current=false;setResumeAfterWrap(false);stopAutoDial("Queue paused");return}
      if(result.kind==="again"&&(postCallLead.doNotCall||!postCallLead.phone)){setDesktopWrapError("This contact cannot be called again.");return}
      void savePostCall(result.kind==="again"?"again":"queue",result.draft);
    });
  });
  useEffect(()=>{
    const desktop=(window as unknown as {pacificaDesktop?:{isDesktop?:boolean;onCallAction?:(callback:(action:string)=>void)=>(()=>void);showMainWindow?:()=>Promise<boolean>}}).pacificaDesktop;
    if(!desktop?.isDesktop||!desktop.onCallAction)return;
    return desktop.onCallAction(action=>{
      if(action==="answer-incoming"){avaControls.current?.stop();acceptIncoming();return}
      if(aiVoiceActive.current){
        if(action==="open"){openAva();void desktop.showMainWindow?.();return}
        if(action==="end"){avaControls.current?.stop();return}
        if(action==="mute"){avaControls.current?.mute();return}
        if(action==="pause"){avaControls.current?.pause();return}
        if(action==="takeover"){avaControls.current?.takeOver();return}
        if(action==="skip"){avaControls.current?.skip();return}
      }
      if(action==="decline-incoming"){rejectIncoming();return}
      if(action==="mute"){toggleMute();return}
      if(action==="end"){hangup();return}
      if(action==="pause"){pauseQueue();return}
      if(action==="open"){setView("dialer");void desktop.showMainWindow?.();return}
      if(action.startsWith("digit:")){const digit=action.slice(6);if(/^[0-9*#]$/.test(digit))pressKey(digit)}
    });
  });
  const handleDesktopMessage=useEffectEvent((message:DesktopMessage)=>{const contact=leads.find(item=>item.id===message.leadId);if(contact)openLeadMessage(contact,message.channel)});
  useEffect(()=>desktopNotifications()?.onMessageAction?.(message=>handleDesktopMessage(message)),[]);

  const [quoteReviewOpen,setQuoteReviewOpen]=useState(false);
  const {t}=useLanguage();
  const nav:[View,string,string][]=([["today","Today","spark"],["dialer","Dialer","dial"],["leads","Contacts","users"],["messages","Messages","chat"],["office","Calendar","calendar"],["miner","Miner","pickaxe"],["clients","Clients","shield"],["activity","Reports","chart"],["ai","Pacifica AI","robot"],["quotes","Industry Tools","shield"]] as [View,string,string][]).filter(([id])=>id==="miner"?isPlatformOwner&&enabledTools.miner:id==="quotes"?enabledTools.industryTools:true);
  const activeLead=allLeads.find(l=>l.id===selectedLead&&!l.deletedAt);
  const growthLead=leads.find(l=>l.id===growthLeadId);
  const incomingLead=findDialedContact(leads,incomingNumber);
  const deferredSearch=useDeferredValue(search);
  const sourceOptions=useMemo(()=>["All sources",...Array.from(new Set(lineLeads.map(item=>item.source)))],[lineLeads]);
  const ownerOptions=useMemo(()=>["All owners","Unassigned",...Array.from(new Set([...workspaceProfile.teamMembers,...lineLeads.map(item=>item.assignedTo||"")].filter(Boolean)))],[workspaceProfile.teamMembers,lineLeads]);
  const matchingLeads=useMemo(()=>view!=="leads"?[]:lineLeads.filter(l=>(stageFilter==="All stages"||l.stage===stageFilter)&&(sourceFilter==="All sources"||l.source===sourceFilter)&&(ownerFilter==="All owners"||(ownerFilter==="Unassigned"?!l.assignedTo:l.assignedTo===ownerFilter))&&contactMatches(l,deferredSearch)),[view,lineLeads,stageFilter,sourceFilter,ownerFilter,deferredSearch]);
  const filteredLeads=useMemo(()=>leadSort==="Next best"?rankLeads(matchingLeads,priorityNow):matchingLeads.toSorted((left,right)=>leadSort==="Newest"?leadCreatedAt(right)-leadCreatedAt(left):leadSort==="Follow-up due"?(Number.isFinite(dateValue(left.followUp))?dateValue(left.followUp):Number.POSITIVE_INFINITY)-(Number.isFinite(dateValue(right.followUp))?dateValue(right.followUp):Number.POSITIVE_INFINITY):leadSort==="Recently attempted"?(Number.isFinite(dateValue(right.lastAttemptAt))?dateValue(right.lastAttemptAt):0)-(Number.isFinite(dateValue(left.lastAttemptAt))?dateValue(left.lastAttemptAt):0):left.name.localeCompare(right.name)),[matchingLeads,leadSort,priorityNow]);
  const contactPageKey=JSON.stringify([activeLine,stageFilter,sourceFilter,ownerFilter,leadSort,deferredSearch]);
  const contactPageIndex=Math.min(contactPage.key===contactPageKey?contactPage.page:0,Math.max(0,Math.ceil(filteredLeads.length/100)-1));
  const contactOffset=contactPageIndex*100;
  const contactRows=useMemo(()=>filteredLeads.slice(contactOffset,contactOffset+100).map(l=>{const priority=leadPriority(l,priorityNow);const nextAction=l.followUp||l.automationNextAt;return <button className="table-row" key={l.id} onClick={()=>setSelectedLead(l.id)}><span><i>{l.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</i><span><span className="contact-name-line"><b>{l.name}</b><em className={`priority-pill ${priority.level.toLowerCase()}`}>{priority.level}</em></span><small>{l.phone||"No phone"} · {l.email||"No email"}</small><small className="priority-summary">{priority.reason}</small></span></span><span className="lead-source"><b>{l.source}</b><small>{l.assignedTo||"Unassigned"}{l.leadCost?` · $${l.leadCost.toFixed(2)}`:""}</small></span><span><em className={`stage ${l.stage.toLowerCase().replace(" ","-")}`}>{l.stage}</em></span><span>{l.outcome}<small>{l.attempts||0} attempt{l.attempts===1?"":"s"}</small></span><span>{nextAction?new Date(nextAction).toLocaleString():"—"}{l.doNotCall&&<strong className="dnc">DNC</strong>}</span></button>}),[filteredLeads,priorityNow,contactOffset]);
  const dueFollowUps=useMemo(()=>scheduledFollowUps(lineLeads,priorityNow),[lineLeads,priorityNow]);
  const dueLeadCount=dueFollowUps.length;
  function updateLead(id:number, patch:Partial<Lead>){if(patch.notes!==undefined&&!patch.notesUpdatedAt)patch={...patch,notesUpdatedAt:new Date().toISOString()};if(!patch.workflowUpdatedAt&&["stage","status","outcome","automationEnabled","sourceDisposition"].some(key=>key in patch))patch={...patch,workflowUpdatedAt:new Date().toISOString()};if(patch.followUp!==undefined)patch={...patch,followUpUtc:patch.followUp&&Number.isFinite(Date.parse(patch.followUp))?new Date(patch.followUp).toISOString():""};setLeads(list=>list.map(l=>l.id===id?{...l,...patch}:l))}
  function moveLeadToQueue(lead:Lead,line:LeadLine){
    if(lead.line===line)return;
    updateLead(lead.id,{line,queueOverride:true});
    if(loadedLeadId===lead.id){activeLineRef.current=line;setActiveLine(line)}
    setToast(`${lead.name} moved to ${queueLabel(line,workspaceProfile.mode)}`);
  }
  const [scanReview,setScanReview]=useState<string[]>([]);
  function openNewLead(){setScanReview([]);setNewLead(emptyNewLead);setShowNewLead(true)}
  function createLead(){
    const phone=newLead.phone.trim();const email=newLead.email.trim();const name=newLead.name.trim();if(!name){setToast("Add the contact name before saving");return}
    const createdAt=new Date().toISOString();const isPolicy=/declaration|policy/i.test(newLead.documentType)&&Boolean(newLead.policyNumber||newLead.policyExpirationDate);
    const match=leadsRef.current.find(item=>(normalizedCsvPhone(phone)&&normalizedCsvPhone(item.phone)===normalizedCsvPhone(phone))||(email&&normalizedCsvEmail(item.email)===normalizedCsvEmail(email))||(newLead.policyNumber&&item.policyNumber===newLead.policyNumber));
    const policyPatch:Partial<Lead>={...(match?.deletedAt?{deletedAt:"",deletionUpdatedAt:createdAt}:{}),name,phone:phone||match?.phone||"",email:email||match?.email||"",city:newLead.city.trim()||match?.city||"No city",address:newLead.address.trim()||match?.address||"",state:newLead.state.trim()||match?.state||"",zip:newLead.zip.trim()||match?.zip||"",product:newLead.product.trim()||match?.product||"Service inquiry",dateOfBirth:newLead.dateOfBirth||match?.dateOfBirth||"",licenseNumber:newLead.licenseNumber||match?.licenseNumber||"",licenseState:newLead.licenseState||match?.licenseState||"",licenseExpiration:newLead.licenseExpiration||match?.licenseExpiration||"",policyNumber:newLead.policyNumber||match?.policyNumber||"",policyEffectiveDate:newLead.policyEffectiveDate||match?.policyEffectiveDate||"",policyExpirationDate:newLead.policyExpirationDate||match?.policyExpirationDate||"",renewalDate:newLead.policyExpirationDate||match?.renewalDate||"",policyPremium:policyMoney(newLead.policyPremium)??match?.policyPremium??0,policyTermMonths:Math.max(0,Number(newLead.policyTermMonths)||match?.policyTermMonths||0),vin:newLead.vin||match?.vin||"",vehicle:newLead.vehicle||match?.vehicle||"",importedFields:{...(match?.importedFields||{}),...newLead.documentFields},...(isPolicy?{clientStatus:"active",stage:"Closed",status:"Closed",outcome:"Sold / Won",closedAt:match?.closedAt||createdAt,automationEnabled:false,automationStatus:"complete",automationNextAt:""}:{})};
    const id=match?.id||Date.now();
    if(match)setLeads(old=>old.map(item=>item.id===match.id?{...item,...policyPatch}:item));
    else{const item:Lead={id,name,phone,email,city:newLead.city.trim()||"No city",address:newLead.address.trim(),state:newLead.state.trim(),zip:newLead.zip.trim(),status:isPolicy?"Closed":"Ready",stage:isPolicy?"Closed":"New lead",outcome:isPolicy?"Sold / Won":"Not contacted",notes:"",followUp:"",doNotCall:false,lastContact:"Never",line:activeLine,source:newLead.source.trim()||"Manual",leadCost:Number(newLead.leadCost)||0,product:newLead.product.trim()||"Service inquiry",sourceDisposition:isPolicy?"Sold":"New",importedAt:createdAt,received:createdAt,smsConsent:false,smsOptOut:false,emailConsent:false,emailOptOut:false,communications:[],automationEnabled:!isPolicy,...policyPatch};setLeads(old=>[item,...old])}
    setNewLead(emptyNewLead);setShowNewLead(false);setSelectedLead(isPolicy?null:id);setView(isPolicy?"clients":"leads");setToast(match?`${name} updated from document`:isPolicy?`${name} added to active clients`:`${name} added${phone?"":" · add a phone before dialing"}`);
  }
  async function scanDocument(input?:File|File[]){
    const files=(Array.isArray(input)?input:input?[input]:[]).slice(0,2),file=files[0];
    if(!file)return;
    if(files.some(file=>file.size>20*1024*1024||!isDocumentFile(file))){setToast("Choose up to two clear document photos under 20 MB each.");return}
    if(files.length>1&&files.some(file=>file.type==="application/pdf")){setToast("Upload one PDF or the front and back photos together.");return}
if(!isDocumentFile(file)){setToast("Use a photo or PDF document");return}if(file.size>20*1024*1024){setToast("Use a document smaller than 20 MB");return}
    setScanBusy(true);setToast("Reading document…");
    try{
      let localResult:Awaited<ReturnType<typeof scanDocumentLocally>>|null=null;let aiExtraction:DocumentLeadExtraction|null=null;let localError="";let aiError="";
      const [localAttempt,aiAttempt]=await Promise.allSettled([
        (async()=>{const reads=await Promise.allSettled(files.map(file=>scanDocumentLocally(file,label=>setToast(label))));const usable=reads.flatMap(read=>read.status==="fulfilled"?[read.value]:[]).sort((a,b)=>Number(b.method==="PDF417 barcode")-Number(a.method==="PDF417 barcode"));if(!usable.length)throw Error("Local scan could not read the document");return {...usable[0],extraction:usable.slice(1).reduce((value,item)=>combineDocumentReads(value,item.extraction),usable[0].extraction)}})(),
        (async()=>{setToast("AI Enhanced Scan · reading document…");return scanDocumentWithAi(files)})(),
      ]);
      if(localAttempt.status==="fulfilled")localResult=localAttempt.value;else localError=localAttempt.reason instanceof Error?localAttempt.reason.message:"Local scan failed";
      if(aiAttempt.status==="fulfilled")aiExtraction=aiAttempt.value;else aiError=aiAttempt.reason instanceof Error?aiAttempt.reason.message:"AI scan failed";
      if(!localResult&&!aiExtraction)throw new Error(aiError||localError||"The document could not be read. Try a brighter, straighter photo.");
      let extraction:DocumentLeadExtraction;let method:string;
      if(localResult&&aiExtraction){
        extraction=mergeDocumentExtractions(localResult.extraction,aiExtraction,localResult.method);
        const localScore=documentLeadCompletenessScore(localResult.extraction);const aiScore=documentLeadCompletenessScore(aiExtraction);
        method=localResult.method==="PDF417 barcode"?"AI + PDF417 barcode":`AI + ${localResult.method}`;
        if(aiScore>localScore&&localResult.method!=="PDF417 barcode")method="AI Enhanced Scan + local verification";
      }else if(aiExtraction){extraction=aiExtraction;method="AI Enhanced Scan"}
      else{extraction=localResult!.extraction;method=localResult!.method}
      setNewLead({...emptyNewLead,name:documentLeadName(extraction),phone:extraction.phone,email:extraction.email,city:extraction.city,address:extraction.address,state:extraction.state,zip:extraction.zip,product:extraction.product||(/insurance|policy/i.test(extraction.documentType)?"Insurance quote":"Service inquiry"),source:/declaration|policy/i.test(extraction.documentType)?"Policy declaration":"Document scan",dateOfBirth:extraction.dateOfBirth,licenseNumber:extraction.licenseNumber,licenseState:extraction.licenseState,licenseExpiration:extraction.licenseExpiration,policyNumber:extraction.policyNumber,policyEffectiveDate:extraction.policyEffectiveDate,policyExpirationDate:extraction.policyExpirationDate,policyPremium:extraction.policyPremium,policyTermMonths:extraction.policyTermMonths,vin:extraction.vin,vehicle:[extraction.vehicleYear,extraction.vehicleMake,extraction.vehicleModel].filter(Boolean).join(" "),documentType:extraction.documentType,documentFields:documentLeadImportedFields(extraction)});setScanReview([...(aiError?[`AI scan unavailable: ${aiError}`]:[]),...(documentMissingFields(extraction).length?[`Please verify or enter: ${documentMissingFields(extraction).join(", ")}. Add a clear photo of the other side if needed.`]:[])]);setShowNewLead(true);setToast(`${method} read${!aiExtraction&&aiError?" · AI unavailable; local extraction used":""} · verify every field`);
    }catch(error){setToast(error instanceof Error?error.message:"Document scan failed")}finally{setScanBusy(false)}
  }
  function handleDroppedFile(file?:File){if(!file)return;if(isDocumentFile(file)){void scanDocument(file);return}if(/\.(csv|tsv|txt)$/i.test(file.name)||["text/csv","text/tab-separated-values","text/plain"].includes(file.type)){importFile(file);return}setToast("Drop a license photo, declaration PDF, CSV, TSV, or TXT file")}
  function openDocumentPicker(){const picker=document.createElement("input");picker.type="file";picker.accept="image/*,application/pdf,.pdf";picker.multiple=true;picker.onchange=()=>void scanDocument(Array.from(picker.files||[]));picker.click()}
  function hasDraggedFiles(event:React.DragEvent){return Array.from(event.dataTransfer.types).includes("Files")}
  function ownsFileDrop(event:React.DragEvent){return event.target instanceof Element&&Boolean(event.target.closest(".message-thread,.ai-workspace"))}
  function onFileDragEnter(event:React.DragEvent<HTMLElement>){if(!hasDraggedFiles(event)||view==="messages"||ownsFileDrop(event))return;event.preventDefault();fileDragDepthRef.current+=1;setFileDragActive(true)}
  function onFileDragOver(event:React.DragEvent<HTMLElement>){if(!hasDraggedFiles(event)||ownsFileDrop(event))return;event.preventDefault();event.dataTransfer.dropEffect="copy"}
  function onFileDragLeave(event:React.DragEvent<HTMLElement>){if(!hasDraggedFiles(event)||ownsFileDrop(event))return;event.preventDefault();fileDragDepthRef.current=Math.max(0,fileDragDepthRef.current-1);if(!fileDragDepthRef.current)setFileDragActive(false)}
  function onFileDrop(event:React.DragEvent<HTMLElement>){if(!hasDraggedFiles(event))return;event.preventDefault();fileDragDepthRef.current=0;setFileDragActive(false);if(view==="messages"||ownsFileDrop(event))return;handleDroppedFile(event.dataTransfer.files?.[0])}
  function addManualCallContact(){setNewLead({...emptyNewLead,phone:dialNumber,source:"Manual phone call"});setShowNewLead(true)}
  // PACIFICA_AI_IMAGE_TO_CONTACT_V1
  function addFolderContacts(candidates:FolderContact[]){
    const now=new Date().toISOString(),line=activeLine;
    setLeads(current=>{
      const enriched=enrichFolderContacts(current,candidates);
      const fresh=newFolderContacts(enriched,candidates);if(!fresh.length)return enriched;
      let nextId=current.reduce((max,item)=>Math.max(max,item.id),Date.now());
      const additions:Lead[]=fresh.map(item=>({id:++nextId,name:item.name,phone:item.phone,email:item.email,address:item.address,city:item.city,state:item.state,zip:item.zip,product:item.product,line,queueOverride:true,source:"Local folder",sourceDisposition:"New",status:"Ready",stage:"New lead",outcome:"Not contacted",notes:"",followUp:"",doNotCall:false,lastContact:"Never",leadCost:0,importedAt:now,received:now,smsConsent:false,emailConsent:false,communications:[],automationEnabled:false,importedFields:{...(item.importedFields||{}),"Source file":item.sourceFile,"Page / row":item.sourcePage,"All sources":(item.sources||[{file:item.sourceFile,page:item.sourcePage}]).map(source=>source.file+" · "+source.page).join("; ")},csvFileName:item.sourceFile}));
      return [...enriched,...additions];
    });
  }
  function createAiLead(input:AiCreateLead){
    if(!contactIntakeCanSave(input)){setToast("Add contact details or a name with readable ID/address details.");return;}
    const documentPatch=contactIntakePatch(input);
    const phone=input.phone.trim();const email=input.email.trim();const name=input.name.trim()||phone||email||"AI image lead";const now=new Date().toISOString();const line:LeadLine=input.line==="home-auto"?"home-auto":"life";
    const fields=Object.fromEntries((input.otherFields||[]).filter(item=>item.label&&item.value).map(item=>[item.label,item.value]));
    const existing=leadsRef.current.find(item=>(normalizedCsvPhone(phone)&&normalizedCsvPhone(item.phone)===normalizedCsvPhone(phone))||(email&&normalizedCsvEmail(item.email)===normalizedCsvEmail(email)));
    if(existing){
      const notes=[existing.notes,input.notes].filter(Boolean).filter((value,index,list)=>list.indexOf(value)===index).join("\n");
      const patch:Partial<Lead>={...documentPatch,
        ...(input.name.trim()?{name:input.name.trim()}:{}),...(phone?{phone}:{}),...(email?{email}:{}),...(input.city.trim()?{city:input.city.trim()}:{}),...(input.state.trim()?{state:input.state.trim()}:{}),
        ...(input.product.trim()?{product:input.product.trim()}:{}),line,queueOverride:true,source:input.source.trim()||existing.source,notes,importedFields:{...(existing.importedFields||{}),...fields},
        ...(existing.deletedAt?{deletedAt:"",deletionUpdatedAt:now}:{}),
      };
      setLeads(list=>list.map(item=>item.id===existing.id?{...item,...patch}:item));setSelectedLead(existing.id);activeLineRef.current=line;setActiveLine(line);setIndex(0);setView("leads");setToast(`${existing.name} enriched from Pacifica AI image · duplicate avoided`);return;
    }
    const item:Lead={...documentPatch,id:Date.now(),name,phone,email,city:input.city.trim()||"Imported",state:input.state.trim(),status:"Ready",stage:"New lead",outcome:"Not contacted",notes:input.notes.trim(),followUp:"",doNotCall:false,lastContact:"Never",line,queueOverride:true,source:input.source.trim()||"Pacifica AI image",leadCost:0,product:input.product.trim()||"Service inquiry",sourceDisposition:"New",importedAt:now,received:now,smsConsent:false,smsOptOut:false,emailConsent:false,emailOptOut:false,communications:[],automationEnabled:false,importedFields:fields};
    setLeads(list=>[item,...list]);setSelectedLead(item.id);activeLineRef.current=line;setActiveLine(line);setIndex(0);setView("leads");setToast(`${name} added to ${queueLabel(line,workspaceProfile.mode)} from Pacifica AI`);
  }
  function applyAiAction(action:AiAction){
    const current=leads.find(item=>item.id===action.leadId);if(!current)return;
    const patch:Partial<Lead>={};
    if(action.patch.stage)patch.stage=action.patch.stage;
    if(action.patch.outcome)patch.outcome=action.patch.outcome;
    if(action.patch.followUp)patch.followUp=action.patch.followUp;
    if(action.patch.notesToAppend)patch.notes=[current.notes,`AI suggestion: ${action.patch.notesToAppend}`].filter(Boolean).join("\n");
    updateLead(action.leadId,patch);setToast(`Updated ${current.name}`);
  }
  function switchLine(line:LeadLine){
    if(dialing||postCallLeadId){if(postCallLeadId)setToast("Save the connected call result before switching queues");return}
    const selected=selectedLead?leadsRef.current.find(item=>item.id===selectedLead):undefined;
    if(selected){loadLeadInDialer(selected);return}
    autoDialRef.current=false;setAutoDialing(false);setLoadedLeadId(null);activeLineRef.current=line;setActiveLine(line);setIndex(0);setSearch("");setStageFilter("All stages");setSourceFilter("All sources");setOwnerFilter("All owners");
  }
  async function subscribe(plan:"solo"|"team"|"agency"){
    setCheckoutPlan(plan);
    try{
      const response=await fetch("/api/stripe/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.url)throw new Error(data.error||"Checkout could not start");
      window.location.assign(String(data.url));
    }catch(error){setToast(error instanceof Error?error.message:"Checkout could not start");setCheckoutPlan("")}
  }
  async function manageMembership(){
    try{
      const response=await fetch("/api/stripe/portal",{method:"POST"});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.url)throw new Error(data.error||"Billing portal could not open");
      window.location.assign(String(data.url));
    }catch(error){setToast(error instanceof Error?error.message:"Billing portal could not open")}
  }
  function downloadCalendar(leadItem:Lead){
    const content=calendarIcs(leadItem);if(!content){setToast("Choose a follow-up date first");return}
    const url=URL.createObjectURL(new Blob([content],{type:"text/calendar;charset=utf-8"}));const anchor=document.createElement("a");anchor.href=url;anchor.download=`${leadItem.name.replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"")||"pacifica"}-follow-up.ics`;anchor.click();URL.revokeObjectURL(url);setToast("Calendar event downloaded");
  }
  function openLeadMessage(leadItem:Lead,channel:"sms"|"email"){
    if(channel==="sms"&&!leadItem.phone){setToast("Add a phone number first");return}
    if(channel==="email"&&!leadItem.email){setToast("Add an email address first");return}
    switchLine(leadItem.line);setMessageTarget({leadId:leadItem.id,channel});setSelectedLead(null);setView("messages");
  }

  return <main className={`app-shell${view==="dialer"?" is-dialer":""}${sidebarCollapsed?" sidebar-collapsed":""}`} onDragEnter={onFileDragEnter} onDragOver={onFileDragOver} onDragLeave={onFileDragLeave} onDrop={onFileDrop}>
    <WorkspaceChromeMetrics/>
    <MobileNavigation items={[...nav,...(isOwner?[["settings","Settings","gear"] as [View,string,string]]:[])].map(([id,label,icon])=>({id,label:t(label),icon:<Icon name={icon}/>}))} active={view} onNavigate={id=>openView(id as View)} unread={messageUnreadCount} syncStatus={workspaceSyncStatus}/>
    {!workspaceHydrated&&<WorkspaceLoadGate error={workspaceLoadError} onRetry={()=>setWorkspaceLoadAttempt(value=>value+1)}/>}
    {workspaceHydrated&&isOwner&&!workspaceProfile.onboardingCompleted&&<BusinessOnboarding profile={workspaceProfile} onComplete={setWorkspaceProfile}/>}
    {fileDragActive&&<div className="file-drop-overlay" role="status" aria-live="polite"><div><Icon name="upload"/><span>DROP TO IMPORT</span><b>License, policy, or lead file</b><small>Images create a reviewable lead · CSV, TSV, and TXT merge into Contacts</small></div></div>}
    {view==="dialer"&&<DialerBackdrop appearance={resolvedAppearance} lightUrl={workspaceProfile.dialerLightBackdropUrl} darkUrl={workspaceProfile.dialerDarkBackdropUrl} motion={workspaceProfile.dialerBackdropMotion}/>}
    <aside className="sidebar">

      <button type="button" className="logo sidebar-logo-toggle" onClick={toggleSidebar} aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed?"Expand sidebar":"Collapse sidebar"} title={sidebarCollapsed?"Expand sidebar":"Collapse sidebar"}><span className="brand-mark"><Image src="/pacifica-mark.png" width={32} height={32} alt="" priority/></span><div><b>PACIFICA</b></div></button>
      <nav>{nav.map(([id,rawLabel,icon])=>{const label=t(rawLabel);return <button key={id} className={view===id?"active":""} aria-label={id==="messages"&&messageUnreadCount?`${label}, ${messageUnreadCount} unread`:label} title={label} aria-current={view===id?"page":undefined} onMouseEnter={()=>preloadView(id)} onFocus={()=>preloadView(id)} onClick={()=>openView(id)}><Icon name={icon}/><span>{label}</span>{id==="leads"&&<em>{leads.length}</em>}{id==="messages"&&messageUnreadCount>0&&<em className="message-unread">{Math.min(99,messageUnreadCount)}</em>}</button>})}</nav>{!sidebarCollapsed&&<LanguageSelect/>}
      <div className="sidebar-install"><PwaInstallButton/></div>
      <div className="sidebar-foot"><div className="agent"><span>{clerkEnabled?<ClerkTopAuth avatarOnly/>:currentUserName.split(" ").map(part=>part[0]).slice(0,2).join("")||"P"}</span><div><b>{currentUserName}</b><small title={currentUserEmail}><i/> {userRole}</small></div></div>{isOwner&&<button aria-label="Owner settings" title="Settings" onClick={()=>setView("settings")}><Icon name="gear"/></button>}</div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div className="caller-id"><small>CALLER ID</small><b>{callerId}</b></div><div className="lead-line-switch" role="group" aria-label="Lead queue"><button className={activeLine==="life"?"active":""} aria-pressed={activeLine==="life"} disabled={dialing} onClick={()=>switchLine("life")}>{queueLabel("life",workspaceProfile.mode)}</button><button className={activeLine==="home-auto"?"active":""} aria-pressed={activeLine==="home-auto"} disabled={dialing} onClick={()=>switchLine("home-auto")}>{queueLabel("home-auto",workspaceProfile.mode)}</button></div><div className="top-actions"><ReleaseUpdateNotice busy={dialing||Boolean(incomingCall)||Boolean(postCallLeadId)||showNewLead||Boolean(selectedLead)||!/saved|synced/i.test(workspaceSyncStatus)}/>{workspaceHydrated&&workspaceProfile.onboardingCompleted&&<WorkspaceTour workspaceId={workspaceId} canManageAppearance={isOwner} onNavigate={id=>{if(id==="settings")setSettingsSection("workspace");openView(id as View)}}/>}<button className={`inbound-availability ${phoneAvailable?"available":""}`} disabled={!phoneReady||dialing} aria-label={phoneAvailable?"Available for incoming calls":"Go available for incoming calls"} title={!phoneReady?"Assign this workspace a Twilio number first":phoneAvailable?"Available for incoming calls":"Go available for incoming calls"} onClick={()=>void togglePhoneAvailability()}><i/>{phoneAvailable?"Available":"Go available"}</button><span className="workspace-sync" title="Leads, calls, and settings save automatically"><i/>{workspaceSyncStatus}</span><span className="connection" title={provider}><Icon name="wifi"/><span>{provider}</span></span><button className={`notification ${dueLeadCount?"has-alerts":""}`} aria-label={`${dueLeadCount} follow-ups due`} title={`${dueLeadCount} follow-ups due`} onClick={()=>setView("today")}><Icon name="bell"/>{dueLeadCount>0&&<em>{Math.min(99,dueLeadCount)}</em>}</button>{clerkEnabled&&<ClerkTopAuth/>}<input ref={scanInputRef} hidden type="file" multiple accept="image/*,application/pdf,.pdf" onChange={event=>{const files=Array.from(event.currentTarget.files||[]);event.currentTarget.value="";void scanDocument(files)}}/><input ref={inputRef} hidden type="file" accept=".csv,.txt,.tsv" onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value="";importFile(file)}}/></div></header>

      {folderMounted&&<LocalFolderImport key={`folder:${workspaceId}`} workspaceId={workspaceId} instruction={folderInstruction} expanded={folderOpen} onOpen={()=>openFolder()} onClose={()=>setFolderOpen(false)} onAdd={addFolderContacts}/>}
      {isOwner&&workspaceProfile.mode==="insurance"&&<AiVoicePilot key={`ava:${workspaceId}`} expanded={avaOpen} onOpen={openAva} onClose={()=>setAvaOpen(false)} leads={allLeads} busy={dialing||autoDialing||Boolean(incomingCall)||Boolean(postCallLeadId)} onActive={active=>{aiVoiceActive.current=active}} onState={setAva} onControls={setAvaControls}/>}
      <FloatingCallWindow autopilot={ava.active?{...ava,onTakeOver:()=>avaControls.current?.takeOver(),onPause:()=>avaControls.current?.pause(),onSkip:()=>avaControls.current?.skip()}:undefined} onWindowChange={setFloatingWindowOpen} category={ava.active?"Ava · Auto + Home":dialerQueueLabel()} active={dialing||ava.active} result={postCallLead?{id:postCallLead.id,source:postCallLead.source,stage:postCallLead.stage,connected:postCallConnected,technicalOutcome:postCallTechnicalOutcome,name:postCallLead.name,number:postCallLead.phone,draft:postCallDraft,resume:resumeAfterWrap,saving:sourceSyncing,doNotCall:postCallLead.doNotCall,error:desktopWrapError,onSelect:choosePostCallOutcome,onChange:patch=>setPostCallDraft(draft=>({...draft,...patch})),onSave:()=>void savePostCall(),onAgain:()=>void savePostCall("again"),onPause:()=>{resumeAfterWrapRef.current=false;setResumeAfterWrap(false);stopAutoDial("Queue paused")}}:undefined} name={ava.active?ava.name:manualCall?"Manual call":lead.name} number={ava.active?ava.number:manualCall?dialNumber:lead.phone} connected={ava.active?Boolean(ava.connectedAt):connected} muted={ava.active?ava.muted:muted} connectedAt={ava.active?ava.connectedAt:callConnectedAt} sentDigits={dtmfDisplay} feedback={ava.active?ava.status:dtmfFeedback.message} onMute={ava.active?()=>avaControls.current?.mute():toggleMute} onEnd={ava.active?()=>avaControls.current?.stop():hangup} onDigits={pressKey}/>
      {dialing&&view!=="dialer"&&<ActiveCallBar product={manualCall?undefined:lead.product} name={manualCall?"Manual call":lead.name} number={manualCall?dialNumber:lead.phone} connected={connected} muted={muted} connectedAt={callConnectedAt} queueRunning={autoDialing} onOpen={()=>setView("dialer")} onKeypad={openCallKeypad} onMute={toggleMute} onEnd={hangup} onPause={pauseQueue}/>}

      {view==="today"&&<TodayWorkspace leads={allLeads.filter(lead=>!lead.deletedAt)} onOpen={id=>setSelectedLead(id)} onCall={callLeadById} onImport={()=>setView("leads")} onAdd={openNewLead}/>}

      {view==="dialer"&&<div className={`dialer-view conversation-workspace ${connected||postCallLeadId?"has-conversation":"is-waiting"} ${keypadOpen?"has-keypad":""}`}>
        <DialerLayout key={workspaceId} workspaceId={workspaceId} theme={resolvedAppearance} keypadOpen={keypadOpen} onKeypadChange={setKeypadOpen} protectedIds={dialing?["contact"]:postCallLeadId?["contact","details"]:[]} detailsAvailable={connected||Boolean(postCallLeadId)}>
        <header className="dialer-toolbar"><div><h1>Dialer</h1><DialerQueueLabel>{dialerQueueLabel()} · {callableLeads.length} remaining</DialerQueueLabel></div><div className="dialer-toolbar-actions">{isOwner&&workspaceProfile.mode==="insurance"&&<button type="button" aria-pressed={avaOpen||ava.active} disabled={dialing||autoDialing||Boolean(postCallLeadId)} onClick={openAva}>Ava Autopilot</button>}<DialerLayoutMenu/><label className="quiet-dialing-toggle" title="Controls ringback only. Voicemail, Google/call screening, IVRs and humans still play after answer."><input type="checkbox" checked={!workspaceProfile.quietDialing} onChange={event=>setWorkspaceProfile(profile=>({...profile,quietDialing:!event.target.checked}))}/>Ringback</label><button type="button" aria-expanded={keypadOpen} aria-controls="dialer-keypad" onClick={()=>setKeypadOpen(open=>!open)}><Icon name="keypad"/>Keypad</button></div></header>
        <div className="dialer-canvas">
        <DialerPanel id="contact">
        <section className={`hero-call focused-call ${connected?"connected":""} ${postCallLeadId?"wrap-ready":""}`}>
          <div className="call-grid">
            <div className="call-status-line"><span><i/>{postCallLeadId?"CALL COMPLETE":connected?"LIVE":dialing?"CONNECTING":"NEXT UP"}</span>{!postCallLeadId&&autoDialing&&<em>{leadQueueRemaining} REMAINING</em>}</div>

            <article
              className={`contact-card ${!manualCall&&lead.id?"contact-card-openable":""}`}
              role={!manualCall&&lead.id?"button":undefined}
              tabIndex={!manualCall&&lead.id?0:undefined}
              aria-label={!manualCall&&lead.id?`Open contact and quote details for ${lead.name}`:undefined}
              title={!manualCall&&lead.id?"Open contact and quote details":undefined}
              onClick={event=>{if(manualCall||!lead.id||(event.target as HTMLElement).closest("a,button"))return;setSelectedLead(lead.id)}}
              onKeyDown={event=>{if(manualCall||!lead.id||event.currentTarget!==event.target||!(event.key==="Enter"||event.key===" "))return;event.preventDefault();setSelectedLead(lead.id)}}
            ><div className="avatar">{manualCall?"#":lead.name.split(" ").map(n=>n[0]).slice(0,2).join("")}</div><div><h2>{manualCall?"Manual call":lead.name}</h2>{!manualCall&&Boolean(lead.id)&&<strong className="lead-product-label">{lead.product||"Lead type not supplied"}</strong>}{lead.lastCallResult&&<p role="status">Last call: {lead.lastCallResult}</p>}<a href={`tel:${manualCall?dialNumber:lead.phone}`}>{manualCall?dialNumber:lead.phone}</a><p>{manualCall?"One-off call":[lead.city,lead.state].filter(Boolean).join(", ")}</p>{!manualCall&&lead.id&&<small className="contact-card-open-hint">Details ↗</small>}</div>{connected&&<b className="timer"><CallTimer startedAt={callConnectedAt}/></b>}</article>
            {!postCallLeadId&&<>
            <div className={`call-controls ${!dialing?"idle":""}`}>
              {!dialing?<button className="start-call" onClick={start}><Icon name="play"/><span>Start calling</span></button>:<>
                {dialing&&<button className={`round ${muted?"muted":""}`} aria-pressed={muted} aria-label={muted?"Unmute":"Mute"} onClick={toggleMute}><Icon name="mute"/><small>{muted?"Unmute":"Mute"}</small></button>}
                <button className="end-call" onClick={hangup}><Icon name="end"/><span>{connected?"End call":"Cancel"}</span></button>
                {connected&&<button className={`round recording-control ${recordingSid?"recording":""}`} aria-label={recordingSid?"Stop recording":"Start consent-based recording"} title="Confirm disclosure and record this call" onClick={()=>void toggleRecording()} disabled={recordingBusy}><span className="record-dot"/><small>{recordingBusy?"Working…":recordingSid?"Stop rec":"Record"}</small></button>}
              </>}
            </div>{autoDialing&&<button className="inline-pause" type="button" onClick={pauseQueue}><Icon name="pause"/> Pause dialing</button>}</>}
          </div>
        </section>
        </DialerPanel>
        <DialerPanel id="mode"><div className="dialer-timeout-control"><span>Call mode</span><div role="group" aria-label="Call mode"><button type="button" disabled={dialing} className={workspaceProfile.dialerRingTimeoutSeconds===20?"active":""} aria-pressed={workspaceProfile.dialerRingTimeoutSeconds===20} onClick={()=>setWorkspaceProfile(profile=>({...profile,dialerRingTimeoutSeconds:20}))}>Fast skip</button><button type="button" disabled={dialing} className={workspaceProfile.dialerRingTimeoutSeconds===30?"active":""} aria-pressed={workspaceProfile.dialerRingTimeoutSeconds===30} onClick={()=>setWorkspaceProfile(profile=>({...profile,dialerRingTimeoutSeconds:30}))}>Listen through</button></div></div></DialerPanel>
        {(connected||Boolean(postCallLeadId))&&<DialerPanel id="details"><aside className="lead-file" aria-label="Current lead file">
          <header>
            <div><span>CONTACT</span><b>{manualCall?"Manual call":lead.name}</b></div>
            <em className={connected?"live":""} role={postCallLeadId?"button":undefined} tabIndex={postCallLeadId?0:undefined} title={postCallLeadId?"Open call wrap-up":undefined} onClick={()=>{if(postCallLeadId)document.getElementById("post-call-wrap")?.scrollIntoView({block:"nearest"})}} onKeyDown={event=>{if(postCallLeadId&&(event.key==="Enter"||event.key===" ")){event.preventDefault();document.getElementById("post-call-wrap")?.scrollIntoView({block:"nearest"})}}}>{postCallLeadId?"CONTACT":connected?"LIVE":callableLeads.length?`${leadQueuePosition+1} OF ${leadQueueTotal}`:"OPEN"}</em>
          </header>
          {lead.id&&!manualCall?<>
            <div className="lead-file-identity"><span className="file-avatar">{lead.name.split(" ").map(part=>part[0]).slice(0,2).join("")}</span><div><a href={`tel:${lead.phone}`}>{lead.phone}</a><a href={`mailto:${lead.email}`}>{lead.email||"No email provided"}</a><small>{[lead.address,lead.city,lead.state,lead.zip].filter(Boolean).join(", ")||lead.city||"No address provided"}</small></div></div>
            <section className="lead-detail-group"><span>LEAD DETAILS</span><div className="lead-file-grid">
              <label><span>Lead source</span><b>{lead.source||"Unknown"}</b></label>
              <label><span>Product</span><b>{lead.product||"—"}</b></label>
              {lead.address&&<label><span>Address</span><b>{[lead.address,lead.city,lead.state,lead.zip].filter(Boolean).join(", ")}</b></label>}
              {lead.dateOfBirth&&<label><span>Date of birth</span><b>{displayBirthDate(lead.dateOfBirth)}</b></label>}
              {lead.vin&&<label><span>VIN</span><b>{lead.vin}</b></label>}
              <label><span>Lead cost</span><b>{lead.leadCost?`$${lead.leadCost.toFixed(2)}`:"—"}</b></label>
              <label><span>Received</span><b>{lead.received||lead.importedAt||"—"}</b></label>
              <label><span>Original status</span><b>{lead.sourceDisposition||"New lead"}</b></label>
              <label><span>Last contact</span><b>{lead.lastContact||"Never"}</b></label>
              {hasLeadDetail(lead.brand)&&<label><span>Brand / agency</span><b>{lead.brand}</b></label>}
              {hasLeadDetail(lead.profileName)&&<label><span>Lead profile</span><b>{lead.profileName}</b></label>}
              {hasLeadDetail(lead.territory)&&<label><span>Territory</span><b>{lead.territory}</b></label>}
              {hasLeadDetail(lead.returnStatus)&&<label><span>Return status</span><b>{lead.returnStatus}</b></label>}
              {hasLeadDetail(lead.employeeCount)&&<label><span>Employees</span><b>{lead.employeeCount}</b></label>}
              {hasLeadDetail(lead.searchPro)&&<label><span>Search Pro</span><b>{lead.searchPro}</b></label>}
            </div></section>
            {importedLeadDetails.length>0&&<section className="lead-detail-group imported-lead-details"><span>QUOTE & IMPORTED DETAILS</span><div className="lead-file-grid">{importedLeadDetails.map(detail=><label key={detail.label}><span>{detail.label}</span><b title={detail.value}>{detail.value}</b></label>)}</div></section>}
            {lead.notes&&<section className="lead-existing-notes"><span>PREVIOUS NOTES</span><p>{lead.notes}</p></section>}
          </>:manualCall?<div className="manual-call-file">
            <div className={`manual-call-orbit ${connected?"connected":""}`}><Icon name="dial"/></div>
            <span>MANUAL OUTBOUND CALL</span>
            <b>{dialNumber||"Unknown number"}</b>
            <dl><div><dt>Caller ID</dt><dd>{callerId}</dd></div><div><dt>Connection</dt><dd>{connected?"Live over browser / Wi-Fi":"Secure browser phone"}</dd></div></dl>
            <button onClick={addManualCallContact}>+ Add this number to Contacts</button>
          </div>:<div className="lead-file-empty"><Icon name="users"/><b>No contact selected</b></div>}
        </aside></DialerPanel>}

        <DialerPanel id="calls"><article className="dialer-metric"><span>Calls today</span><b>{callLogs.filter(log=>new Date(log.startedAt).toDateString()===new Date().toDateString()).length}</b></article></DialerPanel>
        <DialerPanel id="conversations"><article className="dialer-metric"><span>Conversations</span><b>{callLogs.filter(log=>log.outcome==="Completed").length}</b></article></DialerPanel>
        <DialerPanel id="phone"><article className="dialer-metric"><span>Phone</span><b className="phone-stat" role="status">{phoneStatus}</b></article></DialerPanel>
        <DialerPanel id="queue">
          <article className="queue-card"><header><div><span>{activeDialerRun?"Calling run":"Up next"}</span><b>{callableLeads.length?`${Math.max(0,leadQueueRemaining-(dialing?1:0))} ${activeDialerRun?"REMAINING":"READY"}`:"QUEUE CLEAR"}</b></div><button onClick={()=>setView("leads")}>Contacts</button></header>{upNextLeads.map((l,i)=><div className="queue-row" key={l.id}><em>{String(i+1).padStart(2,"0")}</em><span className="mini-avatar">{l.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</span><div><b>{l.name}</b><small>{l.phone} · {l.city}</small></div></div>)}{!callableLeads.length&&<div className="empty-queue"><b>{lineLeads.length?"Queue clear":"No contacts"}</b>{!lineLeads.length&&<button onClick={()=>setView("leads")}>Open Contacts</button>}</div>}</article>
        </DialerPanel>
        <DialerPanel id="keypad"><DialerKeypad muted={muted} onMute={toggleMute} connected={connected} dialing={dialing} phoneReady={phoneReady} number={dialNumber} sentDigits={dtmfDisplay} feedback={dtmfFeedback} onNumberChange={setDialNumber} onDigits={pressKey} onCall={callTypedNumber}/></DialerPanel>
        </div>
        </DialerLayout>
      </div>}

      {view==="leads"&&<div className="page-view crm-view"><header className="module-bar"><span className="eyebrow">{queueLabel(activeLine,workspaceProfile.mode).toUpperCase()} CONTACTS</span><div className="module-actions"><button className="secondary" disabled={scanBusy} onClick={()=>scanInputRef.current?.click()}><Icon name="camera"/> {scanBusy?"Reading…":"Scan document"}</button><button className="secondary" onClick={()=>inputRef.current?.click()}><Icon name="upload"/> Import CSV</button><button className="secondary" disabled={!filteredLeads.length} title="Export contacts in this queue matching the current filters" onClick={()=>{downloadContactsCsv(contactsCsv(filteredLeads),`pacifica-${activeLine}-${new Date().toISOString().slice(0,10)}.csv`);setToast(`${filteredLeads.length} contacts exported`)}}><Icon name="download"/> Export CSV ({filteredLeads.length})</button><button className="primary" onClick={openNewLead}>+ Add lead</button></div></header>{isOwner&&<LeadCampaignPanel/>}{importReport&&<div className="import-hint" role="status"><span><i/>Import summary</span><p>{importReport}</p></div>}<div className="crm-summary five"><article><span>CONTACTS</span><b>{lineLeads.length}</b></article><article><span>LEAD SPEND</span><b>${lineLeads.reduce((total,leadItem)=>total+leadItem.leadCost,0).toFixed(0)}</b></article><article><span>FOLLOW-UPS</span><b>{dueLeadCount}</b></article><article><span>APPOINTMENTS</span><b>{lineLeads.filter(l=>l.stage==="Appointment").length}</b></article><article><span>CALL ATTEMPTS</span><b>{lineLeads.reduce((total,item)=>total+(item.attempts||0),0)}</b></article></div><div className="crm-tools"><div className="crm-search-shell"><span aria-hidden="true">⌕</span><input className="crm-search-input" value={search} onChange={e=>{setSearch(e.target.value);setContactPage({key:"",page:0})}} aria-label="Search contacts" placeholder="Search name, phone or email"/></div><div className="contact-filter-fields"><label><span>Source</span><select aria-label="Filter by source" value={sourceFilter} onChange={e=>{setSourceFilter(e.target.value);setContactPage({key:"",page:0})}}>{sourceOptions.map(source=><option key={source}>{source}</option>)}</select></label><label><span>Owner</span><select aria-label="Filter by owner" value={ownerFilter} onChange={e=>{setOwnerFilter(e.target.value);setContactPage({key:"",page:0})}}>{ownerOptions.map(owner=><option key={owner}>{owner}</option>)}</select></label><label><span>Stage</span><select aria-label="Filter by contact stage" value={stageFilter} onChange={e=>{setStageFilter(e.target.value);setContactPage({key:"",page:0})}}><option>All stages</option><option>New lead</option><option>Follow-up</option><option>Appointment</option><option>Quoted</option><option>Closed</option></select></label><label><span>Sort</span><select aria-label="Sort contacts" value={leadSort} onChange={e=>{setLeadSort(e.target.value);setContactPage({key:"",page:0})}}><option value="Next best">Recommended order</option><option>Newest</option><option>Follow-up due</option><option>Recently attempted</option><option>Name</option></select></label></div></div><div className="table-card crm-table smart-table"><div className="table-head"><span>CONTACT & PRIORITY</span><span>SOURCE & OWNER</span><span>STAGE</span><span>LAST RESULT</span><span>NEXT FOLLOW-UP</span></div>{contactRows}{!filteredLeads.length&&<div className="empty-state">No matching contacts</div>}{filteredLeads.length>100&&<footer className="contact-pagination"><span>{contactOffset+1}–{Math.min(contactOffset+100,filteredLeads.length)} of {filteredLeads.length}</span><div><button type="button" aria-label="Previous contacts" disabled={contactPageIndex===0} onClick={()=>setContactPage({key:contactPageKey,page:contactPageIndex-1})}>Previous</button><button type="button" aria-label="Next contacts" disabled={contactOffset+100>=filteredLeads.length} onClick={()=>setContactPage({key:contactPageKey,page:contactPageIndex+1})}>Next</button></div></footer>}</div></div>}

      {view==="miner"&&isPlatformOwner&&enabledTools.miner&&<><MinerStudio onOpen={setSelectedLead} readOnly={userRole==="agent"} initialKind={workspaceProfile.industry==="real-estate"?"real-estate":"auto"} onProspects={items=>setLeads(current=>mergeIncomingContacts(current,normalizeSavedLeads(items)))}/>{workspaceProfile.mode==="insurance"&&<details className="miner-advanced"><summary>Phone queues & licensed feeds</summary><MinerPanel mode={minerMode} onMode={setMinerMode} prospects={minerLeads} dialing={dialing} activeScope={dialerScope} onStart={startMinerDialer} onCall={callLeadById} onOpen={setSelectedLead} onResults={items=>setLeads(current=>mergeIncomingContacts(current,normalizeSavedLeads(items)))} autoFeed={workspaceProfile.minerAutoFeed} onAutoFeedChange={minerAutoFeed=>setWorkspaceProfile(profile=>({...profile,minerAutoFeed}))}/></details>}</>}

      <div hidden={view!=="messages"} className="page-view messages-view"><MessagesCenter visible={view==="messages"} key={`${workspaceId}:${messageTarget?.leadId||"inbox"}:${messageTarget?.channel||"sms"}`} workspaceId={workspaceId} profile={workspaceProfile} leads={leads} initialLeadId={messageTarget?.leadId} initialChannel={messageTarget?.channel} onOpenContact={id=>setSelectedLead(id)} onCloseLead={id=>updateLead(id,{stage:"Closed",status:"Closed",outcome:"Not interested",followUp:"",automationEnabled:false,automationNextAt:"",automationStatus:"complete",automationUpdatedAt:new Date().toISOString()})} onPatch={(id,patch)=>updateLead(id,patch as Partial<Lead>)} onProfileChange={setWorkspaceProfile}/></div>

      {view!=="ai"&&aiActivity!=="idle"&&<button type="button" className="ai-background-status" onClick={()=>openView("ai")}>{aiActivity==="working"?"Pacifica AI is working…":aiActivity==="sending"?"Pacifica AI is sending…":"Pacifica AI · response ready"} <span>Open →</span></button>}
      <div hidden={view!=="ai"} className="page-view ai-view"><AiCommandCenter onScanFolder={openFolder} callBusy={dialing||autoDialing||Boolean(incomingCall)||Boolean(postCallLeadId)} onNavigate={next=>{if(next==="settings")setSettingsSection("integrations");openView(next)}} clerkEnabled={clerkEnabled} onQuoteRequests={()=>setQuoteReviewOpen(open=>!open)} visible={view==="ai"} onActivity={setAiActivity} key={workspaceId} workspaceId={workspaceId} activeLine={activeLine} profile={workspaceProfile} leads={allLeads} recentCalls={callLogs} onApply={applyAiAction} onCreateLead={createAiLead} onOpen={id=>setSelectedLead(id)} onCall={callLeadById}>{quoteReviewOpen&&view==="ai"&&<OpportunityDesk leads={leads} initialLeadId={quoteRequestLeadId} onOpen={setSelectedLead} onMessage={id=>{const item=leads.find(l=>l.id===id);if(item)openLeadMessage(item,"sms")}} onRefresh={async()=>{const response=await fetch("/api/crm/workspace",{cache:"no-store"});if(!response.ok)throw Error("Contact refresh failed. Your reviewed request remains saved.");const data=await response.json();setLeads(current=>mergeIncomingContacts(current,normalizeSavedLeads(data.leads)));}}/>}</AiCommandCenter></div>


      {view==="clients"&&<div className="page-view clients-view"><ClientPortfolio leads={leads} profile={workspaceProfile} onOpen={id=>setSelectedLead(id)} onPatch={(id,patch)=>updateLead(id,patch as Partial<Lead>)} onProfileChange={setWorkspaceProfile} onImportDocument={openDocumentPicker}/></div>}

      {workspaceHydrated&&clerkEnabled&&<CalendarAlerts key={workspaceId} workspaceId={workspaceId} onOpen={()=>openView("office")}/>}
      {view==="office"&&<div className="page-view"><OfficeDesk workspaceId={workspaceId} leads={leads} profile={workspaceProfile} onProfile={setWorkspaceProfile} isOwner={isOwner} onOpen={setSelectedLead}/></div>}
      {view==="activity"&&<div className="page-view report-view"><header className="module-bar"><span className="eyebrow">REPORTS</span></header><CallLogReport logs={callLogs} leadSpend={leads.reduce((total,item)=>total+item.leadCost,0)} callerId={callerId} agentName={currentUserName} recordingEnabled={workspaceProfile.callRecordingEnabled} onOpenRecordingSettings={()=>{setSettingsSection("workspace");setView("settings")}}/></div>}


      {view==="quotes"&&enabledTools.industryTools&&<div className="page-view"><IndustryTools mode={workspaceProfile.mode} onScan={openDocumentPicker} scanBusy={scanBusy} leads={leads} onCollect={id=>{setQuoteRequestLeadId(id);setQuoteReviewOpen(true);setView("ai")}} onOpen={setSelectedLead} onQuote={setGrowthLeadId} onQuoted={id=>{const lead=leads.find(l=>l.id===id);if(lead)updateLead(id,{stage:"Quoted",automationEnabled:false,automationNextAt:"",sourceDisposition:/smart\s*financial/i.test(lead.source)?"Quoted without Contact":"Quoted"});}}/></div>}



      {isOwner&&view==="settings"&&<div className="page-view settings-page">
        <div className="settings-title-bar">
          <span className="eyebrow">SETTINGS</span>
          <SettingsUpdateCheck busy={dialing||Boolean(incomingCall)||Boolean(postCallLeadId)||showNewLead||Boolean(selectedLead)||!/saved|synced/i.test(workspaceSyncStatus)}/>
          <span className="settings-save-state"><i/>{workspaceSyncStatus}</span>
        </div>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Settings sections">
            {([
              ["workspace","Workspace"],
              ["appearance","Appearance"],
              ["team","Team & routing"],
              ["phone","Calling"],
              ["integrations","Integrations"],
              ["system","System health"],
              ["billing","Plans & Billing"],
            ] as const).map(([section,label])=><button key={section} type="button" className={settingsSection===section?"active":""} aria-current={settingsSection===section?"page":undefined} onClick={()=>setSettingsSection(section)}><span><b>{label}</b></span></button>)}
            {isPlatformOwner&&<button type="button" className={settingsSection==="accounts"?"active":""} onClick={()=>setSettingsSection("accounts")}><span><b>Accounts & trials</b></span></button>}
          </nav>
          <div className="settings-content">
            {settingsSection==="appearance"&&<section className="settings-section appearance-only"><WorkspaceAppearanceSettings profile={workspaceProfile} onChange={setWorkspaceProfile}/><DialerBackgroundSettings profile={workspaceProfile} onChange={setWorkspaceProfile}/></section>}
            {isPlatformOwner&&settingsSection==="accounts"&&<section className="settings-section"><AccountAccessPanel onFeaturesChange={setEnabledTools}/></section>}
            {settingsSection==="workspace"&&<section className="settings-section"><WorkspaceProfileSettings profile={workspaceProfile} onChange={setWorkspaceProfile}/></section>}
            {settingsSection==="team"&&<section className="settings-section"><TeamManagement profile={workspaceProfile} onChange={setWorkspaceProfile}/></section>}
            {settingsSection==="phone"&&<section className="settings-section"><div className="phone-setup-layout"><PhoneSettings ensureDevice={ensureDevice}/><div className="phone-setup-side"><div className="provider-card"><div><span className="eyebrow">VOICE PROVIDER</span><h2>{callerId}</h2></div><div className={`twilio-selected ${phoneReady?"":"waiting"}`}><i/> {phoneReady?"CONFIGURED":"NEEDS ATTENTION"}</div></div><article className="setup-help"><span>TWILIO VOICE WEBHOOK</span><code>https://pacificacrm.com/api/twilio/voice</code><p>HTTP POST</p><a href="/api/twilio/diagnostics" target="_blank" rel="noreferrer">Diagnostics ↗</a></article><PhoneWorkspaceSetup phoneNumber={callerId} workspaceId={workspaceId}/></div></div>{isPlatformOwner&&<PhoneNumberCenter currentWorkspaceId={workspaceId} onAssignmentChange={()=>void refreshPhoneStatus()}/>}</section>}
            {settingsSection==="integrations"&&<section className="settings-section settings-integrations"><article className="smart-connect"><header><div><span>LEAD DELIVERY</span><h2>Inbound API</h2></div><strong className="connected"><i/> READY</strong></header><dl className="lead-api-details"><div><dt>Posting URL</dt><dd>https://pacificacrm.com/api/integrations/leads?workspace={workspaceId}&amp;source=PROVIDER_NAME</dd></div><div><dt>Method</dt><dd>POST · application/json</dd></div><div><dt>Header name</dt><dd>x-pacifica-webhook-secret</dd></div><div><dt>Header value</dt><dd>LEAD_WEBHOOK_SECRET from Vercel</dd></div></dl><div><button onClick={saveLeadFeedConnection}>Check leads</button><small>{leadFeedStatus}</small></div></article><EmailWorkspaceSetup/></section>}
      {settingsSection==="billing"&&<div className="settings-section billing-view"><header className="module-bar"><span className="eyebrow">PLANS &amp; BILLING</span></header><div className="pricing-grid">{(Object.keys(pacificaPlans) as Array<keyof typeof pacificaPlans>).map(key=>{const plan=pacificaPlans[key];return <article key={key} className={key==="team"?"featured":""}>{key==="team"&&<em>MOST POPULAR</em>}<span>{plan.name.toUpperCase()}</span><h2>${plan.monthlyPrice}<small>/month</small></h2><p>{plan.description}</p><ul><li>{plan.seats}</li><li>Contacts, calendar and reporting</li><li>Power dialer, SMS and email</li><li>AI drafts and document intake</li><li>Industry workspace settings</li></ul><button disabled={Boolean(checkoutPlan)} onClick={()=>void subscribe(key)}>{checkoutPlan===key?"Opening secure checkout…":`Choose ${plan.name}`}</button></article>})}</div><PlanComparison/><div className="membership-actions"><button onClick={()=>void manageMembership()}>Manage subscription</button><span>Update payment details, download invoices, or manage your plan securely through Stripe.</span></div><section className="billing-compliance"><div><span>RESPONSIBLE OUTREACH, BUILT IN</span><h2>Clear safeguards protect your team and your customers.</h2><p>Every account agrees to follow consent, Do Not Call, calling-hour, licensing, and recording requirements. Pacifica automatically blocks several unsafe actions and may suspend noncompliant campaigns.</p></div><a href="/terms" target="_blank">View compliance terms ↗</a></section><p className="billing-note">Prices exclude communication usage, applicable taxes, and optional carrier-data integrations. Billing and subscription management are securely processed by Stripe.</p></div>}
            {settingsSection==="system"&&<section className="settings-section"><SystemHealthPanel/></section>}
          </div>
        </div>
      </div>}
    </section>
    {showPhoneSettings&&<div className="phone-config-overlay"><PhoneSettings compact ensureDevice={ensureDevice} onClose={()=>setShowPhoneSettings(false)}/></div>}
    {incomingCall&&<div className="incoming-call-backdrop"><section ref={incomingDialogRef} tabIndex={-1} className="incoming-call-card" role="dialog" aria-modal="true" aria-label="Incoming call"><span>INCOMING PACIFICA CALL</span><i>{incomingLead?incomingLead.name.split(" ").map(part=>part[0]).slice(0,2).join(""):"☎"}</i><h2>{incomingLead?.name||"Unknown caller"}</h2><p>{incomingNumber}</p><small>{incomingLead?`${incomingLead.product} · ${incomingLead.source}`:"New caller · create a lead after answering"}</small><div><button onClick={rejectIncoming}>Decline</button><button onClick={acceptIncoming}>{dialing?"End current & answer":"Answer"}</button></div></section></div>}
    {showNewLead&&<div className="new-lead-backdrop" onClick={()=>setShowNewLead(false)}><form ref={newLeadDialogRef} role="dialog" aria-modal="true" aria-label="Add or review a lead" tabIndex={-1} className="new-lead-modal" aria-busy={scanBusy} onSubmit={event=>{event.preventDefault();createLead()}} onClick={event=>event.stopPropagation()}>
      <header><div><span>{newLead.documentType?"DOCUMENT CAPTURE":"NEW OPPORTUNITY"}</span><h2>{newLead.documentType?"Review scanned lead":"Add a lead"}</h2></div><button type="button" aria-label="Close" onClick={()=>setShowNewLead(false)}>×</button></header>
      <div className={`scan-lead-action ${scanBusy?"busy":""}`}><button type="button" disabled={scanBusy} onClick={()=>scanInputRef.current?.click()}><Icon name="camera"/> {scanBusy?"Reading document…":newLead.documentType?"Scan another":"Scan a license or policy"}</button><span>{newLead.documentType?`${newLead.documentType} · verify before saving`:"or drag and drop an image anywhere"}</span></div>
      <div className="new-lead-fields">{scanReview.map(note=><p className="scan-review-note" role="status" key={note}>{note}</p>)}
        <label>Full name<input autoFocus value={newLead.name} onChange={event=>setNewLead(value=>({...value,name:event.target.value}))} placeholder="Maria Torres"/></label><label>Phone<input value={newLead.phone} onChange={event=>setNewLead(value=>({...value,phone:event.target.value}))} placeholder="Add a phone number"/></label>
        <label>Email<input type="email" value={newLead.email} onChange={event=>setNewLead(value=>({...value,email:event.target.value}))} placeholder="maria@example.com"/></label><label>Date of birth<input type="date" value={newLead.dateOfBirth} onChange={event=>setNewLead(value=>({...value,dateOfBirth:event.target.value}))}/></label>
        <label className="wide-field">Street address<input value={newLead.address} onChange={event=>setNewLead(value=>({...value,address:event.target.value}))} placeholder="123 Main Street"/></label><label>City<input value={newLead.city} onChange={event=>setNewLead(value=>({...value,city:event.target.value}))} placeholder="Van Nuys"/></label><label>State<input value={newLead.state} onChange={event=>setNewLead(value=>({...value,state:event.target.value}))} placeholder="CA"/></label><label>ZIP<input value={newLead.zip} onChange={event=>setNewLead(value=>({...value,zip:event.target.value}))} placeholder="91401"/></label>
        <label>Product<input value={newLead.product} onChange={event=>setNewLead(value=>({...value,product:event.target.value}))} placeholder="Auto insurance"/></label><label>Lead source<input value={newLead.source} onChange={event=>setNewLead(value=>({...value,source:event.target.value}))} placeholder="Referral"/></label><label>Lead cost<input type="number" min="0" step="0.01" value={newLead.leadCost} onChange={event=>setNewLead(value=>({...value,leadCost:event.target.value}))} placeholder="0.00"/></label><label>Queue<select value={activeLine} onChange={event=>switchLine(event.target.value as LeadLine)}><option value="life">{queueLabel("life",workspaceProfile.mode)}</option><option value="home-auto">{queueLabel("home-auto",workspaceProfile.mode)}</option></select></label>
        {(newLead.documentType||newLead.licenseNumber||newLead.policyNumber||newLead.vin)&&<><div className="new-lead-section-label">DOCUMENT DETAILS</div><label>License number<input value={newLead.licenseNumber} onChange={event=>setNewLead(value=>({...value,licenseNumber:event.target.value}))}/></label><label>License state<input value={newLead.licenseState} onChange={event=>setNewLead(value=>({...value,licenseState:event.target.value}))}/></label><label>License expiration<input type="date" value={newLead.licenseExpiration} onChange={event=>setNewLead(value=>({...value,licenseExpiration:event.target.value}))}/></label><label>Policy number<input value={newLead.policyNumber} onChange={event=>setNewLead(value=>({...value,policyNumber:event.target.value}))}/></label><label>Policy effective<input type="date" value={newLead.policyEffectiveDate} onChange={event=>setNewLead(value=>({...value,policyEffectiveDate:event.target.value}))}/></label><label>Policy expiration<input type="date" value={newLead.policyExpirationDate} onChange={event=>setNewLead(value=>({...value,policyExpirationDate:event.target.value}))}/></label><label>Term premium<input type="number" min="0" step=".01" value={newLead.policyPremium} onChange={event=>setNewLead(value=>({...value,policyPremium:event.target.value}))}/></label><label>Policy term (months)<input type="number" min="1" step="1" value={newLead.policyTermMonths} onChange={event=>setNewLead(value=>({...value,policyTermMonths:event.target.value}))}/></label><VinLookupField vin={newLead.vin} vehicle={newLead.vehicle} onVin={vin=>setNewLead(value=>({...value,vin}))} onVehicle={vehicle=>setNewLead(value=>({...value,vehicle}))}/></>}
      </div><footer><small>Documents are read locally for this draft and are not saved to the CRM.</small><button type="button" onClick={()=>setShowNewLead(false)}>Cancel</button><button className="primary" type="submit">{/declaration|policy/i.test(newLead.documentType)?"Save active client":"Add lead"}</button></footer>
    </form></div>}
    {postCallLead&&!floatingWindowOpen&&<PostCallDispositionModal lead={postCallLead} draft={postCallDraft} technicalOutcome={postCallTechnicalOutcome} connected={postCallConnected} resume={resumeAfterWrap} saving={sourceSyncing} onSelect={choosePostCallOutcome} onChange={patch=>setPostCallDraft(draft=>({...draft,...patch}))} onSave={()=>void savePostCall()} onCallAgain={()=>void savePostCall("again")} onPause={()=>{resumeAfterWrapRef.current=false;setResumeAfterWrap(false);stopAutoDial("Queue paused · save this call result when ready")}}/>}
    {deletedLead&&<div className="contact-deleted-notice" role="status"><span>{deletedLead.name} deleted</span><button type="button" onClick={undoDelete}>Undo</button><button type="button" aria-label="Dismiss deletion message" onClick={()=>setDeletedLead(null)}>×</button></div>}
    {activeLead&&<div className="drawer-backdrop" onClick={()=>setSelectedLead(null)}><aside ref={contactDialogRef} role="dialog" aria-modal="true" aria-label={`Contact details for ${activeLead.name}`} tabIndex={-1} className="contact-drawer" onClick={e=>e.stopPropagation()}><header><div className="drawer-person"><i>{activeLead.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</i><span><small>{(activeLead.product||"Lead type not supplied").toUpperCase()} CONTACT</small><h2>{activeLead.name}</h2>{activeLead.lastCallResult&&<p role="status">Last call: {activeLead.lastCallResult}</p>}<p>{activeLead.phone} · {activeLead.city}</p></span></div><button aria-label="Close contact" onClick={()=>setSelectedLead(null)}>×</button></header><div className="record-actions"><button disabled={!activeLead.phone||activeLead.doNotCall} onClick={()=>loadLeadInDialer(activeLead)}><Icon name="dial"/> Call</button><button disabled={!activeLead.phone||activeLead.smsOptOut||activeLead.doNotCall} onClick={()=>openLeadMessage(activeLead,"sms")}><Icon name="chat"/> Text</button><button disabled={!activeLead.email||activeLead.emailOptOut||activeLead.doNotCall} onClick={()=>openLeadMessage(activeLead,"email")}><Icon name="mail"/> Email</button><button className="quote-action" onClick={()=>{setGrowthLeadId(activeLead.id);setSelectedLead(null)}}><Icon name="spark"/> Quote</button><button className={activeLead.priorityOverride==="high"?"pin-active":""} onClick={()=>updateLead(activeLead.id,{priorityOverride:activeLead.priorityOverride==="high"?"auto":"high"})}>{activeLead.priorityOverride==="high"?"Pinned":"Pin"}</button><button disabled={activeLead.stage==="Closed"} onClick={()=>updateLead(activeLead.id,{stage:"Closed",status:"Closed",outcome:"Not interested",followUp:"",automationEnabled:false,automationNextAt:"",automationStatus:"complete",automationUpdatedAt:new Date().toISOString()})}>{activeLead.stage==="Closed"?"Lead closed":"Close lead"}</button></div><section className="record-section"><span className="section-label">CONTACT DETAILS</span><div className="field-grid"><label>Name<input value={activeLead.name} onChange={e=>updateLead(activeLead.id,{name:e.target.value})}/></label><label>Phone<input value={activeLead.phone} onChange={e=>updateLead(activeLead.id,{phone:e.target.value})}/></label><label>Email<input value={activeLead.email} onChange={e=>updateLead(activeLead.id,{email:e.target.value})}/></label><label>City<input value={activeLead.city} onChange={e=>updateLead(activeLead.id,{city:e.target.value})}/></label><label>Lead queue<select value={activeLead.line} onChange={e=>moveLeadToQueue(activeLead,e.target.value as LeadLine)}><option value="life">{queueLabel("life",workspaceProfile.mode)}</option><option value="home-auto">{queueLabel("home-auto",workspaceProfile.mode)}</option></select></label><label className="sms-consent-field"><span>Text message consent</span><select value={activeLead.smsOptOut?"optout":activeLead.smsConsent?"yes":hasContactPermission(activeLead,workspaceProfile,"sms")?"source":"no"} onChange={e=>updateLead(activeLead.id,e.target.value==="yes"?{smsConsent:true,smsOptOut:false}:e.target.value==="optout"?{smsConsent:false,smsOptOut:true}:{smsConsent:false,smsOptOut:false})}><option value="source" disabled>Opted in via lead source</option><option value="no">Not documented</option><option value="yes">Opted in</option><option value="optout">Opted out / STOP</option></select><small>Only select Opted in when you have documented permission to text.</small></label><label className="sms-consent-field"><span>Email consent</span><select aria-label="Email consent" value={activeLead.emailOptOut?"optout":activeLead.emailConsent?"yes":"no"} onChange={e=>updateLead(activeLead.id,e.target.value==="yes"?{emailConsent:true,emailOptOut:false}:e.target.value==="optout"?{emailConsent:false,emailOptOut:true}:{emailConsent:false,emailOptOut:false})}><option value="no">Not documented</option><option value="yes">Opted in</option><option value="optout">Unsubscribed</option></select><small>Record permission for email separately from text messages. Only restore an unsubscribe after a new documented opt-in.</small></label></div></section><section className="record-section"><span className="section-label">STAGE & OUTCOME</span><div className="field-grid"><label>Stage<select value={activeLead.stage} onChange={e=>updateLead(activeLead.id,{stage:e.target.value,status:e.target.value==="Closed"?"Closed":"Ready"})}><option>New lead</option><option>Follow-up</option><option>Appointment</option><option>Quoted</option><option>Closed</option></select></label><label>Call outcome<select value={activeLead.outcome} onChange={e=>{const outcome=e.target.value;const closed=outcome==="Not interested"||outcome==="Wrong number";const appointment=outcome==="Appointment set";updateLead(activeLead.id,{outcome,lastContact:"Just now",sourceDisposition:sourceDispositionForOutcome(activeLead.source,outcome,activeLead.sourceDisposition),stage:closed?"Closed":appointment?"Appointment":["Interested","Call back later"].includes(outcome)?"Follow-up":activeLead.stage,status:closed?"Closed":"Ready"})}}><option>Not contacted</option><option>No answer</option><option>Voicemail</option><option>Interested</option><option>Call back later</option><option>Appointment set</option><option>Not interested</option><option>Wrong number</option></select></label><label>Follow-up date<input type="datetime-local" value={activeLead.followUp} onChange={e=>updateLead(activeLead.id,{followUp:e.target.value,stage:e.target.value&&activeLead.stage==="New lead"?"Follow-up":activeLead.stage})}/></label><label>Last contact<input disabled value={activeLead.lastContact}/></label></div><div className="quick-follow-up"><span>QUICK FOLLOW-UP</span><button onClick={()=>updateLead(activeLead.id,{followUp:suggestedRetryAt(),stage:"Follow-up"})}>Later today</button><button onClick={()=>updateLead(activeLead.id,{followUp:followUpInDays(1),stage:"Follow-up"})}>Tomorrow</button><button onClick={()=>updateLead(activeLead.id,{followUp:followUpInDays(3),stage:"Follow-up"})}>In 3 days</button><button onClick={()=>updateLead(activeLead.id,{followUp:""})}>Clear</button></div></section>{Object.values(activeLead.importedFields||{}).some(value=>String(value).trim())&&<section className="record-section imported-record-section"><div className="imported-record-heading"><span className="section-label">IMPORTED CSV DATA</span><small>{Object.keys(activeLead.importedFields||{}).length} fields · {activeLead.csvFileName||"CSV import"}{activeLead.csvUpdatedAt?` · synced ${new Date(activeLead.csvUpdatedAt).toLocaleString()}`:""}</small></div><div className="imported-data-grid">{Object.entries(activeLead.importedFields||{}).map(([field,value])=><div key={field}><span>{field}</span><b>{value||"—"}</b></div>)}</div></section>}<section className="record-section"><span className="section-label">NOTES</span><textarea value={activeLead.notes} onChange={e=>updateLead(activeLead.id,{notes:e.target.value})} placeholder="Add conversation notes, needs, objections, or next steps…"/></section><section className="timeline"><span className="section-label">ACTIVITY</span><div><i/><span><b>{activeLead.outcome}</b><small>{activeLead.lastContact}</small></span></div>{activeLead.lastSmsAt&&<div><i className="navy"/><span><b>Text message sent</b><small>{new Date(activeLead.lastSmsAt).toLocaleString()}</small></span></div>}{activeLead.stage==="Closed"&&<div><i className="navy"/><span><b>Lead closed</b><small>Excluded from automatic dialing and follow-ups · manual calls available</small></span></div>}{activeLead.followUp&&<div><i className="amber"/><span><b>Follow-up scheduled</b><small>{new Date(activeLead.followUp).toLocaleString()}</small></span></div>}<div><i className="navy"/><span><b>Contact added to Pacifica CRM</b><small>{activeLead.importedAt?new Date(activeLead.importedAt).toLocaleDateString():"Date unavailable"}</small></span></div></section><footer><button type="button" className="delete-contact" onClick={()=>deleteLead(activeLead)}>Delete contact</button><button onClick={()=>void syncLeadDisposition(activeLead,{sourceDisposition:activeLead.sourceDisposition,stage:activeLead.stage,outcome:activeLead.outcome,followUp:activeLead.followUp,notes:activeLead.notes}).then(message=>{setToast(message);setSelectedLead(null)})}>Save contact</button></footer></aside></div>}
    {growthLead&&<div className="quote-modal-backdrop" onMouseDown={()=>setGrowthLeadId(null)}><div ref={quoteDialogRef} tabIndex={-1} className="quote-modal-shell" role="dialog" aria-modal="true" aria-label={`Quote workspace for ${growthLead.name}`} onMouseDown={event=>event.stopPropagation()}><button className="quote-modal-close" type="button" aria-label="Close quote workspace" onClick={()=>setGrowthLeadId(null)}>×</button><LeadGrowthPanel lead={growthLead} teamMembers={workspaceProfile.teamMembers} onPatch={patch=>{const won=patch.outcome==="Sold / Won";updateLead(growthLead.id,{...patch,status:won?"Closed":growthLead.status,sourceDisposition:won?sourceDispositionForOutcome(growthLead.source,"Sold / Won",growthLead.sourceDisposition):growthLead.sourceDisposition,closedAt:won?new Date().toISOString():growthLead.closedAt} as Partial<Lead>);if(won)setToast(`${growthLead.name} marked won`)}} onGoogleCalendar={()=>{const url=googleCalendarUrl(growthLead);if(url)window.open(url,"_blank","noopener,noreferrer");else setToast("Choose a follow-up date first")}} onDownloadCalendar={()=>downloadCalendar(growthLead)}/></div></div>}
    {toast&&<div className="toast" role="status" aria-live="polite">{toast}</div>}
  </main>
}
