'use client';
import {useLanguage} from "./LanguageProvider";
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {type OfficeItem} from '../lib/office-schedule';
import type {WorkspaceProfile} from '../lib/workspace-profile';
import {useDialogFocus} from '../hooks/use-dialog-focus';
import AutomationStudio from './AutomationStudio';
import CalendarConnection from './CalendarConnection';
import ConversationCalendarSettings from './ConversationCalendarSettings';
import {calendarAlertKey} from './CalendarAlerts';
import styles from './OfficeDesk.module.css';
import CalendarWeek from './CalendarWeek';
import ConnectedCalendarChoices,{calendarChoiceKey} from './connected/ConnectedCalendarChoices';
import {connectedPost,connectedRequest,connectionChanged,errorText,type AccountRow} from './connected/client';
import {providerNames,type Calendar,type CalendarEvent} from '../lib/connected/types';
import {calendarDayOverlap} from '../lib/calendar-presentation';
import type {NoteReminder} from '../lib/note-reminders';

type Contact={id:number;name:string;phone:string;deletedAt?:string;followUp?:string};
type Entry=Omit<OfficeItem,'kind'> & {kind:OfficeItem['kind']|'task';external?:'google'|'outlook'|'icloud';allDay?:boolean;externalUrl?:string;cal?:CalendarEvent;endAt?:string;allDayEnd?:string;color?:string};
const dateKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const localTime=(value:string)=>{const d=new Date(value);return `${dateKey(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`};
const clock=(value:string)=>new Date(value).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
const label=(kind:Entry['kind'])=>kind==='payment'?'Payment':kind==='task'?'Today task':'Appointment';
const blank=(date=new Date())=>({allDayDate:'',id:'',leadId:'0',kind:'appointment',title:'',dueAt:dateKey(date)+'T09:00',amount:'',durationMinutes:30,staffReminderMinutes:15,reminder:false,reminderAt:''});

