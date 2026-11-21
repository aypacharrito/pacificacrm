import {createHash} from 'node:crypto';
import {readCalendarSecret} from '../calendar-vault';
import type {GoogleConnection} from '../google-calendar';
import {outlookKey, type OutlookConnection} from '../outlook-calendar';
import type {CalendarEvent, Owner} from './types';

const encryptionReady = () => /^[a-f0-9]{64}$/i.test(process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY || '');
async function legacy(workspace: string) {
  if (!encryptionReady()) return {google: null, microsoft: null};
  const [google, microsoft] = await Promise.all([
    readCalendarSecret<GoogleConnection>(workspace).catch(() => null),
    readCalendarSecret<OutlookConnection>(outlookKey(workspace)).catch(() => null),
  ]);
  return {google, microsoft};
}

export async function legacyReconnect(owner: Owner) {
  if (owner.member !== owner.workspace) return [];
  const saved = await legacy(owner.workspace);
  return (['google', 'microsoft'] as const).filter(provider => saved[provider]?.connectedBy === owner.member);
}

export async function removeCrmDuplicates(owner: Owner, events: CalendarEvent[]) {
  if (!events.some(event => event.provider !== 'icloud')) return events;
  const {google, microsoft} = await legacy(owner.workspace);
  const outlookIds = new Set(Object.values(microsoft?.events || {}).map(event => event.id));
  return events.filter(event => {
    if (event.provider === 'microsoft' && event.calendar === microsoft?.calendarId) return !outlookIds.has(event.id);
    if (event.provider === 'google' && event.calendar === google?.calendarId) {
      if (Object.hasOwn(google.events || {}, event.id)) return false;
      if (event.crmId && createHash('sha256').update(owner.workspace + ':' + event.crmId).digest('hex') === event.id) return false;
    }
    return true;
  });
}
