"use client";
import type {WorkspaceProfile} from '../lib/workspace-profile';
import DialerBackdrop from './DialerBackdrop';
export default function DialerBackgroundSettings({profile,onChange}:{profile:WorkspaceProfile;onChange:(profile:WorkspaceProfile)=>void}){const update=(patch:Partial<WorkspaceProfile>)=>onChange({...profile,...patch});return <>    <section className="dialer-scene-settings" aria-label="Dialer background settings">
      <div className="dialer-scene-heading"><b>Dialer background</b><button type="button" onClick={()=>update({dialerLightBackdropUrl:"",dialerDarkBackdropUrl:""})}>Reset both</button></div>
      <div className="dialer-scene-previews">
        {(["light","dark"] as const).map(theme=><article key={theme}>
          {theme === "light" ? <div className="dialer-scene-plain" role="img" aria-label="Plain light workspace without stars or a watermark"/>
            : <div className="dialer-native-preview" role="img" aria-label="Plain charcoal workspace without stars or a watermark"><DialerBackdrop appearance="dark"/></div>}
          <div><b>{theme === "light" ? "Plain light" : "Plain charcoal"}</b><button type="button" onClick={()=>update(theme === "light" ? {dialerLightBackdropUrl:""} : {dialerDarkBackdropUrl:""})}>Use default</button></div>
        </article>)}
      </div>
      <div className="workspace-profile-fields"><label>Light image / GIF<input type="url" value={profile.dialerLightBackdropUrl} onChange={event=>update({dialerLightBackdropUrl:event.target.value})} placeholder="Optional HTTPS image or GIF"/></label><label>Dark image / GIF<input type="url" value={profile.dialerDarkBackdropUrl} onChange={event=>update({dialerDarkBackdropUrl:event.target.value})} placeholder="Optional HTTPS image or GIF"/></label></div>
    </section>
</>;}
