import {randomUUID} from 'node:crypto';
import {appleAvailable, appleClient} from './apple';
import {googleClient} from './google';
import {connectedPushConfig} from './gmail-push';
import {microsoftClient} from './microsoft';
import {concurrent, eventOverlap, matchesMail, textLimit, writableFolder} from './normalize';
import {freshCredentials, grantedServices, oauthConfigured} from './oauth';
import {
  accountLease, connectionId, decodeSource, deleteGrant, emptyCache, encodeSource, getGrant, indexGmailWatch, isConnectedConfigured, listGrants, loadCache,
  loadPreferences, readCursor, requireGrant, saveCursor, saveGrant, savePreferences, unindexGmailWatch, type SyncCache,
} from './store';
import {
  ConnectedError, defaultPreferences, mailViews, maxAttachment, type Account, type Calendar, type CalendarEvent, type Client, type Credentials,
  type Detail, type Event, type Grant, type Identity, type MailAction, type MailDetail, type MailPage, type MailQuery, type MailRow, type Message,
  type Owner, type Preferences, type Provider, type Services,
} from './types';

const day = 86_400_000;
const mailCount = 240;
const calendarCount = 1500;
const mailSort = (a: Message, b: Message) => b.at - a.at || a.id.localeCompare(b.id);
const noServices: Services = {mail: false, calendar: false, mailWrite: false};
const canUse = (grant: Grant, service: 'mail' | 'calendar') =>
  grant.enabled[service] && grant.granted[service] && grant.state !== 'reconnect';
const selectGrants = (grants: Grant[], selected: string[]) => selected.length ? grants.filter(grant => selected.includes(grant.id)) : grants;
const visibleCalendars = (grant: Grant) => grant.calendars.filter(calendar => grant.calendarChoices[calendar.id]?.visible ?? Boolean(calendar.primary));
const calendarKey = (event: Event) => JSON.stringify([event.calendar, event.id]);
const sortEvents = (a: Event, b: Event) => a.start.localeCompare(b.start) || calendarKey(a).localeCompare(calendarKey(b));
const delay = (state: Account['state']) => state === 'limited' ? 60 : 15;

export function configuredProviders() {
  const apple = appleAvailable(), ready = isConnectedConfigured();
  return {storage: ready, google: ready && oauthConfigured('google'), microsoft: ready && oauthConfigured('microsoft'),
    icloud: ready ? apple : {mail: false, calendar: false}};
}

function stateFor(grant: Grant, busy = false): Account['state'] {
  if ((grant.enabled.mail && !grant.granted.mail) || (grant.enabled.calendar && !grant.granted.calendar) ||
      (grant.enabled.mailWrite && !grant.granted.mailWrite)) return 'limited';
  return busy ? 'syncing' : 'connected';
}
function providerClient(grant: Grant): Client {
  if (grant.provider === 'icloud') return appleClient(grant.credentials, grant.folders, grant.updates, grant.enabled.mailWrite && grant.granted.mailWrite);
  if (!grant.credentials.access) throw new ConnectedError(401, 'Reconnect to restore provider access.');
  return grant.provider === 'google' ? googleClient(grant, grant.credentials.access) : microsoftClient(grant, grant.credentials.access);
}
async function getClient(grant: Grant) {
  const apple = appleAvailable();
  if (grant.provider === 'icloud' && ((grant.enabled.mail && !apple.mail) || (grant.enabled.calendar && !apple.calendar)))
    throw new ConnectedError(503, 'The requested iCloud service needs to be enabled on this host.');
  const credentials = await freshCredentials(grant);
  const updated = {...grant, credentials, granted: grantedServices(grant.provider, credentials.scopes)};
  return {current: updated, client: providerClient(updated)};
}

export function publicAccount(grant: Grant): Account & {actions: MailAction[]} {
  const {id, provider, email, name, enabled, granted, state, lastSync, mailSync, calendarSync, retryAt, folders, calendars, calendarChoices, updates} = grant;
  const actions: MailAction[] = !canUse(grant, 'mail') || !enabled.mailWrite || !granted.mailWrite ? []
    : provider === 'icloud' ? ['star', 'unstar', 'read', 'unread']
      : ['star', 'unstar', 'read', 'unread', 'move', ...(provider === 'google' || folders.some(folder => folder.special === 'archive') ? ['archive' as const] : []),
        ...(provider === 'google' || folders.some(folder => folder.special === 'trash') ? ['trash' as const] : [])];
  return {id, provider, email, name, enabled, granted, state, lastSync, mailSync, calendarSync, retryAt,
    folders: enabled.mail && granted.mail ? folders : [], calendars: enabled.calendar && granted.calendar ? calendars : [],
    calendarChoices, updates, actions};
}

