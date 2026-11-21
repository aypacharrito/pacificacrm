import type {Account, MailAction, Preferences, Provider} from '../../lib/connected/types';

export type AccountRow = Account & {actions: MailAction[]};
export type AccountOverview = {
  accounts: AccountRow[]; preferences: Preferences; legacy?: Array<'google' | 'microsoft'>;
  providers: {storage: boolean; google: boolean; microsoft: boolean; icloud: {mail: boolean; calendar: boolean}};
};

export async function connectedRequest<T>(path: string, options: RequestInit = {}) {
  const response = await fetch('/api/connected/' + path, {cache: 'no-store', credentials: 'same-origin', ...options});
  const data = await response.json().catch(() => ({})) as T & {error?: string};
  if (!response.ok) throw new Error(data.error || 'Connected accounts could not load. Try again.');
  return data as T;
}
export const connectedPost = <T,>(path: string, value: unknown) =>
  connectedRequest<T>(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value)});
export async function connectedOverview(signal?: AbortSignal) {
  const value = await connectedRequest<AccountOverview>('accounts', {signal});
  if (!Array.isArray(value.accounts) || !value.providers || !value.preferences) throw new Error('Connected accounts returned an incomplete response.');
  return value;
}
export const errorText = (error: unknown) => error instanceof Error ? error.message : 'Connected accounts could not load.';

export const stateLabel: Record<Account['state'], string> = {
  connected: 'Connected', syncing: 'Syncing', limited: 'Limited permission', reconnect: 'Reconnect needed', unavailable: 'Temporarily unavailable',
};
export const providerInitial: Record<Provider, string> = {google: 'G', microsoft: 'M', icloud: 'i'};
export const connectionChanged = 'pacifica:connected-accounts-changed';
