import {bounded, connectedOwner, fail, json, objectBody} from '../../../lib/connected/http';
import {inbox, makeQuery, readMail, writeMail} from '../../../lib/connected/service';
import {quota} from '../../../lib/connected/store';
import {ConnectedError, type MailAction} from '../../../lib/connected/types';

export const runtime = 'nodejs';
export const maxDuration = 60;
const actions: MailAction[] = ['star', 'unstar', 'read', 'unread', 'archive', 'move', 'trash'];

export async function GET(request: Request) {
  try {
    const owner = await connectedOwner(request);
    await quota(owner, 'mail', 80);
    const query = new URL(request.url).searchParams, source = query.get('source');
    if (source) return json(await readMail(owner, source));
    const selected = query.getAll('account').filter(value => /^[A-Za-z0-9_-]{20,80}$/.test(value));
    return json(await inbox(owner, makeQuery(query), selected, query.get('cursor') || undefined));
  } catch (error) { return fail(error); }
}
export async function POST(request: Request) {
  try {
    const owner = await connectedOwner(request);
    await quota(owner, 'write', 40);
    const body = await objectBody(request);
    const action = actions.find(value => value === body.action);
    if (!action || action === 'trash' && body.confirm !== true) throw new ConnectedError(400, 'Confirm the requested mailbox action.');
    return json({message: await writeMail(owner, bounded(body.source, 11_000), action, action === 'move' ? bounded(body.folder, 1800) : undefined)});
  } catch (error) { return fail(error); }
}
