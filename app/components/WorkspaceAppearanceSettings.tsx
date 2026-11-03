"use client";

import {useId} from "react";
import type {WorkspaceProfile} from "../lib/workspace-profile";
import {cleanDisplayScale, displayScaleLimits} from "../lib/display-scale";
import {colorPalettes,type ColorPalette} from "../lib/color-palettes";

export default function WorkspaceAppearanceSettings({profile,onChange}:{profile:WorkspaceProfile;onChange:(profile:WorkspaceProfile)=>void}) {
  const id=useId(), size=cleanDisplayScale(profile.displayScale,profile.displaySize);
  const update=(patch:Partial<WorkspaceProfile>)=>onChange({...profile,...patch});
  return <section className="workspace-appearance-controls" aria-label="Appearance settings">
    <div className="workspace-appearance-setting"><div><b>Appearance</b></div><div className="appearance-picker" role="group" aria-label="Workspace appearance">{(["system","light","dark"] as const).map(theme=><button key={theme} type="button" className={profile.appearance===theme?"active":""} aria-pressed={profile.appearance===theme} onClick={()=>update({appearance:theme})}>{theme==="system"?"Follow device":theme==="light"?"Light":"Dark"}</button>)}</div></div>
    <fieldset className="palette-picker"><legend>Color palette</legend><div role="group" aria-label="Color palette">{(Object.keys(colorPalettes) as ColorPalette[]).map(key=><button key={key} type="button" aria-pressed={profile.colorPalette===key} onClick={()=>update({colorPalette:key})}><i style={{background:key==="system"?"AccentColor":colorPalettes[key].dark}} aria-hidden="true"/>{colorPalettes[key].name}{profile.colorPalette===key&&<span aria-hidden="true"> ✓</span>}</button>)}</div><p>Follow device uses your device accent when available. Browsers may use their default accent.</p></fieldset>
    <div className="workspace-scale-setting">
      <div className="workspace-scale-heading"><label htmlFor={id}>Text & spacing</label><output htmlFor={id}>{size}%</output><button type="button" onClick={()=>update({displayScale:displayScaleLimits.default,displaySize:"large"})}>Reset</button></div>
      <p id={`${id}-help`}>Resize text, spacing and the keypad together. Your choice saves automatically.</p>
      <input id={id} type="range" min={displayScaleLimits.min} max={displayScaleLimits.max} step={displayScaleLimits.step} value={size} aria-describedby={`${id}-help`} aria-valuetext={`${size} percent`} onChange={event=>update({displayScale:cleanDisplayScale(Number(event.target.value)),displaySize:"large"})}/>
      <div className="workspace-scale-labels" aria-hidden="true"><span>Compact</span><span>Roomy</span></div>
      <div className="workspace-scale-sample"><b>Clear, comfortable, yours.</b><span>Strong text. A little more room when you need it.</span></div>
    </div>
  </section>;
}
