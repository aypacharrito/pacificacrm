"use client";

import { useCallback, useEffect, useState } from "react";
import type { GmailPreferences } from "../lib/gmail-triage-store";

type GmailAccount = {
  address: string;
  connected: boolean;
  pushActive: boolean;
  preferences: GmailPreferences;
  status?: string;
  lastRunAt?: number;
  stats: Record<string, number>;
  tasks: { id: string; title: string; updatedAt: number; url: string }[];
};

type Snapshot = { configured: boolean; pushConfigured: boolean; accounts: GmailAccount[] };

const settings: [keyof GmailPreferences, string][] = [
  ["star", "Star high-priority messages"],
  ["tasks", "Add follow-ups to Today"],
  ["trash", "Move verified clutter and routine notices older than seven days to Gmail Trash"],
  ["sms", "Text my verified owner number about new priorities"],
  ["starredReview", "Remind me to review starred mail"],
  ["model", "Use OpenAI to identify ambiguous follow-ups"],
];

async function gmailRequest(body?: object) {
  const response = await fetch("/api/integrations/gmail", body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : { cache: "no-store" });
  if (response.status === 403 && !body) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Gmail could not complete that action. Try again shortly.");
  return data;
}

export default function GmailTriagePanel({ today = false }: { today?: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Record<string, GmailPreferences>>({});
  const read = useCallback(async () => {
    try {
      const data = await gmailRequest() as Snapshot | null;
      if (data && !Array.isArray(data.accounts)) throw new Error("Gmail returned an incomplete snapshot.");
      setSnapshot(data);
    }
    catch { setNotice("Gmail could not load. Try again shortly."); }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      if (!today && new URLSearchParams(window.location.search).get("gmail") === "failed") {
        setNotice("Gmail connection failed. Select the matching Google address and grant access.");
      }
      void read();
    }, 0);
    if (!today) return () => window.clearTimeout(initial);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void read(); }, 30_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [read, today]);

  async function change(action: string, address: string, extra: object = {}) {
    setBusy(true);
    setNotice("");
    try {
      const result = await gmailRequest({ action, address, ...extra });
      if (action === "connect" && result?.url) {
        const url = new URL(result.url);
        if (url.origin !== "https://accounts.google.com") throw new Error("Gmail sign-in link was invalid.");
        window.location.assign(url.href);
        return;
      }
      if (action === "review-starred") await gmailRequest({ action: "sync", address });
      if (action === "preferences") setDraft(current => {
        const next = { ...current };
        delete next[address];
        return next;
      });
      await read();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Gmail action failed."); }
    finally { setBusy(false); }
  }

  if (today) {
    const tasks = snapshot?.accounts.flatMap(account => account.tasks.map(task => ({ ...task, address: account.address })))
      .sort((left, right) => right.updatedAt - left.updatedAt) || [];
    if (!tasks.length) return null;
    return <section className="note-reminders today-focus" aria-label="Gmail tasks">
      <header><h2>Gmail tasks</h2></header>
      {notice && <p role="status">{notice}</p>}
      {tasks.slice(0, 40).map(task => <article className="today-task" key={`${task.address}:${task.id}`}>
        <div className="today-task-main">
          <b>{task.title}</b>
          <small>{task.address}</small>
          <a href={task.url} target="_blank" rel="noreferrer">Open in Gmail</a>
        </div>
        <button className="today-complete" type="button" disabled={busy} onClick={() => void change("complete", task.address, { taskId: task.id })}>Done</button>
      </article>)}
      {tasks.length > 40 && <p>{tasks.length - 40} more Gmail tasks.</p>}
    </section>;
  }

  if (!snapshot && !notice) return null;
  return <article className="smart-connect" aria-label="Gmail triage">
    <header><h2>Gmail triage</h2></header>
    {notice && <p role="status">{notice}</p>}
    {snapshot && !snapshot.configured && <p>Gmail server setup is required before connecting an account.</p>}
    {snapshot?.accounts.map(account => <section key={account.address}>
      <h3>{account.address}</h3>
      {!account.connected ? <button type="button" disabled={!snapshot.configured || busy} onClick={() => void change("connect", account.address)}>Connect Gmail</button> : <>
        <p>{account.pushActive ? "Receiving Gmail updates" : "Connected. Immediate Gmail updates are pending setup or the first check."}</p>
        {account.status === "check_connection" && <p role="status">Check the Google connection or reconnect this account.</p>}
        {account.status === "retry" && <p role="status">The last check paused. Saved progress will be used on retry.</p>}
        {account.lastRunAt && <p>Last checked {new Date(account.lastRunAt).toLocaleString()}</p>}
        <p>{account.stats.starred || 0} starred · {account.stats.trashed || 0} moved to Trash · {account.tasks.length} open tasks</p>
        <fieldset disabled={busy}>
          <legend>Actions</legend>
          {settings.map(([key, label]) => <div key={key}><label>
            <input type="checkbox" checked={(draft[account.address] || account.preferences)[key]} onChange={event => {
              const checked = event.target.checked;
              setDraft(current => ({ ...current, [account.address]: { ...(current[account.address] || account.preferences), [key]: checked } }));
            }}/> {label}
          </label></div>)}
          <button type="button" disabled={!draft[account.address]} onClick={() => void change("preferences", account.address, { preferences: draft[account.address] })}>Save actions</button>
        </fieldset>
        <div>
          <button type="button" disabled={busy} onClick={() => void change("sync", account.address)}>Check now</button>
          <button type="button" disabled={busy} onClick={() => void change("review-starred", account.address)}>Review existing stars</button>
          <button type="button" disabled={busy} onClick={() => void change("connect", account.address)}>Reconnect</button>
          <button type="button" disabled={busy} onClick={() => { if (window.confirm("Disconnect Gmail and remove its task and sync history from Pacifica?")) void change("disconnect", account.address); }}>Disconnect</button>
        </div>
      </>}
    </section>)}
  </article>;
}
