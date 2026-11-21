import {timingSafeEqual} from 'node:crypto';
import {connectedAutomationAccess} from '../../../lib/clerk-access';
import {fail, json} from '../../../lib/connected/http';
import {concurrent} from '../../../lib/connected/normalize';
import {syncAccount} from '../../../lib/connected/service';
import {deferJob, dueAccounts, isConnectedConfigured} from '../../../lib/connected/store';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = Buffer.from(process.env.CRON_SECRET?.trim() || '');
  const supplied = Buffer.from(request.headers.get('authorization') || '');
  const bearer = Buffer.concat([Buffer.from('Bearer '), secret]);
  if (!secret.length || bearer.length !== supplied.length || !timingSafeEqual(bearer, supplied)) return json({error: 'Unauthorized.'}, 401);
  if (process.env.PACIFICA_CONNECTED_SYNC_ENABLED !== 'true' || !isConnectedConfigured()) return json({enabled: false});
  try {
    const due = await dueAccounts();
    const results = await concurrent(due, 4, async ({owner, id}) => {
      if (!await connectedAutomationAccess(owner.workspace, owner.member)) {
        await deferJob(owner, id);
        return false;
      }
      return syncAccount(owner, id).then(() => true, () => false);
    });
    return json({enabled: true, checked: due.length, processed: results.filter(Boolean).length});
  } catch (error) { return fail(error); }
}
