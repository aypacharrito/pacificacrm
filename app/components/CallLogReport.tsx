"use client";

import {callResultLabel,type CallDetection} from "../lib/call-detection";
import type {AiCallResult} from "../lib/voice-call-results";
import RecordingPlayer from "./RecordingPlayer";
import { useMemo, useState } from "react";

export type CallLog = CallDetection & AiCallResult & {
  id: string;
  name: string;
  phone: string;
  startedAt: string;
  duration: number;
  outcome: string;
  status: string;
  campaign: string;
  source: string;
  errorCode?: string;
  callSid?: string;
  recordingUrl?: string;
  recordingSid?: string;
  recordingStatus?: string;
  transcript?: string;
  aiSummary?: string;
};

function duration(value: number) { return value < 60 ? `${value}s` : `${Math.floor(value / 60)}m ${value % 60}s`; }
const wentThrough=(log:CallLog)=>["completed","interested","appointment set","sold / won"].includes(log.outcome.trim().toLowerCase());

export default function CallLogReport({ logs, leadSpend, callerId, agentName, recordingEnabled, onOpenRecordingSettings }: { logs: CallLog[]; leadSpend:number; callerId: string; agentName:string; recordingEnabled:boolean; onOpenRecordingSettings:()=>void }) {
  const [outcome, setOutcome] = useState("All outcomes");
  const [durationFilter, setDurationFilter] = useState("All durations");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => logs.filter(log => {
    if (outcome === "Went through" && !wentThrough(log)) return false;
    if (outcome !== "All outcomes" && outcome !== "Went through" && log.outcome !== outcome && callResultLabel(log) !== outcome) return false;
    if (durationFilter === "Under 30 sec" && log.duration >= 30) return false;
    if (durationFilter === "1 minute+" && log.duration < 60) return false;
    return `${log.name} ${log.phone} ${log.status}`.toLowerCase().includes(query.toLowerCase());
  }), [logs, outcome, durationFilter, query]);
  const completed = logs.filter(wentThrough);
  const answerRate = logs.length ? Math.round((completed.length / logs.length) * 100) : 0;
  const shortRate = logs.length ? Math.round((logs.filter(log => log.duration < 15).length / logs.length) * 100) : 0;
  const failedRate = logs.length ? Math.round((logs.filter(log => ["Failed", "Timed out"].includes(log.outcome)).length / logs.length) * 100) : 0;
  const reputationScore = Math.max(0, Math.min(100, 100 - Math.round(shortRate * .35) - Math.round(failedRate * .65)));

  function exportCsv() {
    const rows = [["Agent","Contact","Started","Outcome","Duration","Phone","Status","Call SID"], ...filtered.map(log => [agentName, log.name, log.startedAt, callResultLabel(log), String(log.duration), log.phone, log.status, log.callSid || ""])];
    const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"','""')}"`).join(",")).join("\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); anchor.download = "pacific-call-log.csv"; anchor.click(); URL.revokeObjectURL(anchor.href);
  }

  return <>
    <div className="report-metrics"><article><span>CALLS</span><b>{logs.length}</b></article><article><span>WENT THROUGH</span><b>{completed.length}</b><small>{answerRate}% of calls</small></article><article><span>LEAD SPEND</span><b>${leadSpend.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</b></article><article><span>NUMBER HEALTH</span><b className={reputationScore < 70 ? "risk" : "good"}>{reputationScore}</b></article></div>
    <section className="recording-readiness ready"><div><span>RECORDING</span><b>{recordingEnabled?"Ready":"Available"}</b></div><button type="button" onClick={onOpenRecordingSettings}>Settings</button></section>
    <section className="call-report">
      <header><div><span>CALL LOG</span><b>{filtered.length} results</b></div><button onClick={exportCsv} disabled={!filtered.length}>Export CSV</button></header>
      <div className="report-filters"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or phone"/><select value={outcome} onChange={event => setOutcome(event.target.value)}><option>All outcomes</option>{["Went through","Completed","Interested","Appointment set","Sold / Won","Voicemail","No answer","Busy","Unknown","Fax","Canceled","Rejected","Failed","Timed out"].map(item => <option key={item}>{item}</option>)}</select><select value={durationFilter} onChange={event => setDurationFilter(event.target.value)}><option>All durations</option><option>Under 30 sec</option><option>1 minute+</option></select><select disabled><option>All users</option></select><select disabled><option>Pacific Outreach</option></select></div>
      <div className="call-log-head"><span>AGENT / CONTACT</span><span>TIME</span><span>RESULT</span><span>RECORDING</span><span>DURATION</span><span>NUMBER</span></div>
      <div className="call-log-body">{filtered.map(log => <div className="call-log-row" key={log.id}><span><b>{agentName}</b><small>{log.name}</small></span><span>{new Date(log.startedAt).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })}</span><span><em className={`result ${log.outcome.toLowerCase().replaceAll(" ","-")}`}>{callResultLabel(log)}</em><small>{log.detectedResult ? `Detected: ${log.detectedResult}` : log.errorCode || log.status}</small></span><span className="recording-cell">{log.recordingUrl ? <RecordingPlayer key={log.recordingSid||log.recordingUrl} sid={log.recordingSid} url={log.recordingUrl}/> : log.recordingStatus?<em className="recording-processing"><i/>{/complete/i.test(log.recordingStatus)?"Preparing audio":log.recordingStatus}</em>:<em className="recording-missing">Not recorded</em>}{log.aiSummary&&<details><summary>Doxa notes</summary><pre>{log.aiSummary}</pre>{log.transcript&&<p>{log.transcript}</p>}</details>}</span><span>{duration(log.duration)}</span><span>{log.phone}</span></div>)}{!filtered.length && <div className="empty-call-log"><b>No matching calls</b></div>}</div>
    </section>
    <section className="reputation-panel"><header><div><span>NUMBER HEALTH</span><h2>{callerId||"Caller ID"}</h2></div><strong className={reputationScore < 70 ? "risk" : "good"}>{reputationScore}/100</strong></header><div className="reputation-grid"><article><span>SHORT CALLS</span><b>{shortRate}%</b></article><article><span>FAILED CALLS</span><b>{failedRate}%</b></article><article><span>STATUS</span><b>{reputationScore<70?"Review":"Healthy"}</b></article></div><footer><a href="https://www.twilio.com/docs/voice/spam-monitoring-with-voiceintegrity" target="_blank" rel="noreferrer">Voice Integrity ↗</a><a href="https://www.twilio.com/docs/voice/trusted-calling-with-shakenstir" target="_blank" rel="noreferrer">SHAKEN/STIR ↗</a><a href="https://www.twilio.com/docs/voice/brand-your-calls-using-cnam" target="_blank" rel="noreferrer">CNAM ↗</a></footer></section>
  </>;
}
