import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {AppState,Modal,PermissionsAndroid,Platform,Pressable,Text,View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useAuth} from '@clerk/expo';
import type {Voice,Call,CallInvite} from '@twilio/voice-react-native-sdk';
import {crmRequest} from '../lib/api';
import {useWorkspace} from './WorkspaceProvider';
import {usePalette} from '../components/Primitives';
import PostCallNotes,{type CallNoteDraft} from '../components/PostCallNotes';
type Credentials={token:string;routeToken:string;phoneNumber:string;identity:string;expiresIn:number};
type NativeVoice={status:'off'|'starting'|'ready'|'error';notice:string;available:boolean;busy:boolean;enable:()=>Promise<void>;disable:()=>Promise<void>;call:(number:string)=>Promise<void>};
const Context=createContext<NativeVoice|null>(null);
const digits=(value:string)=>value.replace(/\D/g,'').slice(-10);
export const useNativeVoice=()=>{const value=useContext(Context);if(!value)throw Error('Native voice provider is missing');return value};

export function NativeVoiceProvider({children}:{children:React.ReactNode}){
 const {isSignedIn,userId,getToken}=useAuth({treatPendingAsSignedOut:false});
 const {workspace}=useWorkspace(),palette=usePalette();
 const workspaceRef=useRef(workspace);workspaceRef.current=workspace;
 const getTokenRef=useRef(getToken);getTokenRef.current=getToken;
 const voice=useRef<Voice|null>(null),sdk=useRef<typeof import('@twilio/voice-react-native-sdk')|null>(null),credentials=useRef<Credentials|null>(null);
 const active=useRef<Call|null>(null),invite=useRef<CallInvite|null>(null),generation=useRef(0),starting=useRef(false),enabled=useRef(false);
 const [status,setStatus]=useState<NativeVoice['status']>('off'),[notice,setNotice]=useState('Native Android calls are off.'),[number,setNumber]=useState(''),[busy,setBusy]=useState(false),[panel,setPanel]=useState(false),[ringing,setRinging]=useState(false),[muted,setMuted]=useState(false);
 const [callNote,setCallNote]=useState<CallNoteDraft|null>(null);
 const preference=`pacifica:${userId||'signed-out'}:native-voice`;
 const showError=(error:unknown)=>{setStatus('error');setNotice(error instanceof Error?error.message:'Native calling could not connect.');};
 function attachCall(call:Call,dialedNumber?:string){
  if(!sdk.current||active.current===call)return;
  active.current=call;invite.current=null;setRinging(false);setBusy(true);setPanel(true);
  const external=dialedNumber||([call.getFrom(),call.getTo()].find(v=>v&&/^\+?\d{10,15}$/.test(v))||number);
  setNumber(external);let connected=call.getState()==='connected';setNotice(connected?'Connected':'Connecting…');
  call.on(sdk.current.Call.Event.Connected,()=>{connected=true;setNotice('Connected')});
  const finish=()=>{if(active.current!==call)return;active.current=null;setBusy(false);setPanel(false);setMuted(false);setNotice(enabled.current?'Ready for incoming calls':'Native Android calls are off.');
   if(connected){const matches=workspaceRef.current.leads.filter(l=>!l.deletedAt&&digits(l.phone)===digits(external));setCallNote({key:'mobile:'+Date.now()+'-'+Math.random().toString(36).slice(2),number:external,leadId:matches.length===1?matches[0]!.id:null,notes:'',outcome:'Completed'})}
  };
  call.on(sdk.current.Call.Event.Disconnected,finish);
  call.on(sdk.current.Call.Event.ConnectFailure,error=>{finish();showError(error)});
 }
 async function initialize(){
  if(voice.current)return voice.current;
  const module=await import('@twilio/voice-react-native-sdk');sdk.current=module;const driver=new module.Voice();voice.current=driver;
  driver.on(module.Voice.Event.Error,showError);
  driver.addListener(module.Voice.Event.CallInvite,(pending:CallInvite)=>{
   if(!enabled.current||active.current){void pending.reject();return;}
   invite.current=pending;setRinging(true);setBusy(true);setPanel(true);setNumber(pending.getFrom());setNotice('Incoming Pacifica call');
   pending.on(module.CallInvite.Event.Accepted,attachCall);
   const clear=()=>{if(invite.current!==pending)return;invite.current=null;setRinging(false);setBusy(false);setPanel(false);};
   pending.on(module.CallInvite.Event.Cancelled,clear);pending.on(module.CallInvite.Event.Rejected,clear);
  });
  return driver;
 }
 async function permissions(prompt:boolean){
  const needed=[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,...(Number(Platform.Version)>=33?[PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS]:[])];
  for(const permission of needed){if(await PermissionsAndroid.check(permission))continue;if(!prompt||await PermissionsAndroid.request(permission)!==PermissionsAndroid.RESULTS.GRANTED)throw Error('Allow microphone and call notifications on this phone to receive Pacifica calls.');}
 }
 const register=useCallback(async(prompt=false)=>{
  if(Platform.OS!=='android'||!isSignedIn||starting.current)return;
  const run=generation.current;starting.current=true;setStatus('starting');setNotice('Connecting native calls…');
  try{
   await permissions(prompt);const auth=await getTokenRef.current();if(!auth)throw Error('Sign in before enabling calls.');
   const next=await crmRequest<Credentials>(auth,'/api/twilio/token?platform=android');if(run!==generation.current)return;
   const driver=await initialize();if(run!==generation.current)return;credentials.current=next;enabled.current=true;
   await driver.register(next.token);
   if(run!==generation.current){await driver.unregister(next.token).catch(()=>{});return;}
   setStatus('ready');setNotice('Ready for incoming calls');
   for(const pending of (await driver.getCallInvites()).values())driver.emit(sdk.current!.Voice.Event.CallInvite,pending);
   for(const call of (await driver.getCalls()).values())if(call.getState()!=='disconnected'){attachCall(call);break;}
  }catch(error){if(run===generation.current){enabled.current=false;showError(error)}}finally{starting.current=false;}
 // Authentication identity changes always tear down old bindings below.
 },[isSignedIn]);
 const registerRef=useRef(register);registerRef.current=register;
 useEffect(()=>{
  generation.current++;let alive=true;enabled.current=false;
  if(isSignedIn&&Platform.OS==='android')void AsyncStorage.getItem(preference).then(value=>{if(alive&&value==='on')void registerRef.current(false)});
  const foreground=AppState.addEventListener('change',state=>{if(state==='active'&&enabled.current)void registerRef.current(false)});
  const refresh=setInterval(()=>{if(enabled.current&&AppState.currentState==='active')void registerRef.current(false)},45*60_000);
  return()=>{alive=false;generation.current++;enabled.current=false;foreground.remove();clearInterval(refresh);const driver=voice.current,previous=credentials.current;void active.current?.disconnect();void invite.current?.reject();if(driver&&previous)void driver.unregister(previous.token).catch(()=>{});driver?.removeAllListeners();voice.current=null;credentials.current=null;active.current=null;invite.current=null;setBusy(false);setPanel(false);setCallNote(null);setStatus('off');};
 },[userId,isSignedIn,preference]);
 async function enable(){await AsyncStorage.setItem(preference,'on');await register(true)}
 async function disable(){
  if(active.current)throw Error('End the active call before turning incoming calls off.');
  await AsyncStorage.setItem(preference,'off');enabled.current=false;generation.current++;
  try{if(voice.current&&credentials.current)await voice.current.unregister(credentials.current.token)}
  finally{setStatus('off');setNotice('Native Android calls are off.');}
 }
 async function connect(value:string){
  if(active.current||invite.current)throw Error('Finish the current call first.');if(callNote)throw Error('Save or skip your after-call notes first.');const phone=digits(value);if(phone.length!==10)throw Error('Enter a US or Canadian phone number.');
  if(workspaceRef.current.leads.some(l=>digits(l.phone)===phone&&(l.doNotCall||l.deletedAt)))throw Error('This contact is marked Do Not Call.');
  await permissions(true);const auth=await getTokenRef.current();if(!auth)throw Error('Sign in before calling.');
  const next=await crmRequest<Credentials>(auth,'/api/twilio/token?platform=android'),driver=await initialize();credentials.current=next;
  const call=await driver.connect(next.token,{notificationDisplayName:'Pacifica',params:{To:'+1'+phone,RouteToken:next.routeToken,RingTimeout:'20'}});setNumber('+1'+phone);attachCall(call,'+1'+phone);
 }
 const contact=workspace.leads.find(l=>digits(l.phone)===digits(number));
 const button=(label:string,onPress:()=>void,danger=false)=><Pressable accessibilityRole="button" onPress={onPress} style={{minHeight:52,alignItems:'center',justifyContent:'center',padding:16,borderRadius:12,backgroundColor:danger?palette.danger:palette.green,flex:1}}><Text style={{fontWeight:'700',color:'#fff'}}>{label}</Text></Pressable>;
 return <Context.Provider value={{status,notice,available:Platform.OS==='android',busy,enable,disable,call:connect}}><View style={{flex:1}}>{children}{busy&&!panel&&<Pressable onPress={()=>setPanel(true)} style={{backgroundColor:palette.card,padding:16}}><Text style={{color:palette.green}}>Pacifica call · {contact?.name||number} · Open controls</Text></Pressable>}</View><Modal visible={panel&&busy} onRequestClose={()=>setPanel(false)} animationType="slide" presentationStyle="fullScreen"><View style={{flex:1,backgroundColor:palette.bg,padding:28,justifyContent:'center',gap:24}}><Text style={{color:palette.muted,letterSpacing:3,fontSize:11}}>PACIFICA CALL</Text><Text style={{color:palette.text,fontSize:36,fontWeight:'600'}}>{contact?.name||number}</Text><Text style={{color:palette.muted,fontSize:18}}>{notice}</Text><View style={{flexDirection:'row',gap:12}}>{ringing?<>{button('Decline',()=>void invite.current?.reject(),true)}{button('Answer',()=>void invite.current?.accept().then(attachCall).catch(showError))}</>:<>{button(muted?'Unmute':'Mute',()=>{const next=!muted;void active.current?.mute(next).then(()=>setMuted(next))})}{button('End call',()=>void active.current?.disconnect(),true)}</>}</View><Pressable onPress={()=>setPanel(false)} style={{minHeight:44,alignItems:'center',justifyContent:'center'}}><Text style={{color:palette.muted}}>Back to workspace</Text></Pressable></View></Modal><PostCallNotes key={userId||'signed-out'} draft={callNote} onChange={setCallNote}/></Context.Provider>;
}
