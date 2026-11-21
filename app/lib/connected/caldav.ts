import {responseError} from './oauth';
import {decodeEntities, eventOverlap, short} from './normalize';
import {ConnectedError, type Calendar, type Event, type EventPage} from './types';

const base = 'https://caldav.icloud.com/';
const davOpen = '<?xml version="1.0" encoding="utf-8"?>';
const namespaces = ' xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"';
const xmlEscape = (value: string) => value.replace(/[<>&"']/g, c => ({'<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'}[c]!));
const davUrl = (value: string, from = base) => {
  const url = new URL(value, from);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash ||
      (url.hostname !== 'caldav.icloud.com' && !/^p\d+-caldav\.icloud\.com$/.test(url.hostname))) throw new ConnectedError(502, 'Apple returned an unexpected calendar address.');
  return url.href;
};
function blocks(value: string, tag: string) {
  const prefix = '(?:[\\w.-]+:)?';
  return [...value.matchAll(new RegExp('<' + prefix + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + prefix + tag + '\\s*>', 'gi'))].map(match => match[1]);
}
function property(value: string, tag: string) {
  const raw = blocks(value, tag)[0]?.trim() || '';
  return raw.startsWith('<![CDATA[') && raw.endsWith(']]>') ? raw.slice(9, -3) : decodeEntities(raw);
}
function element(value: string, name: string) {
  return new RegExp('<(?:[\\w.-]+:)?' + name + '(?:\\s|/?>)', 'i').test(value);
}
async function readText(response: Response) {
  if (!response.body) return '';
  const stream = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, value = '';
  try {
    while (true) {
      const {value: chunk, done} = await stream.read();
      if (done) return value + decoder.decode();
      size += chunk.length;
      if (size > 6 * 1024 * 1024) throw new ConnectedError(413, 'Too many events for this iCloud range. Choose fewer days.');
      value += decoder.decode(chunk, {stream: true});
    }
  } finally { await stream.cancel().catch(() => undefined); }
}

function toDate(value: string, timezone?: string, calendarZone?: string) {
  if (/^\d{8}$/.test(value)) return value.slice(0, 4) + '-' + value.slice(4, 6) + '-' + value.slice(6, 8);
  const match = value.match(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)(Z)?$/);
  if (!match) return '';
  const [, year, month, day, hour, minute, second, utc] = match;
  const initial = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  if (utc) return new Date(initial).toISOString();
  const zone = timezone || calendarZone;
  if (!zone) return new Date(initial).toISOString();
  try {
    const format = new Intl.DateTimeFormat('en-GB', {timeZone: zone.replace(/^\/freeassociation\.sourceforge\.net\/Tzfile\//, ''), year: 'numeric',
      month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23'});
    function wall(ms: number) {
      const values = new Map(format.formatToParts(new Date(ms)).map(part => [part.type, +part.value]));
      return Date.UTC(values.get('year')!, values.get('month')! - 1, values.get('day')!, values.get('hour')!, values.get('minute')!, values.get('second')!);
    }
    const choices = [initial - 86400000, initial, initial + 86400000].map(test => initial - (wall(test) - test));
    return new Date(choices.filter(choice => wall(choice) === initial).sort((a, b) => a - b)[0] ?? choices[0]).toISOString();
  } catch { return ''; }
}
function durationMs(value: string) {
  const match = value.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  return match ? ((+match[1] || 0) * 604800 + (+match[2] || 0) * 86400 + (+match[3] || 0) * 3600 +
    (+match[4] || 0) * 60 + (+match[5] || 0)) * 1000 : 0;
}
const icsText = (value: string) => value.replace(/\\([nN,;\\])/g, (_, key: string) => /^[nN]$/.test(key) ? '\n' : key);
export function parseAppleEvents(text: string, calendar: Calendar) {
  const records = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  let fields: Map<string, {value: string; tz?: string}> | undefined;
  const events: Event[] = [];
  let partial = false;
  for (const line of records) {
    if (line === 'BEGIN:VEVENT') { fields = new Map(); continue; }
    if (!fields) continue;
    if (line !== 'END:VEVENT') {
      const colon = line.indexOf(':');
      if (colon < 1) continue;
      const left = line.slice(0, colon), name = left.split(';')[0].toUpperCase();
      const tz = left.match(/(?:^|;)TZID=(?:"([^"]+)"|([^;]+))/i);
      if (!fields.has(name)) fields.set(name, {value: line.slice(colon + 1), tz: tz?.[1] || tz?.[2]});
      continue;
    }
    const data = fields;
    fields = undefined;
    const value = (key: string) => data.get(key)?.value || '';
    if (!value('UID') || value('STATUS').toUpperCase() === 'CANCELLED') continue;
    const original = data.get('DTSTART'), endValue = data.get('DTEND'), allDay = /^\d{8}$/.test(original?.value || '');
    const start = original ? toDate(original.value, original.tz, calendar.timezone) : '';
    let end = endValue ? toDate(endValue.value, endValue.tz, calendar.timezone) : '';
    if (!start) { partial = true; continue; }
    if (!end) {
      const calculated = new Date(Date.parse(start) + (durationMs(value('DURATION')) || (allDay ? 86400000 : 1)));
      end = allDay ? calculated.toISOString().slice(0, 10) : calculated.toISOString();
    }
    if (data.has('RRULE') && !data.has('RECURRENCE-ID')) partial = true;
    const busyOnly = Boolean(calendar.busyOnly || ['PRIVATE', 'CONFIDENTIAL'].includes(value('CLASS').toUpperCase()));
    events.push({id: value('UID') + (data.has('RECURRENCE-ID') ? '@' + value('RECURRENCE-ID') : ''), calendar: calendar.id,
      title: busyOnly ? 'Busy' : short(icsText(value('SUMMARY')), 240) || 'Busy', start, end, allDay,
      timezone: original?.tz || calendar.timezone, busyOnly, privacy: busyOnly ? 'free/busy' : value('CLASS') || undefined,
      location: busyOnly ? undefined : short(icsText(value('LOCATION')), 400)});
  }
  return {events, partial};
}

export function caldav(login: string, password: string) {
  const auth = 'Basic ' + Buffer.from(login + ':' + password).toString('base64');
  async function request(where: string, method: string, body: string, depth: '0' | '1') {
    let url = davUrl(where);
    for (let i = 0; i < 4; i++) {
      let response: Response;
      try {
        response = await fetch(url, {method, body: davOpen + body, signal: AbortSignal.timeout(12_000), redirect: 'manual',
          cache: 'no-store', headers: {Authorization: auth, Depth: depth, 'Content-Type': 'application/xml; charset=utf-8'}});
      } catch { throw new ConnectedError(502, 'iCloud Calendar could not be reached.'); }
      if ([301, 302, 307, 308].includes(response.status)) {
        const next = response.headers.get('location');
        if (!next) throw new ConnectedError(502, 'Apple returned an unexpected calendar redirect.');
        url = davUrl(next, url);
        await response.body?.cancel().catch(() => undefined);
        continue;
      }
      if (!response.ok) throw await responseError(response);
      return {content: await readText(response), url};
    }
    throw new ConnectedError(502, 'Apple returned too many calendar redirects.');
  }
  const propertyRequest = (value: string) => '<d:propfind' + namespaces + '><d:prop>' + value + '</d:prop></d:propfind>';

  async function principal() {
    const first = await request(base, 'PROPFIND', propertyRequest('<d:current-user-principal/>'), '0');
    const path = property(blocks(first.content, 'current-user-principal')[0] || '', 'href');
    if (!path) throw new ConnectedError(403, 'Apple did not return a verified account principal.');
    const url = davUrl(path, first.url);
    const principalPath = decodeURIComponent(new URL(url).pathname);
    if (!/^\/[A-Za-z0-9_-]{3,100}\/principal\/?$/.test(principalPath))
      throw new ConnectedError(403, 'Apple did not return a stable account principal.');
    return {url, subject: principalPath.split('/')[1]};
  }

  return {
    principal,
    async calendars(): Promise<Calendar[]> {
      const account = await principal();
      const second = await request(account.url, 'PROPFIND', propertyRequest('<c:calendar-home-set/>'), '0');
      const set = property(blocks(second.content, 'calendar-home-set')[0] || '', 'href');
      if (!set) throw new ConnectedError(403, 'iCloud did not expose a private calendar collection.');
      const listing = await request(davUrl(set, second.url), 'PROPFIND',
        propertyRequest('<d:displayname/><d:resourcetype/><d:current-user-privilege-set/><c:supported-calendar-component-set/><c:calendar-timezone/><a:calendar-color/>'), '1');
      const calendars = blocks(listing.content, 'response').flatMap(row => {
        const types = blocks(row, 'resourcetype')[0] || '';
        const components = blocks(row, 'supported-calendar-component-set')[0] || '';
        if (!element(types, 'calendar') || (components && !/\bVEVENT\b/i.test(components))) return [];
        const href = property(row, 'href');
        if (!href) return [];
        const id = davUrl(href, listing.url), name = property(row, 'displayname') || 'iCloud Calendar';
        const permissions = blocks(row, 'current-user-privilege-set')[0] || '';
        const busyOnly = element(permissions, 'read-free-busy') && !element(permissions, 'read');
        const color = property(row, 'calendar-color').slice(0, 7);
        const timezone = property(row, 'calendar-timezone').match(/(?:^|\n)TZID:([^\r\n]+)/)?.[1];
        return [{id, name, busyOnly, timezone, ...(color ? {color} : {})}];
      });
      return calendars.map((calendar, index) => ({...calendar, primary: index === 0}));
    },
    async events(calendar: Calendar, start: string, end: string): Promise<EventPage> {
      const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]|\.\d+Z/g, match => match.endsWith('Z') ? 'Z' : '');
      const scope = ' start="' + xmlEscape(stamp(start)) + '" end="' + xmlEscape(stamp(end)) + '"';
      if (calendar.busyOnly) {
        const result = await request(calendar.id, 'REPORT', '<c:free-busy-query' + namespaces + '><c:time-range' + scope + '/></c:free-busy-query>', '1');
        const periods = result.content.replace(/\r?\n[ \t]/g, '').matchAll(/^FREEBUSY(?:;[^:]*)?:([^\r\n]+)/gm);
        const rows = [...periods].flatMap(period => period[1].split(',')).flatMap(slot => {
          const [from, to] = slot.split('/'), a = toDate(from), b = toDate(to);
          if (!a || (!b && !durationMs(to))) return [];
          return [{id: slot, calendar: calendar.id, start: a, end: b || new Date(Date.parse(a) + durationMs(to)).toISOString(), title: 'Busy', busyOnly: true, privacy: 'free/busy'}];
        });
        return {rows};
      }
      const result = await request(calendar.id, 'REPORT', '<c:calendar-query' + namespaces + '><d:prop><d:getetag/><c:calendar-data><c:expand' +
        scope + '/></c:calendar-data></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range' + scope +
        '/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>', '1');
      const items = blocks(result.content, 'response').map(row => parseAppleEvents(property(row, 'calendar-data'), calendar));
      return {rows: items.flatMap(item => item.events).filter(event => eventOverlap(event, start, end)), partial: items.some(item => item.partial)};
    },
  };
}
