'use client';

import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {useDialogFocus} from '../../hooks/use-dialog-focus';
import styles from './Assistant.module.css';

export type AssistantActivity = 'idle' | 'working' | 'sending' | 'ready' | 'listening' | 'speaking' | 'error';
const states: Record<AssistantActivity, string> = {
  idle: 'Ready', working: 'Thinking', sending: 'Sending', ready: 'Reply ready',
  listening: 'Listening', speaking: 'Speaking', error: 'Needs attention',
};

export default function AssistantLauncher({open, activity, blocked, away, onOpen, onClose, children}: {
  open: boolean; activity: AssistantActivity; blocked: boolean; away: boolean;
  onOpen: () => void; onClose: () => void; children: ReactNode;
}) {
  const [visited, setVisited] = useState(false);
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
  return <>
    <div className={styles.launcher} data-away={away} hidden={open || blocked}>
      <button ref={button} type="button" className={styles.orb} data-state={activity} aria-label={'Open Pacifica assistant. ' + states[activity]}
        aria-haspopup="dialog" aria-controls="pacifica-assistant" onClick={show}>
        <i className={styles.arc}/><i className={styles.orbit}/><i className={styles.core}/>
      </button>
    </div>
    <section ref={dialog} id="pacifica-assistant" role="dialog" aria-modal="true" aria-labelledby="assistant-label" tabIndex={-1}
      className={styles.panel} data-away={away} hidden={!open || blocked}>
      <div className={styles.bar}>
        <div><i className={styles.dot} data-state={activity}/><h2 id="assistant-label">Pacifica assistant</h2><span role="status">{states[activity]}</span></div>
        <button type="button" aria-label="Close Pacifica assistant" onClick={close}>×</button>
      </div>
      <div className={styles.content}>{(visited || open) && children}</div>
    </section>
  </>;
}
