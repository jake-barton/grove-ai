// Header — TechBirmingham × Grove dark redesign
'use client';

import { ExternalLink, Database } from 'lucide-react';
import { useEffect, useState } from 'react';
import LMStudioModal from './LMStudioModal';

interface AIStatus {
  provider: string;
  model: string | null;
  connected: boolean;
  url: string;
}

interface HeaderProps {
  onExport: () => void;
  companyCount: number;
}

export default function Header({ onExport, companyCount }: HeaderProps) {
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [showLMModal, setShowLMModal] = useState(false);

  function fetchStatus() {
    fetch('/api/ai-status')
      .then(r => r.json())
      .then(setAiStatus)
      .catch(() => setAiStatus({ provider: 'Unknown', model: null, connected: false, url: '' }));
  }

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, []);
  return (
    <>
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/TechBirminghamAsset 1.svg"
                alt=""
                style={{ width: 14, height: 14, objectFit: 'contain', opacity: 0.9 }}
              />
              <span className="teal-shimmer text-xs font-semibold">
                Grove — AI Sponsor Research
              </span>
            </div>
          </div>
        </div>

        {/* ── Right: AI status + counter + actions ── */}
        <div className="flex items-center gap-3">

          {/* AI connection status pill — click to open LM Studio connect modal */}
          <button
            onClick={() => setShowLMModal(true)}
            title={aiStatus ? `${aiStatus.provider} · ${aiStatus.url}\nClick to configure local AI` : 'Click to configure AI connection'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 9999,
              border: `1px solid ${aiStatus === null ? 'var(--border-mid)' : aiStatus.connected ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
              background: aiStatus === null ? 'var(--bg-card)' : aiStatus.connected ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.03em',
              color: aiStatus === null ? 'var(--text-muted)' : aiStatus.connected ? 'rgb(134,239,172)' : 'rgb(252,165,165)',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
            }}
          >
            {/* Status dot */}
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              flexShrink: 0,
              background: aiStatus === null ? 'var(--text-muted)' : aiStatus.connected ? 'rgb(34,197,94)' : 'rgb(239,68,68)',
              boxShadow: aiStatus?.connected ? '0 0 6px rgb(34,197,94)' : 'none',
            }} />
            {aiStatus === null
              ? 'Connecting…'
              : aiStatus.connected
                ? `${aiStatus.provider} · ${aiStatus.model ?? 'connected'}`
                : `${aiStatus.provider} · disconnected`}
          </button>
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

    <LMStudioModal
      isOpen={showLMModal}
      onClose={() => setShowLMModal(false)}
      currentURL={aiStatus?.provider === 'LM Studio' ? (aiStatus.url ?? null) : null}
      onStatusChange={() => { fetchStatus(); }}
    />
    </>
  );
}