export function readServices(body: unknown): Services {
  if (!body || typeof body !== 'object') return noServices;
  const input = body as Partial<Services>;
  return {mail: input.mail === true, calendar: input.calendar === true, mailWrite: input.mail === true && input.mailWrite === true};
}

function collectCategories(grant: Grant, rows: Message[]) {
  if (grant.provider !== 'microsoft') return grant.folders;
  const seen = new Map(grant.folders.map(folder => [folder.id, folder]));
  for (const id of new Set(rows.flatMap(row => row.folders).filter(id => id.startsWith('category:')))) {
    if (!seen.has(id)) seen.set(id, {id, kind: 'category', name: id.slice(9)});
  }
  for (const [id, name] of [['inference:focused', 'Focused'], ['inference:other', 'Other']]) {
    if (!seen.has(id)) seen.set(id, {id, kind: 'category', name});
  }
  return [...seen.values()];
}

export async function enroll(owner: Owner, provider: Provider, identity: Identity, credentials: Credentials, enabled: Services, reconnect?: string) {
  const id = connectionId(owner, provider, identity);
  if (reconnect && id !== reconnect)
    throw new ConnectedError(409, 'That is a different provider account. Choose the original account to reconnect.');
  return accountLease(owner, id, async lease => {
    const previous = reconnect ? await requireGrant(owner, id) : await getGrant(owner, id);
    const current: Grant = {
      owner, id, provider, identity, credentials, enabled, granted: grantedServices(provider, credentials.scopes),
      email: identity.email, name: identity.name, state: 'syncing', since: previous?.since || Date.now(),
      version: randomUUID(), folders: enabled.mail ? previous?.folders || [] : [], calendars: enabled.calendar ? previous?.calendars || [] : [],
      calendarChoices: previous?.calendarChoices || {}, updates: previous?.updates,
    };
    current.state = stateFor(current, true);
    // Record consent first. Discovery is retryable through the per-account job.
    await saveGrant(current, lease, Date.now(), emptyCache());
    return publicAccount(current);
  });
}

export async function disconnect(owner: Owner, id: string) {
  return accountLease(owner, id, async lease => {
    const grant = await requireGrant(owner, id);
    // OAuth grants may be shared by the same external account across private workspaces. An
    // account-level revocation can also remove another recipient's consent. Remove our copy.
    await deleteGrant(owner, id, lease);
    if (grant.provider === 'google') await unindexGmailWatch(grant).catch(() => undefined);
  });
}

export async function setAccountOptions(owner: Owner, id: string, options: {
  updates?: unknown; calendar?: unknown; visible?: unknown; color?: unknown; services?: unknown;
}) {
  return accountLease(owner, id, async lease => {
    const grant = await requireGrant(owner, id);
    let cache: SyncCache | undefined;
    if (options.services !== undefined) {
      const services = readServices(options.services);
      if (!services.mail && !services.calendar) throw new ConnectedError(400, 'Enable a service or disconnect the account.');
      if ((services.mail && !grant.granted.mail) || (services.calendar && !grant.granted.calendar) ||
          (services.mailWrite && !grant.granted.mailWrite)) throw new ConnectedError(409, 'Reconnect and grant the requested permissions.');
      cache = emptyCache();
      grant.enabled = services;
      grant.version = randomUUID();
      if (grant.state !== 'reconnect') grant.state = 'syncing';
    }
    if (options.updates !== undefined) {
      if (grant.provider === 'google') throw new ConnectedError(400, 'Gmail uses its native Updates category.');
      if (options.updates !== '' && !grant.folders.some(folder => folder.id === options.updates && !['trash', 'junk', 'drafts'].includes(folder.special || '')))
        throw new ConnectedError(400, 'Choose an existing folder or category.');
      grant.updates = typeof options.updates === 'string' && options.updates ? options.updates : undefined;
    }
    if (typeof options.calendar === 'string') {
      if (!grant.calendars.some(calendar => calendar.id === options.calendar)) throw new ConnectedError(404, 'Calendar not found.');
      const color = typeof options.color === 'string' && /^#[a-f0-9]{6}$/i.test(options.color) ? options.color : undefined;
      grant.calendarChoices = {...grant.calendarChoices, [options.calendar]: {visible: options.visible === true, color}};
      cache ||= await loadCache(owner, id);
      cache.calendars = [];
      grant.version = randomUUID();
    }
    await saveGrant(grant, lease, grant.state === 'reconnect' ? undefined : Date.now(), cache);
    return publicAccount(grant);
  });
}

