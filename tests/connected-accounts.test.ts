import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import test from 'node:test';
import {calendarDayOverlap} from '../app/lib/calendar-presentation';
import {workspaceDay, connectedIntent} from '../app/lib/connected/assistant';
import {imapList} from '../app/lib/connected/apple';
import {parseAppleEvents} from '../app/lib/connected/caldav';
import {gmailMessage, googleEvent} from '../app/lib/connected/google';
import {gmailPush} from '../app/lib/connected/gmail-push';
import {graphContinuation, graphEvent, graphMessage} from '../app/lib/connected/microsoft';
import {htmlText, matchesMail} from '../app/lib/connected/normalize';
import {authorizationUrl, grantedServices, newFlow} from '../app/lib/connected/oauth';
import {accountOverview, calendarRange, disconnect, enroll, inbox, readAttachment, readMail, setAccountOptions, setMailPreferences, syncAccount, writeMail} from '../app/lib/connected/service';
import {accountLease, decodeSource, encodeSource, getGrant, loadCache} from '../app/lib/connected/store';
import type {Identity, Owner, Services} from '../app/lib/connected/types';

const owner: Owner = {workspace: 'agencyFixture', member: 'staffFixture'};
const services: Services = {mail: true, calendar: true, mailWrite: true};
const identity = (name: string, tenant = ''): Identity => ({subject: 'stable-' + name, tenant, email: name + '@example.test', name});
const googleScopes = ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/calendar.readonly'];
const microsoftScopes = ['Mail.ReadWrite', 'Calendars.Read'];

test('provider meanings preserve Gmail labels, Graph flag completion, known categories and IMAP special folders', () => {
  const gmail = gmailMessage({id: 'same', threadId: 'same', labelIds: ['IMPORTANT', 'CATEGORY_UPDATES'], internalDate: '1000'}, 'mail@example.test');
  assert.equal(gmail.starred, false);
  assert.equal(gmail.important, true);
  assert.equal(matchesMail(gmail, {view: 'updates'}, {provider: 'google'}), true);
  assert.equal(matchesMail(gmail, {view: 'all'}, {provider: 'google'}), true);
  assert.match(gmail.link!, /authuser=mail%40example\.test/);
  const folders = [{kind: 'folder' as const, id: 'archive-id', name: 'Archive', special: 'archive'}];
  const graph = graphMessage({id: 'same', flag: {flagStatus: 'complete'}, parentFolderId: 'archive-id', categories: ['Carrier']}, folders);
  assert.equal(graph.starred, false);
  assert.equal(graph.flag, 'complete');
  assert.equal(matchesMail(graph, {view: 'archive'}, {provider: 'microsoft', folders}), true);
  assert.equal(matchesMail(graph, {view: 'updates'}, {provider: 'microsoft'}), false);
  assert.equal(matchesMail(graph, {view: 'updates'}, {provider: 'microsoft', updates: 'category:Carrier'}), true);
  assert.deepEqual(imapList([{line: '* LIST (\\Sent) "/" "Mail/Sent"'}, {line: '* LIST (\\Noselect) "/" "Hidden"'}]),
    [{id: 'Mail/Sent', name: 'Sent', path: 'Mail/Sent', kind: 'folder', special: 'sent'}]);
  assert.throws(() => graphContinuation('https://graph.microsoft.com.bad.test/v1.0/me/messages?$skip=1', 'me/messages'));
  assert.equal(htmlText('<p>Hello &amp; hi<img src="https://tracker.invalid/p"/></p><script>alert(1)</script>'), 'Hello & hi');
});

