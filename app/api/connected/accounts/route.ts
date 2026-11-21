import {auth} from '@clerk/nextjs/server';
import {cookies} from 'next/headers';
import {verifyApple} from '../../../lib/connected/apple';
import {bounded, connectedOwner, fail, json, objectBody} from '../../../lib/connected/http';
import {authorizationUrl, newFlow, oauthOrigin} from '../../../lib/connected/oauth';
import {accountOverview, disconnect, enroll, readServices, setAccountOptions, setMailPreferences, syncAccount} from '../../../lib/connected/service';
import {quota, requireGrant, seal} from '../../../lib/connected/store';
import {ConnectedError} from '../../../lib/connected/types';
import {legacyReconnect} from '../../../lib/connected/legacy';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const owner = await connectedOwner(request);
    const [overview, legacy] = await Promise.all([accountOverview(owner), legacyReconnect(owner)]);
    return json({...overview, legacy});
  }
  catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  try {
    const owner = await connectedOwner(request);
    const body = await objectBody(request);
    if (body.action === 'preferences') return json(await setMailPreferences(owner, body));
    if (body.action === 'connect') {
      await quota(owner, 'connect', 12);
      const provider = body.provider, services = readServices(body.services);
      if (!services.mail && !services.calendar) throw new ConnectedError(400, 'Enable Mail or Calendar.');
      if (provider !== 'google' && provider !== 'microsoft' && provider !== 'icloud') throw new ConnectedError(400, 'Choose an account provider.');
      const reconnect = body.id ? bounded(body.id) : undefined;
      const previous = reconnect ? await requireGrant(owner, reconnect) : undefined;
      if (previous && previous.provider !== provider) throw new ConnectedError(400, 'Reconnect using the original provider.');
      if (provider === 'icloud') {
        const login = bounded(body.login, 240).trim().toLowerCase();
        const verified = await verifyApple(login, bounded(body.password, 40).trim(), services.mail, services.calendar, services.mailWrite);
        const saved = await enroll(owner, provider, verified.identity, verified.credentials, services, reconnect);
        return json(await syncAccount(owner, saved.id, true).catch(() => saved));
      }
      const {sessionId} = await auth();
      const origin = oauthOrigin(provider);
      if (!sessionId || !origin || new URL(request.url).origin !== origin)
        throw new ConnectedError(503, 'Open Connected accounts from the configured HTTPS preview or CRM address.');
      const flow = newFlow({owner, provider, services, session: sessionId, reconnect});
      (await cookies()).set('pacifica_connected_' + flow.nonce, flow.nonce, {
        httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'lax', path: '/api/connected/oauth', maxAge: 600,
      });
      return json({url: authorizationUrl(flow, seal(flow, 'oauth'), previous?.email)});
    }
    const id = bounded(body.id);
    if (body.action === 'disconnect') { await disconnect(owner, id); return json({ok: true}); }
    if (body.action === 'sync') { await quota(owner, 'sync', 20); return json(await syncAccount(owner, id, true)); }
    if (body.action === 'options') return json(await setAccountOptions(owner, id, body));
    throw new ConnectedError(400, 'Choose a connected account action.');
  } catch (error) { return fail(error); }
}
