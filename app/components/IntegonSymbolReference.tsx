'use client';

import {useEffect, useRef, useState} from 'react';
import {lookupSelectedSymbolSheet, type SymbolReferenceProgress, type SymbolReferenceResult} from '../lib/integon-symbol-reference';

export default function IntegonSymbolReference() {
  const [file, setFile] = useState<File | null>(null);
  const [maskedKey, setMaskedKey] = useState('');
  const [year, setYear] = useState('');
  const [result, setResult] = useState<SymbolReferenceResult | null>(null);
  const [progress, setProgress] = useState<SymbolReferenceProgress | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const validKey = /^[A-Z0-9*&]{10}$/.test(maskedKey) && maskedKey.includes('*');
  const validYear = /^(?:19|20)\d{2}$/.test(year);

  useEffect(() => () => active.current?.abort(), []);

  function clearLookup() {
    active.current?.abort();
    active.current = null;
    setProgress(null);
    setResult(null);
    setError('');
    setBusy(false);
  }

  function resetForm() {
    clearLookup();
    setFile(null);
    setMaskedKey('');
    setYear('');
    if (fileInput.current) fileInput.current.value = '';
  }

  async function lookup() {
    if (!file || !validKey || !validYear) return;
    clearLookup();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    try {
      const found = await lookupSelectedSymbolSheet(file, maskedKey, Number(year), {
        signal: controller.signal,
        onProgress(value) {
          if (!controller.signal.aborted) setProgress(value);
        },
      });
      if (!controller.signal.aborted) setResult(found);
    } catch {
      if (!controller.signal.aborted) {
        setError('Pacifica could not read the local PDF. Select the filed SS5 sheet or refer the vehicle to the carrier.');
      }
    } finally {
      if (!controller.signal.aborted) {
        active.current = null;
        setBusy(false);
      }
    }
  }

  return <details aria-label="Integon filed vehicle symbol reference">
    <summary>Integon filed vehicle symbol reference</summary>
    <p>Choose the SS5 PDF for the model year. The five filed sheets cover 1981–2025. Pacifica reads the selected file on this device.</p>
    <div><label>Selected filed SS5 PDF
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" onChange={event => {
        clearLookup();
        setFile(event.target.files?.[0] ?? null);
      }}/>
    </label></div>
    <div><label>Published masked VIN pattern (10 characters)
      <input value={maskedKey} maxLength={10} autoComplete="off" spellCheck={false}
        placeholder="1FTFW2K5*R" onChange={event => {
          clearLookup();
          setMaskedKey(event.target.value.toUpperCase());
        }}/>
    </label></div>
    <div><label>Model year
      <input value={year} maxLength={4} inputMode="numeric" placeholder="YYYY" onChange={event => {
        clearLookup();
        setYear(event.target.value.replace(/\D/g, ''));
      }}/>
    </label></div>
    <button type="button" disabled={busy || !file || !validKey || !validYear} onClick={() => void lookup()}>
      Find filed reference locally
    </button>
    {busy && <button type="button" onClick={clearLookup}>Cancel lookup</button>}
    {file && <button type="button" onClick={resetForm}>Clear inputs</button>}
    {busy && <p role="status">{progress ? `Checking page ${progress.page} of ${progress.totalPages}` : 'Checking the selected PDF…'}</p>}
    {error && <p role="alert">{error}</p>}
    {result?.state === 'matched' && <div role="status">
      <p>{result.make} {result.model} · {year} · SymbolSet5 <strong>{result.symbolSet5}</strong></p>
      <p>{result.sourceFile}, page {result.page} · SERFF {result.filing} · California {result.stateTracking}</p>
    </div>}
    {result && result.state !== 'matched' && <p role="status">
      {result.reason || (result.state === 'missing' ? 'The selected sheet has no matching row for this mask and year.' : 'The filed reference needs carrier review.')}
    </p>}
    <p>Carrier quote required. Confirm the vehicle and applicable rate with the carrier.</p>
  </details>;
}
