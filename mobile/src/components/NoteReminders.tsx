import React,{useCallback,useMemo,useRef,useState} from "react";
import {AppState,Pressable,Text,View} from "react-native";
import {useFocusEffect,router} from "expo-router";
import {useAuth} from "@clerk/expo";
import {crmRequest} from "../lib/api";
import {useWorkspace} from "../state/WorkspaceProvider";
import {Avatar,Button,Card,Chip,Muted,useDisplayScale,usePalette} from "./Primitives";
type Task={id:string;title:string;leadId:number;status:string;dueAt:string;snoozedUntil:string};
type Snapshot={items:Task[];error?:string;review?:{error?:string}};
export default function NoteReminders(){
 const p=usePalette(),scale=useDisplayScale(),{getToken}=useAuth(),{workspace}=useWorkspace();
 const [items,setItems]=useState<Task[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false),[view,setView]=useState("Today"),[now,setNow]=useState(Date.now);
 const active=useRef(false),running=useRef(false);
 const load=useCallback(async(action="",id?:string)=>{
  if(running.current)return;running.current=true;if(active.current)setBusy(true);
  try{const token=await getToken();if(!token)throw Error("Sign in to see reminders.");
   const result=await crmRequest<Snapshot>(token,"/api/crm/note-reminders",action?{action,id,hours:24}:undefined);
   if(active.current){setItems(result.items||[]);setNow(Date.now());setError(result.error||result.review?.error||"")}
  }catch(e){if(active.current)setError(e instanceof Error?e.message:"Reminders could not load.")}
  finally{running.current=false;if(active.current)setBusy(false)}
 },[getToken]);
 useFocusEffect(useCallback(()=>{
  active.current=true;void load().then(()=>{if(active.current)void load("review")});
  const timer=setInterval(()=>{if(AppState.currentState==="active")void load("review")},60000);
  return()=>{active.current=false;clearInterval(timer)};
 },[load]));
 const names=useMemo(()=>new Map(workspace.leads.map(l=>[l.id,l.name])),[workspace.leads]);
 const isDue=(t:Task)=>t.status==="open"&&(!t.dueAt||Date.parse(t.dueAt)<=now)&&(!t.snoozedUntil||Date.parse(t.snoozedUntil)<=now);
 const shown=items.filter(t=>view==="Done"?t.status==="done":view==="Later"?t.status==="open"&&!isDue(t):isDue(t));
 const dueCount=items.filter(isDue).length;
 return <Card style={{gap:12*scale}}>
  <View style={{flexDirection:"row",alignItems:"center",gap:10}}>
   <Text style={{color:p.text,fontWeight:"700",fontSize:18*scale,flex:1}}>From your notes</Text>
   {dueCount?<View style={{minWidth:26,height:26,borderRadius:13,paddingHorizontal:8,backgroundColor:p.green,alignItems:"center",justifyContent:"center"}}><Text style={{color:p.onGreen,fontWeight:"700",fontSize:13}}>{dueCount}</Text></View>:null}
  </View>
  <View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{["Today","Later","Done"].map(label=><Chip key={label} label={label} selected={view===label} onPress={()=>setView(label)}/>)}</View>
  {error?<Text accessibilityRole="alert" style={{color:p.danger}}>{error}</Text>:null}
  {shown.slice(0,20).map(t=>{const name=names.get(t.leadId)||"Contact";return <View key={t.id} style={{gap:10*scale,paddingTop:12*scale,borderTopWidth:1,borderTopColor:p.border}}>
   <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name}`} onPress={()=>router.push(`/lead/${t.leadId}`)} style={{flexDirection:"row",alignItems:"center",gap:12}}>
    <Avatar name={name} size={40}/>
    <View style={{flex:1,gap:2}}><Text numberOfLines={1} style={{color:p.text,fontWeight:"600",fontSize:16*scale}}>{name}</Text><Text style={{color:p.muted,fontSize:14*scale,lineHeight:19*scale}}>{t.title}</Text></View>
   </Pressable>
   <View style={{flexDirection:"row",gap:8,paddingLeft:52}}>{t.status==="done"
    ?<Button title="Undo" kind="tonal" icon="undo" compact disabled={busy} onPress={()=>void load("reopen",t.id)}/>
    :<><Button title="Done" kind="tonal" icon="check" compact disabled={busy} onPress={()=>void load("done",t.id)}/><Button title="Tomorrow" kind="text" icon="clock-outline" compact disabled={busy} onPress={()=>void load("snooze",t.id)}/></>}</View>
  </View>})}
  {!shown.length?<Muted>{busy?"Reviewing notes…":view==="Today"?"You're all caught up.":"No reminders here."}</Muted>:null}
  {shown.length>20?<Muted>{shown.length-20} more will appear as you finish these.</Muted>:null}
 </Card>;
}
