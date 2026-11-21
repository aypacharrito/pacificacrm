'use client';

import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {defaultPreferences, providerNames, type MailAction, type MailDetail, type MailRow, type MailView, type Preferences} from '../../lib/connected/types';
import {connectedOverview, connectedPost, connectedRequest, connectionChanged, errorText, type AccountOverview} from './client';
import styles from './Connected.module.css';

type Page = {rows: MailRow[]; next?: string; coverage: Array<{connection: string; account: string; status: string; reason?: string}>};
type Search = {q: string; from: string; subject: string; start: string; end: string; attachments: boolean};
const emptySearch: Search = {q: '', from: '', subject: '', start: '', end: '', attachments: false};
const viewLabel: Record<MailView, string> = {
  all: 'All Mail', starred: 'Starred', updates: 'Updates', inbox: 'Inbox', unread: 'Unread', sent: 'Sent', archive: 'Archive',
  drafts: 'Drafts', junk: 'Spam / Junk', trash: 'Trash', folder: 'Folder or label',
};
const primary: MailView[] = ['all', 'starred', 'updates'];
const folders: MailView[] = ['inbox', 'unread', 'sent', 'archive', 'drafts', 'junk', 'trash'];
const rowKey = (row: MailRow) => JSON.stringify([row.connection, row.id]);
const coverageLabel: Record<string, string> = {pending: 'More mail is available', unavailable: 'Incomplete', 'no-updates': 'No Updates mapping', searched: 'Searched'};

