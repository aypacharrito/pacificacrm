import {ScaledText as Text} from "../../src/components/Primitives";
import React,{useEffect,useRef,useState} from "react";
import { Image, View } from "react-native";
import {useAuth} from "@clerk/expo";
import {router} from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {manipulateAsync,SaveFormat} from "expo-image-manipulator";
import {Screen} from "../../src/components/Screen";
import {Button,Card,Field,Muted,Title,usePalette} from "../../src/components/Primitives";
import {useWorkspace} from "../../src/state/WorkspaceProvider";
import {scanContactDocument,askPacifica,getWorkspace,putWorkspace,type MobileAiResult} from "../../src/lib/api";
import {documentContactFields,capturedContact,cleanContactDraft,matchingContact,type ContactDraft} from "../../src/lib/contact-capture";

export default function AiScreen(){const {userId}=useAuth();return <AiWorkspace key={userId||"signed-out"}/>;}
function AiWorkspace(){
  const p=usePalette(),{getToken,userId}=useAuth(),{workspace,refresh}=useWorkspace();
  const [prompt,setPrompt]=useState(""),[photo,setPhoto]=useState<string>(),[result,setResult]=useState<MobileAiResult>();
  const [draft,setDraft]=useState<ContactDraft>(),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState<number>();
  const inFlight=useRef(false),saveId=useRef(0);
  const owner=useRef(userId);useEffect(()=>{owner.current=userId;return()=>{owner.current=undefined}},[userId]);
  async function pick(camera:boolean){
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError("");
    try{
      if(camera){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted)throw new Error("Allow camera access in phone settings, or choose a photo instead.");}
      const selected=camera?await ImagePicker.launchCameraAsync({mediaTypes:["images"],quality:1}):await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],quality:1,selectionLimit:1});
      if(selected.canceled)return;
      const asset=selected.assets[0];if(!asset)throw new Error("No photo selected.");const scale=Math.min(1,1800/Math.max(asset.width,asset.height));
      const image=await manipulateAsync(asset.uri,[{resize:{width:Math.max(1,Math.round(asset.width*scale)),height:Math.max(1,Math.round(asset.height*scale))}}],{compress:.75,format:SaveFormat.JPEG,base64:true});
      if(!image.base64||image.base64.length>2_500_000)throw new Error("Photo is too large. Crop closer to the contact details and try again.");
      setPhoto(`data:image/jpeg;base64,${image.base64}`);setDraft(undefined);setSaved(undefined);setResult(undefined);
      setPrompt("Create a contact draft from the visible name, phone number and other contact details. Leave anything unreadable blank.");
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not open this photo.")}
    finally{inFlight.current=false;setBusy(false);}
  }
  async function analyze(){
    if(inFlight.current||(!prompt.trim()&&!photo))return;
    const account=userId;inFlight.current=true;setBusy(true);setError("");setSaved(undefined);
    try{
      const token=await getToken();if(!token)throw new Error("Sign in to use Pacifica AI.");
      let answer:MobileAiResult;
      if(photo){const scan=await scanContactDocument(token,photo),e=scan.extraction;
        answer={summary:"Document details are ready to review.",notice:[scan.notice,scan.missingFields?.length?`Check missing or unreadable fields: ${scan.missingFields.join(", ")}`:""].filter(Boolean).join(" "),createLead:cleanContactDraft({...e,name:String(e.fullName||[e.firstName,e.middleName,e.lastName].filter(Boolean).join(" ")),vehicle:[e.vehicleYear,e.vehicleMake,e.vehicleModel].filter(Boolean).join(" "),line:"home-auto",notes:Array.isArray(e.otherFields)?e.otherFields.map((f:{label:string;value:string})=>`${f.label}: ${f.value}`).join("\n"):""})};
      }else answer=await askPacifica(token,prompt,undefined,workspace);
      if(owner.current!==account)return;
      setResult(answer);setDraft(answer.createLead?cleanContactDraft(answer.createLead):undefined);saveId.current=Date.now();
    }catch(reason){setError(reason instanceof Error?reason.message:"AI could not read this photo. Try again.");}
    finally{inFlight.current=false;setBusy(false);}
  }
  async function save(){
    if(!draft||inFlight.current||saved)return;
    const account=userId;inFlight.current=true;setBusy(true);setError("");
    try{
      const contact=capturedContact(draft,saveId.current),token=await getToken();if(!token)throw new Error("Sign in before saving.");
      const latest=await getWorkspace(token);if(owner.current!==account)return;
      const duplicate=matchingContact(latest.leads,draft);
      if(duplicate){setError(duplicate.deletedAt?"This contact already exists in deleted contacts. Restore it in Contacts instead of creating a duplicate.":"This number or email already belongs to a contact. Open the existing contact instead.");if(!duplicate.deletedAt)setSaved(duplicate.id);return;}
      if(latest.leads.length>=5000)throw new Error("Your workspace contact limit has been reached. Manage contacts before adding another.");
      await putWorkspace(token,{...latest,leads:[contact,...latest.leads]});
      if(owner.current!==account)return;
      setSaved(contact.id);setPhoto(undefined);await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not save. Your draft is still here; retry when online.");}
    finally{inFlight.current=false;setBusy(false);}
  }
  return <Screen>
    <Title eyebrow="PACIFICA AI">Capture a contact</Title>
    <Muted>Take a photo of a number or business card, then check the details and save. Or ask AI about your CRM.</Muted>
    <View style={{gap:10,flexDirection:"row"}}><Button title="Take photo" disabled={busy} onPress={()=>void pick(true)} style={{flex:1}}/><Button title="Choose photo" kind="secondary" disabled={busy} onPress={()=>void pick(false)} style={{flex:1}}/></View>
    {photo?<Card><Image accessibilityLabel="Photo to read" source={{uri:photo}} style={{height:180,width:"100%",resizeMode:"contain"}}/><Button title="Remove photo" kind="secondary" disabled={busy} onPress={()=>setPhoto(undefined)}/></Card>:null}
    <Field accessibilityLabel="Ask Pacifica AI" multiline value={prompt} editable={!busy} onChangeText={setPrompt} placeholder="Read this number, prepare a contact, or help me follow up…" style={{minHeight:100,paddingVertical:12}}/>
    <Muted>Your selected photo is sent to Pacifica AI when you tap below.</Muted>
    <Button title={photo?"Read photo":"Ask Pacifica AI"} loading={busy} disabled={!photo&&!prompt.trim()} onPress={()=>void analyze()}/>
    {error?<Text accessibilityRole="alert" style={{color:p.danger}}>{error}</Text>:null}
    {result?<Card><Text style={{color:p.text}}>{result.summary}</Text>{result.notice?<Muted>{result.notice}</Muted>:null}{result.draft?<Text selectable style={{color:p.text}}>{result.draft}</Text>:null}</Card>:null}
    {draft&&!saved?<Card><Title eyebrow="REVIEW BEFORE SAVING">Contact details</Title>
      {(["name","phone","email","city","state",...documentContactFields,"product","notes"] as const).map(key=><View key={key} style={{gap:5,marginTop:10}}><Muted>{key.charAt(0).toUpperCase()+key.slice(1)}</Muted><Field accessibilityLabel={key} value={draft[key]} editable={!busy} onChangeText={value=>setDraft(current=>current?{...current,[key]:value}:current)} keyboardType={key==="phone"?"phone-pad":key==="email"?"email-address":"default"} autoCapitalize={key==="email"?"none":"sentences"} multiline={key==="notes"}/></View>)}
      <View style={{gap:8,marginVertical:12}}><Muted>Contact queue</Muted><Button title={draft.line==="home-auto"?"✓ Home & Auto":"Home & Auto"} kind="secondary" disabled={busy} onPress={()=>setDraft({...draft,line:"home-auto"})}/><Button title={draft.line==="life"?"✓ Life / Priority":"Life / Priority"} kind="secondary" disabled={busy} onPress={()=>setDraft({...draft,line:"life"})}/></View>
      <Button title="Save contact" loading={busy} onPress={()=>void save()}/>
    </Card>:null}
    {saved?<Card><Muted>Contact available in Pacifica.</Muted><Button title="Open contact" onPress={()=>router.push({pathname:"/lead/[id]",params:{id:String(saved)}})}/></Card>:null}
    {result?.priorities?.map(item=><Card key={item.leadId}><Text style={{color:p.text,fontWeight:"700"}}>{item.leadName}</Text><Muted>{item.reason} {item.nextStep}</Muted><Button title="Open contact" kind="secondary" onPress={()=>router.push({pathname:"/lead/[id]",params:{id:String(item.leadId)}})}/></Card>)}
  </Screen>;
}
