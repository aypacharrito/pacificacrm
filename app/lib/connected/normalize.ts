import {ConnectedError, type Event, type Grant, type MailAction, type MailQuery, type Message, type Resource} from './types';

export const pathPart = (value: string) => encodeURIComponent(value);
export const emailLabel = (name?: string, address?: string) => name && address && name !== address ? name + ' <' + address + '>' : address || name || '';
export const timestamp = (value?: string) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
export const short = (value: string | undefined, size = 320) => (value || '').trim().slice(0, size);
export const textLimit = 900_000;
const entities: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};
export function decodeEntities(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, key: string) => {
    if (key[0] !== '#') return entities[key.toLowerCase()] || entity;
    const point = /^#x/i.test(key) ? Number.parseInt(key.slice(2), 16) : Number(key.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
  });
}

/** Mail bodies are delivered and rendered as text. Tags, tracking URLs, and active content never reach the DOM. */
export function htmlText(value: string) {
  return decodeEntities(value.slice(0, 2 * textLimit)
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style|head|template|noscript)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<\/?(?:p|div|br|tr|li|h[1-6]|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ''))
    .replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, textLimit);
}

export function safeLink(value: string | undefined, hosts?: string[]) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (hosts && !hosts.includes(url.hostname))) return undefined;
    return url.href;
  } catch { return undefined; }
}

export async function concurrent<T, R>(items: T[], width: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let offset = 0;
  await Promise.all(Array.from({length: Math.min(width, items.length)}, async () => {
    while (offset < items.length) {
      const index = offset++;
      output[index] = await work(items[index], index);
    }
  }));
  return output;
}

export function matchesMail(row: Message, query: MailQuery, grant: Pick<Grant, 'provider' | 'updates'> & {folders?: Resource[]}) {
  if ((query.before && row.at >= query.before) || (query.after && row.at < query.after)) return false;
  if (query.attachments && !row.hasAttachments) return false;
  if (query.from && !row.sender.toLowerCase().includes(query.from.toLowerCase())) return false;
  if (query.subject && !row.subject.toLowerCase().includes(query.subject.toLowerCase())) return false;
  if (query.keyword && ![row.subject, row.preview, row.sender, ...row.recipients].join('\n').toLowerCase().includes(query.keyword.toLowerCase())) return false;
  if (query.view === 'folder') return row.folders.includes(query.folder || '');
  if (query.view === 'drafts' || query.view === 'junk' || query.view === 'trash') return row.excluded === query.view;
  if (row.excluded) return false;
  if (query.view === 'starred') return row.starred;
  if (query.view === 'updates') return row.folders.includes(grant.provider === 'google' ? 'CATEGORY_UPDATES' : grant.updates || '');
  if (query.view === 'inbox') return row.inbox;
  if (query.view === 'sent') return row.sent;
  if (query.view === 'unread') return row.unread;
  if (query.view === 'archive') return grant.provider === 'google' ? !row.inbox && !row.sent
    : Boolean(grant.folders?.some(folder => folder.special === 'archive' && row.folders.includes(folder.id)));
  return true;
}

export function satisfied(row: Message, action: MailAction, folder?: string) {
  switch (action) {
    case 'star': return row.starred;
    case 'unstar': return !row.starred;
    case 'read': return !row.unread;
    case 'unread': return row.unread;
    case 'archive': return !row.inbox && !row.excluded && (!folder || row.folders.includes(folder));
    case 'move': return Boolean(folder && row.folders.includes(folder));
    case 'trash': return row.excluded === 'trash';
  }
}

export function writableFolder(folders: Resource[], id: string | undefined) {
  const target = folders.find(folder => folder.id === id && folder.kind !== 'category' && folder.special !== 'drafts' && folder.special !== 'sent' && folder.special !== 'junk' && folder.special !== 'trash');
  if (!target) throw new ConnectedError(400, 'Choose a movable folder in the source account.');
  return target.id;
}

export function eventOverlap(event: Event, start: string, end: string, firstDate = start.slice(0, 10), lastDate = end.slice(0, 10)) {
  return event.allDay
    ? event.start < lastDate && event.end > firstDate
    : Date.parse(event.start) < Date.parse(end) && Date.parse(event.end) > Date.parse(start);
}
