'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {useLanguage} from './LanguageProvider';

type RecordingSession = {
  recorder?: MediaRecorder;
  stream?: MediaStream;
  timer?: ReturnType<typeof setTimeout>;
  finishing: boolean;
  controller: AbortController;
};

const recordingTypes = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
const audioExtensions: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
};

function stopTracks(session: RecordingSession) {
  const stream = session.stream;
  session.stream = undefined;
  stream?.getTracks().forEach(track => track.stop());
}

function microphoneError(error: unknown) {
  if (error instanceof Error || error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'Allow microphone access in your browser settings, then try again.';
    if (error.name === 'NotFoundError') return 'No microphone was found. You can still type your message.';
    if (error.name === 'NotReadableError') return 'The microphone is busy or unavailable. Close other apps using it and try again.';
    return error.message;
  }
  return 'Could not open the microphone. Try again or type your message.';
}

export default function VoiceDictation({disabled, onText, compact = false, onActiveChange, onStatus}: {
  disabled: boolean;
  onText: (text: string) => void;
  compact?: boolean;
  onActiveChange?: (active: boolean) => void;
  onStatus?: (status: 'idle' | 'listening' | 'error') => void;
}) {
  const {writingLanguage} = useLanguage();
  const [phase, setPhase] = useState<'idle' | 'starting' | 'recording' | 'transcribing'>('idle');
  const [error, setError] = useState('');
  const session = useRef<RecordingSession | null>(null);
  const callback = useRef(onText);
  const activeCallback = useRef(onActiveChange);

  useEffect(() => {
    callback.current = onText;
    activeCallback.current = onActiveChange;
  }, [onText, onActiveChange]);

  const release = useCallback(() => {
    const active = session.current;
    if (!active) return;
    session.current = null;
    clearTimeout(active.timer);
    active.controller.abort();
    const recorder = active.recorder;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        // The track cleanup below still runs if the browser already stopped recording.
      }
    }
    stopTracks(active);
    activeCallback.current?.(false);
  }, []);

  const cancel = useCallback(() => {
    release();
    setPhase('idle');
  }, [release]);

  useEffect(() => {
    const visibility = () => { if (document.hidden) cancel(); };
    window.addEventListener('pagehide', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pagehide', cancel);
      document.removeEventListener('visibilitychange', visibility);
      release();
    };
  }, [cancel, release]);

  useEffect(() => {
    if (disabled) cancel();
  }, [disabled, cancel]);

  useEffect(() => {
    onStatus?.(phase === 'recording' ? 'listening' : error ? 'error' : 'idle');
  }, [phase, error, onStatus]);

  function finish() {
    const active = session.current;
    const recorder = active?.recorder;
    if (!active || !recorder || active.finishing) return;

    active.finishing = true;
    clearTimeout(active.timer);
    setPhase('transcribing');
    try {
      recorder.stop();
    } catch {
      cancel();
      setError('The recording could not finish. Try again or type your message.');
    }
  }

  async function start() {
    if (session.current || disabled) return;
    const active: RecordingSession = {finishing: false, controller: new AbortController()};
    session.current = active;
    setError('');
    setPhase('starting');
    activeCallback.current?.(true);

    try {
      if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw Error('Voice input is unavailable here. Open the CRM over HTTPS in a supported browser or type your message.');
      }

      active.stream = await navigator.mediaDevices.getUserMedia({audio: true});
      if (session.current !== active) {
        stopTracks(active);
        return;
      }

      for (const track of active.stream.getTracks()) {
        track.addEventListener?.('ended', () => {
          if (session.current !== active || active.finishing) return;
          cancel();
          setError('Microphone access ended. Tap Voice input to try again.');
        }, {once: true, signal: active.controller.signal});
      }

      const mimeType = recordingTypes.find(type => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(active.stream, mimeType ? {mimeType} : undefined);
      active.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        cancel();
        setError('Recording stopped. Try again or type your message.');
      };
      recorder.onstop = async () => {
        clearTimeout(active.timer);
        stopTracks(active);
        if (session.current !== active) return;

        try {
          if (!active.finishing) throw Error('The microphone was interrupted. Try recording again.');
          if (!chunks.length) throw Error('No audio was recorded. Please try again.');
          const type = (chunks.find(chunk => chunk.type)?.type || recorder.mimeType || mimeType || '').split(';')[0].toLowerCase().trim();
          const extension = audioExtensions[type];
          if (!extension) throw Error('This browser recorded an unsupported audio format. You can still type your message.');
          const form = new FormData();
          form.append('language', writingLanguage);
          form.append('audio', new Blob(chunks, {type}), 'dictation.' + extension);
          const response = await fetch('/api/ai/transcribe', {method: 'POST', body: form, signal: active.controller.signal});
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw Error(data.error || 'Could not transcribe. Try again or type your message.');
          const transcript = typeof data.text === 'string' ? data.text.trim() : '';
          if (!transcript) throw Error('No speech was detected. Try again or type your message.');
          if (session.current === active) callback.current(transcript);
        } catch (error) {
          if (session.current === active) setError(error instanceof Error ? error.message : 'Voice input failed.');
        } finally {
          if (session.current === active) cancel();
        }
      };

      recorder.start();
      setPhase('recording');
      active.timer = setTimeout(finish, 60000);
    } catch (error) {
      if (session.current !== active) return;
      cancel();
      setError(microphoneError(error));
    }
  }

  const label = phase === 'recording' ? 'Finish recording' : phase === 'transcribing' ? 'Transcribing…' : phase === 'starting' ? 'Opening microphone…' : 'Voice input';
  return <span className={`voice-dictation ${compact ? 'compact' : ''} ${phase}`}>
    <button type="button" className="voice-record" disabled={phase === 'idle' ? disabled : phase !== 'recording'}
      aria-label={label} title={phase === 'idle' ? 'Speak, then review your words before sending' : label} aria-pressed={phase === 'recording'}
      onClick={phase === 'recording' ? finish : () => void start()}>
      {phase === 'recording' ? <span className="voice-stop" aria-hidden="true"/> :
        <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round">
          <rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>
        </svg>}
      <span className={compact && phase === 'idle' ? 'sr-only' : ''}>{label}</span>
    </button>
    {phase !== 'idle' && <button type="button" className="voice-cancel" aria-label="Cancel voice input" onClick={cancel}>×</button>}
    <span className="sr-only" role="status">
      {phase === 'recording' ? 'Listening. Up to one minute. Finish to review your words.' : phase === 'transcribing' ? 'Turning your voice into text.' : ''}
    </span>
    {error && <small role="alert">{error}</small>}
  </span>;
}
