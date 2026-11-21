'use client';

import {useCallback, useEffect, useState, type FormEvent} from 'react';
import {providerNames, providers, type Provider, type Services} from '../../lib/connected/types';
import {connectedOverview, connectedPost, connectionChanged, errorText, providerInitial, stateLabel, type AccountOverview, type AccountRow} from './client';
import styles from './Connected.module.css';

const defaults: Services = {mail: true, calendar: true, mailWrite: false};
const messages: Record<string, string> = {
  connected: 'Account connected. Discovery and sync will continue in the background.',
  declined: 'The provider did not grant access. You can connect again when ready.',
  'wrong-account': 'Choose the original account when reconnecting.',
  invalid: 'This connection request expired. Start again below.',
  failed: 'The provider connection could not finish. Check permissions and try again.',
};

export function ConnectedHealth({onSettings}: {onSettings: () => void}) {
  const [state, setState] = useState<AccountOverview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => void connectedOverview().then(value => {
      if (active) {setState(value); setError('');}
    }).catch(error => {if (active) setError(errorText(error));});
    load();
    window.addEventListener(connectionChanged, load);
    return () => {active = false; window.removeEventListener(connectionChanged, load);};
  }, []);
  return <section className={styles.health}>
    <header><h3>Connected mail and calendars</h3><button type="button" onClick={onSettings}>Manage accounts</button></header>
    {error ? <p role="status">{error}</p> : !state ? <p role="status">Checking accounts…</p> : !state.accounts.length ? <p>No personal accounts connected.</p> :
      <ul>{state.accounts.map(account => <li key={account.id}><b>{account.email}</b><span>{stateLabel[account.state]}</span>
        <small>{account.lastSync ? 'Last synced ' + new Date(account.lastSync).toLocaleString() : 'First sync pending'}</small></li>)}</ul>}
  </section>;
}

