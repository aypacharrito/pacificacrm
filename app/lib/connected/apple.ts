import {connect} from 'node:tls';
import {htmlText, short, timestamp} from './normalize';
import {ConnectedError, maxAttachment, type Client, type Credentials, type Identity, type MailQuery, type Message, type Resource} from './types';
import {caldav} from './caldav';

const lineEnd = Buffer.from('\r\n');
const maxLiteral = 19 * 1024 * 1024;
type Line = {line: string; data?: Buffer};
type Source = {mailbox: string; validity: string; uid: number};
const flags = (line: string) => (line.match(/\bFLAGS \(([^)]*)\)/i)?.[1] || '').toLowerCase().split(/\s+/);
const taggedId = (source: Source) => JSON.stringify([source.mailbox, source.validity, source.uid]);
const imapQuote = (value: string) => {
  if (/[\x00-\x1f\x7f]/.test(value) || value.length > 1800) throw new ConnectedError(400, 'The iCloud mailbox or search text is invalid.');
  return '"' + value.replace(/["\\]/g, '\\$&') + '"';
};
function sourceId(value: string): Source {
  try {
    const [mailbox, validity, uid] = JSON.parse(value) as [string, string, number];
    if (typeof mailbox === 'string' && mailbox.length < 1800 && /^\d{1,16}$/.test(validity) && Number.isSafeInteger(uid) && uid > 0) return {mailbox, validity, uid};
  } catch { /* Only issued message references can select an iCloud UID. */ }
  throw new ConnectedError(404, 'iCloud message reference is unavailable.');
}

class Imap {
  private input = Buffer.alloc(0);
  private current: Line[] = [];
  private callback?: {tag: string; resolve: (value: Line[]) => void; reject: (error: unknown) => void; timer: ReturnType<typeof setTimeout>};
  private counter = 0;
  private failure?: ConnectedError;
  private pendingLiteral?: {line: string; length: number};
  private constructor(private write: (text: string) => void, private stop: () => void) {}
  static async open() {
    let client: Imap;
    let start: () => void;
    if (typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers') {
      const {connect: openSocket} = await import('cloudflare:sockets');
      const socket = openSocket({hostname: 'imap.mail.me.com', port: 993}, {secureTransport: 'on'});
      const reader = socket.readable.getReader(), writer = socket.writable.getWriter();
      client = new Imap(text => {void writer.write(Buffer.from(text)).catch(() => client.fail());}, () => {void socket.close().catch(() => undefined);});
      start = () => {
        void (async () => {
          for (;;) {
            const {done, value} = await reader.read();
            if (done) break;
            client.receive(Buffer.from(value));
          }
          client.fail();
        })().catch(() => client.fail());
      };
    } else {
      const socket = connect({host: 'imap.mail.me.com', port: 993, servername: 'imap.mail.me.com', rejectUnauthorized: true, minVersion: 'TLSv1.2'});
      client = new Imap(text => socket.write(text), () => socket.destroy());
      start = () => {
        socket.on('data', (data: Buffer) => client.receive(data));
        socket.on('error', () => client.fail());
        socket.on('end', () => client.fail());
      };
    }
    try {
      const greeting = client.wait('*GREETING');
      start();
      await greeting;
      return client;
    }
    catch (error) { client.close(); throw error; }
  }
  private wait(tag: string) {
    if (this.failure) return Promise.reject(this.failure);
    this.current = [];
    return new Promise<Line[]>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(), 10_000);
      this.callback = {tag, resolve, reject, timer};
    });
  }
  private fail(error = new ConnectedError(502, 'iCloud Mail could not complete the connection.')) {
    this.failure = error;
    if (this.callback) {
      const pending = this.callback;
      this.callback = undefined;
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.stop();
  }
  private receive(data: Buffer) {
    this.input = Buffer.concat([this.input, data]);
    if (this.input.length > maxLiteral + 65536) {
      this.fail(new ConnectedError(413, 'This message is too large. Open it in iCloud Mail.'));
      return;
    }
    while (this.input.length) {
      if (this.pendingLiteral) {
        const {line, length} = this.pendingLiteral;
        if (this.input.length < length) return;
        this.current.push({line, data: this.input.subarray(0, length)});
        this.input = this.input.subarray(length);
        this.pendingLiteral = undefined;
        continue;
      }
      const end = this.input.indexOf(lineEnd);
      if (end < 0) return;
      const line = this.input.subarray(0, end).toString('utf8');
      this.input = this.input.subarray(end + 2);
      const literal = line.match(/\{(\d+)\+?\}$/);
      if (literal && Number(literal[1]) > 0) {
        if (Number(literal[1]) > maxLiteral) {
          this.fail(new ConnectedError(413, 'This message is too large. Open it in iCloud Mail.'));
          return;
        }
        this.pendingLiteral = {line, length: Number(literal[1])};
        continue;
      }
      const prior = this.current.at(-1);
      if (prior?.data && /^[ )]/.test(line)) {
        prior.line += ' ' + line;
        continue;
      }
      this.current.push({line});
      const pending = this.callback;
      if (!pending || !(line.startsWith(pending.tag + ' ') || pending.tag === '*GREETING' && line.startsWith('* '))) continue;
      this.callback = undefined;
      clearTimeout(pending.timer);
      if (line.startsWith((pending.tag === '*GREETING' ? '*' : pending.tag) + ' OK')) pending.resolve(this.current);
      else pending.reject(new ConnectedError(502, 'iCloud Mail did not accept the mailbox operation.'));
    }
  }
  command(value: string) {
    const tag = 'P' + (++this.counter);
    const result = this.wait(tag);
    if (!this.failure) this.write(tag + ' ' + value + '\r\n');
    return result;
  }
  async select(mailbox: string, write = false) {
    const rows = await this.command((write ? 'SELECT ' : 'EXAMINE ') + imapQuote(mailbox));
    const validity = rows.map(row => row.line.match(/\[UIDVALIDITY (\d+)\]/i)?.[1]).find(Boolean);
    if (!validity) throw new ConnectedError(502, 'iCloud did not identify the mailbox version.');
    return validity;
  }
  close() { this.stop(); }
}
export const appleAvailable = () => ({
  mail: process.env.PACIFICA_CONNECTED_ICLOUD_MAIL === 'true',
  calendar: process.env.PACIFICA_CONNECTED_ICLOUD_CALENDAR === 'true',
});
async function usingImap<T>(login: string, password: string, operation: (client: Imap) => Promise<T>) {
  const client = await Imap.open();
  try {
    try { await client.command('LOGIN ' + imapQuote(login) + ' ' + imapQuote(password)); }
    catch (error) {
      if (error instanceof ConnectedError && error.message.includes('did not accept')) throw new ConnectedError(401, 'iCloud rejected this app-specific password.');
      throw error;
    }
    return await operation(client);
  } finally { client.close(); }
}
export async function verifyApple(login: string, password: string, mail: boolean, calendar: boolean, write: boolean) {
  const apple = appleAvailable();
  if ((mail && !apple.mail) || (calendar && !apple.calendar)) throw new ConnectedError(503, 'The requested iCloud service needs to be enabled on this host.');
  if (!/^[^@\s:]+@(?:icloud|me|mac)\.com$/i.test(login) || !/^[a-z-]{16,22}$/i.test(password))
    throw new ConnectedError(400, 'Use the main iCloud Mail address and an Apple app-specific password.');
  // The CalDAV principal identifies the Apple account even if the address is changed. This probe reads account identity only.
  const dav = caldav(login, password);
  const [identity] = await Promise.all([
    dav.principal(),
    mail ? usingImap(login, password, async imap => { await imap.select('INBOX'); }) : null,
    calendar ? dav.calendars() : null,
  ]);
  const result: Identity = {subject: identity.subject, tenant: '', email: login, name: login};
  const credentials: Credentials = {secret: password, login, scopes: [...(mail ? ['imap'] : []), ...(calendar ? ['caldav'] : []), ...(mail && write ? ['imap-write'] : [])]};
  return {identity: result, credentials};
}

