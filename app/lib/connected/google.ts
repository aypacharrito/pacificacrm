import {decodeEntities, eventOverlap, htmlText, pathPart, satisfied, short} from './normalize';
import {providerJson} from './oauth';
import {ConnectedError, maxAttachment, type Attachment, type Calendar, type Client, type Event, type Grant, type MailQuery, type Message} from './types';

const gmail = 'https://gmail.googleapis.com/gmail/v1/users/me/';
const calendarApi = 'https://www.googleapis.com/calendar/v3/';
const partFields = 'mimeType,filename,body/size';
const messageFields = 'id,threadId,labelIds,internalDate,snippet,payload(headers,' + partFields +
  ',parts(' + partFields + ',parts(' + partFields + ',parts(' + partFields + '))))';
const labelNames: Record<string, string> = {
  INBOX: 'Inbox', SENT: 'Sent', DRAFT: 'Drafts', TRASH: 'Trash', SPAM: 'Spam', STARRED: 'Starred', IMPORTANT: 'Important',
  CATEGORY_PERSONAL: 'Primary', CATEGORY_SOCIAL: 'Social', CATEGORY_PROMOTIONS: 'Promotions', CATEGORY_UPDATES: 'Updates', CATEGORY_FORUMS: 'Forums',
};
const special: Record<string, string> = {INBOX: 'inbox', SENT: 'sent', DRAFT: 'drafts', SPAM: 'junk', TRASH: 'trash'};
type Part = {mimeType?: string; filename?: string; headers?: Array<{name: string; value: string}>; body?: {attachmentId?: string; data?: string; size?: number}; parts?: Part[]};
type GmailMessage = {id: string; threadId: string; labelIds?: string[]; internalDate?: string; snippet?: string; payload?: Part};
type Ident = {id: string};
type GmailList = {messages?: Ident[]; nextPageToken?: string};
type GoogleEvent = {
  id: string; status?: string; summary?: string; location?: string; htmlLink?: string; hangoutLink?: string; visibility?: string;
  start?: {date?: string; dateTime?: string; timeZone?: string}; end?: {date?: string; dateTime?: string; timeZone?: string};
  extendedProperties?: {private?: {pacificaId?: string}};
};

function parts(part?: Part): Part[] { return part ? [part, ...(part.parts || []).flatMap(parts)] : []; }
function header(part: Part | undefined, key: string) { return part?.headers?.find(item => item.name.toLowerCase() === key)?.value || ''; }

export function gmailMessage(raw: GmailMessage, email: string): Message {
  const labels = raw.labelIds || [];
  return {
    id: raw.id, thread: raw.threadId || raw.id, sender: short(header(raw.payload, 'from')), subject: short(header(raw.payload, 'subject')),
    recipients: ['to', 'cc'].map(value => short(header(raw.payload, value), 700)).filter(Boolean),
    at: Number(raw.internalDate) || 0, preview: short(decodeEntities(raw.snippet || ''), 480),
    unread: labels.includes('UNREAD'), starred: labels.includes('STARRED'), important: labels.includes('IMPORTANT'),
    inbox: labels.includes('INBOX'), sent: labels.includes('SENT'), folders: labels,
    excluded: labels.includes('TRASH') ? 'trash' : labels.includes('SPAM') ? 'junk' : labels.includes('DRAFT') ? 'drafts' : undefined,
    hasAttachments: parts(raw.payload).some(part => Boolean(part.filename)),
    link: 'https://mail.google.com/mail/u/?authuser=' + pathPart(email) + '#all/' + pathPart(raw.threadId || raw.id),
  };
}

