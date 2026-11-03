"use client";
import {useEffect,useLayoutEffect,useReducer,useState} from "react";
import type {WorkspaceProfile} from "../lib/workspace-profile";
import {applyWorkspaceAppearance,resolvedWorkspaceTheme,watchDeviceAppearance} from "../lib/workspace-appearance";
export function useWorkspaceAppearance(profile:WorkspaceProfile,hydrated:boolean){
 const [generation,changed]=useReducer(value=>value+1,0),[theme,setTheme]=useState<"light"|"dark">(()=>resolvedWorkspaceTheme(profile.appearance));
 useEffect(()=>watchDeviceAppearance(changed),[]);
 useLayoutEffect(()=>{if(hydrated)setTheme(applyWorkspaceAppearance(profile.appearance,profile.displaySize,profile.displayScale,profile.colorPalette))},[profile.appearance,profile.displaySize,profile.displayScale,profile.colorPalette,hydrated,generation]);return theme;
}
