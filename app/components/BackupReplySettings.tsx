"use client";
import {cleanWarming} from '../lib/lead-warming-policy';
import type {WorkspaceProfile} from '../lib/workspace-profile';
export default function BackupReplySettings({profile,onChange}:{profile:WorkspaceProfile;onChange:(p:WorkspaceProfile)=>void}){
 const settings=cleanWarming(profile.leadWarming);
 const save=(patch:Partial<typeof settings>)=>onChange({...profile,leadWarming:cleanWarming({...settings,...patch,policyUpdatedAt:new Date().toISOString()})});
 return <section className="backup-reply-settings"><h3>When you haven’t replied</h3>
  <label><input type="checkbox" checked={settings.backupRepliesEnabled} onChange={event=>save({backupRepliesEnabled:event.target.checked,backupRepliesSince:event.target.checked?new Date().toISOString():settings.backupRepliesSince})}/> Let Pacifica send a backup reply</label>
  <p>For new incoming texts after you enable this. Sales AI-off chats can still get one useful reply. Pacifica waits for you first, skips acknowledgments, and never restarts a sales sequence.</p>
  <div className="warming-limits"><label>Minutes before stepping in<input aria-label="Backup reply delay in minutes" type="number" min="15" max="1440" value={settings.backupReplyDelayMinutes} onChange={event=>save({backupReplyDelayMinutes:Number(event.target.value)})}/></label><label>Weekly SMS limit ($)<input aria-label="Weekly estimated SMS budget" type="number" min="0" step="1" value={settings.weeklyBudgetCents/100} onChange={event=>save({weeklyBudgetCents:Number(event.target.value)*100})}/></label></div>
  <button type="button" onClick={()=>save({dailyBudgetCents:200,weeklyBudgetCents:1000,monthlyBudgetCents:3000,maxSegments:1,maxUnansweredTexts:2,gapHours:72})}>Use the $2/day · $10/week · $30/month plan</button>
  <p>Business hours: weekdays, 9 am–6 pm in your workspace time zone. At most one backup reply per contact each day and two per calendar week. STOP, DNC, closed contacts, and “Never auto-reply” stay blocked.</p>
  <details><summary>The follow-up plan</summary><ol><li>One short question for a fresh eligible lead.</li><li>One purposeful follow-up at least 72 hours later if unanswered, then rest.</li><li>Resume only for a new customer message or a customer-requested renewal/follow-up date.</li></ol><p>No daily “just checking in” loop. One SMS segment includes the sender and opt-out footer. Budget reservations include personal texts and reminders, and uncertain deliveries are not retried automatically.</p></details>
 </section>;
}