export default function ConnectedMail({source, onSettings}: {source?: string; onSettings: () => void}) {
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [choices, setChoices] = useState<Preferences>(defaultPreferences);
  const [draft, setDraft] = useState<Search>(emptySearch);
  const [search, setSearch] = useState<Search>(emptySearch);
  const [page, setPage] = useState<Page | null>(null);
  const [active, setActive] = useState(source || '');
  const [detail, setDetail] = useState<MailDetail | null>(null);
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const saved = useRef<Promise<unknown>>(Promise.resolve());
  const listRequest = useRef<AbortController | null>(null);
  const lastOpened = useRef<HTMLButtonElement | null>(null);
  const detailHeading = useRef<HTMLHeadingElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = () => void connectedOverview(controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setOverview(data); setChoices(data.preferences); setReady(true);
    }).catch(error => {if (!controller.signal.aborted) setListError(errorText(error));});
    load();
    window.addEventListener(connectionChanged, load);
    return () => {controller.abort(); window.removeEventListener(connectionChanged, load);};
  }, []);
  useEffect(() => { if (source) setActive(source); }, [source]);

  function select(value: Preferences) {
    setChoices(value); setNotice('');
    saved.current = saved.current.catch(() => undefined).then(() => connectedPost<Preferences>('accounts', {action: 'preferences', ...value}))
      .catch(error => setNotice(errorText(error)));
  }

  const storageReady = overview?.providers.storage;
  const loadMail = useCallback(async (cursor?: string) => {
    if (!storageReady) return;
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setLoading(true); setListError('');
    if (!cursor) setPage(null);
    try {
      const query = new URLSearchParams(cursor ? {cursor} : {
        view: choices.view, ...(choices.folder ? {folder: choices.folder} : {}),
        q: search.q, from: search.from, subject: search.subject, start: search.start, end: search.end, attachments: String(search.attachments),
      });
      if (!cursor) choices.selected.forEach(id => query.append('account', id));
      const data = await connectedRequest<Page>('mail?' + query, {signal: controller.signal});
      if (controller.signal.aborted) return;
      setPage(previous => cursor && previous ? {...data, rows: [...new Map([...previous.rows, ...data.rows].map(row => [rowKey(row), row])).values()]} : data);
    } catch (error) { if (!controller.signal.aborted) setListError(errorText(error)); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [choices, search, storageReady]);
  useEffect(() => {
    if (ready) void loadMail();
    return () => listRequest.current?.abort();
  }, [loadMail, ready, reload]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setReading(true); setDetailError(''); setDetail(null); setTarget('');
    void connectedRequest<MailDetail>('mail?source=' + encodeURIComponent(active), {signal: controller.signal}).then(data => {
      if (!controller.signal.aborted) setDetail(data);
    }).catch(error => {
      if (!controller.signal.aborted) setDetailError(errorText(error));
    }).finally(() => { if (!controller.signal.aborted) setReading(false); });
    return () => controller.abort();
  }, [active]);
  useEffect(() => { if (detail) detailHeading.current?.focus({preventScroll: true}); }, [detail]);

  const accounts = (overview?.accounts || []).filter(account => account.enabled.mail);
  const chosen = choices.selected.length ? accounts.filter(account => choices.selected.includes(account.id)) : accounts;
  const scoped = chosen.length === 1 ? chosen[0] : undefined;
  const currentAccount = accounts.find(account => account.id === detail?.connection);
  const updates = chosen.map(account => ({
    account: account.email, source: account.provider === 'google' ? 'Gmail Updates' : account.folders.find(folder => folder.id === account.updates)?.name,
  }));
  const moves = (currentAccount?.folders || []).filter(folder => folder.kind !== 'category' && (currentAccount?.provider !== 'google' ||
    folder.id === 'INBOX' || folder.id.startsWith('Label_')) && !['drafts', 'sent', 'trash', 'junk'].includes(folder.special || ''));

  async function write(action: MailAction) {
    if (!detail || busy) return;
    if (action === 'trash' && !window.confirm('Move this message from ' + detail.account + ' to Trash?')) return;
    setBusy(true); setDetailError(''); setNotice('');
    try {
      const {message} = await connectedPost<{message: MailRow | null}>('mail', {source: detail.source, action,
        ...(action === 'move' ? {folder: target} : {}), ...(action === 'trash' ? {confirm: true} : {})});
      if (message) setDetail(value => value?.source === detail.source ? {...value, ...message} : value);
      setNotice('Updated in ' + detail.account + '.'); setReload(value => value + 1);
    } catch (error) { setDetailError(errorText(error)); }
    finally {setBusy(false);}
  }

  const submit = (event: FormEvent) => {event.preventDefault(); setSearch({...draft});};
  function back() {
    setActive(''); setDetail(null); setDetailError(''); setReading(false);
    requestAnimationFrame(() => lastOpened.current?.focus());
  }

  return <section className={styles.mail} aria-label="Connected mail">
    <header className={styles.moduleHeader}><div><h1>Connected mail</h1><p>Mail from the accounts you’ve connected to Pacifica.</p></div>
      <button type="button" onClick={onSettings}>Manage accounts</button></header>
    <div className={styles.mailToolbar}>
      <details className={styles.menu}><summary>{!choices.selected.length ? 'All accounts' : scoped ? scoped.email : chosen.length + ' accounts selected'}</summary>
        <div><button type="button" onClick={event => {select({...choices, selected: [], folder: undefined, view: choices.view === 'folder' ? 'all' : choices.view}); event.currentTarget.closest('details')?.removeAttribute('open');}}>All accounts</button>
          {accounts.map(account => <label key={account.id}><input type="checkbox" checked={choices.selected.includes(account.id)} onChange={event => {
            const selected = event.target.checked ? [...choices.selected, account.id] : choices.selected.filter(id => id !== account.id);
            select({...choices, selected, folder: undefined, view: choices.view === 'folder' ? 'all' : choices.view});
          }}/><span>{account.email}<small>{providerNames[account.provider]}</small></span></label>)}
          {accounts.length > 0 && <button type="button" onClick={event => event.currentTarget.closest('details')?.removeAttribute('open')}>Done</button>}
        </div>
      </details>
      <div className={styles.mailModes} role="group" aria-label="Primary mail views">{primary.map(view =>
        <button key={view} type="button" aria-pressed={choices.view === view} onClick={() => select({...choices, view, folder: undefined})}>{viewLabel[view]}</button>)}
      </div>
      <select aria-label="Folder or label" value={choices.view === 'folder' ? 'native:' + choices.folder : primary.includes(choices.view) ? '' : choices.view}
        onChange={event => {const value = event.target.value; select({...choices, view: value.startsWith('native:') ? 'folder' : value ? value as MailView : 'all',
          folder: value.startsWith('native:') ? value.slice(7) : undefined});}}>
        <option value="">Folders & labels</option>{folders.map(view => <option key={view} value={view}>{viewLabel[view]}</option>)}
        {scoped && <optgroup label={scoped.email}>{scoped.folders.map(folder =>
          <option key={folder.id} value={'native:' + folder.id}>{folder.path || folder.name}</option>)}</optgroup>}
      </select>
    </div>
    <form onSubmit={submit} className={styles.search}>
      <div><input type="search" aria-label="Search mail" placeholder="Search mail" value={draft.q} onChange={event => setDraft(old => ({...old, q: event.target.value}))}/>
        <button type="submit">Search</button><button type="button" onClick={() => {setDraft(emptySearch); setSearch(emptySearch);}}>Clear</button></div>
      <details><summary>Search filters</summary><div className={styles.advanced}>
        <label>Sender<input value={draft.from} onChange={event => setDraft(old => ({...old, from: event.target.value}))}/></label>
        <label>Subject<input value={draft.subject} onChange={event => setDraft(old => ({...old, subject: event.target.value}))}/></label>
        <label>From date (UTC)<input type="date" value={draft.start} onChange={event => setDraft(old => ({...old, start: event.target.value}))}/></label>
        <label>Through date (UTC)<input type="date" value={draft.end} onChange={event => setDraft(old => ({...old, end: event.target.value}))}/></label>
        <label><input type="checkbox" checked={draft.attachments} onChange={event => setDraft(old => ({...old, attachments: event.target.checked}))}/> Has attachment</label>
      </div></details>
    </form>
    <div className={styles.mailScope}><b>{choices.view === 'folder' ? scoped?.folders.find(folder => folder.id === choices.folder)?.name || viewLabel.folder : viewLabel[choices.view]}</b>
      <span>{scoped?.email || (choices.selected.length ? chosen.length + ' selected accounts' : 'All accounts')}
        {search.start || search.end ? ' · ' + (search.start || 'Any earlier date') + ' to ' + (search.end || 'present') : ''}</span>
      {choices.view === 'all' && <small>Includes sent and archived mail. Drafts, spam and trash have their own views.</small>}
    </div>
    {choices.view === 'updates' && updates.length > 0 && <details className={styles.coverage} open={updates.every(item => !item.source)}>
      <summary>Updates sources ({updates.filter(item => item.source).length} of {updates.length})</summary>
      <ul>{updates.map(item => <li key={item.account}>{item.account} · {item.source || 'No mapping'}</li>)}</ul>
      {updates.some(item => !item.source) && <button type="button" onClick={onSettings}>Set up mapping</button>}
    </details>}
    {page?.coverage.length ? <details className={styles.coverage}>
      <summary>Search coverage</summary><ul>{page.coverage.map(item => <li key={item.connection}>{item.account} · {coverageLabel[item.status] || item.status}
        {item.reason && <small>{item.reason}</small>}</li>)}</ul>
    </details> : null}
    {page?.coverage.some(item => item.status === 'unavailable') && <p className={styles.notice} role="status">Some accounts couldn’t be searched. Open Search coverage for details.</p>}
    {listError && <p role="alert" className={styles.error}>{listError}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <div className={styles.mailGrid} data-reading={Boolean(active)}>
      <div className={styles.messageList} aria-label="Messages" aria-busy={loading}>
        {loading && !page && <p role="status" className={styles.empty}>Loading mail…</p>}
        {!loading && !listError && (page?.rows.length === 0 || ready && !accounts.length) && <p className={styles.empty}>{accounts.length ? 'No messages in this view.' : 'Connect a mail account to start.'}</p>}
        {page?.rows.map(row => <button key={rowKey(row)} type="button" aria-pressed={detail ? rowKey(detail) === rowKey(row) : active === row.source}
          onClick={event => {lastOpened.current = event.currentTarget; setActive(row.source);}} className={styles.message} data-unread={row.unread}>
          <div><b>{row.sender || row.account}</b><time dateTime={new Date(row.at).toISOString()}>{new Date(row.at).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</time></div>
          <strong>{row.starred && <span className={styles.star} aria-label="Starred">★ </span>}{row.subject || '(No subject)'}</strong>
          <p>{row.preview}</p><small>{row.account}{row.unread ? ' · Unread' : ''}{row.hasAttachments ? ' · Attachment' : ''}</small>
        </button>)}
        {page?.next && <button className={styles.moreButton} type="button" disabled={loading} onClick={() => void loadMail(page.next)}>{loading ? 'Loading…' : 'Load more'}</button>}
        {listError && <button className={styles.moreButton} type="button" onClick={() => setReload(value => value + 1)}>Retry</button>}
      </div>
      <article className={styles.reader} aria-label="Reading pane" aria-busy={reading}>
        <button className={styles.back} type="button" onClick={back}>← Back to messages</button>
        {reading && <p role="status">Opening message…</p>}
        {detailError && <p role="alert" className={styles.error}>{detailError}</p>}
        {!active && <p className={styles.empty}>Select a message to read it.</p>}
        {detail && <><header className={styles.detailHeader}><p>{detail.account} · {providerNames[detail.provider]}</p>
          <h2 ref={detailHeading} tabIndex={-1}>{detail.subject || '(No subject)'}</h2>
          <div><b>{detail.sender}</b><time dateTime={new Date(detail.at).toISOString()}>{new Date(detail.at).toLocaleString()}</time></div>
          {detail.recipients.length > 0 && <p>To {detail.recipients.join(', ')}</p>}
          {detail.flag === 'complete' && <p>Follow-up complete</p>}
          {detail.link && <a href={detail.link} target="_blank" rel="noreferrer">Open in {providerNames[detail.provider]}</a>}</header>
          {currentAccount?.actions.length ? <div className={styles.buttons} aria-label={'Actions for ' + detail.account}>
            <button type="button" disabled={busy} onClick={() => void write(detail.starred ? 'unstar' : 'star')}>{detail.starred ? 'Remove star' : 'Star'}</button>
            <button type="button" disabled={busy} onClick={() => void write(detail.unread ? 'read' : 'unread')}>{detail.unread ? 'Mark read' : 'Mark unread'}</button>
            {currentAccount.actions.includes('archive') && <button type="button" disabled={busy} onClick={() => void write('archive')}>Archive</button>}
            {currentAccount.actions.includes('trash') && detail.excluded !== 'trash' && <button type="button" disabled={busy} onClick={() => void write('trash')}>Move to Trash</button>}
            {currentAccount.actions.includes('move') && moves.length > 0 && <><select aria-label="Move to" value={target} onChange={event => setTarget(event.target.value)}>
              <option value="">Move to…</option>{moves.map(folder => <option key={folder.id} value={folder.id}>{folder.path || folder.name}</option>)}</select>
              <button type="button" disabled={!target || busy} onClick={() => void write('move')}>Move</button></>}
          </div> : null}
          <div className={styles.body}>{detail.text || 'No text available.'}</div>
          {detail.attachments.length > 0 && <section><h3>Attachments</h3><ul className={styles.attachments}>{detail.attachments.map(item =>
            <li key={item.id}><a href={item.download}>{item.name}</a></li>)}</ul></section>}
          {detail.related.length > 0 && <section><h3>Other messages in this thread</h3><ul className={styles.attachments}>{detail.related.map(row =>
            <li key={rowKey(row)}><button type="button" onClick={() => setActive(row.source)}>{row.sender} · {row.subject || '(No subject)'}</button></li>)}</ul></section>}
        </>}
      </article>
    </div>
  </section>;
}
