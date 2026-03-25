// Header — TechBirmingham × Grove dark redesign
'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Database, Settings, X, Eye, EyeOff } from 'lucide-react';

interface HeaderProps {
  onExport: () => void;
  companyCount: number;
}

type AIStatus = 'connected' | 'disconnected' | 'no-key' | 'loading';
type AIMode = 'openai' | 'lmstudio';

function useAIStatus(refreshKey: number) {
  const [status, setStatus] = useState<AIStatus>('loading');
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<AIMode>('openai');
  const [keySource, setKeySource] = useState<'runtime' | 'env' | 'none'>('env');

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/ai-status');
        if (!res.ok) { setStatus('disconnected'); setLabel('error'); return; }
        const data = await res.json();
        setMode(data.mode as AIMode);
        setKeySource(data.keySource ?? 'env');
        setStatus(data.status === 'connected' ? 'connected' : data.status);
        setLabel(
          data.mode === 'openai'
            ? `OpenAI · ${data.model ?? 'gpt-4o'}`
            : data.status === 'connected'
              ? `LM Studio · ${(data.model as string)?.split('/').pop() ?? 'local'}`
              : 'LM Studio · offline'
        );
      } catch {
        setStatus('disconnected');
        setLabel('unreachable');
      }
    };
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, [refreshKey]);

  return { status, label, mode, keySource };
}

