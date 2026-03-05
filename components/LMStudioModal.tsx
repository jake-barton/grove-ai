'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentURL: string | null;
  onStatusChange: () => void;
}

export default function LMStudioModal({ isOpen, onClose, currentURL, onStatusChange }: Props) {
  const [url, setUrl] = useState(() => currentURL?.replace('/v1', '') ?? '');
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [model, setModel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const prevOpenRef = useRef(false);

  // Reset form when modal opens
  if (isOpen && !prevOpenRef.current) {
    prevOpenRef.current = true;
    // Schedule focus — can't call directly in render
  }
  if (!isOpen && prevOpenRef.current) {
    prevOpenRef.current = false;
  }

  useEffect(() => {
    if (isOpen) {
      setUrl(currentURL?.replace('/v1', '') ?? '');
      setStatus('idle');
      setMessage('');
      setModel('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleConnect() {
    if (!url.trim()) return;
    setStatus('testing');
    setMessage('');
    try {
      const res = await fetch('/api/lmstudio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect', url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error ?? 'Connection failed');
      } else {
        setStatus('success');
        setModel(data.model ?? '');
        setMessage(`Connected! Grove is now using your local AI.`);
        onStatusChange();
      }
    } catch {
      setStatus('error');
      setMessage('Network error — check your URL and try again.');
    }
  }

  async function handleDisconnect() {
    setStatus('testing');
    try {
      await fetch('/api/lmstudio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      setStatus('idle');
      setMessage('');
      setUrl('');
      onStatusChange();
      onClose();
    } catch {
      setStatus('error');
      setMessage('Failed to disconnect.');
    }
  }

  const isConnected = !!currentURL;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1001,
        width: 'min(520px, 92vw)',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-mid)',
        borderRadius: 16,
        padding: '28px 28px 24px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{
              margin: 0, fontSize: 18, fontWeight: 700,
              color: 'var(--text-primary)', fontFamily: 'var(--font-heading)',
            }}>
              Connect Local AI
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Use your own LM Studio instead of OpenAI
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, padding: 4,
          }}>✕</button>
        </div>

        {/* Current status */}
        {isConnected && status !== 'success' && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderRadius: 10, marginBottom: 20,
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgb(34,197,94)', boxShadow: '0 0 6px rgb(34,197,94)', display: 'inline-block' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'rgb(134,239,172)' }}>
                LM Studio connected
              </span>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={status === 'testing'}
              style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                background: 'rgba(239,68,68,0.1)', color: 'rgb(252,165,165)',
                border: '1px solid rgba(239,68,68,0.3)',
              }}
            >
              Disconnect
            </button>
          </div>
        )}

        {/* Instructions */}
        <div style={{
          padding: '14px 16px', borderRadius: 10, marginBottom: 20,
          background: 'rgba(108,173,223,0.06)', border: '1px solid rgba(108,173,223,0.15)',
        }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--tb-blue)' }}>
            How to get your LM Studio URL
          </p>
          <ol style={{ margin: 0, padding: '0 0 0 18px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <li>Open <strong style={{ color: 'var(--text-primary)' }}>LM Studio</strong> and load any model</li>
            <li>Go to <strong style={{ color: 'var(--text-primary)' }}>Local Server</strong> (left sidebar)</li>
            <li>Click <strong style={{ color: 'var(--text-primary)' }}>Start Server</strong></li>
            <li>Enable <strong style={{ color: 'var(--text-primary)' }}>LM Studio Cloud Tunnel</strong> — copy the URL it gives you</li>
          </ol>
          <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
            The URL looks like: <code style={{ color: 'var(--tb-blue)', background: 'rgba(108,173,223,0.1)', padding: '1px 5px', borderRadius: 4 }}>https://abc123.lmstudio.ai</code>
          </p>
        </div>

        {/* URL input */}
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          LM Studio URL
        </label>
        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={e => { setUrl(e.target.value); setStatus('idle'); setMessage(''); }}
          onKeyDown={e => e.key === 'Enter' && handleConnect()}
          placeholder="https://abc123.lmstudio.ai"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: 'var(--bg-card)', border: `1px solid ${status === 'error' ? 'rgba(239,68,68,0.5)' : 'var(--border-mid)'}`,
            color: 'var(--text-primary)', outline: 'none',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        />

        {/* Feedback message */}
        {message && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12,
            background: status === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${status === 'success' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
            color: status === 'success' ? 'rgb(134,239,172)' : 'rgb(252,165,165)',
          }}>
            {status === 'success' && model && (
              <span style={{ fontWeight: 700 }}>Model: {model} — </span>
            )}
            {message}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          {status === 'success' ? (
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13,
                fontWeight: 700, cursor: 'pointer',
                background: 'var(--tb-navy-mid)', color: 'white',
                border: '1px solid var(--tb-blue)',
              }}
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                style={{
                  padding: '10px 18px', borderRadius: 8, fontSize: 13,
                  fontWeight: 600, cursor: 'pointer',
                  background: 'var(--bg-card)', color: 'var(--text-muted)',
                  border: '1px solid var(--border-mid)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConnect}
                disabled={!url.trim() || status === 'testing'}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13,
                  fontWeight: 700, cursor: url.trim() && status !== 'testing' ? 'pointer' : 'not-allowed',
                  background: url.trim() && status !== 'testing' ? 'var(--tb-orange)' : 'var(--bg-card)',
                  color: url.trim() && status !== 'testing' ? 'white' : 'var(--text-muted)',
                  border: `1px solid ${url.trim() && status !== 'testing' ? 'var(--tb-orange)' : 'var(--border-mid)'}`,
                  transition: 'all 0.2s ease',
                }}
              >
                {status === 'testing' ? 'Connecting…' : 'Connect & Use Local AI'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