export default function ConnectedAccounts({callback}: {callback?: string}) {
  const [state, setState] = useState<AccountOverview | null>(null);
  const [attempt, setAttempt] = useState<{provider: Provider; id?: string; email?: string} | null>(null);
  const [services, setServices] = useState<Services>(defaults);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState(callback ? messages[callback] || '' : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [shown, setShown] = useState(10);

  const load = useCallback(async (signal?: AbortSignal) => {
    try { setState(await connectedOverview(signal)); }
    catch (error) { if (!signal?.aborted) setError(errorText(error)); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const configured = state?.providers;
  function begin(provider: Provider, account?: AccountRow) {
    const available = provider === 'icloud' ? configured?.icloud : {mail: true, calendar: true};
    setAttempt({provider, id: account?.id, email: account?.email}); setLogin(account?.email || ''); setPassword(''); setError('');
    setServices(account?.enabled || {mail: Boolean(available?.mail), calendar: Boolean(available?.calendar), mailWrite: false});
  }
  async function connect(event: FormEvent) {
    event.preventDefault();
    if (!attempt || busy) return;
    setBusy('connect'); setError(''); setNotice('');
    try {
      const response = await connectedPost<{url?: string}>('accounts', {
        action: 'connect', provider: attempt.provider, id: attempt.id, services,
        ...(attempt.provider === 'icloud' ? {login, password} : {}),
      });
      setPassword('');
      if (response.url) {window.location.assign(response.url); return;}
      setAttempt(null); setNotice(messages.connected);
      await load(); window.dispatchEvent(new Event(connectionChanged));
    } catch (error) {setError(errorText(error)); setPassword('');}
    finally {setBusy('');}
  }
  async function update(account: AccountRow, action: string, value: Record<string, unknown> = {}) {
    if (busy) return;
    const confirm = action !== 'disconnect' || window.confirm('Disconnect ' + account.email + ' from this workspace? External mail and events stay in the provider.');
    if (!confirm) return;
    setBusy(account.id); setNotice(''); setError('');
    try {
      const result = await connectedPost<Partial<AccountRow>>('accounts', {id: account.id, action, ...value});
      await load(); window.dispatchEvent(new Event(connectionChanged));
      if (action === 'disconnect') setNotice(account.email + ' disconnected.');
      if (action === 'sync') setNotice(result.state === 'connected' ? account.email + ' synced.' : stateLabel[result.state || 'syncing'] + ' · ' + account.email);
    } catch (error) { setError(errorText(error)); }
    finally {setBusy('');}
  }

  return <section className={styles.accounts} aria-label="Connected accounts">
    <header className={styles.moduleHeader}><div><h2>Connected accounts</h2><p>Choose which mail and calendars to bring into this workspace. Your connections are private to you.</p></div>
      {state && <details className={styles.menu}><summary>Add account</summary><div>{providers.map(provider => {
        const available = provider === 'icloud' ? configured?.icloud.mail || configured?.icloud.calendar : configured?.[provider];
        return <button key={provider} type="button" disabled={!available || Boolean(busy)} onClick={event => {event.currentTarget.closest('details')?.removeAttribute('open'); begin(provider);}}>
          <span className={styles.providerBadge} data-provider={provider}>{providerInitial[provider]}</span>{providerNames[provider]}{!available && <small>Setup required</small>}
        </button>;
      })}</div></details>}
    </header>
    {!state && !error && <p role="status">Loading connected accounts…</p>}
    {configured && !configured.storage && <p className={styles.notice}>This deployment needs connected account storage before it can accept provider grants.</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {state?.legacy?.map(provider => <div className={styles.legacy} key={provider}>
      <p>Your existing {providerNames[provider]} calendar sync target is available in Calendar settings. Connect it here to grant personal calendar access.</p>
      <button type="button" disabled={!configured?.[provider] || Boolean(busy)} onClick={() => begin(provider)}>Connect {providerNames[provider]} calendar</button>
    </div>)}
    {attempt && <form autoComplete="off" onSubmit={connect} className={styles.connectForm}>
      <h3>{attempt.id ? 'Reconnect ' + attempt.email : 'Connect ' + providerNames[attempt.provider]}</h3>
      <fieldset><legend>Services</legend>
        <label><input type="checkbox" checked={services.mail} disabled={attempt.provider === 'icloud' && !configured?.icloud.mail}
          onChange={event => setServices(old => ({...old, mail: event.target.checked, mailWrite: event.target.checked && old.mailWrite}))}/> Mail</label>
        <label><input type="checkbox" checked={services.calendar} disabled={attempt.provider === 'icloud' && !configured?.icloud.calendar}
          onChange={event => setServices(old => ({...old, calendar: event.target.checked}))}/> Calendar</label>
        <label><input type="checkbox" checked={services.mailWrite} disabled={!services.mail}
          onChange={event => setServices(old => ({...old, mailWrite: event.target.checked}))}/> Allow explicit mailbox actions</label>
      </fieldset>
      {attempt.provider === 'icloud' && <div className={styles.appleCredentials}>
        <label>Primary iCloud Mail address<input required type="email" autoComplete="off" value={login} onChange={event => setLogin(event.target.value)}/></label>
        <label>Apple app-specific password<input required type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)}/></label>
        <a href="https://account.apple.com/" target="_blank" rel="noreferrer">Create an app-specific password</a>
      </div>}
      <div className={styles.buttons}><button type="submit" className={styles.primary} disabled={Boolean(busy) || !(services.mail || services.calendar)}>{busy === 'connect' ? 'Connecting…' : 'Continue'}</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => {setAttempt(null); setPassword('');}}>Cancel</button></div>
    </form>}
    {state && !state.accounts.length && !attempt && <p className={styles.empty}>Add an account to start syncing your mail and calendars.</p>}
    <div className={styles.accountList}>{state?.accounts.slice(0, shown).map(account =>
      <article className={styles.account} key={account.id}>
        <header><span className={styles.providerBadge} data-provider={account.provider}>{providerInitial[account.provider]}</span><div><h3>{account.name || account.email}</h3>
          <p>{account.email} · {providerNames[account.provider]}</p></div><span className={styles.statusPill} data-state={account.state}>{stateLabel[account.state]}</span></header>
        <p>{[account.enabled.mail && 'Mail', account.enabled.calendar && 'Calendar', account.enabled.mailWrite && 'Mailbox actions'].filter(Boolean).join(' · ')}</p>
        <small>{account.lastSync ? 'Last synced ' + new Date(account.lastSync).toLocaleString() : 'First sync pending'}
          {account.retryAt && account.retryAt > Date.now() ? ' · Retry after ' + new Date(account.retryAt).toLocaleTimeString() : ''}</small>
        <div className={styles.buttons}><button type="button" disabled={Boolean(busy) || account.state === 'reconnect'} onClick={() => void update(account, 'sync')}>{busy === account.id ? 'Working…' : 'Sync now'}</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => begin(account.provider, account)}>Reconnect</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => void update(account, 'disconnect')}>Disconnect</button></div>
        <details className={styles.options}><summary>Permissions and views</summary>
          <div className={styles.checks}>{(['mail', 'calendar', 'mailWrite'] as const).map(service => <label key={service}>
            <input type="checkbox" checked={account.enabled[service]} disabled={Boolean(busy) || !account.granted[service] ||
              service === 'mailWrite' && !account.enabled.mail || service === 'mail' && !account.enabled.calendar && account.enabled.mail ||
              service === 'calendar' && !account.enabled.mail && account.enabled.calendar}
              onChange={event => void update(account, 'options', {services: {...account.enabled, [service]: event.target.checked}})}/>
              {{mail: 'Mail', calendar: 'Calendar', mailWrite: 'Mailbox actions'}[service]}</label>)}</div>
          {account.provider !== 'google' && account.enabled.mail && <label className={styles.mapping}>Updates mapping
            <select value={account.updates || ''} disabled={Boolean(busy)} onChange={event => void update(account, 'options', {updates: event.target.value})}>
              <option value="">No mapping</option>{account.folders.filter(folder => !['drafts', 'junk', 'trash'].includes(folder.special || '')).map(folder =>
                <option key={folder.id} value={folder.id}>{folder.path || folder.name}</option>)}
            </select></label>}
          {account.provider === 'google' && account.enabled.mail && <p>Updates uses Gmail’s native category.</p>}
        </details>
      </article>)}</div>
    {state && state.accounts.length > shown && <button type="button" onClick={() => setShown(value => value + 10)}>Show more accounts</button>}
  </section>;
}
