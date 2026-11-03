"use client";

import {useEffect,useRef,useState,type ReactNode} from "react";
import {useDialogFocus} from "../hooks/use-dialog-focus";

type Item={id:string;label:string;icon:ReactNode};
const primaryIds=["today","dialer","messages","leads"];

/** Phone navigation is independent of the saved desktop sidebar width. */
export default function MobileNavigation({items,active,onNavigate,unread=0,syncStatus}:{items:Item[];active:string;onNavigate:(id:string)=>void;unread?:number;syncStatus:string}){
  const [open,setOpen]=useState(false);
  const dialog=useRef<HTMLDivElement>(null);
  useDialogFocus(dialog,open,()=>setOpen(false));
  useEffect(()=>{
    if(typeof window.matchMedia!=="function")return;
    const query=window.matchMedia("(min-width: 761px)");
    const close=()=>{if(query.matches)setOpen(false)};
    query.addEventListener("change",close);
    return()=>query.removeEventListener("change",close);
  },[]);
  useEffect(()=>{
    const viewport=window.visualViewport;
    if(!viewport)return;
    const root=document.documentElement;
    const previous=root.style.getPropertyValue("--crm-phone-height");
    let frame=0;
    let restingHeight=Math.min(viewport.height,window.innerHeight),restingWidth=window.innerWidth;
    const measure=()=>{
      frame=0;
      // Pinch zoom is an accessibility action, not a keyboard resize.
      if(viewport.scale!==1)return;
      const height=Math.min(viewport.height,window.innerHeight),editing=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||"");
      if(!editing||Math.abs(window.innerWidth-restingWidth)>100){restingHeight=height;restingWidth=window.innerWidth}
      root.style.setProperty("--crm-phone-height",`${Math.round(height)}px`);
      // Android can resize both the layout and visual viewport when its keyboard opens.
      root.dataset.phoneKeyboard=String(window.innerWidth<=760&&editing&&Math.max(window.innerHeight-viewport.height,restingHeight-height)>140);
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure)};
    viewport.addEventListener("resize",schedule,{passive:true});
    window.addEventListener("resize",schedule,{passive:true});
    document.addEventListener("focusin",schedule);
    document.addEventListener("focusout",schedule);
    measure();
    return()=>{cancelAnimationFrame(frame);viewport.removeEventListener("resize",schedule);window.removeEventListener("resize",schedule);document.removeEventListener("focusin",schedule);document.removeEventListener("focusout",schedule);delete root.dataset.phoneKeyboard;if(previous)root.style.setProperty("--crm-phone-height",previous);else root.style.removeProperty("--crm-phone-height")};
  },[]);
  function navigate(id:string){setOpen(false);onNavigate(id)}
  const primary=primaryIds.flatMap(id=>items.filter(item=>item.id===id));
  const title=items.find(item=>item.id===active)?.label||"Workspace";
  return <>
    <header className="mobile-workspace-header"><div className="mobile-brand"><img src="/pacifica-mark.png" alt="Pacifica" width={28} height={28}/><span><b>PACIFICA</b><small>{title}</small></span></div><span className="mobile-save-status" role="status"><i/>{syncStatus}</span></header>
    <nav className="mobile-navigation" aria-label="Phone navigation">
      {primary.map(item=><button key={item.id} type="button" aria-label={item.id==="messages"&&unread?`${item.label}, ${unread} unread`:item.label} aria-current={active===item.id?"page":undefined} onClick={()=>navigate(item.id)}><span>{item.icon}{item.id==="messages"&&unread>0&&<em>{Math.min(99,unread)}</em>}</span><small>{item.label}</small></button>)}
      <button type="button" aria-label="More navigation" aria-expanded={open} aria-controls="mobile-workspace-menu" aria-current={!primaryIds.includes(active)?"page":undefined} onClick={()=>setOpen(true)}><span><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></span><small>More</small></button>
    </nav>
    {open&&<div className="mobile-menu-overlay" onClick={event=>{if(event.target===event.currentTarget)setOpen(false)}}><div ref={dialog} id="mobile-workspace-menu" className="mobile-menu" role="dialog" aria-modal="true" aria-labelledby="mobile-menu-title" tabIndex={-1}><header><div><small>PACIFICA</small><h2 id="mobile-menu-title">Your workspace</h2></div><button type="button" aria-label="Close navigation" onClick={()=>setOpen(false)}>×</button></header><nav aria-label="All workspace pages">{items.map(item=><button key={item.id} type="button" aria-current={active===item.id?"page":undefined} onClick={()=>navigate(item.id)}>{item.icon}<span>{item.label}</span><span aria-hidden="true">↗</span></button>)}</nav></div></div>}
  </>;
}