function mimeWord(value: string) {
  return value.replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (word, charset: string, type: string, data: string) => {
    const bytes = type.toLowerCase() === 'b' ? Buffer.from(data, 'base64') : qp(data.replace(/_/g, ' '));
    try { return new TextDecoder(charset).decode(bytes); }
    catch { return bytes.toString('utf8') || word; }
  });
}
function qp(value: string) {
  return Buffer.from(value.replace(/=\r?\n/g, '').replace(/=([\da-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))), 'latin1');
}
function parseHeaders(value: string) {
  const map = new Map<string, string>();
  for (const line of value.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0) map.set(line.slice(0, colon).toLowerCase(), mimeWord(line.slice(colon + 1).trim()));
  }
  return map;
}
function mediaParam(header: string, key: string) {
  const param = header.match(new RegExp('(?:^|;)\\s*' + key + '(\\*)?=(?:"([^"]*)"|([^;]*))', 'i'));
  const value = (param?.[2] || param?.[3] || '').trim();
  if (!param?.[1]) return value;
  try { return decodeURIComponent(value.replace(/^[^']*'[^']*'/, '')); }
  catch { return value; }
}
type MimePart = {name?: string; kind: string; content: Buffer; charset?: string};
function mime(value: string, depth = 0): MimePart[] {
  const split = value.search(/\r?\n\r?\n/);
  if (split < 0) return [];
  const headers = parseHeaders(value.slice(0, split));
  const type = headers.get('content-type') || 'text/plain';
  const disposition = headers.get('content-disposition') || '';
  const content = value.slice(split).replace(/^\r?\n\r?\n/, '');
  const boundary = mediaParam(type, 'boundary');
  if (type.toLowerCase().startsWith('multipart/') && boundary && depth < 12) {
    const delimiter = '--' + boundary;
    const children: string[] = [];
    let child: string[] | undefined;
    for (const line of content.split(/\r?\n/)) {
      if (line === delimiter || line === delimiter + '--') {
        if (child) children.push(child.join('\r\n'));
        if (line.endsWith('--') && line === delimiter + '--') break;
        child = [];
      } else child?.push(line);
    }
    return children.flatMap(body => mime(body, depth + 1));
  }
  const encoding = headers.get('content-transfer-encoding')?.toLowerCase();
  const name = mediaParam(disposition, 'filename') || mediaParam(type, 'name') || (/^attachment/i.test(disposition) ? 'Attachment' : '');
  return [{name: name || undefined, kind: type.split(';')[0].toLowerCase(), charset: mediaParam(type, 'charset'),
    content: encoding === 'base64' ? Buffer.from(content, 'base64') : encoding === 'quoted-printable' ? qp(content) : Buffer.from(content, 'latin1')}];
}
function mailBody(parts: MimePart[]) {
  const part = parts.find(part => !part.name && part.kind === 'text/plain') || parts.find(part => !part.name && part.kind === 'text/html');
  return part ? part.kind === 'text/html' ? htmlText(decodeText(part.content, part.charset)) : decodeText(part.content, part.charset) : '';
}
function decodeText(value: Buffer, charset?: string) {
  try { return new TextDecoder(charset || 'utf-8').decode(value); }
  catch { return value.toString('utf8'); }
}
function mailboxName(value: string) {
  return value.replace(/&([A-Za-z0-9+,]*)-/g, (_, x: string) => {
    if (!x) return '&';
    const bytes = Buffer.from(x.replace(/,/g, '/'), 'base64');
    return bytes.length % 2 === 0 ? bytes.swap16().toString('utf16le') : x;
  });
}
export function imapList(rows: Line[]): Resource[] {
  const positions: Record<string, string> = {'\\sent': 'sent', '\\drafts': 'drafts', '\\archive': 'archive', '\\trash': 'trash', '\\junk': 'junk'};
  return rows.flatMap(row => {
    const values = row.line.match(/^\* LIST \(([^)]*)\) (NIL|"(?:\\.|[^"])*") (.*)$/i);
    if (!values || /\\noselect|\\nonexistent/i.test(values[1])) return [];
    const read = (value: string) => value.replace(/^"|"$/g, '').replace(/\\(.)/g, '$1');
    const id = row.data ? row.data.toString('utf8') : read(values[3]);
    const delim = values[2] === 'NIL' ? '' : read(values[2]), path = mailboxName(id);
    const name = delim ? path.split(delim).at(-1) || path : path;
    const special = id.toUpperCase() === 'INBOX' ? 'inbox' : values[1].toLowerCase().split(' ').map(flag => positions[flag]).find(Boolean);
    return [{id, path, name, kind: 'folder', special}];
  });
}

function appleMessage(row: Line, mailbox: Resource, source: Source): Message {
  const headers = parseHeaders(row.data?.toString('utf8') || '');
  const states = flags(row.line);
  const at = timestamp(row.line.match(/\bINTERNALDATE "([^"]+)"/i)?.[1]) || timestamp(headers.get('date'));
  return {
    id: taggedId(source), thread: headers.get('message-id') || taggedId(source), sender: short(headers.get('from')),
    recipients: [headers.get('to'), headers.get('cc')].filter((value): value is string => Boolean(value)),
    subject: short(headers.get('subject')), at, preview: '', unread: !states.includes('\\seen'), starred: states.includes('\\flagged'),
    folders: [mailbox.id], inbox: mailbox.special === 'inbox', sent: mailbox.special === 'sent',
    excluded: mailbox.special === 'drafts' || mailbox.special === 'junk' || mailbox.special === 'trash' ? mailbox.special : undefined,
    hasAttachments: /multipart\/(mixed|related)/i.test(headers.get('content-type') || ''),
  };
}
const headersFetch = '(UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID CONTENT-TYPE)])';

function imapDate(time: number) {
  const date = new Date(time);
  return date.getUTCDate() + '-' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getUTCMonth()] + '-' + date.getUTCFullYear();
}
function appleSearch(query: MailQuery) {
  const filters: string[] = [];
  if (query.after) filters.push('SINCE ' + imapDate(query.after));
  if (query.before) filters.push('BEFORE ' + imapDate(query.before + 86400000));
  if (query.view === 'starred') filters.push('FLAGGED');
  if (query.view === 'unread') filters.push('UNSEEN');
  if (query.from && /^[\x20-\x7e]+$/.test(query.from)) filters.push('FROM ' + imapQuote(query.from));
  if (query.subject && /^[\x20-\x7e]+$/.test(query.subject)) filters.push('SUBJECT ' + imapQuote(query.subject));
  if (query.keyword && /^[\x20-\x7e]+$/.test(query.keyword)) filters.push('TEXT ' + imapQuote(query.keyword));
  return filters.join(' ') || 'ALL';
}

