'use client';
import {useEffect, useRef, useState} from 'react';

export function CopyText({label, value, secret = false}: {label: string; value: string; secret?: boolean}) {
  const text = useRef<HTMLTextAreaElement>(null);
  const [feedback, setFeedback] = useState('');
  const generation = useRef(0);
  const currentValue = useRef(value);
  currentValue.current = value;
  useEffect(() => { generation.current++; setFeedback(''); return () => { generation.current++; }; }, [value]);
  async function copy() {
    const own = generation.current;
    try { await navigator.clipboard.writeText(value); if (own === generation.current && currentValue.current === value) setFeedback('Copied.'); }
    catch {
      if (own !== generation.current || currentValue.current !== value) return;
      text.current?.focus(); text.current?.select(); setFeedback('Clipboard unavailable. Text selected; copy it manually.');
    }
  }
  return <div className={`hosted-copy${secret ? ' hosted-secret-copy' : ''}`}>
    <label>{label}<textarea ref={text} aria-label={label} readOnly value={value} rows={Math.min(14, Math.max(2, value.split('\n').length))} spellCheck={false} autoComplete="off" /></label>
    <button type="button" className="button subtle" onClick={() => void copy()}>Copy {label.toLowerCase()}</button>
    <p className="fine" role="status">{feedback}</p>
  </div>;
}