const asView = (value: unknown) => mailViews.find(view => view === value) || defaultPreferences.view;
export async function setMailPreferences(owner: Owner, value: {view?: unknown; selected?: unknown; folder?: unknown}) {
  const grants = await listGrants(owner);
  const selected = Array.isArray(value.selected) ? grants.filter(grant => value.selected instanceof Array && value.selected.includes(grant.id)).map(grant => grant.id) : [];
  const view = asView(value.view);
  const folder = view === 'folder' && selectGrants(grants, selected).some(grant => grant.folders.some(resource => resource.id === value.folder))
    ? String(value.folder) : undefined;
  const preferences = {view: view === 'folder' && !folder ? defaultPreferences.view : view, selected, folder};
  await savePreferences(owner, preferences);
  return preferences;
}

async function syncMail(grant: Grant, cache: SyncCache, client: Client, now: number) {
  if (!cache.mailDiscovered || now - cache.mailDiscovered >= day) {
    const found = await client.discoverMail();
    grant.folders = [...found, ...grant.folders.filter(folder => grant.provider === 'microsoft' && folder.id.startsWith('category:'))];
    cache.mailDiscovered = now;
  }
  const after = cache.mailAfter ?? now - 30 * day;
  const existing = new Map((!client.changes && !cache.mailPage ? [] : cache.mail).map(row => [row.id, row]));
  if (cache.mailAnchor && client.changes && !cache.mailPage) {
    const result = await client.changes(cache.mailAnchor, cache.historyPage);
    if (result.reset) {
      cache.mailAnchor = cache.historyPage = cache.stageAnchor = cache.mailAfter = undefined;
      cache.mail = [];
      grant.mailSync = undefined;
      return true;
    }
    result.removed.forEach(id => existing.delete(id));
    result.rows.forEach(row => existing.set(row.id, row));
    cache.historyPage = result.next;
    if (!result.next) cache.mailAnchor = result.anchor || cache.mailAnchor;
    grant.mailSync = now;
  } else {
    const result = await client.mail({view: 'all', after, start: 'sync'}, cache.mailPage);
    result.rows.forEach(row => existing.set(row.id, row));
    cache.mailPage = result.next;
    cache.mailAfter = after;
    if (result.anchor) cache.stageAnchor = result.anchor;
    if (!result.next || existing.size >= mailCount) {
      cache.mailAnchor = cache.stageAnchor;
      cache.mailPage = cache.mailAfter = cache.stageAnchor = undefined;
      grant.mailSync = now;
    }
  }
  cache.mail = [...existing.values()].filter(row => row.at >= now - 31 * day).sort(mailSort).slice(0, mailCount);
  grant.folders = collectCategories(grant, cache.mail);
  return Boolean(cache.mailPage || cache.historyPage);
}

