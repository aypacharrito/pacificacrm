import {ScaledText as Text} from "../../src/components/Primitives";
import {router,useFocusEffect} from 'expo-router';
import {useAuth} from '@clerk/expo';
import React,{useCallback,useState} from 'react';
import { Linking, View } from "react-native";
import {Screen} from '../../src/components/Screen';
import {Button,Card,Muted,Title,usePalette} from '../../src/components/Primitives';
import {useWorkspace} from '../../src/state/WorkspaceProvider';
import {API_URL} from '../../src/lib/api';

export default function CalendarScreen(){
 const {workspace,calendarReminders,setCalendarReminders,refresh}=useWorkspace(),p=usePalette();
 const {getToken}=useAuth();
 const [outside,setOutside]=useState<Array<{id:string;title:string;dueAt:string;allDay:boolean;external:'google'|'outlook'}>>([]),[externalError,setExternalError]=useState('');
 const loadExternal=useCallback(async()=>{const token=await getToken();if(!token)return;const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),1),end=new Date(now.getFullYear(),now.getMonth()+2,1);const response=await fetch(`${API_URL}/api/calendar/external?${new URLSearchParams({start:start.toISOString(),end:end.toISOString()})}`,{headers:{Authorization:`Bearer ${token}`}}),data=await response.json();if(!response.ok)throw Error('Connected calendars could not load.');return data as {events:typeof outside;errors:string[]}},[getToken]);
 useFocusEffect(useCallback(()=>{let active=true;void loadExternal().then(data=>{if(active&&data){setOutside(data.events);setExternalError(data.errors.join(' '))}}).catch(()=>{if(active)setExternalError('Connected calendars could not load. Refresh to retry.')});return()=>{active=false}},[loadExternal]));
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const items=(workspace.officeItems||[]).filter(item=>item.status==='open'&&(item.leadId===0||workspace.leads.some(lead=>lead.id===item.leadId&&!lead.deletedAt))).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt));
 async function toggle(){setBusy(true);try{await setCalendarReminders(!calendarReminders);setMessage('Reminder preference saved.')}catch(e){setMessage(e instanceof Error?e.message:'Could not enable reminders.')}finally{setBusy(false)}}
 return <Screen><Title eyebrow="YOUR WORKSPACE">Calendar</Title>
  <Card><Muted>Appointments and payment due dates from your CRM. Open an item to see its contact.</Muted><Button title="Refresh calendar" kind="secondary" onPress={()=>void Promise.all([refresh(),loadExternal().then(data=>{if(data){setOutside(data.events);setExternalError(data.errors.join(' '))}})]).catch(()=>setMessage('Calendar refresh failed. Try again.'))}/></Card>
  <Card><View style={{gap:12}}><Text style={{color:p.text,fontWeight:'800'}}>Phone reminders</Text><Muted>Schedule the next 60 reminders on this phone, including while Pacifica is closed. Open the app after changes on another device to refresh them.</Muted><Button loading={busy} title={calendarReminders?'Turn off phone reminders':'Enable phone reminders'} onPress={()=>void toggle()}/>{message?<Muted>{message}</Muted>:null}</View></Card>
  <Card><View style={{gap:12}}><Text style={{color:p.text,fontWeight:'800'}}>Connected calendars</Text><Muted>Connect Google or Outlook in the web CRM when ready. Their calendar apps can notify you without opening Pacifica.</Muted><Button kind="secondary" title="Open CRM calendar" onPress={()=>void Linking.openURL(`${API_URL}/dashboard?calendar=open`)}/></View></Card>
  {items.map(item=><Card key={item.id}><View style={{gap:10}}><Text style={{color:p.text,fontSize:18,fontWeight:'800'}}>{item.title}</Text><Muted>{new Date(item.dueAt).toLocaleString()}{item.kind==='payment'?` · $${item.amount.toFixed(2)}`:''}</Muted><Muted>{workspace.leads.find(lead=>lead.id===item.leadId)?.name||(item.leadId===0?'Personal appointment':'Contact unavailable')}</Muted><Button kind="secondary" title="Open contact" disabled={item.leadId===0} onPress={()=>router.push(`/lead/${item.leadId}`)}/></View></Card>)}
  {outside.length>0&&<Title>Connected events</Title>}{outside.map(item=><Card key={item.id}><Text style={{color:p.text,fontSize:18,fontWeight:'800'}}>{item.title}</Text><Muted>{item.allDay?new Date(item.dueAt).toLocaleDateString()+' · All day':new Date(item.dueAt).toLocaleString()} · {item.external==='google'?'Google':'Outlook'} · Read-only</Muted></Card>)}
  {externalError?<Muted>{externalError}</Muted>:null}
  {!items.length&&<Card><Muted>No open appointments or payments. Add one in the CRM calendar.</Muted></Card>}
 </Screen>;
}