export default function Header({ onExport, companyCount }: HeaderProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [toggling, setToggling] = useState(false);
  const ai = useAIStatus(refreshKey);

  // Settings popover state
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyMsg, setKeyMsg] = useState('');
  const settingsRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSettings]);

  const pillColor =
    ai.status === 'connected'
      ? { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)', dot: '#22c55e', text: '#86efac' }
      : ai.status === 'loading'
        ? { bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)', dot: '#94a3b8', text: '#94a3b8' }
        : { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.30)', dot: '#ef4444', text: '#fca5a5' };

  const toggleMode = async () => {
    if (toggling) return;
    setToggling(true);
    const next: AIMode = ai.mode === 'lmstudio' ? 'openai' : 'lmstudio';
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      await new Promise(r => setTimeout(r, 600));
      setRefreshKey(k => k + 1);
    } finally {
      setToggling(false);
    }
  };

  const saveApiKey = async () => {
    setSavingKey(true);
    setKeyMsg('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      if (res.ok) {
        setKeyMsg(apiKeyInput.trim() === '' ? 'Cleared — using default key' : 'Key saved ✓');
        setApiKeyInput('');
        setRefreshKey(k => k + 1);
      } else {
        const err = await res.json();
        setKeyMsg(err.error ?? 'Failed to save');
      }
    } catch {
      setKeyMsg('Network error');
    } finally {
      setSavingKey(false);
      setTimeout(() => setKeyMsg(''), 3000);
    }
  };

  const isLM = ai.mode === 'lmstudio';

  return (
    <header
      className="scan-line border-b px-6 py-0 shrink-0 relative overflow-visible"
      style={{
        background: 'var(--bg-elevated)',
        borderColor: 'var(--border-mid)',
      }}
    >
      <div className="flex items-center justify-between h-16 relative z-10">

        {/* ── Left: TB logo image + Grove badge ── */}
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/tb-logo.jpg"
            alt="TechBirmingham"
            style={{
              height: '34px',
              width: 'auto',
              objectFit: 'contain',
              mixBlendMode: 'screen',
              opacity: 0.95,
            }}
          />

          <div
            className="h-6 w-px shrink-0"
            style={{ background: 'var(--border-mid)' }}
          />

          <div>
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-bold px-2.5 py-0.5 rounded-full leading-none tracking-wide"
                style={{ background: 'var(--tb-orange-dim)', color: 'var(--tb-orange)', border: '1px solid rgba(242,101,34,0.30)' }}
              >
                Sloss.Tech
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--tb-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="6"/>
                <line x1="12" y1="14" x2="12" y2="21"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
              </svg>
              <span className="teal-shimmer text-xs font-semibold">
                Grove — AI Sponsor Research
              </span>
            </div>
          </div>
        </div>

        {/* ── Right: AI toggle + status pill + counter + actions ── */}
        <div className="flex items-center gap-3">

          {/* AI mode toggle — LM Studio / OpenAI */}
          <div
            className="flex items-center gap-2"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-mid)',
              borderRadius: '999px',
              padding: '3px 4px 3px 10px',
            }}
          >
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {isLM ? 'LM Studio' : 'OpenAI'}
            </span>
            {/* Toggle switch */}
            <button
              onClick={toggleMode}
              disabled={toggling}
              title={`Switch to ${isLM ? 'OpenAI' : 'LM Studio'}`}
              style={{
                position: 'relative',
                width: 36,
                height: 20,
                borderRadius: 999,
                border: 'none',
                cursor: toggling ? 'wait' : 'pointer',
                background: isLM ? 'var(--tb-blue)' : 'var(--tb-orange)',
                transition: 'background 0.2s',
                flexShrink: 0,
                opacity: toggling ? 0.6 : 1,
              }}
            >
              <span style={{
                position: 'absolute',
                top: 2,
                left: isLM ? 18 : 2,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }} />
            </button>
          </div>

          {/* AI status pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '0.72rem',
              fontWeight: 600,
              letterSpacing: '0.02em',
              background: pillColor.bg,
              border: `1px solid ${pillColor.border}`,
              color: pillColor.text,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: pillColor.dot,
              boxShadow: ai.status === 'connected' ? `0 0 6px ${pillColor.dot}` : 'none',
              flexShrink: 0,
            }} />
            {ai.status === 'loading' ? 'Checking AI…' : ai.label}
          </div>

          {/* ── Settings gear — API key popover ── */}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => { setShowSettings(s => !s); setKeyMsg(''); }}
              title="Settings — API key"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: '8px',
                border: '1px solid var(--border-mid)',
                background: showSettings ? 'var(--bg-card)' : 'transparent',
                color: showSettings ? 'var(--tb-blue)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--tb-blue)';
              }}
              onMouseLeave={e => {
                if (!showSettings) {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-mid)';
                }
              }}
            >
              <Settings className="w-4 h-4" />
            </button>

            {showSettings && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 10px)',
                  right: 0,
                  width: 320,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-mid)',
                  borderRadius: '12px',
                  padding: '16px',
                  boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
                  zIndex: 100,
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Settings
                  </span>
                  <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Current key source */}
                <div
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    marginBottom: '12px',
                    fontSize: '0.72rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Active key: </span>
                  {ai.keySource === 'runtime'
                    ? <span style={{ color: 'var(--tb-orange)' }}>Custom key (runtime)</span>
                    : ai.keySource === 'env'
                      ? <span style={{ color: '#86efac' }}>Default key (built-in)</span>
                      : <span style={{ color: '#fca5a5' }}>No key configured</span>
                  }
                </div>

                {/* API key input */}
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  OpenAI API Key
                </label>
                <div style={{ position: 'relative', marginBottom: '8px' }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={e => setApiKeyInput(e.target.value)}
                    placeholder="sk-…  (leave blank to use default)"
                    style={{
                      width: '100%',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-mid)',
                      borderRadius: '8px',
                      padding: '8px 36px 8px 10px',
                      fontSize: '0.75rem',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      fontFamily: 'monospace',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--tb-blue)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-mid)')}
                    onKeyDown={e => { if (e.key === 'Enter') saveApiKey(); }}
                  />
                  <button
                    onClick={() => setShowKey(v => !v)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      padding: 0,
                    }}
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Save button */}
                <button
                  onClick={saveApiKey}
                  disabled={savingKey}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--tb-orange)',
                    color: '#fff',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: savingKey ? 'wait' : 'pointer',
                    opacity: savingKey ? 0.6 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {savingKey ? 'Saving…' : apiKeyInput.trim() === '' ? 'Clear Custom Key' : 'Save Key'}
                </button>

                {keyMsg && (
                  <p style={{ marginTop: '8px', fontSize: '0.7rem', color: keyMsg.includes('✓') || keyMsg.includes('Cleared') ? '#86efac' : '#fca5a5', textAlign: 'center' }}>
                    {keyMsg}
                  </p>
                )}

                <p style={{ marginTop: '10px', fontSize: '0.65rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Key is stored in memory for this session only. Clearing it restores the built-in default key.
                </p>
              </div>
            )}
          </div>

          <div className="text-right pr-3 border-r" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Companies tracked
            </p>
            <p className="text-2xl font-black leading-none" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
              {companyCount}
            </p>
          </div>

          <a
            href="https://console.prisma.io"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-press hover-lift flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-mid)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.borderColor = 'var(--tb-blue)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.borderColor = 'var(--border-mid)';
            }}
          >
            <Database className="w-4 h-4" />
            Database
          </a>

          <button
            onClick={onExport}
            className="btn-press hover-lift flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--tb-navy-mid)', border: '1px solid var(--tb-blue)' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--tb-orange)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--tb-orange-dark)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--tb-navy-mid)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--tb-blue)';
            }}
          >
            <ExternalLink className="w-4 h-4" />
            Open Sheet
          </button>
        </div>
      </div>
    </header>
  );
}