async function syncCalendar(grant: Grant, cache: SyncCache, client: Client, now: number) {
  if (!cache.calendarDiscovered || now - cache.calendarDiscovered >= day) {
    grant.calendars = await client.discoverCalendars();
    cache.calendarDiscovered = now;
  }
  const resources = visibleCalendars(grant);
  const ids = new Set(resources.map(calendar => calendar.id));
  const records = new Map((cache.calendars || []).filter(record => ids.has(record.id)).map(record => [record.id, record]));
  cache.events = cache.events.filter(event => ids.has(event.calendar));
  const todo = resources.filter(calendar => (records.get(calendar.id)?.retryAt || 0) <= now).sort((a, b) =>
    (records.get(a.id)?.checked || 0) - (records.get(b.id)?.checked || 0));
  const calendar = todo[0];
  if (!calendar) return false;
  const record = records.get(calendar.id) || {id: calendar.id, from: '', to: ''};
  records.set(calendar.id, record);
  const renew = !record.from || (!record.page && Date.parse(record.from) < now - 16 * day);
  if (renew) {
    record.from = new Date(now - 9 * day).toISOString();
    record.to = new Date(now + 38 * day).toISOString();
    record.anchor = record.page = record.checked = undefined;
  }
  const next = () => todo.some(item => !records.get(item.id)?.checked || Boolean(records.get(item.id)?.page));
  try {
    const delta = client.calendarChanges
      ? await client.calendarChanges(calendar, record.from, record.to, record.anchor, record.page)
      : await client.events(calendar, record.from, record.to, record.page);
    const other = cache.events.filter(event => event.calendar !== calendar.id);
    const keep = new Map((record.anchor || record.page ? cache.events.filter(event => event.calendar === calendar.id) : []).map(event => [event.id, event]));
    if ('reset' in delta && delta.reset) {
      delete record.anchor; delete record.page; delete record.checked;
      cache.events = other;
      return true;
    }
    if ('removed' in delta) (delta.removed as string[] | undefined)?.forEach(id => keep.delete(id));
    delta.rows.forEach(event => keep.set(event.id, event));
    if (delta.partial || other.length + keep.size > calendarCount) throw new ConnectedError(403, 'Calendar cache is incomplete. Open a shorter range.');
    cache.events = [...other, ...keep.values()].sort(sortEvents);
    record.page = delta.next;
    record.retryAt = undefined;
    if (!delta.next) {
      record.checked = now;
      if ('anchor' in delta && typeof delta.anchor === 'string') record.anchor = delta.anchor;
      grant.calendarSync = now;
    }
    return next();
  } catch (error) {
    record.retryAt = error instanceof ConnectedError ? Math.max(error.retryAt || 0, now + 15 * 60_000) : now + 15 * 60_000;
    throw error;
  } finally {cache.calendars = [...records.values()];}
}

function issueState(error: unknown): Account['state'] {
  return error instanceof ConnectedError && error.status === 401 ? 'reconnect'
    : error instanceof ConnectedError && error.status === 403 ? 'limited' : 'unavailable';
}

export async function syncAccount(owner: Owner, id: string, manual = false) {
  return accountLease(owner, id, async lease => {
    const grant = await requireGrant(owner, id);
    const now = Date.now();
    if (grant.state === 'reconnect') throw new ConnectedError(401, 'Reconnect this account to resume syncing.');
    if ((grant.retryAt || 0) > now) {
      if (manual) throw new ConnectedError(429, 'This account is waiting to retry.', grant.retryAt);
      await saveGrant(grant, lease, grant.retryAt);
      return publicAccount(grant);
    }
    const cache = await loadCache(owner, id);
    try {
      const {current, client} = await getClient(grant);
      const results = await Promise.allSettled([
        canUse(current, 'mail') ? syncMail(current, cache, client, now) : false,
        canUse(current, 'calendar') ? syncCalendar(current, cache, client, now) : false,
      ]);
      const errors = results.filter(result => result.status === 'rejected');
      const unknown = errors.find(result => issueState(result.reason) === 'reconnect') || errors[0];
      const pending = results.some(result => result.status === 'fulfilled' && result.value);
      const push = connectedPushConfig();
      if (push.pushReady && canUse(current, 'mail') && client.watch && (cache.watchUntil || 0) < now + 3 * day) {
        try {await indexGmailWatch(current); cache.watchUntil = await client.watch(push.topic);}
        catch {console.info('[connected sync]', {provider: current.provider, push: 'using scheduled reconciliation'});}
      }
      current.state = unknown ? issueState(unknown.reason) : stateFor(current, pending);
      if (!unknown && !pending) current.lastSync = now;
      current.retryAt = errors.reduce((latest, result) => result.reason instanceof ConnectedError ? Math.max(latest, result.reason.retryAt || 0) : latest, 0) || undefined;
      const next = pending && !unknown ? now + 3000 : now + delay(current.state) * 60_000;
      await saveGrant(current, lease, current.state === 'reconnect' ? undefined : Math.max(current.retryAt || 0, next), cache);
      console.info('[connected sync]', {provider: current.provider, state: current.state, incomplete: pending, elapsed: Date.now() - now});
      return publicAccount(current);
    } catch (error) {
      grant.state = issueState(error);
      grant.retryAt = error instanceof ConnectedError ? error.retryAt : undefined;
      await saveGrant(grant, lease, grant.state === 'reconnect' ? undefined : Math.max(grant.retryAt || 0, now + 15 * 60_000));
      return publicAccount(grant);
    }
  });
}

