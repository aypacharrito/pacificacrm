import {accountAllows} from '../account-access-policy';
import {getPacificaAccess} from '../clerk-access';
import {ConnectedError} from './types';

export const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, {status, headers: {'Cache-Control': 'no-store', ...headers}});
export async function connectedOwner(request: Request) {
  const url = new URL(request.url);
  const access = await getPacificaAccess();
  if (!access.allowed || !access.accountUserId || !accountAllows(access, url.pathname, request.method) ||
      (access.userId !== access.accountUserId && !('teamRole' in access && access.teamRole)))
    throw new ConnectedError(403, 'Sign in with access to this Pacifica workspace.');
  if (request.method === 'POST' && request.headers.get('origin') !== url.origin)
    throw new ConnectedError(403, 'The request must come from Pacifica.');
  return {workspace: access.userId, member: access.accountUserId};
}
export const fail = (error: unknown) => {
  if (error instanceof ConnectedError) {
    const headers: Record<string, string> = {};
    if (error.retryAt) headers['Retry-After'] = String(Math.max(1, Math.ceil((error.retryAt - Date.now()) / 1000)));
    return json({error: error.message}, error.status, headers);
  }
  return json({error: 'Connected accounts could not complete this request. Try again shortly.'}, 503);
};
export async function objectBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.text();
  if (body.length > 24_000) throw new ConnectedError(413, 'Keep this request under 24 KB.');
  try {
    const value: unknown = JSON.parse(body);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* Invalid JSON is a request error. */ }
  throw new ConnectedError(400, 'Choose a valid connected accounts action.');
}
export function bounded(value: unknown, max = 120) {
  if (typeof value !== 'string' || !value || value.length > max) throw new ConnectedError(400, 'The connected account selection is invalid.');
  return value;
}
