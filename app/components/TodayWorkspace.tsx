"use client";

import AttachmentReview from "./AttachmentReview";
import GmailTriagePanel from "./GmailTriagePanel";
import NoteReminders from "./NoteReminders";
import { useEffect, useMemo, useState } from "react";
import type {PrivateCallback} from '../lib/member-callbacks';
import { dateValue, leadPriority, rankLeads, type LeadPriorityInput } from "../lib/lead-priority";

type TodayLead=LeadPriorityInput&{name:string;phone:string;city:string;source:string;leadCost:number;product:string};

function relativeDate(value:string,now:number){
  const timestamp=dateValue(value);if(!Number.isFinite(timestamp))return "No date";
  const days=Math.round((timestamp-now)/(24*60*60*1000));
  if(days<0)return `${Math.abs(days)}d overdue`;
  if(days===0)return "Today";
  if(days===1)return "Tomorrow";
  return `In ${days}d`;
}

export default function TodayWorkspace({leads,onOpen,onCall,onImport,onAdd,isOwner}:{leads:TodayLead[];onOpen:(id:number)=>void;onCall:(id:number)=>void;onImport:()=>void;onAdd:()=>void;isOwner?:boolean}){
  const [currentNow,setCurrentNow]=useState(()=>Date.now());
  const [privateCallbacks,setPrivateCallbacks]=useState<PrivateCallback[]>([]);
  useEffect(()=>{let active=true;const load=()=>void fetch('/api/calendar/member-callbacks',{cache:'no-store'}).then(response=>response.ok?response.json():{items:[]}).then(data=>{if(active)setPrivateCallbacks(Array.isArray(data.items)?data.items:[])}).catch(()=>{});load();window.addEventListener('pacifica:private-callback-updated',load);return()=>{active=false;window.removeEventListener('pacifica:private-callback-updated',load)}},[]);
  useEffect(()=>{const timer=window.setInterval(()=>setCurrentNow(Date.now()),60000);return()=>window.clearInterval(timer)},[]);
  const {open,ranked,overdue,appointments,untouched,recent,sourceRows}=useMemo(()=>{
  const open=leads.filter(lead=>lead.stage!=="Closed"&&!lead.doNotCall);
  const ranked=rankLeads(open,currentNow).slice(0,8);
  const overdue=open.filter(lead=>leadPriority(lead,currentNow).due).length;
  const appointments=open.filter(lead=>lead.stage==="Appointment"||lead.outcome==="Appointment set").length;
  const untouched=open.filter(lead=>lead.outcome==="Not contacted").length;
  const recent=open.filter(lead=>{const arrived=dateValue(lead.received);return Number.isFinite(arrived)&&currentNow-arrived<24*60*60*1000}).length;
  const sourceRows=Array.from(open.reduce((map,lead)=>{const row=map.get(lead.source)||{name:lead.source,count:0,cost:0,appointments:0};row.count++;row.cost+=lead.leadCost;if(lead.stage==="Appointment"||lead.outcome==="Appointment set")row.appointments++;map.set(lead.source,row);return map},new Map<string,{name:string;count:number;cost:number;appointments:number}>()).values()).toSorted((a,b)=>b.count-a.count).slice(0,4);
  return {open,ranked,overdue,appointments,untouched,recent,sourceRows};
  },[leads,currentNow]);

  return <div className="today-workspace"><NoteReminders leads={leads} onOpen={onOpen}/><AttachmentReview leads={leads}/>
    {privateCallbacks.filter(item=>item.status==='open'&&Date.parse(item.dueAt)>=currentNow-7*86400000&&Date.parse(item.dueAt)<currentNow+180*86400000&&leads.some(lead=>lead.id===item.leadId)).length>0&&<section className="focus-list" aria-label="Private callbacks"><header><span>PRIVATE CALLBACKS</span></header>{privateCallbacks.filter(item=>item.status==='open'&&Date.parse(item.dueAt)>=currentNow-7*86400000&&Date.parse(item.dueAt)<currentNow+180*86400000&&leads.some(lead=>lead.id===item.leadId)).map(item=><article key={item.id}><button type="button" className="focus-person" onClick={()=>onOpen(item.leadId)}>{item.title}</button><small>{new Date(item.dueAt).toLocaleString()} · {item.timezone}</small></article>)}</section>}
    {isOwner&&<GmailTriagePanel today/>}
    <header className="module-bar"><span className="eyebrow">TODAY</span><div className="today-actions"><button onClick={onImport}>Import</button><button className="primary" onClick={onAdd}>+ New lead</button></div></header>
    <section className="today-metrics">
      <article><span>NEW TODAY</span><b>{recent}</b></article>
      <article className={overdue?"urgent":""}><span>OVERDUE</span><b>{overdue}</b></article>
      <article><span>UNTOUCHED</span><b>{untouched}</b></article>
      <article><span>APPOINTMENTS</span><b>{appointments}</b></article>
    </section>
    <div className="today-grid">
      <section className="focus-list"><header><span>PRIORITY QUEUE</span><em>{open.length} open</em></header>{ranked.map((lead,index)=>{const priority=leadPriority(lead,currentNow);return <article key={lead.id}><strong>{String(index+1).padStart(2,"0")}</strong><button className="focus-person" onClick={()=>onOpen(lead.id)}><i>{lead.name.split(" ").map(part=>part[0]).slice(0,2).join("")}</i><span><b>{lead.name}</b><small>{lead.product} · {lead.source}</small></span></button><div className="focus-reason"><b><em className={`priority-pill ${priority.level.toLowerCase()}`}>{priority.level}</em>{priority.reason}</b><small>{lead.followUp?`${relativeDate(lead.followUp,currentNow)} · `:""}{priority.detail}</small></div><button className="focus-call" onClick={()=>onCall(lead.id)}>Call</button></article>})}{!ranked.length&&<div className="today-empty"><b>Queue clear</b><button onClick={onAdd}>Add lead</button></div>}</section>
      <aside className="source-pulse"><header><span>LEAD SOURCES</span></header>{sourceRows.map(row=><article key={row.name}><div><b>{row.name}</b><small>{row.count} open</small></div><span><b>{row.appointments}</b><small>appts</small></span><span><b>${row.cost.toFixed(0)}</b><small>spend</small></span></article>)}{!sourceRows.length&&<p>No source data</p>}</aside>
    </div>
  </div>;
}