function gmailSearch(query: MailQuery) {
  const q: string[] = [];
  if (query.view === 'all' || ['starred', 'updates', 'unread', 'archive'].includes(query.view)) q.push('-in:spam', '-in:trash', '-in:drafts');
  if (query.view === 'starred') q.push('is:starred');
  if (query.view === 'updates') q.push('category:updates');
  if (query.view === 'inbox') q.push('in:inbox');
  if (query.view === 'unread') q.push('is:unread');
  if (query.view === 'sent') q.push('in:sent');
  if (query.view === 'archive') q.push('-in:inbox', '-in:sent');
  if (query.view === 'drafts') q.push('in:drafts');
  if (query.view === 'junk') q.push('in:spam');
  if (query.view === 'trash') q.push('in:trash');
  const phrase = (value: string) => '"' + value.replace(/["\\\r\n]/g, ' ') + '"';
  if (query.keyword) q.push(phrase(query.keyword));
  if (query.from) q.push('from:' + phrase(query.from));
  if (query.subject) q.push('subject:' + phrase(query.subject));
  if (query.after) q.push('after:' + Math.floor(query.after / 1000));
  if (query.before) q.push('before:' + Math.ceil(query.before / 1000));
  if (query.attachments) q.push('has:attachment');
  return q.join(' ');
}

export function googleEvent(raw: GoogleEvent, cal: Calendar): Event | null {
  const start = raw.start?.date || raw.start?.dateTime, end = raw.end?.date || raw.end?.dateTime;
  if (!raw.id || raw.status === 'cancelled' || !start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) return null;
  const allDay = Boolean(raw.start?.date);
  const privateEvent = !raw.summary && raw.visibility === 'private';
  const busyOnly = Boolean(cal.busyOnly || privateEvent);
  return {
    id: raw.id, calendar: cal.id, start, end, allDay, busyOnly,
    title: busyOnly ? 'Busy' : short(raw.summary, 240) || 'Busy',
    timezone: raw.start?.timeZone || cal.timezone, privacy: busyOnly ? 'free/busy' : raw.visibility,
    location: busyOnly ? undefined : short(raw.location, 400),
    meeting: busyOnly ? undefined : safeGoogleMeeting(raw.hangoutLink),
    link: busyOnly ? undefined : safeGoogleCalendarLink(raw.htmlLink),
    crmId: busyOnly ? undefined : raw.extendedProperties?.private?.pacificaId,
  };
}
function safeGoogleMeeting(url?: string) {
  try { return url && new URL(url).origin === 'https://meet.google.com' ? url : undefined; }
  catch { return undefined; }
}
function safeGoogleCalendarLink(url?: string) {
  try { return url && new URL(url).origin === 'https://calendar.google.com' ? url : undefined; }
  catch { return undefined; }
}

export function googleClient(grant: Grant, token: string): Client {
  const get = <T,>(path: string) => providerJson<T>(gmail + path, token);
  const eventGet = <T,>(path: string, init?: RequestInit) => providerJson<T>(calendarApi + path, token, init);
  const headersPath = 'format=full&fields=' + pathPart(messageFields);
  const readSummary = async (id: string) => gmailMessage(await get<GmailMessage>('messages/' + pathPart(id) + '?' + headersPath), grant.email);
  async function summaries(ids: string[]) {
    const results = await Promise.all(ids.map(async id => {
      try { return await readSummary(id); }
      catch (error) { if (error instanceof ConnectedError && error.status === 404) return null; throw error; }
    }));
    return {rows: results.filter((row): row is Message => Boolean(row)), removed: ids.filter((_, index) => !results[index])};
  }
  async function loadPart(id: string, part: Part) {
    const body = part.body;
    if (!body || (body.size || 0) > maxAttachment) return '';
    const data = body.data || (body.attachmentId ? (await get<{data?: string}>('messages/' + pathPart(id) + '/attachments/' + pathPart(body.attachmentId))).data : '');
    return data ? Buffer.from(data, 'base64url').toString('utf8') : '';
  }

  return {
    async discoverMail() {
      const {labels} = await get<{labels?: Array<{id: string; name: string; type: string}>}>('labels');
      return (labels || []).map(label => ({
        id: label.id, name: labelNames[label.id] || label.name,
        path: label.type === 'user' ? label.name : undefined, special: special[label.id],
        kind: label.id.startsWith('CATEGORY_') ? 'category' : 'label',
      }));
    },
    async discoverCalendars() {
      const calendars: Calendar[] = [];
      let page: string | undefined;
      do {
        const {items, nextPageToken} = await eventGet<{items?: Array<{id: string; summary: string; summaryOverride?: string; primary?: boolean; backgroundColor?: string; accessRole?: string; timeZone?: string}>; nextPageToken?: string}>('users/me/calendarList?' + new URLSearchParams({maxResults: '250', showHidden: 'true', ...(page ? {pageToken: page} : {})}));
        calendars.push(...(items || []).map(item => ({
          id: item.id, name: item.summaryOverride || item.summary || item.id, primary: Boolean(item.primary), color: item.backgroundColor,
          busyOnly: item.accessRole === 'freeBusyReader', timezone: item.timeZone,
        })));
        page = nextPageToken;
      } while (page && calendars.length < 1000);
      return calendars;
    },
    async mail(query, page) {
      const anchor = query.start === 'sync' && !page ? (await get<{historyId?: string}>('profile?fields=historyId')).historyId : undefined;
      const params = new URLSearchParams({maxResults: '12', q: gmailSearch(query), includeSpamTrash: String(['trash', 'junk', 'folder'].includes(query.view)),
        ...(query.folder ? {labelIds: query.folder} : {}), ...(page ? {pageToken: page} : {})});
      const list = await get<GmailList>('messages?' + params);
      return {...await summaries((list.messages || []).map(item => item.id)), next: list.nextPageToken, anchor};
    },
    async changes(anchor, page) {
      try {
        const response = await get<{history?: Array<{messages?: Ident[]; messagesAdded?: Array<{message: Ident}>; messagesDeleted?: Array<{message: Ident}>; labelsAdded?: Array<{message: Ident}>; labelsRemoved?: Array<{message: Ident}>}>; nextPageToken?: string; historyId?: string}>('history?' + new URLSearchParams({startHistoryId: anchor, maxResults: '8', ...(page ? {pageToken: page} : {})}));
        const ids = [...new Set((response.history || []).flatMap(item => [
          ...(item.messages || []), ...(item.messagesAdded || []).map(x => x.message), ...(item.messagesDeleted || []).map(x => x.message),
          ...(item.labelsAdded || []).map(x => x.message), ...(item.labelsRemoved || []).map(x => x.message),
        ]).map(item => item.id))];
        const rows: Message[] = [], removed: string[] = [];
        for (let offset = 0; offset < ids.length; offset += 12) {
          const part = await summaries(ids.slice(offset, offset + 12));
          rows.push(...part.rows);
          removed.push(...part.removed);
        }
        return {rows, removed, next: response.nextPageToken, anchor: response.historyId || anchor};
      } catch (error) {
        if (error instanceof ConnectedError && (error.status === 404 || error.status === 410)) return {rows: [], removed: [], reset: true};
        throw error;
      }
    },
    async watch(topic) {
      const result = await providerJson<{expiration?: string}>(gmail + 'watch', token, {method: 'POST', body: JSON.stringify({topicName: topic})});
      const expiry = Number(result.expiration);
      if (!Number.isFinite(expiry) || expiry < Date.now()) throw new ConnectedError(502, 'Gmail did not confirm a watch expiration.');
      return expiry;
    },
    async read(id) {
      const raw = await get<GmailMessage>('messages/' + pathPart(id) + '?format=full');
      const row = gmailMessage(raw, grant.email);
      const branches = parts(raw.payload);
      const plain = branches.find(child => !child.filename && child.mimeType === 'text/plain');
      const html = branches.find(child => !child.filename && child.mimeType === 'text/html');
      const text = plain ? await loadPart(id, plain) : html ? htmlText(await loadPart(id, html)) : '';
      const attachments: Attachment[] = branches.flatMap((child, index) => child.filename ?
        [{id: String(index), name: child.filename, size: child.body?.size}] : []);
      const thread = await get<{messages?: GmailMessage[]}>('threads/' + pathPart(row.thread) + '?format=metadata&fields=' +
        pathPart('messages(id,threadId,labelIds,internalDate,snippet,payload/headers)')).catch(() => ({} as {messages?: GmailMessage[]}));
      return {...row, text, attachments, related: (thread.messages || []).filter(message => message.id !== id).slice(-30).map(message => gmailMessage(message, grant.email))};
    },
    async attachment(id, index) {
      const raw = await get<GmailMessage>('messages/' + pathPart(id) + '?format=full');
      if (!/^\d{1,5}$/.test(index)) throw new ConnectedError(404, 'Attachment not found.');
      const part = parts(raw.payload)[Number(index)];
      if (!part?.filename || !part.body) throw new ConnectedError(404, 'Attachment not found.');
      if ((part.body.size || 0) > maxAttachment) throw new ConnectedError(413, 'This attachment is too large. Open it in Gmail.');
      const data = part.body.data || (part.body.attachmentId ?
        (await get<{data?: string}>('messages/' + pathPart(id) + '/attachments/' + pathPart(part.body.attachmentId))).data : '');
      if (!data) throw new ConnectedError(404, 'Attachment not found.');
      return {name: part.filename, content: Buffer.from(data, 'base64url')};
    },
    actions: grant.granted.mailWrite && grant.enabled.mailWrite ? ['star', 'unstar', 'read', 'unread', 'archive', 'move', 'trash'] : [],
    async write(id, action, folder) {
      const path = 'messages/' + pathPart(id);
      const current = await readSummary(id);
      if (satisfied(current, action, folder)) return current;
      let addLabelIds: string[] = [], removeLabelIds: string[] = [];
      if (action === 'star') addLabelIds = ['STARRED'];
      if (action === 'unstar') removeLabelIds = ['STARRED'];
      if (action === 'read') removeLabelIds = ['UNREAD'];
      if (action === 'unread') addLabelIds = ['UNREAD'];
      if (action === 'archive') removeLabelIds = ['INBOX'];
      if (action === 'move' && folder) {
        addLabelIds = [folder]; removeLabelIds = folder === 'INBOX' ? [] : ['INBOX'];
      }
      let failure: unknown;
      try {
        await providerJson(gmail + path + (action === 'trash' ? '/trash' : '/modify'), token, {
          method: 'POST', ...(action === 'trash' ? {} : {body: JSON.stringify({addLabelIds, removeLabelIds})}),
        });
      } catch (error) { failure = error; }
      const updated = await readSummary(id).catch(() => null);
      if (updated && satisfied(updated, action, folder)) return updated;
      if (failure) throw failure;
      throw new ConnectedError(502, 'Gmail could not confirm the change. Refresh before retrying.');
    },
    async events(cal, start, end, page) {
      if (cal.busyOnly) {
        const result = await eventGet<{calendars?: Record<string, {busy?: Array<{start: string; end: string}>; errors?: unknown[]}>}>('freeBusy', {
          method: 'POST', body: JSON.stringify({timeMin: start, timeMax: end, items: [{id: cal.id}]}),
        });
        const data = result.calendars?.[cal.id];
        if (!data || data.errors?.length) throw new ConnectedError(403, 'The calendar did not grant free/busy access.');
        return {rows: (data.busy || []).map(event => ({...event, id: event.start + '@' + event.end, calendar: cal.id, title: 'Busy', busyOnly: true, privacy: 'free/busy'}))};
      }
      const query = new URLSearchParams({timeMin: start, timeMax: end, singleEvents: 'true', showDeleted: 'false', maxResults: '100', ...(page ? {pageToken: page} : {})});
      const {items, nextPageToken} = await eventGet<{items?: GoogleEvent[]; nextPageToken?: string}>('calendars/' + pathPart(cal.id) + '/events?' + query);
      return {rows: (items || []).flatMap(raw => { const item = googleEvent(raw, cal); return item ? [item] : []; }), next: nextPageToken};
    },
    async calendarChanges(cal, start, end, anchor, page) {
      if (cal.busyOnly) return this.events(cal, start, end, page);
      const path = 'calendars/' + pathPart(cal.id) + '/events?';
      const parameters = new URLSearchParams({singleEvents: 'true', showDeleted: 'true', maxResults: '80',
        ...(anchor ? {syncToken: anchor} : {timeMin: start, timeMax: end}), ...(page ? {pageToken: page} : {})});
      try {
        const result = await eventGet<{items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string}>(path + parameters);
        const rows: Event[] = [], removed: string[] = [];
        for (const object of result.items || []) {
          const event = googleEvent(object, cal);
          if (event && (event.allDay || eventOverlap(event, start, end))) rows.push(event);
          else if (object.id) removed.push(object.id);
        }
        return {rows, removed, next: result.nextPageToken, anchor: result.nextSyncToken};
      } catch (error) {
        if (error instanceof ConnectedError && error.status === 410 && anchor) return {rows: [], reset: true};
        throw error;
      }
    },
  };
}
