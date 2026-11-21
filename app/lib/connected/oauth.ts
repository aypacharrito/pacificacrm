import {createHash, randomBytes, webcrypto} from 'node:crypto';
import {ConnectedError, type Credentials, type Grant, type Identity, type Owner, type Provider, type Services} from './types';

export const googleMail = 'https://www.googleapis.com/auth/gmail.readonly';
export const googleWrite = 'https://www.googleapis.com/auth/gmail.modify';
export const googleCalendar = 'https://www.googleapis.com/auth/calendar.readonly';
const endpoints = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    env: 'PACIFICA_CONNECTED_GOOGLE',
  },
  microsoft: {
    authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    env: 'PACIFICA_CONNECTED_MICROSOFT',
  },
};
export type OAuthProvider = keyof typeof endpoints;
export type Flow = {owner: Owner; session: string; services: Services; nonce: string; verifier: string; provider: OAuthProvider; reconnect?: string; after: number};
type Tokens = {access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string};

function config(provider: OAuthProvider) {
  const entry = endpoints[provider];
  const id = process.env[entry.env + '_CLIENT_ID']?.trim();
  const secret = process.env[entry.env + '_CLIENT_SECRET']?.trim();
  const origin = process.env.PACIFICA_CONNECTED_ORIGIN?.trim();
  if (!id || !secret || !origin) return null;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) return null;
    return {...entry, id, secret, origin, redirect: origin + '/api/connected/oauth/' + provider};
  } catch { return null; }
}
export const oauthConfigured = (provider: OAuthProvider) => Boolean(config(provider));
export const oauthOrigin = (provider: OAuthProvider) => config(provider)?.origin;
export const newFlow = (flow: Omit<Flow, 'nonce' | 'verifier' | 'after'>): Flow => ({
  ...flow, nonce: randomBytes(24).toString('base64url'), verifier: randomBytes(48).toString('base64url'), after: Date.now() + 600_000,
});

function configOrThrow(provider: OAuthProvider) {
  const value = config(provider);
  if (!value) throw new ConnectedError(503, 'This provider needs a connected accounts application and callback.');
  return value;
}

const scopesFor = (provider: OAuthProvider, enabled: Services) => provider === 'google'
  ? ['openid', 'email', 'profile', ...(enabled.mail ? [enabled.mailWrite ? googleWrite : googleMail] : []), ...(enabled.calendar ? [googleCalendar] : [])]
  : ['openid', 'email', 'profile', 'offline_access', 'User.Read', ...(enabled.mail ? [enabled.mailWrite ? 'Mail.ReadWrite' : 'Mail.Read'] : []),
    ...(enabled.calendar ? ['Calendars.Read', 'Calendars.Read.Shared'] : [])];

export function authorizationUrl(flow: Flow, state: string, loginHint?: string) {
  const settings = configOrThrow(flow.provider);
  const parameters = new URLSearchParams({
    client_id: settings.id, redirect_uri: settings.redirect, response_type: 'code', state,
    scope: scopesFor(flow.provider, flow.services).join(' '),
    code_challenge: createHash('sha256').update(flow.verifier).digest('base64url'), code_challenge_method: 'S256',
    nonce: flow.nonce,
    ...(flow.provider === 'google' ? {access_type: 'offline', prompt: 'consent select_account'} : {prompt: 'select_account', response_mode: 'query'}),
    ...(loginHint ? {login_hint: loginHint} : {}),
  });
  return settings.authorize + '?' + parameters.toString();
}

function retryTime(response: Response) {
  const value = response.headers.get('retry-after');
  if (!value) return undefined;
  const time = /^\d+$/.test(value) ? Date.now() + Number(value) * 1000 : Date.parse(value);
  return Number.isFinite(time) ? Math.max(Date.now() + 1000, time) : undefined;
}

export async function providerFetch(url: URL | string, init: RequestInit = {}) {
  let response: Response;
  try { response = await fetch(url, {...init, redirect: 'error', cache: 'no-store', signal: init.signal ?? AbortSignal.timeout(12_000)}); }
  catch { throw new ConnectedError(502, 'The provider could not be reached. Try again shortly.'); }
  return response;
}

export async function responseError(response: Response) {
  if (response.status === 401) return new ConnectedError(401, 'Reconnect this account to restore provider access.');
  if (response.status === 403) return new ConnectedError(403, 'This item needs additional provider permission.');
  if (response.status === 404) return new ConnectedError(404, 'The provider could not find this item.');
  if (response.status === 410) return new ConnectedError(410, 'The provider change cursor expired.');
  if (response.status === 429 || response.status === 503)
    return new ConnectedError(429, 'The provider is limiting requests. Try again later.', retryTime(response) ?? Date.now() + 60_000);
  return new ConnectedError(502, 'The provider could not complete this request.');
}

export async function providerJson<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer ' + token);
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await providerFetch(url, {...init, headers});
  if (!response.ok) throw await responseError(response);
  if (response.status === 204) return {} as T;
  try { return await response.json() as T; }
  catch { throw new ConnectedError(502, 'The provider returned an unexpected response.'); }
}

