"use client";

import {useCallback,useEffect,useRef,useState} from "react";

type Check={ready:boolean;configured:boolean;observedAt:string|null;reason:string;nextAction:string};
type Health={status:string;ready:number;total:number;checkedAt:string;checks:Record<string,Check>;release?:string};
const labels:Record<string,string>={storage:"Storage",voice:"Calling",sms:"Texting",email:"Email",emailReplies:"Email replies",automation:"Automation",ai:"Doxa",recording:"Recordings"};

export default function SystemHealthPanel(){
  const [health,setHealth]=useState<Health|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const request=useRef<AbortController|null>(null);
  const load=useCallback(async()=>{
    request.current?.abort();
    const controller=new AbortController();request.current=controller;
    setLoading(true);setError("");
    try{
      const response=await fetch("/api/diagnostics/system",{cache:"no-store",signal:controller.signal});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Health check failed");
      if(!controller.signal.aborted)setHealth(data);
    }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:"Health check failed")}
    finally{if(!controller.signal.aborted)setLoading(false)}
  },[]);
  useEffect(()=>{const initial=window.setTimeout(()=>void load(),0);const timer=window.setInterval(()=>void load(),60000);return()=>{window.clearTimeout(initial);window.clearInterval(timer);request.current?.abort()}},[load]);
  const needsAttention=health?Object.values(health.checks).filter(check=>!check.ready).length:0;
  return <section className="workspace-health" aria-label="System health" aria-busy={loading}>
    <header><div><h2>System health</h2><p role="status">{error?"Could not refresh status":!health?"Checking capabilities.":needsAttention?`${needsAttention} capability checks need verification`:"All capability checks observed"}</p></div><button type="button" disabled={loading} onClick={()=>void load()}>{loading?"Checking.":"Refresh"}</button></header>
    {error&&<p className="workspace-health-error" role="alert">{error}</p>}
    {health&&<div className="workspace-health-list">{Object.entries(health.checks).map(([key,check])=><details key={key} className={check.ready?"health-ready":"health-attention"}><summary><b>{labels[key]||key}</b><span>{check.ready?"Observed":check.configured?"Configured · unverified":"Needs setup"}</span></summary><p>{check.reason}</p><p>{check.observedAt?`Observed ${new Date(check.observedAt).toLocaleString()}`:`Checked ${new Date(health.checkedAt).toLocaleString()} · no successful outcome observed`}</p><p>Next: {check.nextAction}</p></details>)}</div>}
  </section>;
}