export default function OfficeDesk({leads,profile,onProfile,isOwner,onOpen,workspaceId='local',linked,initialDay,initialItem,canConnect=false,onConnectedSettings,onOpenToday}:{workspaceId?:string;leads:Contact[];profile:WorkspaceProfile;onProfile:(profile:WorkspaceProfile)=>void;isOwner:boolean;onOpen:(id:number)=>void;linked?:string;initialDay?:string;initialItem?:string;canConnect?:boolean;onConnectedSettings?:()=>void;onOpenToday?:()=>void}){
 const {t,language}=useLanguage();
 const weekdays=Array.from({length:7},(_,i)=>new Date(2026,0,4+i).toLocaleDateString(language,{weekday:"short"}));
 const [tasks,setTasks]=useState<NoteReminder[]>([]);
 const [items,setItems]=useState<OfficeItem[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [anchor,setAnchor]=useState(()=>initialDay?new Date(initialDay+'T12:00:00'):new Date()),[view,setView]=useState<'day'|'month'|'week'|'agenda'>(linked||initialItem?'day':'month'),[selected,setSelected]=useState(initialItem||'');
 const [editor,setEditor]=useState(false),[settings,setSettings]=useState(false),[deviceAlerts,setDeviceAlerts]=useState(false),[form,setForm]=useState(blank);
 const [external,setExternal]=useState<Entry[]>([]),[externalMessage,setExternalMessage]=useState('');
 const [linkedEvents,setLinkedEvents]=useState<Entry[]>([]),[accountRows,setAccountRows]=useState<AccountRow[]>([]);
 const [calendarNotice,setCalendarNotice]=useState(''),[calendarPending,setCalendarPending]=useState(''),[calendarFocus,setCalendarFocus]=useState('');
 const autoOpen=useRef(false);
 const [filters,setFilters]=useState({appointment:true,payment:true,task:true,completed:false});
 const revision=useRef(0),mutating=useRef(false),dialog=useRef<HTMLDivElement>(null);
 useDialogFocus(dialog,editor||settings,()=>{if(!busy){setEditor(false);setSettings(false)}});
 const load=useCallback(async()=>{if(mutating.current)return;const version=++revision.current;const response=await fetch('/api/crm/office',{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Calendar could not load.');if(version===revision.current)setItems(data.items||[])},[]);
 useEffect(()=>{const requests=revision;const initial=setTimeout(()=>{void load().catch(e=>setMessage(e.message));try{setDeviceAlerts(localStorage.getItem(calendarAlertKey(workspaceId))==='on')}catch{}},0),timer=setInterval(()=>void load().catch(()=>undefined),30000);return()=>{clearTimeout(initial);clearInterval(timer);requests.current++}},[load,workspaceId]);
 useEffect(()=>{
  if(!canConnect)return;
  const controller=new AbortController();
  void fetch('/api/crm/note-reminders',{cache:'no-store',signal:controller.signal}).then(async response=>{
   if(!response.ok)return;
   const data=await response.json() as {items?:NoteReminder[]};
   if(!controller.signal.aborted)setTasks(Array.isArray(data.items)?data.items:[]);
  }).catch(()=>undefined);
  return()=>controller.abort();
 },[canConnect,workspaceId]);
 const contacts=useMemo(()=>new Map(leads.filter(x=>!x.deletedAt).map(x=>[x.id,x])),[leads]);
 const entries=useMemo<Entry[]>(()=>{
  const scheduled:Entry[]=tasks.filter(task=>task.status!=='dismissed'&&task.dueAt&&contacts.has(task.leadId)).map(task=>({
   id:'today:'+task.id,leadId:task.leadId,kind:'task',title:task.title,dueAt:task.snoozedUntil&&Date.parse(task.snoozedUntil)>Date.parse(task.dueAt)?task.snoozedUntil:task.dueAt,
   status:task.status==='done'?'done':'open',durationMinutes:15,amount:0,reminderAt:'',reminderState:'off',createdAt:task.createdAt,
  }));
  return [...scheduled,...items.filter(x=>x.leadId===0||contacts.has(x.leadId)).map(x=>({...x,allDay:Boolean(x.allDayDate)})),...external,...linkedEvents].sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt));
 },[items,contacts,external,linkedEvents,tasks]);
 const filtered=entries.filter(x=>filters[x.kind]&&(filters.completed||x.status==='open')&&(!calendarFocus||!x.cal||calendarChoiceKey(x.cal.connection,x.cal.calendar)===calendarFocus));
 const monthDays=useMemo(()=>Array.from({length:42},(_,i)=>new Date(anchor.getFullYear(),anchor.getMonth(),i-new Date(anchor.getFullYear(),anchor.getMonth(),1).getDay()+1)),[anchor]);
 const days=view==='day'?[anchor]:view==='week'?Array.from({length:7},(_,i)=>new Date(anchor.getFullYear(),anchor.getMonth(),anchor.getDate()-anchor.getDay()+i)):monthDays;
 const rangeStart=new Date(days[0].getFullYear(),days[0].getMonth(),days[0].getDate()).toISOString(),lastDay=days[days.length-1],rangeEnd=new Date(lastDay.getFullYear(),lastDay.getMonth(),lastDay.getDate()+1).toISOString();
 useEffect(()=>{let active=true;let controller:AbortController|undefined;
  const refresh=async()=>{if(document.hidden)return;controller?.abort();controller=new AbortController();try{const r=await fetch(`/api/calendar/external?${new URLSearchParams({start:rangeStart,end:rangeEnd})}`,{cache:'no-store',signal:controller.signal}),d=await r.json();if(!r.ok)throw Error('Calendar events could not load.');if(active){setExternal(d.events||[]);setExternalMessage((d.errors||[]).join(' '))}}catch(e){if(active&&!(e instanceof Error&&e.name==='AbortError'))setExternalMessage('Connected calendar events could not load. Open Calendar settings to retry.')}};
  void refresh();const timer=setInterval(()=>void refresh(),300000),update=()=>void refresh();window.addEventListener('pacifica:external-calendar-changed',update);document.addEventListener('visibilitychange',update);return()=>{active=false;controller?.abort();clearInterval(timer);window.removeEventListener('pacifica:external-calendar-changed',update);document.removeEventListener('visibilitychange',update)};
 },[rangeStart,rangeEnd,workspaceId]);
 const firstDay=dateKey(days[0]),lastDate=dateKey(new Date(lastDay.getFullYear(),lastDay.getMonth(),lastDay.getDate()+1));
 useEffect(()=>{
  if(!canConnect)return;
  const controller=new AbortController();
  function refresh(){
   const query=new URLSearchParams({start:rangeStart,end:rangeEnd,first:firstDay,last:lastDate});
   if(linked&&!autoOpen.current)query.set('source',linked);
   void connectedRequest<{events:CalendarEvent[];accounts:AccountRow[];errors:string[];open?:string}>('calendars?'+query,{signal:controller.signal}).then(data=>{
    if(controller.signal.aborted)return;
    const rows=data.events.map((event):Entry=>({
     id:'linked:'+JSON.stringify([event.connection,event.calendar,event.id]),leadId:0,kind:'appointment',title:event.title,
     dueAt:event.allDay?event.start+'T12:00:00':event.start,endAt:event.allDay?undefined:event.end,
     allDay:event.allDay,allDayDate:event.allDay?event.start:undefined,allDayEnd:event.allDay?event.end:undefined,
     durationMinutes:event.allDay?undefined:(Date.parse(event.end)-Date.parse(event.start))/60000,
     amount:0,status:'open',reminderAt:'',reminderState:'off',createdAt:'',staffReminderMinutes:-1,
     external:event.provider==='microsoft'?'outlook':event.provider,externalUrl:event.link,cal:event,color:event.color,
    }));
    setLinkedEvents(rows);setAccountRows(data.accounts);setCalendarNotice(data.errors.join(' '));
    if(!autoOpen.current&&data.open){const target=rows.find(row=>row.cal?.source===data.open);if(target){autoOpen.current=true;setSelected(target.id);}}
   }).catch(error=>{if(!controller.signal.aborted)setCalendarNotice(errorText(error));});
  }
  refresh();window.addEventListener(connectionChanged,refresh);
  return()=>{controller.abort();window.removeEventListener(connectionChanged,refresh);};
 },[canConnect,firstDay,lastDate,linked,rangeStart,rangeEnd,workspaceId]);
 async function calendarPreference(account:AccountRow,calendar:Calendar,visible:boolean,color?:string){
  if(calendarPending)return;
  setCalendarPending(calendarChoiceKey(account.id,calendar.id));setCalendarNotice('');
  try{
   const updated=await connectedPost<AccountRow>('accounts',{action:'options',id:account.id,calendar:calendar.id,visible,color});
   setAccountRows(rows=>rows.map(row=>row.id===updated.id?updated:row));
   if(!visible&&calendarFocus===calendarChoiceKey(account.id,calendar.id))setCalendarFocus('');
   window.dispatchEvent(new Event(connectionChanged));
  }catch(error){setCalendarNotice(errorText(error));}
  finally{setCalendarPending('');}
 }
 const byDay=new Map(days.map(day=>[dateKey(day),filtered.filter(entry=>calendarDayOverlap(entry,day))]));
 const active=entries.find(x=>x.id===selected),today=dateKey(new Date());
 function move(direction:number){setAnchor(date=>view==='day'||view==='week'?new Date(date.getFullYear(),date.getMonth(),date.getDate()+direction*(view==='day'?1:7)):new Date(date.getFullYear(),date.getMonth()+direction,1))}
 function create(date=anchor,hour=9){const next=blank(date);next.dueAt=dateKey(date)+`T${String(hour).padStart(2,'0')}:00`;setForm(next);setSelected('');setSettings(false);setEditor(true);setMessage('')}
 function edit(item:Entry){if(item.external||item.kind==='task')return;setForm({allDayDate:item.allDayDate||'',id:item.id,leadId:String(item.leadId),kind:item.kind,title:item.title,dueAt:localTime(item.dueAt),amount:String(item.amount),durationMinutes:item.durationMinutes??30,staffReminderMinutes:item.staffReminderMinutes??15,reminder:item.reminderState==='pending',reminderAt:item.reminderAt?localTime(item.reminderAt):''});setEditor(true);setMessage('')}
 async function save(body:Record<string,unknown>){
  if(mutating.current)return;mutating.current=true;revision.current++;setBusy(true);setMessage('');
  try{const response=await fetch('/api/crm/office',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error||'Could not save.');setItems(data.items);setEditor(false);setMessage('Saved.');window.dispatchEvent(new Event('pacifica:calendar-changed'))}
  catch(e){setMessage(e instanceof Error?e.message:'Could not save.')}finally{mutating.current=false;setBusy(false)}
 }
 async function toggleAlerts(){const enabled=!deviceAlerts;try{if(enabled&&typeof Notification!=='undefined'&&Notification.permission==='default')await Notification.requestPermission();localStorage.setItem(calendarAlertKey(workspaceId),enabled?'on':'off');setDeviceAlerts(enabled);setMessage(enabled?(typeof Notification!=='undefined'&&Notification.permission==='granted'?'Desktop and in-app reminders enabled. Keep Pacifica running.':'In-app reminders enabled. Allow browser notifications for desktop pop-ups.'):'Device reminders disabled.');window.dispatchEvent(new Event('pacifica:calendar-changed'))}catch{setMessage('Check your browser notification permissions.')}}
 function chip(item:Entry){return <button key={item.id} type="button" className={`${styles.event} ${styles[item.kind]} ${item.status==='done'?styles.done:''}`} style={item.color?{borderInlineStart:"3px solid "+item.color}:undefined} onClick={()=>{setSelected(item.id);setMessage('')}} title={`${item.title} · ${item.allDay?'All day':clock(item.dueAt)}`}><span>{item.allDay?'All day':clock(item.dueAt)}</span> {item.title}{item.cal&&<small className={styles.eventSource}> · {item.cal.calendarName}</small>}</button>}
 return <section className={styles.calendar}>
  <header className={styles.toolbar}><h1>{t("Calendar")}</h1><button onClick={()=>setAnchor(new Date())}>{t("Today")}</button><div className={styles.arrows}><button aria-label="Previous period" onClick={()=>move(-1)}>‹</button><button aria-label="Next period" onClick={()=>move(1)}>›</button></div><h2>{anchor.toLocaleDateString(language,{month:'long',year:'numeric'})}</h2><div className={styles.toolbarEnd}><select aria-label="Calendar view" value={view} onChange={e=>setView(e.target.value as typeof view)}><option value="day">Day</option><option value="month">{t("Month")}</option><option value="week">{t("Week")}</option><option value="agenda">{t("Agenda")}</option></select><button onClick={()=>{setSettings(true);setEditor(false)}}>{t("Settings")}</button><button className={styles.primary} onClick={()=>create()}>+ {t("Create")}</button></div></header>
  <div className={styles.workspace}>
   <aside className={styles.sidebar}><div className={styles.miniHeader}><span>{anchor.toLocaleDateString(language,{month:'short',year:'numeric'})}</span><div><button aria-label="Previous mini month" onClick={()=>setAnchor(day=>new Date(day.getFullYear(),day.getMonth()-1,1))}>‹</button><button aria-label="Next mini month" onClick={()=>setAnchor(day=>new Date(day.getFullYear(),day.getMonth()+1,1))}>›</button></div></div><div className={styles.miniMonth} aria-label="Choose a date">{weekdays.map((d,i)=><b key={i}>{d}</b>)}{monthDays.map(day=><button key={dateKey(day)} className={dateKey(day)===today?styles.today:day.getMonth()!==anchor.getMonth()?styles.outside:''} aria-label={`Go to ${day.toDateString()}`} onClick={()=>{setAnchor(day);setView('week')}}>{day.getDate()}</button>)}</div><h3>{t("My calendar")}</h3>{(['appointment','payment','task'] as const).map(kind=><label className={styles.filter} key={kind}><input type="checkbox" checked={filters[kind]} onChange={e=>setFilters(f=>({...f,[kind]:e.target.checked}))}/><i className={styles[kind]}/>{t(kind==="payment"?"Payments":kind==="task"?"Tasks":"Appointments")}</label>)}<label className={styles.filter}><input type="checkbox" checked={filters.completed} onChange={e=>setFilters(f=>({...f,completed:e.target.checked}))}/>{t("Show completed")}</label><p className={styles.timezone}>{Intl.DateTimeFormat().resolvedOptions().timeZone}</p><p className={styles.hint}>Click a date to create an event. Click an event for details.</p>{canConnect&&<ConnectedCalendarChoices accounts={accountRows} focus={calendarFocus} pending={calendarPending} onFocus={setCalendarFocus} onChange={(...args)=>void calendarPreference(...args)} onSettings={onConnectedSettings}/>}</aside>
   <main className={styles.board}>
    {view==='week'||view==='day'?<CalendarWeek days={days} entries={filtered} language={language} onCreate={create} onSelect={id=>{setSelected(id);setMessage('')}}/>:view==='agenda'?<div className={styles.agenda}>{filtered.filter(x=>days.some(day=>day.getMonth()===anchor.getMonth()&&calendarDayOverlap(x,day))).map(item=><article key={item.id}><time>{new Date(item.dueAt).toLocaleDateString(language,{weekday:'short',month:'short',day:'numeric'})}</time>{chip(item)}</article>)}{!filtered.some(x=>days.some(day=>day.getMonth()===anchor.getMonth()&&calendarDayOverlap(x,day)))&&<p>No events this month. Create an appointment to get started.</p>}</div>:<><div className={styles.weekdays}>{weekdays.map(day=><b key={day}>{day}</b>)}</div><div className={styles.grid}>{days.map(day=>{const key=dateKey(day),events=byDay.get(key)||[];return <div className={`${styles.day} ${day.getMonth()!==anchor.getMonth()?styles.outside:''}`} key={key}><button className={`${styles.date} ${key===today?styles.today:''}`} aria-label={`Create event on ${day.toDateString()}`} onClick={()=>create(day)}>{day.getDate()}</button><div className={styles.dayEvents}>{events.slice(0,4).map(chip)}{events.length>4&&<button className={styles.more} onClick={()=>{setAnchor(day);setView('week')}}>+{events.length-4} more</button>}</div><button className={styles.addSpace} aria-label={`Add event on ${day.toDateString()}`} onClick={()=>create(day)}/></div>})}</div></>}
   </main>
  </div>
  {active&&!editor&&!settings&&<section className={styles.detail} aria-label="Event details"><header><span>{active.cal?active.cal.calendarName+' · '+active.cal.account:active.external?`${active.external==='icloud'?'iCloud':active.external==='google'?'Google':'Outlook'} Calendar`:label(active.kind)}</span><button aria-label="Close event details" onClick={()=>setSelected('')}>×</button></header><h2>{active.title}</h2><p>{active.allDayDate?`${active.allDayDate} · All day`:new Date(active.dueAt).toLocaleString()}{active.kind==='payment'?` · $${active.amount.toFixed(2)}`:''}</p>{active.leadId>0&&<p>{contacts.get(active.leadId)?.name}</p>}{active.cal&&<>{active.cal.busyOnly?<p>Free/busy</p>:<>{active.cal.privacy&&<p>Privacy · {active.cal.privacy}</p>}{active.cal.timezone&&<p>Event time zone · {active.cal.timezone}</p>}{active.cal.location&&<p>{active.cal.location}</p>}{active.cal.meeting&&<p><a href={active.cal.meeting} target="_blank" rel="noreferrer">Join meeting</a></p>}</>}</>}{active.kind==='task'?<p>Manage this scheduled task in Today.</p>:active.external?<p>Read-only · {active.allDay?'All-day event':'Managed in your connected calendar'}</p>:<><p>{active.status==='done'?(active.kind==='payment'?'Marked paid':'Completed'):`Your reminder: ${active.staffReminderMinutes===-1?'off':(active.staffReminderMinutes??15)+' minutes before'}`}</p>{active.reminderState!=='off'&&<p>Customer text: {active.reminderState}</p>}{active.reminderError&&<p role="status">{active.reminderError}</p>}</>}<div className={styles.actions}>{active.kind==='task'?(onOpenToday&&<button type="button" onClick={onOpenToday}>Open Today</button>):active.external?(active.externalUrl&&<a href={active.externalUrl} target="_blank" rel="noreferrer">Open in {active.cal?providerNames[active.cal.provider]:active.external==='icloud'?'iCloud':active.external==='google'?'Google':'Outlook'} ↗</a>):<>{active.leadId>0&&<button onClick={()=>onOpen(active.leadId)}>Contact</button>}{active.status==='open'&&<button disabled={busy||active.reminderState==='sending'} onClick={()=>edit(active)}>Edit</button>}{<>{active.status==='open'&&<button disabled={busy} onClick={()=>void save({action:'complete',id:active.id})}>{active.kind==='payment'?'Mark paid':'Complete'}</button>}{active.reminderState==='pending'&&<button disabled={busy} onClick={()=>void save({action:'cancel-reminder',id:active.id})}>Cancel customer text</button>}<button disabled={busy||active.reminderState==='sending'} onClick={()=>{if(window.confirm('Remove this event and its synced calendar copies?'))void save({action:'delete',id:active.id})}}>Remove</button></>}</>}</div></section>}
  {(editor||settings)&&<div className={styles.backdrop} onMouseDown={e=>{if(e.target===e.currentTarget&&!busy){setEditor(false);setSettings(false)}}}><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="calendar-dialog-title" className={styles.dialog}><header><h2 id="calendar-dialog-title">{settings?'Calendar settings':form.id?'Edit event':'New event'}</h2><button disabled={busy} aria-label="Close calendar dialog" onClick={()=>{setEditor(false);setSettings(false)}}>×</button></header>
   {settings?<><ConversationCalendarSettings/><CalendarConnection/><section><h3>Your device reminders</h3><p>In-app and desktop alerts while Pacifica is running. Phone reminders are in More → Calendar in the Pacifica app.</p><button aria-pressed={deviceAlerts} onClick={()=>void toggleAlerts()}>{deviceAlerts?'Turn off device reminders':'Enable device reminders'}</button><small>Use Google or Pacifica reminders to avoid receiving both.</small></section>{isOwner&&<details><summary>Customer text automation</summary><AutomationStudio profile={profile} onChange={onProfile}/></details>}</>:<form id="calendar-editor" className={styles.form} onSubmit={e=>{e.preventDefault();void save({action:form.id?'edit':'create',...form,leadId:Number(form.leadId),amount:Number(form.amount)||0,dueAt:form.allDayDate?form.allDayDate+'T12:00:00Z':new Date(form.dueAt).toISOString(),reminderAt:form.reminder?new Date(form.reminderAt).toISOString():'',reminderState:form.reminder?'pending':'off'})}}>
    <label className={styles.wide}>Title<input required autoFocus maxLength={100} placeholder="Add a title" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/></label>
    <label>Type<select value={form.kind} onChange={e=>setForm(f=>({...f,kind:e.target.value}))}><option value="appointment">Appointment</option><option value="payment">Payment due</option></select></label><label>Contact<select value={form.leadId} onChange={e=>setForm(f=>({...f,leadId:e.target.value,reminder:e.target.value==='0'?false:f.reminder}))}><option value="0">Personal / no contact</option>{[...contacts.values()].map(lead=><option key={lead.id} value={lead.id}>{lead.name}</option>)}</select></label>
    <label>{form.allDayDate?"Date (all day)":"Date and time"}<input required type={form.allDayDate?"date":"datetime-local"} value={form.allDayDate||form.dueAt} onChange={e=>setForm(f=>form.allDayDate?{...f,allDayDate:e.target.value}:{...f,dueAt:e.target.value})}/></label><label>Duration<select value={form.durationMinutes} onChange={e=>setForm(f=>({...f,durationMinutes:Number(e.target.value)}))}>{[15,30,45,60,90,120].map(minutes=><option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
    <label>Remind me<select value={form.staffReminderMinutes} onChange={e=>setForm(f=>({...f,staffReminderMinutes:Number(e.target.value)}))}>{[[-1,'No reminder'],[0,'At the start'],[5,'5 minutes before'],[15,'15 minutes before'],[30,'30 minutes before'],[60,'1 hour before'],[1440,'1 day before']].map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>{form.kind==='payment'&&<label>Amount due ($)<input type="number" min="0" max="10000000" step="0.01" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/></label>}
    <details className={styles.wide}><summary>Customer text reminder</summary><label className={styles.check}><input type="checkbox" disabled={form.leadId==='0'} checked={form.reminder} onChange={e=>setForm(f=>({...f,reminder:e.target.checked}))}/>Schedule a customer text</label>{form.reminder&&<label>Remind at<input required type="datetime-local" max={form.dueAt} value={form.reminderAt} onChange={e=>setForm(f=>({...f,reminderAt:e.target.value}))}/></label>}<small>Requires a saved contact, text permission, connected texting, and active automation. Cloud checks must be active for reminders to run while the app is closed.</small></details>
    <footer className={styles.wide}><button type="button" disabled={busy} onClick={()=>setEditor(false)}>Cancel</button><button className={styles.primary} disabled={busy}>{busy?'Saving…':form.id?'Save changes':'Save to calendar'}</button></footer>
   </form>}<p role="status">{message}</p>
  </div></div>}
  {calendarNotice&&<p role="status" className={styles.status}>{calendarNotice}</p>}
  {externalMessage&&<p role="status" className={styles.status}>{externalMessage}</p>}
  {!editor&&!settings&&message&&<p role="status" className={styles.status}>{message}</p>}
 </section>;
}
