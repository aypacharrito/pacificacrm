import React,{useEffect,useState} from "react";
import {Alert,View,type ColorValue} from "react-native";
import Slider from "@react-native-community/slider";
// 5.2's native implementation accepts ColorValue; its compatibility .d.ts still says string.
const NativeSlider=Slider as React.ComponentType<Omit<React.ComponentProps<typeof Slider>,'minimumTrackTintColor'|'thumbTintColor'>&{minimumTrackTintColor?:ColorValue;thumbTintColor?:ColorValue}>;
import {Button,Muted,ScaledText as Text,previewDisplayScale,savedDisplayScale,usePalette} from "./Primitives";
import {useWorkspace} from "../state/WorkspaceProvider";

export default function DisplaySizeSlider(){
  const p=usePalette(),{workspace,updateProfile}=useWorkspace();
  const saved=savedDisplayScale(workspace.profile),[draft,setDraft]=useState<number|null>(null);
  useEffect(()=>()=>previewDisplayScale(null),[]);
  const preview=(value:number)=>{setDraft(value);previewDisplayScale(value)};
  async function save(value:number){
    const size=Math.min(125,Math.max(80,Math.round(value/5)*5));
    preview(size);
    try{await updateProfile({displayScale:size,displaySize:"large"})}
    catch{Alert.alert("Size could not save","Please try again. Your previous size is still available.")}
    finally{previewDisplayScale(null);setDraft(null)}
  }
  return <View style={{gap:8}}>
    <View style={{flexDirection:"row",alignItems:"center",gap:10}}><Text style={{color:p.text,fontWeight:"700",flex:1}}>Text & spacing</Text><Text style={{color:p.green,fontWeight:"700"}}>{draft??saved}%</Text><Button title="Reset" kind="secondary" onPress={()=>void save(90)}/></View>
    <Muted>Resize text, spacing and the keypad together.</Muted>
    <NativeSlider accessibilityLabel="Text and spacing" accessibilityValue={{min:80,max:125,now:draft??saved,text:`${draft??saved} percent`}} minimumValue={80} maximumValue={125} step={5} value={draft??saved} onValueChange={preview} onSlidingComplete={value=>void save(value)} minimumTrackTintColor={p.green} maximumTrackTintColor={p.border} thumbTintColor={p.green} style={{height:48,width:"100%"}}/>
    <View style={{flexDirection:"row",justifyContent:"space-between"}}><Muted>Compact</Muted><Muted>Roomy</Muted></View>
  </View>;
}
