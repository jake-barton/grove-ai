// Header — TechBirmingham × Grove dark redesign
'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Database } from 'lucide-react';

interface HeaderProps {
  onExport: () => void;
  companyCount: number;
}

type AIStatus = 'connected' | 'disconnected' | 'no-key' | 'loading';

function useAIStatus() {
  const [status, setStatus] = useState<AIStatus>('loading');
  const [label, setLabel] = useState('');

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/ai-status');
        if (!res.ok) { setStatus('disconnected'); setLabel('error'); return; }
        const data = await res.json();
        setStatus(data.status === 'connected' ? 'connected' : data.status);
        setLabel(
          data.mode === 'openai'
            ? `OpenAI · ${data.model ?? 'gpt-4o'}`
            : data.status === 'connected'
              ? `LM Studio · ${data.model ?? 'local'}`
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
  }, []);

  return { status, label };
}

export default function Header({ onExport, companyCount }: HeaderProps) {
  const ai = useAIStatus();

  const pillColor =
    ai.status === 'connected'  ? { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)', dot: '#22c55e', text: '#86efac' } :
    ai.status === 'loading'    ? { bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)', dot: '#94a3b8', text: '#94a3b8' } :
                                 { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.30)', dot: '#ef4444', text: '#fca5a5' };

  return (
    <header
      className="scan-line border-b px-6 py-0 shrink-0 relative overflow-hidden"
      style={{
        background: 'var(--bg-elevated)',
        borderColor: 'var(--border-mid)',
      }}
    >
      <div className="flex items-center justify-between h-16 relative z-10">

        {/* ── Left: TB logo image + Grove badge ── */}
        <div className="flex items-center gap-4">
          {/* Official TB logo — mix-blend-mode:screen knocks out white bg on dark surface */}
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
              {/* 🌳 deciduous tree */}
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

        {/* ── Right: AI status pill + counter + actions ── */}
        <div className="flex items-center gap-3">

          {/* AI status — simple read-only pill, no modal */}
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