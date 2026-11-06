import {ScaledText as Text} from "../../src/components/Primitives";
import React,{useCallback,useEffect,useMemo,useRef,useState} from "react";
import { ActivityIndicator, AppState, FlatList, Image, Platform, Pressable, View } from "react-native";
import Animated, {FadeInDown, LinearTransition, useAnimatedStyle} from "react-native-reanimated";
import {useReanimatedKeyboardAnimation} from "react-native-keyboard-controller";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {router,useLocalSearchParams,useFocusEffect} from "expo-router";
import {useAuth} from "@clerk/expo";
import * as WebBrowser from "expo-web-browser";
import {Screen} from "../../src/components/Screen";
import {Avatar,Button,Field,Icon,IconButton,Title,usePalette,useRipple} from "../../src/components/Primitives";
import {clockTime,dayKey,dayLabel,statusIcon} from "../../src/lib/format";
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
 const ripple=useRipple(),insets=useSafeAreaInsets(),mountedAt=useRef(Date.now()).current;
 // Frame-by-frame keyboard height (like Google Messages): the composer rides up with the keyboard instead of
 // staying hidden behind it (Android edge-to-edge no longer resizes the window for the keyboard).
 const {height:keyboard}=useReanimatedKeyboardAnimation();
 const composerPad=useAnimatedStyle(()=>({paddingBottom:Math.max(insets.bottom,-keyboard.value)+8}));
 const data=useMemo(()=>[...thread].reverse(),[thread]);
 if(!lead)return <Screen><Title>Contact unavailable</Title><Button title="Back" onPress={()=>router.back()}/></Screen>;
 const blocked=lead.smsOptOut||lead.doNotCall;
 const when=(m:Communication)=>Date.parse(m.sentAt||m.createdAt||"")||0;
 const side=(m:Communication)=>String(m.direction).includes("inbound");
 const close=(a:Communication,b:Communication)=>side(a)===side(b)&&Math.abs(when(a)-when(b))<5*60_000&&dayKey(when(a))===dayKey(when(b));
 return <Screen scroll={false}>
  <View style={{flexDirection:"row",alignItems:"center",gap:10,paddingHorizontal:8,paddingVertical:6}}>
   <IconButton icon="arrow-left" label="Back to messages" onPress={()=>router.back()}/>
   <Avatar name={lead.name||"?"} size={40}/>
   <View style={{flex:1,gap:1}}><Text numberOfLines={1} style={{color:p.text,fontSize:18,fontWeight:"600"}}>{lead.name}</Text><Text numberOfLines={1} style={{color:p.muted,fontSize:12}}>Your Pacifica business number</Text></View>
   <IconButton icon="account-circle-outline" label="Open contact" onPress={()=>router.push(`/lead/${lead.id}`)}/>
  </View>
  <FlatList data={data} inverted keyExtractor={(m,index)=>String(m.providerId||m.id||index)} initialNumToRender={25} maxToRenderPerBatch={15}
   contentContainerStyle={{paddingHorizontal:12,paddingVertical:10}} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==="ios"?"interactive":"on-drag"}
   refreshing={loading} onRefresh={()=>void load()}
   ListFooterComponent={cursor.before||cursor.providerCursor?<View style={{paddingVertical:8,alignItems:"center"}}><Button title="Older messages" kind="text" compact loading={loading} onPress={()=>void load(cursor)}/></View>:null}
   renderItem={({item,index})=>{
   const incoming=side(item),key=String(item.providerId||item.id),older=data[index+1],newer=data[index-1];
   const newDay=!older||dayKey(when(older))!==dayKey(when(item));
   const joinOlder=!!older&&!newDay&&close(older,item),joinNewer=!!newer&&close(newer,item);
   const big=20,small=6,status=statusIcon(item.status);
   const corners=incoming?{borderTopLeftRadius:joinOlder?small:big,borderBottomLeftRadius:joinNewer?small:big}
                         :{borderTopRightRadius:joinOlder?small:big,borderBottomRightRadius:joinNewer?small:big};
   return <View>
    {newDay?<Text style={{alignSelf:"center",color:p.muted,fontSize:12,fontWeight:"500",marginTop:16,marginBottom:6}}>{dayLabel(when(item))}</Text>:null}
    <Animated.View entering={when(item)>mountedAt?FadeInDown.duration(220):undefined} layout={LinearTransition.duration(180)}
     style={{alignSelf:incoming?"flex-start":"flex-end",maxWidth:"82%",marginTop:joinOlder?2:8}}>
     <Pressable accessibilityHint={incoming&&!blocked?"Long-press to react":undefined} delayLongPress={280} android_ripple={ripple}
      onLongPress={incoming&&!blocked?()=>{void Haptics.selectionAsync();setReacting(reacting===key?"":key)}:undefined}
      style={{paddingVertical:9,paddingHorizontal:14,borderRadius:big,...corners,overflow:"hidden",backgroundColor:incoming?p.card:p.greenSoft,gap:8}}>
      {Boolean(item.body)&&<Text selectable={Platform.OS==="ios"} style={{color:p.text,fontSize:15.5,lineHeight:22}}>{item.body}</Text>}
      {item.attachments?.map(file=>{const uri=file.url.startsWith("/")?API_URL+file.url:file.url;return file.type?.startsWith("image/")?<Image key={uri} accessibilityLabel={file.name||"Attachment"} source={{uri,headers:uri.startsWith(API_URL+"/")?{Authorization:`Bearer ${token}`}:{}}} style={{width:220,height:180,resizeMode:"cover",borderRadius:12}}/>:<Pressable key={uri} onPress={()=>void WebBrowser.openBrowserAsync(uri)} style={{flexDirection:"row",alignItems:"center",gap:6}}><Icon name="paperclip" color={p.green} size={18}/><Text style={{color:p.green}}>{file.name||"Open file"}</Text></Pressable>})}
     </Pressable>
     {!joinNewer?<View style={{flexDirection:"row",alignItems:"center",gap:4,alignSelf:incoming?"flex-start":"flex-end",marginTop:3,marginHorizontal:6}}>
      <Text style={{color:p.muted,fontSize:11}}>{clockTime(when(item))}</Text>
      {!incoming&&status?<Icon name={status.icon} color={status.bad?p.danger:p.muted} size={14}/>:null}
      {!incoming&&status?.bad?<Text style={{color:p.danger,fontSize:11}}>Not delivered</Text>:null}
     </View>:null}
     {reacting===key?<Animated.View entering={FadeInDown.duration(160)} style={{flexDirection:"row",alignItems:"center",marginTop:4,backgroundColor:p.cardHigh,borderRadius:24,paddingHorizontal:4,alignSelf:"flex-start"}}>
      {["👍","❤️","😂","🎉","🙏","😮"].map(emoji=><Pressable key={emoji} accessibilityLabel={`Send ${emoji} reaction as text`} disabled={sending} android_ripple={{borderless:true,radius:22}} onPress={()=>void send(`${emoji} to ${item.body?`“${Array.from(item.body.replace(/\s+/g," ")).slice(0,100).join("")}”`:"your attachment"}`,true)} style={{padding:8}}><Text style={{fontSize:24}}>{emoji}</Text></Pressable>)}
      <IconButton icon="close" label="Close reactions" size={36} color={p.muted} onPress={()=>setReacting("")}/>
     </Animated.View>:null}
    </Animated.View>
   </View>;
  }}/>
  <Animated.View style={[{paddingHorizontal:10,paddingTop:6,gap:6,backgroundColor:p.bg},composerPad]}>
   {error?<Text accessibilityRole="alert" style={{color:p.danger,paddingHorizontal:8}}>{error}</Text>:null}
   {blocked?<Text style={{color:p.muted,paddingHorizontal:8}}>Texting is blocked for this contact.</Text>:null}
   <View style={{flexDirection:"row",alignItems:"flex-end",gap:8}}>
    <Field accessibilityLabel="Message" placeholder="Text message" value={draft} onChangeText={setDraft} editable={!sending&&!blocked} multiline maxLength={1400}
     style={{flex:1,maxHeight:130,minHeight:50,paddingTop:14,paddingBottom:14,borderRadius:26,paddingHorizontal:18,backgroundColor:p.card}}/>
    {sending?<View style={{width:50,height:50,alignItems:"center",justifyContent:"center"}}><ActivityIndicator color={p.green}/></View>
     :<IconButton icon="send" label="Send text" size={50} color={draft.trim()?p.onGreen:p.muted} background={draft.trim()?p.green:p.cardHigh} disabled={blocked||!draft.trim()} onPress={()=>{void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);void send()}}/>}
   </View>
  </Animated.View>
 </Screen>;
}