export function appleClient(creds: Credentials, initialFolders: Resource[], updates?: string, allowWrite = false): Client {
  const login = creds.login!, password = creds.secret, dav = caldav(login, password);
  const run = <T,>(request: (client: Imap) => Promise<T>) => usingImap(login, password, request);
  let folders = initialFolders;
  const getFolder = (value: string) => folders.find(folder => folder.id === value);
  async function valid(imap: Imap, id: string, write = false) {
    const source = sourceId(id), mailbox = getFolder(source.mailbox);
    if (!mailbox || source.validity !== await imap.select(source.mailbox, write)) throw new ConnectedError(404, 'The iCloud mailbox has changed. Refresh this view.');
    return {source, mailbox};
  }
  async function fetchMessage(imap: Imap, id: string) {
    const {source, mailbox} = await valid(imap, id);
    const sizeRows = await imap.command('UID FETCH ' + source.uid + ' (RFC822.SIZE)');
    const size = sizeRows.find(row => /\bRFC822\.SIZE \d+/i.test(row.line))?.line.match(/\bRFC822\.SIZE (\d+)/i)?.[1];
    if (!size) throw new ConnectedError(404, 'The iCloud message was removed.');
    if (+size > maxLiteral) throw new ConnectedError(413, 'This message is too large. Open it in iCloud Mail.');
    const rows = await imap.command('UID FETCH ' + source.uid + ' (UID FLAGS INTERNALDATE BODY.PEEK[])');
    const item = rows.find(row => row.data);
    if (!item?.data) throw new ConnectedError(404, 'The iCloud message was removed.');
    const raw = item.data.toString('latin1');
    const header = raw.split(/\r?\n\r?\n/, 1)[0];
    return {message: appleMessage({...item, data: Buffer.from(header, 'latin1')}, mailbox, source), parts: mime(raw)};
  }
  return {
    async discoverMail() { folders = await run(async imap => imapList(await imap.command('LIST "" "*"'))); return folders; },
    discoverCalendars: dav.calendars,
    async mail(query, page) {
      const search = appleSearch(query);
      const candidates = folders.filter(folder => {
        if (query.folder || query.view === 'updates') return folder.id === (query.folder || updates);
        if (['drafts', 'junk', 'trash', 'sent', 'inbox', 'archive'].includes(query.view)) return folder.special === query.view;
        return !['drafts', 'junk', 'trash'].includes(folder.special || '');
      });
      const cursor = page ? JSON.parse(page) as {index: number; before: number} : {index: 0, before: 0};
      if (cursor.index >= candidates.length) return {rows: []};
      return run(async imap => {
        const folder = candidates[cursor.index];
        const validity = await imap.select(folder.id);
        const searchResult = await imap.command('UID SEARCH ' + search + (cursor.before ? ' UID 1:' + (cursor.before - 1) : ''));
        const uids = (searchResult.find(row => /^\* SEARCH(?: |$)/.test(row.line))?.line.slice(8).match(/\d+/g) || [])
          .map(Number).filter(uid => uid > 0 && (!cursor.before || uid < cursor.before)).sort((a, b) => b - a);
        const batch = uids.slice(0, 20);
        const raw = batch.length ? await imap.command('UID FETCH ' + batch.join(',') + ' ' + headersFetch) : [];
        const rows = raw.flatMap(row => {
          const uid = Number(row.line.match(/\bUID (\d+)/i)?.[1]);
          return row.data && uid ? [appleMessage(row, folder, {uid, mailbox: folder.id, validity})] : [];
        });
        const next = uids.length > batch.length ? {index: cursor.index, before: batch.at(-1)!} :
          cursor.index + 1 < candidates.length ? {index: cursor.index + 1, before: 0} : null;
        return {rows, next: next ? JSON.stringify(next) : undefined, partial: candidates.length > 1};
      });
    },
    async read(id) {
      return run(async imap => {
        const {message, parts} = await fetchMessage(imap, id);
        const attachments = parts.flatMap((part, index) => part.name ? [{id: String(index), name: part.name, size: part.content.length}] : []);
        return {...message, hasAttachments: attachments.length > 0, text: mailBody(parts), attachments, related: []};
      });
    },
    async attachment(message, id) {
      return run(async imap => {
        const {parts} = await fetchMessage(imap, message);
        const part = /^\d{1,4}$/.test(id) ? parts[Number(id)] : undefined;
        if (!part?.name) throw new ConnectedError(404, 'Attachment not found.');
        if (part.content.length > maxAttachment) throw new ConnectedError(413, 'This attachment is too large. Open it in iCloud Mail.');
        return {name: part.name, content: part.content};
      });
    },
    actions: allowWrite ? ['star', 'unstar', 'read', 'unread'] : [],
    async write(id, action) {
      return run(async imap => {
        const {source, mailbox} = await valid(imap, id, true);
        const flag = action === 'star' || action === 'unstar' ? '\\Flagged' : '\\Seen';
        const operator = action === 'star' || action === 'read' ? '+' : '-';
        let failure: unknown;
        try { await imap.command('UID STORE ' + source.uid + ' ' + operator + 'FLAGS.SILENT (' + flag + ')'); }
        catch (error) { failure = error; }
        const raw = await imap.command('UID FETCH ' + source.uid + ' ' + headersFetch).catch(() => []);
        const row = raw.find(item => item.data);
        if (row && flags(row.line).includes(flag.toLowerCase()) === (operator === '+')) return appleMessage(row, mailbox, source);
        if (failure) throw failure;
        throw new ConnectedError(502, 'iCloud did not confirm the flag change. Refresh before retrying.');
      });
    },
    events: dav.events,
  };
}