type Stream = {connection: string; version: string; rows: Message[]; page?: string; done?: boolean; partial?: boolean};
type InboxCursor = {streams: Stream[]; query: MailQuery; selected: string[]; seen: string[]; at: number};
type Coverage = {connection: string; account: string; status: 'searched' | 'pending' | 'unavailable' | 'no-updates'; reason?: string};
export function makeQuery(parameters: URLSearchParams): MailQuery {
  const word = (key: string) => (parameters.get(key) || '').trim().slice(0, 160) || undefined;
  const date = (key: string) => {
    const value = parameters.get(key);
    if (!value) return undefined;
    const exact = /^\d{4}-\d\d-\d\d$/.test(value) ? Date.parse(value + 'T00:00:00Z') : NaN;
    if (!Number.isFinite(exact)) throw new ConnectedError(400, 'Use a valid search date.');
    return exact;
  };
  const after = date('start'), end = date('end');
  if (after && end && after > end) throw new ConnectedError(400, 'The start date must come before the end date.');
  return {view: asView(parameters.get('view')), folder: parameters.get('folder')?.slice(0, 1800) || undefined,
    keyword: word('q'), from: word('from'), subject: word('subject'), after, before: end ? end + day : undefined,
    attachments: parameters.get('attachments') === 'true'};
}