async function tokenRequest(provider: OAuthProvider, values: Record<string, string>) {
  const settings = configOrThrow(provider);
  const response = await providerFetch(settings.token, {
    method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({client_id: settings.id, client_secret: settings.secret, ...values}),
  });
  const body = await response.json().catch(() => ({})) as Tokens & {error?: string};
  if (['invalid_grant', 'interaction_required', 'consent_required'].includes(body.error || ''))
    throw new ConnectedError(401, 'Reconnect this account to restore provider access.');
  if (!response.ok) throw await responseError(response);
  if (!body.access_token) throw new ConnectedError(502, 'Provider authorization did not return an access token.');
  return body;
}
function credentials(tokens: Tokens, previous?: Credentials): Credentials {
  const secret = tokens.refresh_token || previous?.secret;
  if (!secret) throw new ConnectedError(403, 'The provider did not grant offline access. Reconnect and accept the consent screen.');
  return {
    secret, scopes: tokens.scope?.split(/\s+/).filter(Boolean) ?? previous?.scopes ?? [],
    access: tokens.access_token, expires: Date.now() + Math.max(0, (Number(tokens.expires_in) || 0) - 90) * 1000,
  };
}

export function grantedServices(provider: Provider, scopes: string[]): Services {
  const set = new Set(scopes.map(scope => scope.toLowerCase().replace(/^https:\/\/graph\.microsoft\.com\//, '')));
  if (provider === 'google') return {mail: set.has(googleMail) || set.has(googleWrite), calendar: set.has(googleCalendar), mailWrite: set.has(googleWrite)};
  if (provider === 'microsoft') return {mail: set.has('mail.read') || set.has('mail.readwrite'), calendar: set.has('calendars.read') || set.has('calendars.read.shared'), mailWrite: set.has('mail.readwrite')};
  return {mail: set.has('imap'), calendar: set.has('caldav'), mailWrite: set.has('imap-write')};
}

type MicrosoftClaims = {tid?: string; sub?: string; aud?: string; iss?: string; nonce?: string; exp?: number; nbf?: number; preferred_username?: string; name?: string};
async function microsoftIdentity(token: string, idToken: string, flow: Flow) {
  const [header, body, signature, extra] = idToken.split('.');
  let claims: MicrosoftClaims;
  try {
    if (!header || !body || !signature || extra) throw Error();
    const jwksHeader = JSON.parse(Buffer.from(header, 'base64url').toString()) as {alg?: string; kid?: string};
    claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as MicrosoftClaims;
    const tenant = claims.tid || '';
    const now = Date.now() / 1000;
    if (jwksHeader.alg !== 'RS256' || !jwksHeader.kid || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(tenant) ||
        claims.iss !== 'https://login.microsoftonline.com/' + tenant + '/v2.0' || claims.aud !== configOrThrow('microsoft').id ||
        claims.nonce !== flow.nonce || !claims.sub || Number(claims.exp || 0) < now || Number(claims.nbf || 0) > now + 60) throw Error();
    const response = await providerFetch('https://login.microsoftonline.com/' + tenant + '/discovery/v2.0/keys');
    if (!response.ok) throw Error();
    const {keys} = await response.json() as {keys: Array<JsonWebKey & {kid?: string}>};
    const jwk = keys.find(key => key.kid === jwksHeader.kid && key.kty === 'RSA');
    if (!jwk) throw Error();
    const key = await webcrypto.subtle.importKey('jwk', jwk, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
    if (!await webcrypto.subtle.verify('RSASSA-PKCS1-v1_5', key, Buffer.from(signature, 'base64url'), Buffer.from(header + '.' + body))) throw Error();
  } catch { throw new ConnectedError(403, 'Microsoft account identity could not be verified. Start the connection again.'); }
  const person = await providerJson<{displayName?: string; mail?: string; userPrincipalName?: string}>(
    'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName', token);
  const email = person.mail || person.userPrincipalName || claims.preferred_username || '';
  return {subject: claims.sub!, tenant: claims.tid!, email, name: person.displayName || claims.name || email};
}

export async function completeOAuth(flow: Flow, code: string): Promise<{identity: Identity; credentials: Credentials}> {
  const result = await tokenRequest(flow.provider, {
    grant_type: 'authorization_code', redirect_uri: configOrThrow(flow.provider).redirect, code, code_verifier: flow.verifier,
  });
  const access = result.access_token!;
  let identity: Identity;
  if (flow.provider === 'google') {
    const user = await providerJson<{sub?: string; email?: string; email_verified?: boolean; name?: string}>(
      'https://openidconnect.googleapis.com/v1/userinfo', access);
    if (!user.sub || !user.email || user.email_verified !== true)
      throw new ConnectedError(403, 'Google did not confirm the account identity.');
    identity = {subject: user.sub, tenant: '', email: user.email, name: user.name || user.email};
  } else {
    identity = await microsoftIdentity(access, result.id_token || '', flow);
  }
  if (!identity.email) throw new ConnectedError(403, 'The provider did not return an account address.');
  return {identity, credentials: credentials(result)};
}

export async function freshCredentials(grant: Grant) {
  if (grant.provider === 'icloud' || (grant.credentials.access && (grant.credentials.expires ?? 0) > Date.now())) return grant.credentials;
  return credentials(await tokenRequest(grant.provider, {grant_type: 'refresh_token', refresh_token: grant.credentials.secret}), grant.credentials);
}
