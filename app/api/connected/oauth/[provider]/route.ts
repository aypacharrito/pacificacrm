import {auth} from '@clerk/nextjs/server';
import {cookies} from 'next/headers';
import {connectedOwner} from '../../../../lib/connected/http';
import {completeOAuth, oauthOrigin, type Flow} from '../../../../lib/connected/oauth';
import {enroll, syncAccount} from '../../../../lib/connected/service';
import {claimOauthState, sameOwner, unseal} from '../../../../lib/connected/store';
import {ConnectedError} from '../../../../lib/connected/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const redirect = (status: string) => new Response(null, {status: 303, headers: {
  Location: '/dashboard?connections=' + status, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
}});
export async function GET(request: Request, {params}: {params: Promise<{provider: string}>}) {
  try {
    const {provider} = await params;
    if (provider !== 'google' && provider !== 'microsoft') return redirect('invalid');
    const url = new URL(request.url);
    if (url.origin !== oauthOrigin(provider)) return redirect('invalid');
    const owner = await connectedOwner(request);
    const {sessionId} = await auth();
    const state = url.searchParams.get('state') || '';
    if (!/^[A-Za-z0-9_-]{40,4000}$/.test(state)) return redirect('invalid');
    const flow = unseal<Flow>(state, 'oauth');
    if (!sessionId || flow.session !== sessionId || !sameOwner(owner, flow.owner) || flow.provider !== provider || flow.after < Date.now()) return redirect('invalid');
    const jar = await cookies();
    const name = 'pacifica_connected_' + flow.nonce;
    if (jar.get(name)?.value !== flow.nonce || !await claimOauthState(owner, flow.nonce)) return redirect('invalid');
    jar.set(name, '', {path: '/api/connected/oauth', maxAge: 0, httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:'});
    if (url.searchParams.has('error')) return redirect('declined');
    const code = url.searchParams.get('code');
    if (!code || code.length > 5000) return redirect('invalid');
    const verified = await completeOAuth(flow, code);
    const saved = await enroll(owner, provider, verified.identity, verified.credentials, flow.services, flow.reconnect);
    await syncAccount(owner, saved.id, true).catch(() => undefined);
    return redirect('connected');
  } catch (error) {
    return redirect(error instanceof ConnectedError && error.status === 409 ? 'wrong-account' : 'failed');
  }
}
