import {cleanOfficeItems} from '../office-schedule';
import {readStoredWorkspace} from '../workspace-storage';
import {removeCrmDuplicates} from './legacy';
import {calendarLink, calendarRange, inbox, mailLink, selectedPreferences} from './service';
import type {Owner} from './types';

export type ConnectedSource = {label: string; detail: string; href: string};
type Intent = 'today' | 'starred' | 'carrier';
export function connectedIntent(question: string): Intent | undefined {
  const text = question.toLowerCase().replace(/[’']/g, '');
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

export async function answerConnected(owner: Owner, intent: Intent): Promise<{summary: string; notice?: string; sources: ConnectedSource[]}> {
  if (intent === 'today') {
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
      sources, notice: result.errors.length ? 'Some calendars could not be checked. ' + result.errors.slice(0, 3).join(' ') : undefined};
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