test('calendar ranges preserve multi-day dates, DST and cancelled entries, and busy-only event details stay private', () => {
  assert.equal(calendarDayOverlap({id: 'all-day', dueAt: '2026-11-01T12:00:00', allDayDate: '2026-11-01', allDayEnd: '2026-11-03'}, new Date(2026, 10, 2)), true);
  assert.equal(calendarDayOverlap({id: 'all-day', dueAt: '2026-11-01T12:00:00', allDayDate: '2026-11-01', allDayEnd: '2026-11-03'}, new Date(2026, 10, 3)), false);
  const day = workspaceDay(new Date('2026-11-01T18:00:00Z'), 'America/Los_Angeles');
  assert.equal(Date.parse(day.end) - Date.parse(day.start), 25 * 3_600_000);
  const g = googleEvent({id: 'event', summary: 'Private details', location: 'Office', start: {date: '2026-11-01'}, end: {date: '2026-11-03'}},
    {id: 'other', name: 'Busy', busyOnly: true});
  assert.equal(g?.title, 'Busy');
  assert.equal(g?.location, undefined);
  assert.equal(googleEvent({id: 'cancelled', status: 'cancelled'}, {id: 'c', name: 'C'}), null);
  const graph = graphEvent({id: 'all-day', subject: 'Tokyo', isAllDay: true, originalStartTimeZone: 'Tokyo Standard Time',
    start: {dateTime: '2026-10-31T15:00:00'}, end: {dateTime: '2026-11-01T15:00:00'}}, {id: 'c', name: 'Schedule'});
  assert.equal(graph?.start, '2026-11-01');
  const apple = parseAppleEvents([
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:series', 'SUMMARY:First occurrence', 'DTSTART;TZID=America/Los_Angeles:20261025T090000',
    'DTEND;TZID=America/Los_Angeles:20261025T100000', 'RECURRENCE-ID;TZID=America/Los_Angeles:20261025T090000', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:series', 'SUMMARY:Moved occurrence', 'DTSTART;TZID=America/Los_Angeles:20261101T100000',
    'DTEND;TZID=America/Los_Angeles:20261101T110000', 'RECURRENCE-ID;TZID=America/Los_Angeles:20261101T090000', 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n'), {id: 'calendar', name: 'Personal'});
  assert.deepEqual(apple.events.map(event => event.start), ['2026-10-25T16:00:00.000Z', '2026-11-01T18:00:00.000Z']);
  assert.equal(new Set(apple.events.map(event => event.id)).size, 2);
  assert.equal(connectedIntent('What is on my calendar today?'), 'today');
  assert.equal(connectedIntent('Which starred emails need a response?'), 'starred');
  assert.equal(connectedIntent('Move all my starred email to Trash'), undefined);
});

function memoryRedis() {
  const keys = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const sorted = new Map<string, number>();
  const set = (id: string) => {if (!sets.has(id)) sets.set(id, new Set());return sets.get(id)!;};
  return (cmd: Array<string | number>): unknown => {
    const [operation, ...args] = cmd.map(String);
    const [a, b, c, d] = args;
    if (operation === 'GET') return keys.get(a) ?? null;
    if (operation === 'MGET') return args.map(key => keys.get(key) ?? null);
    if (operation === 'SMEMBERS') return [...set(a)];
    if (operation === 'SREM') return Number(set(a).delete(b));
    if (operation === 'SET') {
      if (args.includes('NX') && keys.has(a)) return null;
      return keys.set(a, b) && 'OK';
    }
    if (operation === 'EVAL') {
      const count = Number(b);
      const [lease, grant, index, , cache] = args.slice(2, count + 2);
      const [lock, value, id, due, job, data] = args.slice(count + 2);
      if (a.includes("redis.call('INCR'")) {
        const n = Number(keys.get(lease) || '0') + 1;
        keys.set(lease, String(n));
        return n;
      }
      if (a.includes("redis.call('EXPIRE'")) return set(lease).add(lock) && 1;
      if (keys.get(lease) !== lock) return 0;
      if (count === 1) return Number(keys.delete(lease));
      if (a.includes("redis.call('DEL'")) {
        keys.delete(grant); keys.delete(index); set(args[5]).delete(value); sorted.delete(id);
        return 1;
      }
      keys.set(grant, value); set(index).add(id);
      if (due) sorted.set(job, Number(due)); else sorted.delete(job);
      if (data) keys.set(cache, data);
      return 1;
    }
    if (operation === 'ZRANGEBYSCORE') return [...sorted].filter(([, at]) => at <= Number(c)).map(([job]) => job);
    if (operation === 'ZADD') {sorted.set(args.at(-1)!, Number(args.at(-2)));return 1;}
    throw Error('Fixture received unexpected Redis command ' + operation + ' ' + d);
  };
}

test('connected Gmail push requires the preview service identity, signature and exact subscription', async t => {
  const env = {
    PACIFICA_CONNECTED_ENCRYPTION_KEY: '23'.repeat(32), KV_REST_API_URL: 'https://redis.example.test', KV_REST_API_TOKEN: 'fixture',
    PACIFICA_CONNECTED_GMAIL_TOPIC: 'projects/pacifica-test/topics/connected',
    PACIFICA_CONNECTED_GMAIL_SUBSCRIPTION: 'projects/pacifica-test/subscriptions/connected',
    PACIFICA_CONNECTED_GMAIL_PUSH_AUDIENCE: 'https://preview.example.test/api/connected/google/push',
    PACIFICA_CONNECTED_GMAIL_PUSH_SERVICE_ACCOUNT: 'preview@example.test',
  };
  const old = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const fetchBefore = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = fetchBefore;
    for (const [key, value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
  const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
  let lookups = 0;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes('/oauth2/v3/certs')) return Response.json({keys: [{...publicKey.export({format: 'jwk'}), kid: 'connected-fixture'}]});
    if (url === 'https://redis.example.test') {lookups++;return Response.json({result: []});}
    throw Error('Unexpected push fetch');
  };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const jwt = (audience: string) => {
    const now = Math.floor(Date.now() / 1000);
    const input = encode({alg: 'RS256', kid: 'connected-fixture'}) + '.' + encode({
      iss: 'https://accounts.google.com', aud: audience, email: env.PACIFICA_CONNECTED_GMAIL_PUSH_SERVICE_ACCOUNT,
      email_verified: true, iat: now, exp: now + 600,
    });
    return input + '.' + sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
  };
  const request = (token: string, subscription = env.PACIFICA_CONNECTED_GMAIL_SUBSCRIPTION) => new Request(
    env.PACIFICA_CONNECTED_GMAIL_PUSH_AUDIENCE, {method: 'POST', headers: {Authorization: 'Bearer ' + token},
      body: JSON.stringify({subscription, message: {data: encode({emailAddress: 'owner@example.test', historyId: '321'})}})});
  assert.equal((await gmailPush(request('arbitrary'))).status, 401);
  assert.equal((await gmailPush(request(jwt('https://wrong.example.test')))).status, 401);
  const valid = jwt(env.PACIFICA_CONNECTED_GMAIL_PUSH_AUDIENCE);
  assert.equal((await gmailPush(request(valid, 'projects/pacifica-test/subscriptions/other'))).status, 400);
  assert.equal(lookups, 0);
  assert.equal((await gmailPush(request(valid))).status, 204);
  assert.equal(lookups, 1);
});

test('five delegated grants survive reconnect, filtered reads, concurrency, cursors and disconnect', async t => {
  const env = {
    PACIFICA_CONNECTED_ENCRYPTION_KEY: 'ab'.repeat(32),
    PACIFICA_CONNECTED_ORIGIN: 'https://preview.example.test',
    PACIFICA_CONNECTED_GOOGLE_CLIENT_ID: 'google-fixture-id',
    PACIFICA_CONNECTED_GOOGLE_CLIENT_SECRET: 'google-fixture-secret',
    PACIFICA_CONNECTED_MICROSOFT_CLIENT_ID: 'graph-fixture-id',
    PACIFICA_CONNECTED_MICROSOFT_CLIENT_SECRET: 'graph-fixture-secret',
    KV_REST_API_URL: 'https://redis.example.test', KV_REST_API_TOKEN: 'isolated-fixture-token',
  };
  const prior = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const restore = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = restore;
    for (const [name, value] of Object.entries(prior)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  });
  const redis = memoryRedis(), now = Date.now() - 3_600_000;
  const boxes = new Map<string, string[]>([['g1', ['INBOX', 'STARRED', 'UNREAD', 'CATEGORY_UPDATES']], ['g2', ['STARRED']], ['g3', ['SENT']]]);
  const changes: Array<string> = [];
  const archives = new Set(['m1']);
  let expired = false, throttle = false;
  globalThis.fetch = async (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const method = options?.method || 'GET';
    if (url.hostname === 'redis.example.test') return Response.json({result: redis(JSON.parse(String(options?.body)))});
    const auth = new Headers(options?.headers).get('authorization')?.slice(7) || '';
    if (url.hostname === 'gmail.googleapis.com') {
      const path = url.pathname.replace('/gmail/v1/users/me/', '');
      if (auth === 'g2' && throttle) return Response.json({}, {status: 429, headers: {'Retry-After': '120'}});
      if (path === 'labels') return Response.json({labels: [
        {id: 'INBOX', name: 'INBOX', type: 'system'}, {id: 'CATEGORY_UPDATES', name: 'CATEGORY_UPDATES', type: 'system'}, {id: 'Label_1', name: 'Clients/Current', type: 'user'},
      ]});
      if (path === 'profile') return Response.json({historyId: '900'});
      if (path === 'history') {
        if (expired) return Response.json({}, {status: 404});
        return Response.json({historyId: '901', history: [{messages: [{id: 'shared'}]}]});
      }
      if (path === 'messages') {
        const query = url.searchParams.get('q') || '';
        if (query.includes('is:starred') && !boxes.get(auth)?.includes('STARRED')) return Response.json({});
        if (query.includes('category:updates') && !boxes.get(auth)?.includes('CATEGORY_UPDATES')) return Response.json({});
        return Response.json(url.searchParams.has('pageToken') ? {messages: [{id: 'older'}]} :
          {messages: [{id: 'shared'}], nextPageToken: 'older-' + auth});
      }
      if (path === 'threads/thread') return Response.json({messages: []});
      if (path === 'messages/shared/modify') {
        changes.push(auth + ':' + method);
        const update = JSON.parse(String(options?.body)) as {addLabelIds: string[]; removeLabelIds: string[]};
        boxes.set(auth, [...new Set([...(boxes.get(auth) || []).filter(label => !update.removeLabelIds.includes(label)), ...update.addLabelIds])]);
        // The provider receives the action but the response is lost.
        throw Error('simulated timeout after commit');
      }
      if (['messages/shared', 'messages/older'].includes(path)) return Response.json({
        id: path.split('/').at(-1), threadId: 'thread', labelIds: boxes.get(auth), internalDate: String(now - (path.endsWith('older') ? 45 * 86400000 : 0)),
        snippet: 'Fixture summary', payload: {mimeType: 'multipart/mixed', headers: [{name: 'From', value: 'Carrier fixture'}, {name: 'Subject', value: 'Same subject'}],
          parts: [{mimeType: 'text/html', body: {data: Buffer.from('<p>Read me</p><img src="https://remote.test">').toString('base64url')}},
            {filename: 'one.txt', body: {size: 4, data: Buffer.from('file').toString('base64url')}}]},
      });
    }
    if (url.hostname === 'www.googleapis.com' && url.pathname.includes('/calendar/v3/')) {
      if (url.pathname.endsWith('/calendarList')) return Response.json({items: [
        {id: 'primary-' + auth, summary: 'Team calendar', primary: true, timeZone: 'America/Los_Angeles'}
      ]});
      if (url.pathname.endsWith('/events')) return Response.json({items: [{id: 'same-event', summary: 'Appointment',
        start: {dateTime: '2026-11-01T18:00:00Z'}, end: {dateTime: '2026-11-01T19:00:00Z'}}], nextSyncToken: 'sync-' + auth});
    }
    if (url.hostname === 'graph.microsoft.com') {
      const path = url.pathname.replace('/v1.0/', '');
      if (path === 'me/mailFolders') return Response.json({value: [{id: 'mail-inbox', displayName: 'Inbox'}, {id: 'mail-archive', displayName: 'Archive'}]});
      if (/^me\/mailFolders\/[^/]+$/.test(path)) return Response.json({id: 'mail-' + path.split('/').at(-1), displayName: 'Fixture folder'});
      if (path === 'me/messages' || path.endsWith('/messages') || path.endsWith('/messages/delta')) {
        const moved = archives.has(auth);
        return Response.json({value: [{id: 'shared', conversationId: 't', subject: 'Same subject', receivedDateTime: new Date(now - 2000).toISOString(),
          isRead: false, flag: {flagStatus: 'flagged'}, parentFolderId: moved ? 'mail-archive' : 'mail-inbox', categories: ['Carrier'], bodyPreview: 'Insurance'}]});
      }
      if (path === 'me/calendars') return Response.json({value: [{id: 'calendar-' + auth, name: 'Team calendar', isDefaultCalendar: true}]});
      if (path.endsWith('/calendarView') || path.endsWith('/calendarView/delta')) return Response.json({value: []});
    }
    throw Error('Unexpected fixture URL ' + url.origin + url.pathname);
  };
  const flow = newFlow({owner, session: 'sessionFixture', provider: 'google', services: {mail: true, calendar: false, mailWrite: false}});
  assert.deepEqual(grantedServices('microsoft', ['https://graph.microsoft.com/Mail.Read']), {mail: true, calendar: false, mailWrite: false});
  const auth = new URL(authorizationUrl(flow, 'test-state'));
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.match(auth.searchParams.get('scope')!, /gmail\.readonly/);
  assert.doesNotMatch(auth.searchParams.get('scope')!, /modify|calendar/);
  const googleIds = await Promise.all(['g1', 'g2', 'g3'].map(login => enroll(owner, 'google', identity(login),
    {secret: 'refresh-' + login, access: login, expires: Date.now() + 3600_000, scopes: googleScopes}, login === 'g3'
      ? {mail: true, calendar: false, mailWrite: false} : services)));
  const microsoftIds = await Promise.all(['m1', 'm2'].map(login => enroll(owner, 'microsoft', identity(login, login === 'm1' ? 'work-tenant' : 'personal-tenant'),
    {secret: 'refresh-' + login, access: login, expires: Date.now() + 3600_000, scopes: microsoftScopes}, login === 'm2'
      ? {mail: false, calendar: true, mailWrite: false} : services)));
  const [first, second] = googleIds;
  assert.equal((await accountOverview(owner)).accounts.length, 5);
  assert.equal((await accountOverview(owner)).preferences.view, 'starred');
  const secretFields = JSON.stringify(await accountOverview(owner));
  assert.doesNotMatch(secretFields, /refresh-|credentials|stable-g1/);
  await assert.rejects(enroll(owner, 'google', identity('g2'), {secret: 'test', scopes: googleScopes}, services, first.id), /different provider account/);
  assert.equal((await accountOverview(owner)).accounts.length, 5);
  assert.equal((await getGrant({workspace: 'other', member: owner.member}, first.id)), null);
  let release!: () => void;
  const held = new Promise<void>(resolve => {release = resolve;});
  const locked = accountLease(owner, first.id, () => held);
  await new Promise(resolve => setTimeout(resolve, 5));
  await assert.rejects(syncAccount(owner, first.id, true), /busy/);
  release(); await locked;
  await Promise.all([...googleIds, ...microsoftIds].map(account => syncAccount(owner, account.id, true)));
  for (const account of googleIds) await syncAccount(owner, account.id, true);
  await setAccountOptions(owner, microsoftIds[0].id, {updates: 'category:Carrier'});
  await setMailPreferences(owner, {view: 'updates', selected: [first.id, microsoftIds[0].id]});
  assert.equal((await accountOverview(owner)).preferences.view, 'updates');
  assert.equal((await accountOverview(owner)).preferences.selected.length, 2);
  const starred = await inbox(owner, {view: 'starred'}, []);
  const g1 = starred.rows.find(row => row.account === first.email)!;
  assert.equal(g1.subject, 'Same subject');
  assert.equal(g1.unread, true);
  const all = await inbox(owner, {view: 'all'}, [microsoftIds[0].id]);
  assert.ok(all.rows.some(row => row.folders.includes('mail-archive')));
  const updates = await inbox(owner, {view: 'updates'}, [first.id, second.id, microsoftIds[0].id]);
  assert.ok(updates.rows.some(row => row.connection === first.id));
  assert.ok(updates.coverage.some(row => row.connection === second.id && row.status !== 'unavailable'));
  const detail = await readMail(owner, g1.source);
  assert.equal(detail.text, 'Read me');
  assert.equal(detail.unread, true);
  assert.equal(changes.length, 0);
  assert.equal((await readAttachment(owner, new URL(detail.attachments[0].download, 'https://fixture.test').searchParams.get('source')!)).name, 'one.txt');
  await assert.rejects(readMail({...owner, member: 'anotherMember'}, g1.source), /unavailable/);
  if (starred.next) await assert.rejects(inbox({...owner, workspace: 'anotherWorkspace'}, {view: 'starred'}, [], starred.next), /expired/);
  const expiredAttachment = encodeSource(owner, 'attachment', [first.id, 'shared', '1', 'one.txt'], Date.now() - 1);
  assert.throws(() => decodeSource(owner, 'attachment', expiredAttachment, 4), /unavailable/);
  await writeMail(owner, g1.source, 'archive');
  assert.deepEqual(changes, ['g1:POST']);
  assert.equal((await readMail(owner, g1.source)).inbox, false);
  assert.equal((await readMail(owner, g1.source)).unread, true);
  const overlays = await calendarRange(owner, '2026-11-01T07:00:00Z', '2026-11-02T08:00:00Z', '2026-11-01', '2026-11-02');
  assert.equal(overlays.events.length, 2);
  assert.equal(new Set(overlays.events.map(event => event.connection)).size, 2);
  expired = true; await syncAccount(owner, first.id, true);
  assert.equal((await loadCache(owner, first.id)).mailAnchor, undefined);
  throttle = true;
  assert.equal((await syncAccount(owner, second.id, true)).state, 'unavailable');
  const unaffected = await inbox(owner, {view: 'updates'}, [first.id, second.id]);
  assert.ok(unaffected.rows.some(row => row.connection === first.id));
  await disconnect(owner, first.id);
  assert.equal((await accountOverview(owner)).accounts.length, 4);
  await assert.rejects(readMail(owner, g1.source), /not be found/);
  assert.deepEqual((await loadCache(owner, first.id)).mail, []);
});
