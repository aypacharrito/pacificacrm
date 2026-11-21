import {authenticateGmailPush} from '../gmail-triage-google';
import {isConnectedConfigured, signalGmail} from './store';

export function connectedPushConfig() {
  const topic = process.env.PACIFICA_CONNECTED_GMAIL_TOPIC?.trim() || '';
  const subscription = process.env.PACIFICA_CONNECTED_GMAIL_SUBSCRIPTION?.trim() || '';
  const pushAudience = process.env.PACIFICA_CONNECTED_GMAIL_PUSH_AUDIENCE?.trim() || '';
  const pushServiceAccount = process.env.PACIFICA_CONNECTED_GMAIL_PUSH_SERVICE_ACCOUNT?.trim() || '';
  const pushReady = isConnectedConfigured() && /^projects\/[^/]+\/topics\/[^/]+$/.test(topic) &&
    /^projects\/[^/]+\/subscriptions\/[^/]+$/.test(subscription) && Boolean(pushAudience && pushServiceAccount);
  return {topic, subscription, pushAudience, pushServiceAccount, pushReady};
}

export async function gmailPush(request: Request) {
  const config = connectedPushConfig();
  if (!await authenticateGmailPush(request.headers.get('authorization'), config)) return new Response(null, {status: 401});
  let email: string;
  try {
    if (Number(request.headers.get('content-length')) > 8192) return new Response(null, {status: 413});
    const text = await request.text();
    if (text.length > 8192) return new Response(null, {status: 413});
    const body = JSON.parse(text) as {subscription?: string; message?: {data?: string}};
    const data = body.message?.data;
    if (body.subscription !== config.subscription || !data || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(data)) return new Response(null, {status: 400});
    const notice = JSON.parse(Buffer.from(data, 'base64').toString()) as {emailAddress?: string; historyId?: string};
    if (!/^\d{1,40}$/.test(notice.historyId || '') || !/^[^@\s]+@[^@\s]+$/.test(notice.emailAddress || '')) return new Response(null, {status: 400});
    email = notice.emailAddress!.toLowerCase();
  } catch { return new Response(null, {status: 400}); }
  // The delivery is a hint. The account lease owns the Gmail history cursor, so
  // replays, duplicate hints and reordered push messages cannot skip mail changes.
  try { await signalGmail(email); return new Response(null, {status: 204}); }
  catch { return new Response(null, {status: 503}); }
}
