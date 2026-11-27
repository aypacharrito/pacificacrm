'use client';

import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {useDialogFocus} from '../../hooks/use-dialog-focus';
import styles from './Assistant.module.css';

export const defaultAssistantName = 'Doxa';

export type AssistantActivity = 'idle' | 'working' | 'sending' | 'ready' | 'listening' | 'speaking' | 'error';
const states: Record<AssistantActivity, string> = {
  idle: 'Ready', working: 'Thinking', sending: 'Sending', ready: 'Reply ready',
  listening: 'Listening', speaking: 'Speaking', error: 'Needs attention',
};

export default function AssistantLauncher({name = defaultAssistantName, open, activity, blocked, away, onOpen, onClose, onRename, children}: {
  name?: string; open: boolean; activity: AssistantActivity; blocked: boolean; away: boolean;
  onOpen: () => void; onClose: () => void; onRename?: (name: string) => Promise<void>; children: ReactNode;
}) {
  const [visited, setVisited] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState('');
  const renameButton = useRef<HTMLButtonElement | null>(null);
  const dialog = useRef<HTMLElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => {
    onClose();
    requestAnimationFrame(() => button.current?.focus({preventScroll: true}));
  }, [onClose]);
  useDialogFocus(dialog, open && !blocked, close);
  useEffect(() => {
    if (open) setVisited(true);
    if (open && blocked) onClose();
  }, [open, blocked, onClose]);
  function show() {
    setVisited(true);
    onOpen();
  }
  async function saveName(next: string) {
    if (!onRename || renaming) return;
    setRenaming(true);
    setRenameError('');
    try {
      await onRename(next);
      setEditing(false);
      requestAnimationFrame(() => renameButton.current?.focus({preventScroll: true}));
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'The assistant name could not be saved.');
    } finally {
      setRenaming(false);
    }
  }

  return <>
    <div className={styles.launcher} data-away={away} hidden={open || blocked}>
      <button ref={button} type="button" className={styles.orb} data-state={activity} aria-label={'Open ' + name + '. ' + states[activity]}
        aria-haspopup="dialog" aria-controls="pacifica-assistant" onClick={show}>
        <i className={styles.arc}/><i className={styles.orbit}/><i className={styles.core}/>
      </button>
    </div>
    <section ref={dialog} id="pacifica-assistant" role="dialog" aria-modal="true" aria-labelledby="assistant-label" tabIndex={-1}
      className={styles.panel} data-away={away} hidden={!open || blocked}>
      <div className={styles.bar}>
        <div><i className={styles.dot} data-state={activity}/><h2 id="assistant-label">{name}</h2><span role="status">{states[activity]}</span></div>
        <div className={styles.barActions}>
          {onRename && <button ref={renameButton} type="button" aria-expanded={editing} aria-controls={editing ? 'assistant-name-form' : undefined}
            onClick={() => { setDraftName(name); setRenameError(''); setEditing(value => !value); }}>Rename assistant</button>}
          <button type="button" aria-label={'Close ' + name} onClick={close}>×</button>
        </div>
      </div>
      <div className={styles.content}>
        {editing && onRename && <form id="assistant-name-form" className={styles.nameForm} onSubmit={event => {
          event.preventDefault();
          void saveName(draftName.trim());
        }}>
          <label>Assistant name <input value={draftName} maxLength={60} required disabled={renaming}
            onChange={event => setDraftName(event.target.value)}/></label>
          <button type="submit" disabled={renaming}>{renaming ? 'Saving…' : 'Save name'}</button>
          <button type="button" disabled={renaming} onClick={() => void saveName('')}>Reset to Doxa</button>
          {renameError && <small role="alert">{renameError}</small>}
        </form>}
        {(visited || open) && children}
      </div>
    </section>
  </>;
}