export const mailLink = (source: string) => '/dashboard?connectedMail=' + encodeURIComponent(source);
export const calendarLink = (source: string, date: string) => '/dashboard?connectedEvent=' + encodeURIComponent(source) + '&day=' + date.slice(0, 10);
function mailRow(grant: Grant, message: Message): MailRow {
  return {...message, connection: grant.id, source: encodeSource(grant.owner, 'mail', [grant.id, message.id]), account: grant.email, provider: grant.provider};
}
function eventsWithSource(grant: Grant, calendar: Calendar, source: Event[]): CalendarEvent[] {
  const color = grant.calendarChoices[calendar.id]?.color || calendar.color;
  return source.map(event => ({...event, calendarName: calendar.name, account: grant.email, connection: grant.id,
    source: encodeSource(grant.owner, 'event', [grant.id, calendar.id, event.id]), provider: grant.provider,
    color: color && /^#[0-9a-f]{6}$/i.test(color) ? color : undefined}));
}
const notice = (error: unknown) => error instanceof ConnectedError ? error.message : 'Try again when the provider is available.';
const qualifying = (row: Message, query: MailQuery, grant: Grant) => matchesMail(row,
  grant.provider === 'google' || grant.provider === 'microsoft' && /[\p{L}\p{N}]/u.test(query.keyword || '') || grant.provider === 'icloud' && /^[\x20-\x7E]+$/.test(query.keyword || '')
    ? {...query, keyword: undefined} : query, grant);

export async function inbox(owner: Owner, query: MailQuery, selected: string[], resume?: string) {
  const accounts = await listGrants(owner);
  const byId = new Map(accounts.map(grant => [grant.id, grant]));
  const at = Date.now();
  const cursor: InboxCursor = resume ? await readCursor<InboxCursor>(owner, resume) : {
    selected, query: {...query, before: Math.min(query.before ?? at + 1, at + 1)}, seen: [], at,
    streams: selectGrants(accounts, selected).filter(grant => grant.enabled.mail).map(grant => ({connection: grant.id, version: grant.version, rows: []})),
  };
  const actual = cursor.query, reports: Coverage[] = [], seen = new Set(cursor.seen);
  await concurrent(cursor.streams, 4, async stream => {
    const grant = byId.get(stream.connection);
    if (!grant || grant.version !== stream.version || !canUse(grant, 'mail')) {
      stream.rows = [];
      stream.done = true;
      if (grant) reports.push({connection: grant.id, account: grant.email, status: 'unavailable', reason: 'Reconnect or enable Mail for this account.'});
      return;
    }
    const report: Coverage = {connection: grant.id, account: grant.email, status: 'searched'};
    reports.push(report);
    if (actual.view === 'updates' && grant.provider !== 'google' && !grant.folders.some(folder => folder.id === grant.updates)) {
      stream.done = true; report.status = 'no-updates'; return;
    }
    if (actual.view === 'folder' && !grant.folders.some(folder => folder.id === actual.folder)) {
      stream.done = true; return;
    }
    if (stream.done || stream.rows.length) {
      if (stream.partial || !stream.done) report.status = 'pending';
      return;
    }
    try {
      if ((grant.retryAt || 0) > Date.now()) throw new ConnectedError(429, 'Waiting for the provider to accept more requests.');
      const {client} = await getClient(grant);
      for (let step = 0; step < 2 && !stream.rows.length && !stream.done; step++) {
        const result: MailPage = await client.mail(actual, stream.page);
        stream.rows = result.rows.filter(row => qualifying(row, actual, grant)).sort(mailSort);
        stream.page = result.next;
        stream.done = !result.next;
        stream.partial = result.partial;
      }
      if (stream.partial || !stream.done) report.status = 'pending';
    } catch (error) {
      report.status = 'unavailable';
      report.reason = notice(error);
      // Cached messages are available with their exact scope when a provider is temporarily unavailable.
      if (!resume && !(error instanceof ConnectedError && (error.status === 401 || error.status === 403))) {
        const cached = await loadCache(owner, grant.id).catch(() => emptyCache());
        stream.rows = cached.mail.filter(row => matchesMail(row, actual, grant)).sort(mailSort);
        report.reason += ' Recent cached results may be shown.';
      }
    }
  });
  const rows: MailRow[] = [];
  await concurrent(cursor.streams.filter(stream => stream.rows.length > 0), 4, async stream => {
    try { await stillAvailable(byId.get(stream.connection)!, 'mail'); }
    catch {stream.rows = []; stream.done = true;}
  });
  while (rows.length < 24) {
    const best = cursor.streams.filter(stream => stream.rows.length).sort((a, b) =>
      mailSort(a.rows[0], b.rows[0]) || a.connection.localeCompare(b.connection))[0];
    if (!best) break;
    const message = best.rows.shift()!, key = JSON.stringify([best.connection, message.id]);
    if (!seen.has(key)) { rows.push(mailRow(byId.get(best.connection)!, message)); seen.add(key); }
    if (!best.rows.length && !best.done) break;
  }
  const next = cursor.streams.some(stream => stream.rows.length || !stream.done);
  return {
    rows, next: next ? await saveCursor(owner, {...cursor, seen: [...seen].slice(-2000)}) : undefined,
    coverage: reports.sort((a, b) => a.account.localeCompare(b.account)), at: cursor.at,
  };
}

async function mailSource(owner: Owner, source: string) {
  const [id, message] = decodeSource(owner, 'mail', source, 2);
  const grant = await requireGrant(owner, id);
  if (!canUse(grant, 'mail')) throw new ConnectedError(403, 'This mailbox no longer has read access.');
  return {grant, message};
}
async function stillAvailable(grant: Grant, service: 'mail' | 'calendar') {
  const active = await getGrant(grant.owner, grant.id);
  if (!active || active.version !== grant.version || !canUse(active, service))
    throw new ConnectedError(403, 'The account access changed during this request. Refresh to continue.');
}

export async function readMail(owner: Owner, source: string): Promise<MailDetail> {
  const {grant, message} = await mailSource(owner, source);
  const {client} = await getClient(grant);
  const detail = await client.read(message);
  await stillAvailable(grant, 'mail');
  return mailDetail(grant, detail);
}
function mailDetail(grant: Grant, detail: Detail): MailDetail {
  const {related, text, attachments, ...message} = detail;
  return {...mailRow(grant, message), text: text.slice(0, textLimit),
    related: related.map(row => mailRow(grant, row)), attachments: attachments.map(item => ({
      ...item, download: '/api/connected/attachment?source=' + encodeURIComponent(encodeSource(grant.owner, 'attachment',
        [grant.id, message.id, item.id, item.name], Date.now() + 300_000)),
    }))};
}
export async function readAttachment(owner: Owner, source: string) {
  const [id, message, attachment, name] = decodeSource(owner, 'attachment', source, 4);
  const grant = await requireGrant(owner, id);
  if (!canUse(grant, 'mail')) throw new ConnectedError(403, 'This mailbox no longer has read access.');
  const {client} = await getClient(grant);
  const file = await client.attachment(message, attachment);
  await stillAvailable(grant, 'mail');
  if (file.content.length > maxAttachment) throw new ConnectedError(413, 'Open this large attachment in the provider.');
  return {name: (file.name || name).slice(0, 240), content: file.content};
}

export async function writeMail(owner: Owner, source: string, action: MailAction, target?: string) {
  const {grant, message} = await mailSource(owner, source);
  return accountLease(owner, grant.id, async lease => {
    const currentGrant = await requireGrant(owner, grant.id);
    if (grant.version !== currentGrant.version || !canUse(currentGrant, 'mail') || !publicAccount(currentGrant).actions.includes(action))
      throw new ConnectedError(403, 'This account does not grant the requested mailbox action.');
    const {client, current} = await getClient(currentGrant);
    if (!client.actions.includes(action) || !client.write) throw new ConnectedError(403, 'This provider does not grant the requested mailbox action.');
    const folder = action === 'move' ? writableFolder(current.folders, target) : undefined;
    if (folder && current.provider === 'google' && folder !== 'INBOX' && !folder.startsWith('Label_'))
      throw new ConnectedError(400, 'Choose Inbox or a Gmail user label.');
    const updated = await client.write(message, action, folder);
    const cache = await loadCache(owner, grant.id);
    cache.mail = [...cache.mail.filter(row => row.id !== message && row.id !== updated?.id), ...(updated ? [updated] : [])].sort(mailSort).slice(0, mailCount);
    await saveGrant(current, lease, Date.now(), cache);
    return updated ? mailRow(current, updated) : null;
  });
}

export async function accountOverview(owner: Owner) {
  const [grants, preferences] = await Promise.all([listGrants(owner), loadPreferences(owner)]);
  const selected = preferences.selected.filter(id => grants.some(grant => grant.id === id && grant.enabled.mail));
  return {providers: configuredProviders(), accounts: grants.map(publicAccount), preferences: {...preferences, selected}};
}

export async function calendarRange(owner: Owner, start: string, end: string, firstDay?: string, lastDay?: string) {
  const grants = (await listGrants(owner)).filter(grant => grant.enabled.calendar);
  const errors: string[] = [];
  const events: CalendarEvent[] = [];
  await concurrent(grants, 3, async grant => {
    if (!canUse(grant, 'calendar')) {errors.push(grant.email + ' needs calendar permission or reconnection.'); return;}
    const cache = await loadCache(owner, grant.id);
    let client: Client | undefined;
    for (const calendar of visibleCalendars(grant)) {
      try {
        const stored = cache.calendars?.find(record => record.id === calendar.id);
        const useCache = stored && !stored.page && !stored.retryAt && stored.checked && Date.now() - stored.checked < 20 * 60_000 &&
          Date.parse(stored.from) <= Date.parse(start) && Date.parse(stored.to) >= Date.parse(end);
        if (useCache) {
          events.push(...eventsWithSource(grant, calendar, cache.events.filter(event => event.calendar === calendar.id && eventOverlap(event, start, end, firstDay, lastDay))));
          continue;
        }
        client ||= (await getClient(grant)).client;
        let page: string | undefined, partial = false;
        const rows: Event[] = [];
        for (let index = 0; index < 4; index++) {
          const data = await client.events(calendar, start, end, page);
          rows.push(...data.rows.filter(event => eventOverlap(event, start, end, firstDay, lastDay)));
          page = data.next;
          partial ||= Boolean(data.partial);
          if (!page) break;
        }
        if (page || partial) errors.push(calendar.name + ' (' + grant.email + ') has more results. Choose a shorter range.');
        events.push(...eventsWithSource(grant, calendar, rows));
      } catch (error) {
        errors.push(calendar.name + ' (' + grant.email + '): ' + notice(error));
      }
    }
    if (!grant.calendars.length) errors.push(grant.email + ' is discovering calendars. Use Sync now in Connected accounts.');
    if (events.some(event => event.connection === grant.id)) {
      try { await stillAvailable(grant, 'calendar'); }
      catch { for (let i = events.length - 1; i >= 0; i--) if (events[i].connection === grant.id) events.splice(i, 1); }
    }
  });
  return {events: [...new Map(events.map(event => [JSON.stringify([event.connection, event.calendar, event.id]), event])).values()].sort(sortEvents),
    errors: errors.sort(), accounts: grants.map(publicAccount)};
}

export function eventIdentity(owner: Owner, token: string) { return decodeSource(owner, 'event', token, 3); }
export async function selectedPreferences(owner: Owner): Promise<Preferences> { return loadPreferences(owner); }
