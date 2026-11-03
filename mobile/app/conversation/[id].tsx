import {ScaledText as Text} from "../../src/components/Primitives";
import React,{useCallback,useEffect,useMemo,useRef,useState} from "react";
import { AppState, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import {router,useLocalSearchParams,useFocusEffect} from "expo-router";
import {useAuth} from "@clerk/expo";
import * as WebBrowser from "expo-web-browser";
import {Screen} from "../../src/components/Screen";
import {Button,Field,Muted,Title,usePalette} from "../../src/components/Primitives";
import {useWorkspace} from "../../src/state/WorkspaceProvider";
import {API_URL,crmRequest} from "../../src/lib/api";
import type {Communication} from "../../src/lib/types";
const merge=(old:Communication[],next:Communication[])=>Array.from(new Map([...old,...next].map(m=>[m.providerId||m.id,m])).values()).sort((a,b)=>Date.parse(a.sentAt||"")-Date.parse(b.sentAt||""));
export default function ConversationScreen(){const {id}=useLocalSearchParams<{id:string}>(),{userId}=useAuth();return <Conversation key={`${userId}:${id}`} id={Number(id)}/>;}
function Conversation({id}:{id:number}){
 const p=usePalette(),{getToken}=useAuth(),{workspace,refresh}=useWorkspace();
 const lead=workspace.leads.find(l=>l.id===id&&!l.deletedAt);
 const [messages,setMessages]=useState<Communication[]>([]),[draft,setDraft]=useState(""),[error,setError]=useState(""),[sending,setSending]=useState(false),[loading,setLoading]=useState(false),[reacting,setReacting]=useState(""),[token,setToken]=useState("");
 const [cursor,setCursor]=useState<{before?:string;providerCursor?:string}>({});
 const requestRef=useRef(false),loadingRef=useRef(false),pagedBack=useRef(false),alive=useRef(true),latestToken=useRef(getToken);
 useEffect(()=>{latestToken.current=getToken},[getToken]);
 const load=useCallback(async(older?:{before?:string;providerCursor?:string})=>{
  if(loadingRef.current)return;loadingRef.current=true;setLoading(true);
  try{const jwt=await latestToken.current();if(!jwt)throw Error("Sign in to open messages.");const params=new URLSearchParams({leadId:String(id),channel:"sms",sync:"1",...older});const result=await crmRequest<{messages:Communication[];nextCursor?:string;providerCursor?:string}>(jwt,`/api/conversations?${params}`);
   if(alive.current){setToken(jwt);setMessages(old=>merge(old,result.messages||[]));if(older||!pagedBack.current){setCursor({before:result.nextCursor||undefined,providerCursor:result.providerCursor||undefined});if(older)pagedBack.current=true}setError("");}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:"Messages could not load.")}finally{loadingRef.current=false;if(alive.current)setLoading(false)}
 },[id]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useFocusEffect(useCallback(()=>{void load();const timer=setInterval(()=>{if(AppState.currentState==="active")void load()},15000);return()=>clearInterval(timer)},[load]));
 const thread=useMemo(()=>merge((lead?.communications||[]).filter(m=>m.channel==="sms"),messages),[lead?.communications,messages]);
 async function send(text=draft,reaction=false){
  if(requestRef.current||!lead||!text.trim())return;requestRef.current=true;setSending(true);setError("");
  try{if(lead.smsOptOut||lead.doNotCall)throw Error("This contact opted out or is marked Do Not Call.");const jwt=await getToken();if(!jwt)throw Error("Sign in to send.");const result=await crmRequest<{message:Communication}>(jwt,"/api/twilio/messages",{to:lead.phone,body:text,sendMode:"manual"});
   if(alive.current){setMessages(old=>merge(old,[{...result.message,channel:"sms",direction:"outbound"}]));if(!reaction)setDraft("");setReacting("");}void refresh();
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:"Text could not be submitted. Your draft is still here.")}finally{requestRef.current=false;if(alive.current)setSending(false)}
 }
 if(!lead)return <Screen><Title>Contact unavailable</Title><Button title="Back" onPress={()=>router.back()}/></Screen>;
 const blocked=lead.smsOptOut||lead.doNotCall;
 return <Screen scroll={false}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":undefined}>
  <View style={{padding:16,gap:6}}><Pressable accessibilityRole="button" onPress={()=>router.back()}><Text style={{color:p.green}}>‹ Messages</Text></Pressable><Title>{lead.name}</Title><Muted>From your Pacifica business number</Muted></View>
  <FlatList data={[...thread].reverse()} inverted keyExtractor={(m,index)=>String(m.providerId||m.id||index)} initialNumToRender={25} maxToRenderPerBatch={15} contentContainerStyle={{padding:16,gap:10}} refreshing={loading} onRefresh={()=>void load()} ListFooterComponent={cursor.before||cursor.providerCursor?<Button title="Older messages" kind="secondary" loading={loading} onPress={()=>void load(cursor)}/>:null} renderItem={({item})=>{
   const incoming=String(item.direction).includes("inbound"),key=String(item.providerId||item.id);
   return <View style={{alignSelf:incoming?"flex-start":"flex-end",maxWidth:"90%",padding:13,borderRadius:16,backgroundColor:incoming?p.card:p.greenSoft,gap:8}}>
    {Boolean(item.body)&&<Text selectable style={{color:p.text,fontSize:15,lineHeight:22}}>{item.body}</Text>}
    {item.attachments?.map(file=>{const uri=file.url.startsWith("/")?API_URL+file.url:file.url;return file.type?.startsWith("image/")?<Image key={uri} accessibilityLabel={file.name||"Attachment"} source={{uri,headers:uri.startsWith(API_URL+"/")?{Authorization:`Bearer ${token}`}:{}}} style={{width:220,height:180,resizeMode:"contain",borderRadius:8}}/>:<Pressable key={uri} onPress={()=>void WebBrowser.openBrowserAsync(uri)}><Text style={{color:p.green}}>📎 {file.name||"Open file"}</Text></Pressable>})}
    <Text style={{color:p.muted,fontSize:11}}>{new Date(item.sentAt||item.createdAt||"").toLocaleString()} · {item.status}</Text>
    {incoming&&!blocked&&<Pressable accessibilityRole="button" disabled={sending} onPress={()=>setReacting(reacting===key?"":key)}><Text style={{color:p.muted}}>React</Text></Pressable>}
    {reacting===key&&<><View style={{flexDirection:"row",flexWrap:"wrap"}}>{["👍","❤️","😂","🎉","🙏","😮"].map(emoji=><Pressable key={emoji} accessibilityLabel={`Send ${emoji} reaction as text`} disabled={sending} onPress={()=>void send(`${emoji} to ${item.body?`“${Array.from(item.body.replace(/\s+/g," ")).slice(0,100).join("")}”`:"your attachment"}`,true)} style={{padding:10}}><Text style={{fontSize:23}}>{emoji}</Text></Pressable>)}</View><Muted>Sent as a text reply</Muted></>}
   </View>;
  }}/>
  <View style={{padding:14,gap:8,backgroundColor:p.bg}}>{error?<Text accessibilityRole="alert" style={{color:p.danger}}>{error}</Text>:null}{blocked?<Muted>Texting is blocked for this contact.</Muted>:null}<Field accessibilityLabel="Message" placeholder="Write a text…" value={draft} onChangeText={setDraft} editable={!sending&&!blocked} multiline maxLength={1400} style={{maxHeight:120,paddingVertical:12}}/><Button title="Send text" disabled={blocked||!draft.trim()} loading={sending} onPress={()=>void send()}/></View>
 </KeyboardAvoidingView></Screen>;
}
