import {concurrent, emailLabel, eventOverlap, htmlText, pathPart, safeLink, satisfied, short, timestamp} from './normalize';
import {providerJson} from './oauth';
import {ConnectedError, maxAttachment, type Calendar, type Client, type Event, type Grant, type MailQuery, type Message, type Resource} from './types';

const graphRoot = 'https://graph.microsoft.com/v1.0/';
const mailFields = 'id,conversationId,from,sender,toRecipients,ccRecipients,subject,receivedDateTime,sentDateTime,createdDateTime,bodyPreview,isRead,flag,parentFolderId,isDraft,hasAttachments,categories,inferenceClassification,webLink';
const outlookHosts = ['outlook.office.com', 'outlook.office365.com', 'outlook.live.com', 'outlook.cloud.microsoft', 'outlook.office365.us'];
const specials: Record<string, string> = {inbox: 'inbox', sentitems: 'sent', archive: 'archive', drafts: 'drafts', junkemail: 'junk', deleteditems: 'trash'};
type Contact = {emailAddress?: {name?: string; address?: string}};
type Folder = {id: string; displayName?: string; parentFolderId?: string; childFolderCount?: number; wellKnownName?: string};
type GraphMail = {
  id: string; conversationId?: string; from?: Contact; sender?: Contact; toRecipients?: Contact[]; ccRecipients?: Contact[];
  subject?: string; receivedDateTime?: string; sentDateTime?: string; createdDateTime?: string; bodyPreview?: string;
  isRead?: boolean; flag?: {flagStatus?: string}; isDraft?: boolean; parentFolderId?: string; hasAttachments?: boolean;
  categories?: string[]; webLink?: string; inferenceClassification?: string; body?: {contentType?: string; content?: string};
  '@removed'?: unknown;
};
type Collection<T> = {value?: T[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string};
type GraphEvent = {
  id: string; subject?: string; isCancelled?: boolean; isAllDay?: boolean; sensitivity?: string; webLink?: string;
  originalStartTimeZone?: string; originalEndTimeZone?: string; start?: {dateTime?: string; timeZone?: string}; end?: {dateTime?: string; timeZone?: string};
  location?: {displayName?: string}; onlineMeeting?: {joinUrl?: string}; onlineMeetingUrl?: string;
  '@removed'?: unknown;
};
const label = (item?: Contact) => emailLabel(item?.emailAddress?.name, item?.emailAddress?.address);
const categoryId = (name: string) => 'category:' + name;
const windowsZones: Record<string, string> = {
  'UTC': 'UTC', 'Pacific Standard Time': 'America/Los_Angeles', 'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix', 'Central Standard Time': 'America/Chicago', 'Eastern Standard Time': 'America/New_York',
  'Atlantic Standard Time': 'America/Halifax', 'Hawaiian Standard Time': 'Pacific/Honolulu', 'Alaskan Standard Time': 'America/Anchorage',
  'GMT Standard Time': 'Europe/London', 'W. Europe Standard Time': 'Europe/Berlin', 'Romance Standard Time': 'Europe/Paris',
  'India Standard Time': 'Asia/Kolkata', 'China Standard Time': 'Asia/Shanghai', 'Tokyo Standard Time': 'Asia/Tokyo',
  'AUS Eastern Standard Time': 'Australia/Sydney', 'New Zealand Standard Time': 'Pacific/Auckland', 'SA Pacific Standard Time': 'America/Bogota',
};
function calendarDate(value: string, timezone: string | undefined) {
  if (timezone && Number.isFinite(Date.parse(value))) {
    try {
      const fields = new Intl.DateTimeFormat('en', {timeZone: windowsZones[timezone] || timezone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(value));
      return ['year', 'month', 'day'].map(key => fields.find(field => field.type === key)!.value).join('-');
    } catch { /* Some Exchange custom time zones have no IANA equivalent. */ }
  }
  return value.slice(0, 10);
}

export function graphContinuation(value: string, path: string) {
  try {
    const url = new URL(value);
    if (url.origin === 'https://graph.microsoft.com' && !url.username && !url.password && !url.hash && decodeURIComponent(url.pathname).toLowerCase() === ('/v1.0/' + decodeURIComponent(path)).toLowerCase()) return url.href;
  } catch { /* Provider page links are opaque beyond endpoint validation. */ }
  throw new ConnectedError(502, 'Microsoft returned an invalid page link.');
}

export function graphMessage(raw: GraphMail, folders: Resource[]): Message {
  const parent = folders.find(folder => folder.id === raw.parentFolderId);
  const excluded = raw.isDraft ? 'drafts' : parent?.special === 'trash' || parent?.special === 'junk' ? parent.special : undefined;
  const flag = raw.flag?.flagStatus;
  return {
    id: raw.id, thread: raw.conversationId || raw.id, sender: label(raw.from || raw.sender),
    recipients: [...(raw.toRecipients || []), ...(raw.ccRecipients || [])].map(label).filter(Boolean).slice(0, 60),
    subject: short(raw.subject), at: timestamp(raw.receivedDateTime || raw.sentDateTime || raw.createdDateTime), preview: short(raw.bodyPreview, 480),
    unread: raw.isRead === false, starred: flag === 'flagged', flag,
    folders: [raw.parentFolderId || '', ...(raw.categories || []).map(categoryId), ...(raw.inferenceClassification ? ['inference:' + raw.inferenceClassification] : [])].filter(Boolean),
    inbox: parent?.special === 'inbox', sent: parent?.special === 'sent', excluded,
    hasAttachments: Boolean(raw.hasAttachments), link: safeLink(raw.webLink, outlookHosts),
  };
}
export function graphEvent(raw: GraphEvent, cal: Calendar): Event | null {
  const toUtc = (value?: string) => value ? /(?:z|[+-]\d\d:\d\d)$/i.test(value) ? value : value + 'Z' : '';
  const start = toUtc(raw.start?.dateTime), end = toUtc(raw.end?.dateTime);
  if (!raw.id || raw.isCancelled || !start || !end || !timestamp(start) || !timestamp(end)) return null;
  const hidden = Boolean(cal.busyOnly || !raw.subject || !cal.viewPrivate && ['private', 'confidential'].includes(raw.sensitivity || ''));
  return {
    id: raw.id, calendar: cal.id, title: hidden ? 'Busy' : short(raw.subject, 240), allDay: Boolean(raw.isAllDay),
    start: raw.isAllDay ? calendarDate(start, raw.originalStartTimeZone) : start,
    end: raw.isAllDay ? calendarDate(end, raw.originalEndTimeZone || raw.originalStartTimeZone) : end,
    timezone: raw.originalStartTimeZone || raw.start?.timeZone, busyOnly: hidden, privacy: hidden ? 'free/busy' : raw.sensitivity,
    location: hidden ? undefined : short(raw.location?.displayName, 400),
    meeting: hidden ? undefined : safeLink(raw.onlineMeeting?.joinUrl || raw.onlineMeetingUrl),
    link: hidden ? undefined : safeLink(raw.webLink, outlookHosts),
  };
}
const folderPath = (id: string) => 'me/mailFolders/' + pathPart(id);
const mailPath = (id: string) => 'me/messages/' + pathPart(id);
const queryPath = (path: string, params: URLSearchParams) => path + '?' + params;
const nameMatch = (item: Resource | undefined, kind: string) => item?.special === kind;

export function microsoftClient(grant: Grant, token: string): Client {
  const get = <T,>(path: string, init: RequestInit = {}, mode: 'mail' | 'calendar' = 'mail') =>
    providerJson<T>(path.startsWith('https://') ? path : graphRoot + path, token, {...init, headers: {
      Prefer: mode === 'mail' ? 'IdType="ImmutableId", outlook.body-content-type="text"' : 'outlook.timezone="UTC", odata.maxpagesize=80',
    }});
  let folders = grant.folders;
  async function drain<T>(path: string, params: URLSearchParams, cap: number) {
    const output: T[] = [];
    let next: string | undefined = queryPath(path, params);
    for (let i = 0; next && i < cap; i++) {
      const data: Collection<T> = await get<Collection<T>>(next);
      output.push(...(data.value || []));
      const url = data['@odata.nextLink'];
      next = url ? graphContinuation(url, path) : undefined;
    }
    return output;
  }
  async function listFolders() {
    // Outlook folder IDs are tenant- and mailbox-scoped. Resolve the system ones by name before listing messages.
    const params = new URLSearchParams({'$top': '100', '$select': 'id,displayName,parentFolderId,childFolderCount'});
    const knownEntries = await concurrent(Object.entries(specials), 3, async ([wellKnown, special]) => {
      try {
        const row = await get<Folder>(folderPath(wellKnown) + '?$select=id,displayName');
        return [row.id, special] as const;
      } catch (error) {
        if (error instanceof ConnectedError && error.status === 404) return null;
        throw error;
      }
    });
    const known = new Map(knownEntries.filter(entry => entry !== null));
    const all: Array<Folder & {path?: string}> = await drain<Folder>('me/mailFolders', params, 8);
    for (let offset = 0; offset < all.length && offset < 500; offset += 1) {
      const parent = all[offset];
      if (!parent.childFolderCount) continue;
      const children = await drain<Folder>(folderPath(parent.id) + '/childFolders', params, 4);
      all.push(...children.map(child => ({...child, path: (parent.path || parent.displayName || '') + ' / ' + (child.displayName || '')})));
    }
    folders = all.map(folder => ({
      id: folder.id, name: folder.displayName || 'Mailbox', kind: 'folder', parent: folder.parentFolderId, path: folder.path, special: known.get(folder.id),
    }));
    return folders;
  }
  async function summary(id: string) {
    return graphMessage(await get<GraphMail>(mailPath(id) + '?$select=' + mailFields), folders);
  }

  return {
    discoverMail: listFolders,
    async discoverCalendars() {
      const rows = await drain<{id: string; name?: string; isDefaultCalendar?: boolean; canViewPrivateItems?: boolean; color?: string}>(
        'me/calendars', new URLSearchParams({'$top': '100', '$select': 'id,name,isDefaultCalendar,canViewPrivateItems,color'}), 8);
      return rows.map(item => ({id: item.id, name: item.name || 'Calendar', primary: Boolean(item.isDefaultCalendar), viewPrivate: Boolean(item.canViewPrivateItems || item.isDefaultCalendar)}));
    },
    async mail(query, page) {
      const id = query.view === 'updates' ? grant.updates : query.folder;
      const selected = folders.find(folder => folder.id === id);
      const special = ['inbox', 'sent', 'archive', 'drafts', 'junk', 'trash'].includes(query.view)
        ? folders.find(folder => nameMatch(folder, query.view)) : undefined;
      const folder = selected?.kind === 'folder' ? selected : special;
      const path = folder ? folderPath(folder.id) + '/messages' : 'me/messages';
      const keyword = query.keyword?.replace(/[^a-zA-Z0-9\p{L}\p{N}\s@._-]/gu, ' ').trim();
      const condition: string[] = [];
      if (query.before) condition.push('receivedDateTime lt ' + new Date(query.before).toISOString());
      if (query.after) condition.push('receivedDateTime ge ' + new Date(query.after).toISOString());
      // Graph requires ordered fields to appear first in the filter for message queries.
      if (!condition.length) condition.push('receivedDateTime ge 1900-01-01T00:00:00Z');
      if (query.view === 'starred') condition.push("flag/flagStatus eq 'flagged'");
      if (query.view === 'unread') condition.push('isRead eq false');
      if (query.attachments) condition.push('hasAttachments eq true');
      const parameters = new URLSearchParams({'$top': '32', '$select': mailFields,
        ...(keyword ? {'$search': '"' + keyword + '"'} : {'$orderby': 'receivedDateTime desc', '$filter': condition.join(' and ')})});
      const result = await get<Collection<GraphMail>>(page ? graphContinuation(page, path) : queryPath(path, parameters));
      return {rows: (result.value || []).map(item => graphMessage(item, folders)), next: result['@odata.nextLink'],
        partial: Boolean(keyword), anchor: query.start === 'sync' && !page ? '{}' : undefined};
    },
    async changes(anchor) {
      const state = JSON.parse(anchor) as {offset?: number; links?: Record<string, string>};
      const ordered = [...folders].filter(folder => folder.kind === 'folder').sort((a, b) =>
        Number(b.special === 'inbox') - Number(a.special === 'inbox') || a.id.localeCompare(b.id));
      if (!ordered.length) return {rows: [], removed: [], anchor};
      const offset = (state.offset || 0) % ordered.length, folder = ordered[offset];
      const links = state.links || {};
      const path = folderPath(folder.id) + '/messages/delta';
      const options = new URLSearchParams({'$top': '12', '$select': mailFields,
        '$filter': 'receivedDateTime ge ' + new Date(Date.now() - 31 * 86400000).toISOString()});
      try {
        const result = await get<Collection<GraphMail>>(links[folder.id] ? graphContinuation(links[folder.id], path) : queryPath(path, options));
        const rows: Message[] = [], removed: string[] = [];
        for (const item of result.value || []) {
          if (!item['@removed']) rows.push(graphMessage(item, folders));
          else {
            const current = await summary(item.id).catch(error => {
              if (error instanceof ConnectedError && error.status === 404) return null;
              throw error;
            });
            if (current) rows.push(current);
            else removed.push(item.id);
          }
        }
        const next = result['@odata.nextLink'], delta = result['@odata.deltaLink'];
        if (next || delta) links[folder.id] = (next || delta)!;
        return {rows, removed, anchor: JSON.stringify({offset: next ? offset : (offset + 1) % ordered.length, links})};
      } catch (error) {
        if (error instanceof ConnectedError && (error.status === 410 || error.status === 404)) {
          delete links[folder.id];
          return {rows: [], removed: [], anchor: JSON.stringify({offset: (offset + 1) % ordered.length, links})};
        }
        throw error;
      }
    },
    async read(id) {
      const raw = await get<GraphMail>(mailPath(id) + '?$select=' + mailFields + ',body');
      const row = graphMessage(raw, folders);
      const base = mailPath(id) + '/attachments';
      const attachments = raw.hasAttachments ? await drain<{id: string; name?: string; size?: number; isInline?: boolean}>(base,
        new URLSearchParams({'$top': '40', '$select': 'id,name,size,isInline'}), 4) : [];
      const related = raw.conversationId ? await get<Collection<GraphMail>>('me/messages?' + new URLSearchParams({
        '$top': '25', '$select': mailFields, '$filter': "conversationId eq '" + raw.conversationId.replace(/'/g, "''") + "'",
      })).catch(() => ({} as Collection<GraphMail>)) : {};
      return {...row, text: raw.body?.contentType === 'html' ? htmlText(raw.body.content || '') : raw.body?.content || '',
        attachments: attachments.filter(item => !item.isInline).map(item => ({id: item.id, name: item.name || 'Attachment', size: item.size})),
        related: (related.value || []).filter(item => item.id !== id).map(item => graphMessage(item, folders))};
    },
    async attachment(message, id) {
      const raw = await get<{name?: string; size?: number; contentBytes?: string}>(mailPath(message) + '/attachments/' + pathPart(id));
      if (!raw.contentBytes) throw new ConnectedError(404, 'Open this attachment in Outlook.');
      if ((raw.size || 0) > maxAttachment || raw.contentBytes.length > Math.ceil(maxAttachment / 3) * 4)
        throw new ConnectedError(413, 'This attachment is too large. Open it in Outlook.');
      return {name: raw.name, content: Buffer.from(raw.contentBytes, 'base64')};
    },
    actions: grant.granted.mailWrite && grant.enabled.mailWrite ? ['star', 'unstar', 'read', 'unread', 'archive', 'move', 'trash'] : [],
    async write(id, action, folder) {
      const current = await summary(id);
      const dest = action === 'archive' || action === 'trash' ? folders.find(item => nameMatch(item, action))?.id : folder;
      const moving = ['archive', 'move', 'trash'].includes(action);
      if (moving && !dest) throw new ConnectedError(400, 'The destination folder is unavailable.');
      if (satisfied(current, action, dest)) return current;
      const path = mailPath(id) + (moving ? '/move' : '');
      const payload = moving ? {destinationId: dest} : action === 'star' || action === 'unstar'
        ? {flag: {flagStatus: action === 'star' ? 'flagged' : 'notFlagged'}} : {isRead: action === 'read'};
      let failure: unknown, nextId = id;
      try {
        const result = await get<{id?: string}>(path, {method: moving ? 'POST' : 'PATCH', body: JSON.stringify(payload)});
        nextId = result.id || id;
      } catch (error) { failure = error; }
      const updated = await summary(nextId).catch(() => null);
      if (updated && satisfied(updated, action, dest)) return updated;
      if (failure) throw failure;
      throw new ConnectedError(502, 'Microsoft could not confirm the change. Refresh before retrying.');
    },
    async events(cal, start, end, page) {
      const path = 'me/calendars/' + pathPart(cal.id) + '/calendarView';
      const result = await get<Collection<GraphEvent>>(page ? graphContinuation(page, path) : queryPath(path, new URLSearchParams({
        startDateTime: start, endDateTime: end, '$top': '100',
        '$select': 'id,subject,start,end,isAllDay,isCancelled,sensitivity,originalStartTimeZone,originalEndTimeZone,location,onlineMeeting,onlineMeetingUrl,webLink',
      })), {}, 'calendar');
      return {rows: (result.value || []).flatMap(raw => { const item = graphEvent(raw, cal); return item ? [item] : []; }),
        next: result['@odata.nextLink']};
    },
    async calendarChanges(cal, start, end, anchor, page) {
      if (!cal.primary || cal.busyOnly) return this.events(cal, start, end, page);
      const path = 'me/calendarView/delta', next = page || anchor;
      try {
        const result = await get<Collection<GraphEvent>>(next ? graphContinuation(next, path)
          : queryPath(path, new URLSearchParams({startDateTime: start, endDateTime: end})), {}, 'calendar');
        const rows: Event[] = [], removed: string[] = [];
        for (const item of result.value || []) {
          const event = item['@removed'] ? null : graphEvent(item, cal);
          if (event && (event.allDay || eventOverlap(event, start, end))) rows.push(event);
          else if (item.id) removed.push(item.id);
        }
        return {rows, removed, next: result['@odata.nextLink'], anchor: result['@odata.deltaLink']};
      } catch (error) {
        if (error instanceof ConnectedError && error.status === 410 && (anchor || page)) return {rows: [], reset: true};
        throw error;
      }
    },
  };
}
