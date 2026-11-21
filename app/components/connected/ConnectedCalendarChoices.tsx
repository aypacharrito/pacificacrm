'use client';

import {providerNames, type Calendar} from '../../lib/connected/types';
import type {AccountRow} from './client';
import styles from '../OfficeDesk.module.css';

const colors = ['#2cbce9', '#32bb8a', '#c390e6', '#e9984b', '#e76d91', '#99a9ef'];
export const calendarChoiceKey = (account: string, calendar: string) => JSON.stringify([account, calendar]);

export default function ConnectedCalendarChoices({accounts, focus, pending, onFocus, onChange, onSettings}: {
  accounts: AccountRow[]; focus: string; pending: string; onFocus: (value: string) => void;
  onChange: (account: AccountRow, calendar: Calendar, visible: boolean, color?: string) => void; onSettings?: () => void;
}) {
  return <details className={styles.connectedChoices}>
    <summary>Connected calendars</summary>
    {accounts.length > 0 && <label className={styles.visibleCalendars}><span>Show</span>
      <select aria-label="Show calendar" value={focus} onChange={event => onFocus(event.target.value)}>
        <option value="">All visible calendars</option>{accounts.map(account => <optgroup key={account.id} label={account.email}>
          {account.calendars.filter(calendar => account.calendarChoices[calendar.id]?.visible ?? Boolean(calendar.primary)).map(calendar =>
            <option key={calendar.id} value={calendarChoiceKey(account.id, calendar.id)}>{calendar.name}</option>)}
        </optgroup>)}
      </select></label>}
    {accounts.map(account => <section key={account.id}>
      <h4 title={account.email}>{account.email}</h4><small>{providerNames[account.provider]}</small>
      {account.calendars.map((calendar, index) => {
        const choice = account.calendarChoices[calendar.id];
        const visible = choice?.visible ?? Boolean(calendar.primary);
        const color = choice?.color || (/^#[a-f0-9]{6}$/i.test(calendar.color || '') ? calendar.color : colors[index % colors.length]);
        return <div key={calendar.id} className={styles.calendarChoice}>
          <label><input type="checkbox" checked={visible} disabled={Boolean(pending)} onChange={event => onChange(account, calendar, event.target.checked, color)}/>
            <span>{calendar.name}{calendar.busyOnly ? ' · Busy only' : ''}</span></label>
          <input aria-label={'Color for ' + calendar.name + ' (' + account.email + ')'} type="color" value={color} disabled={Boolean(pending)}
            onChange={event => onChange(account, calendar, visible, event.target.value)}/>
        </div>;
      })}
      {!account.calendars.length && <p>Discovery pending. Check account status in Settings.</p>}
    </section>)}
    {onSettings && <button type="button" onClick={onSettings}>Manage accounts</button>}
  </details>;
}
