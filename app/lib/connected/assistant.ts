import {cleanOfficeItems} from '../office-schedule';
import {readStoredWorkspace} from '../workspace-storage';
import {removeCrmDuplicates} from './legacy';
import {calendarLink, calendarRange, inbox, mailLink, selectedPreferences} from './service';
import type {Owner} from './types';
import {callbackRequests,needsTodayMail} from './briefing';
import {crmBriefing} from './crm-briefing';
import {memberCallbacks} from '../member-callbacks';

export type ConnectedSource = {label: string; detail: string; href: string};
type Intent = 'today' | 'starred' | 'carrier' | 'needsToday' | 'callback';
export function connectedIntent(question: string): Intent | undefined {
  const text = question.toLowerCase().replace(/[’']/g, '');
  const writeRequest=/\b(?:send|delete|archive|trash|create|schedule|invite|move|mark|text|email|env[ií]a|borra|archiva|programa)\b/.test(text);
  if (!writeRequest&&/\b(?:what\s+needs\s+me\s+today|what\s+needs\s+my\s+attention\s+today|qu[eé]\s+(?:necesita|requiere)\s+mi\s+atenci[oó]n\s+hoy)\b/.test(text)) return 'needsToday';
  if (!writeRequest&&/(?:\bwho\s+(?:asked|wanted|requested)\s+(?:me\s+)?(?:to\s+)?call\s+(?:them|him|her|back|me)\b|\bqui[eé]n\s+(?:pidi[oó]|quer[ií]a)\s+que\s+le\s+llamara\b)/.test(text)) return 'callback';
  if (/\b(today|hoy)\b/.test(text) && /\b(calendar|calendario|schedule|agenda|appointments|citas)\b/.test(text) &&
      !/\b(book|schedule a|send|invite|move|delete|cancel|create|reschedule)\b/.test(text)) return 'today';
  if (/\b(starred|flagged|destacados|marcados)\b/.test(text) && /\b(mail|email|emails|messages|correo|correos)\b/.test(text) &&
      !/\b(send|archive|trash|delete|unstar|move|mark)\b/.test(text)) return 'starred';
  if (/\b(carrier|carriers|aseguradora|aseguradoras)\b/.test(text) && /\b(follow.?ups?|rate books?|seguimiento)\b/.test(text) &&
      !/\b(send|archive|trash|delete|move)\b/.test(text)) return 'carrier';
}

function zonedDate(date: Date, timezone: string, withTime: boolean) {
  return new Map<string, string>(new Intl.DateTimeFormat('en', {timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    ...(withTime ? {hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'} : {})}).formatToParts(date).map(part => [part.type, part.value]));
}
function midnight(date: string, timezone: string) {
  const wall = Date.parse(date + 'T00:00:00Z');
  let instant = wall;
  for (let i = 0; i < 3; i++) {
    const parts = zonedDate(new Date(instant), timezone, true);
    const inZone = Date.parse(['year', 'month', 'day'].map(key => parts.get(key)).join('-') + 'T' +
      ['hour', 'minute', 'second'].map(key => parts.get(key)).join(':') + 'Z');
    instant += wall - inZone;
  }
  return new Date(instant).toISOString();
}
export function workspaceDay(date: Date, requestedZone: string) {
  let timezone = requestedZone;
  try { zonedDate(date, timezone, false); } catch { timezone = 'America/Los_Angeles'; }
  const parts = zonedDate(date, timezone, false);
  const first = ['year', 'month', 'day'].map(key => parts.get(key)).join('-');
  const last = new Date(Date.parse(first + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10);
  return {first, last, start: midnight(first, timezone), end: midnight(last, timezone), timezone};
}

export async function answerConnected(owner: Owner, intent: Intent, options:{role?:string;mail?:boolean;calendar?:boolean}={}): Promise<{summary: string; notice?: string; sources: ConnectedSource[]}> {
  if(intent==='needsToday'){
    const workspace=await readStoredWorkspace(owner.workspace);
    const day=workspaceDay(new Date(),workspace?.profile.automationTimezone||'America/Los_Angeles');
    const crm=crmBriefing(workspace,{id:owner.member,role:options.role||'owner'},'needsToday',Date.parse(day.start),Date.parse(day.end));
    let privateError=false;
    const privateItems=await memberCallbacks({workspace:owner.workspace,member:owner.member,role:options.role||'owner'}).catch(()=>{privateError=true;return []});
    const privateSources=privateItems.filter(item=>item.status==='open'&&Date.parse(item.dueAt)>=Date.parse(day.start)-7*86_400_000&&Date.parse(item.dueAt)<Date.parse(day.end)).map(item=>({label:item.title,detail:'Private CRM callback · '+new Date(item.dueAt).toLocaleString(),href:'/dashboard?calendar=1&day='+workspaceDay(new Date(item.dueAt),item.timezone).first+'&appointment='+encodeURIComponent(item.id)}));
    const calendar=options.calendar===false?null:await calendarRange(owner,day.start,day.end,day.first,day.last);
    const linked=calendar?await removeCrmDuplicates(owner,calendar.events):[];
    const calendarSources=linked.map(event=>({label:event.title,detail:'Calendar · '+event.calendarName+' · '+event.account,href:calendarLink(event.source,day.first)}));
    const prefs=options.mail===false?null:await selectedPreferences(owner);
    const mail=prefs?await inbox(owner,{view:'starred',after:Date.now()-14*86_400_000},prefs.selected):null;
    const rows=needsTodayMail(mail?.rows||[]);
    const sources=[...crm,...privateSources,...calendarSources,...rows.map(row=>({label:row.subject||'(No subject)',detail:new Date(row.at).toLocaleString()+' · '+row.sender+' · '+row.account,href:mailLink(row.source)}))].slice(0,20);
    return {summary:sources.length?'Here are due CRM follow-ups, appointments, calendar items and starred unread mail to review today. Open each source for details.':'No matching items were found in the sources checked today.',sources,
      notice:[privateError?'Private callbacks could not be checked. Open Today to retry.':undefined,!calendar?'Connected calendars are outside your access.':!calendar.accounts.length?'No connected calendar account was checked.':calendar.errors.length?'Some calendars could not be checked.':undefined,
        !mail?'Connected mail is outside your access.':mail.next||mail.coverage.some(row=>row.status!=='searched')||!mail.coverage.length?'Mail coverage is partial or no connected mail account was checked.':undefined].filter(Boolean).join(' ')||undefined};
  }
  if(intent==='callback'){
    const workspace=await readStoredWorkspace(owner.workspace);
    const crm=crmBriefing(workspace,{id:owner.member,role:options.role||'owner'},'callback',0,0);
    const prefs=options.mail===false?null:await selectedPreferences(owner);
    const mail=prefs?await inbox(owner,{view:'all',after:Date.now()-30*86_400_000},prefs.selected):null;
    const rows=callbackRequests(mail?.rows||[]);
    return {summary:crm.length||rows.length?'These saved messages explicitly asked for a return call. Open each source to confirm the request.':'No explicit return-call requests were found in the sources checked.',
      sources:[...crm,...rows.map(row=>({label:row.sender,detail:(row.subject||'(No subject)')+' · '+new Date(row.at).toLocaleString()+' · '+row.account,href:mailLink(row.source)}))].slice(0,16),
      notice:!mail?'Connected mail is outside your access.':mail.next||mail.coverage.some(row=>row.status!=='searched')||!mail.coverage.length?'Results are partial or no connected mail account was checked. Search Connected mail for older or unavailable messages.':undefined};
  }  if (intent === 'today') {
    const workspace = await readStoredWorkspace(owner.workspace);
    const {first, last, start, end, timezone} = workspaceDay(new Date(), workspace?.profile.automationTimezone || 'America/Los_Angeles');
    const result = await calendarRange(owner, start, end, first, last);
    const label = (value: string) => new Date(value).toLocaleTimeString(undefined, {timeZone: timezone, hour: 'numeric', minute: '2-digit'});
    const linked = await removeCrmDuplicates(owner, result.events);
    const crm = cleanOfficeItems(workspace?.officeItems).filter(item => item.status === 'open' &&
      (item.allDayDate ? item.allDayDate === first : Date.parse(item.dueAt) >= Date.parse(start) && Date.parse(item.dueAt) < Date.parse(end)));
    const sources = [
      ...linked.map(event => ({label: event.title, detail: (event.allDay ? 'All day' : label(event.start)) + ' · ' + event.calendarName + ' · ' + event.account,
        href: calendarLink(event.source, first), at: event.start})),
      ...crm.map(item => ({label: item.title, detail: (item.allDayDate ? 'All day' : label(item.dueAt)) + ' · Pacifica',
        href: '/dashboard?calendar=1&day=' + first + '&appointment=' + encodeURIComponent(item.id), at: item.allDayDate || item.dueAt})),
    ].sort((a, b) => a.at.localeCompare(b.at)).slice(0, 12);
    return {summary: sources.length ? 'Here’s your calendar for ' + first + ' (' + timezone + ').' : 'No events were found for ' + first + ' (' + timezone + ').',
      sources, notice: !result.accounts.length?'No connected calendar account was checked.':result.errors.length ? 'Some calendars could not be checked. ' + result.errors.slice(0, 3).join(' ') : undefined};
  }
  const prefs = await selectedPreferences(owner);
  const result = await inbox(owner, {view: intent === 'starred' ? 'starred' : 'all', after: Date.now() - (intent === 'carrier' ? 14 : 30) * 86_400_000,
    keyword: intent === 'carrier' ? 'carrier' : undefined}, prefs.selected);
  const pattern = /\b(carrier|insurance|underwriting|rate\s?book|appointment|quote|renewal|policy|binder)\b/i;
  const rows = result.rows.filter(row => !row.sent && (intent === 'starred' ? row.unread : pattern.test(row.sender + ' ' + row.subject + ' ' + row.preview)));
  return {
    summary: rows.length ? intent === 'starred' ? 'I found starred, unread messages in your selected accounts that may need a reply.'
      : 'I found these possible carrier follow-ups in your selected accounts.' : 'I found no matching messages in the accounts and dates checked.',
    notice: result.next || result.coverage.some(row => row.status !== 'searched')
      ? 'Results are partial. Connected mail shows search coverage and older messages.' : undefined,
    sources: rows.slice(0, 8).map(row => ({label: row.subject || '(No subject)',
      detail: new Date(row.at).toLocaleDateString() + ' · ' + row.sender + ' · ' + row.account, href: mailLink(row.source)})),
  };
}
