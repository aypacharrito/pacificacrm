import {connectedOwner, fail, json} from '../../../lib/connected/http';
import {calendarRange, eventIdentity} from '../../../lib/connected/service';
import {quota} from '../../../lib/connected/store';
import {ConnectedError} from '../../../lib/connected/types';
import {removeCrmDuplicates} from '../../../lib/connected/legacy';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const owner = await connectedOwner(request);
    await quota(owner, 'calendar', 80);
    const query = new URL(request.url).searchParams;
    const start = Date.parse(query.get('start') || ''), end = Date.parse(query.get('end') || '');
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 63 * 86_400_000)
      throw new ConnectedError(400, 'Choose a calendar period of up to 63 days.');
    const day = (name: string) => /^\d{4}-\d\d-\d\d$/.test(query.get(name) || '') ? query.get(name)! : undefined;
    const result = await calendarRange(owner, new Date(start).toISOString(), new Date(end).toISOString(), day('first'), day('last'));
    result.events = await removeCrmDuplicates(owner, result.events);
    const source = query.get('source');
    const selected = source ? eventIdentity(owner, source) : null;
    const opened = selected ? result.events.find(event => event.connection === selected[0] && event.calendar === selected[1] && event.id === selected[2]) : undefined;
    return json({...result, open: opened?.source});
  } catch (error) { return fail(error); }
}
