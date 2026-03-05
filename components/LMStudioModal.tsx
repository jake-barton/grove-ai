'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentURL: string | null;
  onStatusChange: () => void;
}

type BridgePhase = 'offline' | 'waiting' | 'tunneling' | 'connected' | 'error' | 'stopped';

interface BridgeStatus {
  phase: BridgePhase;
  tunnelURL: string | null;
  model: string | null;
  log: { level: string; msg: string; ts: number }[];
}

const BRIDGE = 'http://localhost:7842';

export default function LMStudioModal({ isOpen, onClose, currentURL, onStatusChange }: Props) {
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [stopping, setStopping] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll the local bridge every 1.5s while modal is open
  useEffect(() => {
    if (!isOpen) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    async function poll() {
      try {
        const res = await fetch(`${BRIDGE}/status`, { signal: AbortSignal.timeout(1200) });
        if (!res.ok) throw new Error('not ok');
        const data: BridgeStatus = await res.json();
        const prev = bridge;
        setBridge(data);
        // If we just became connected, refresh the AI status pill
        if (data.phase === 'connected' && prev?.phase !== 'connected') {
          onStatusChange();
        }
      } catch {
        setBridge(null); // bridge not running
      }
    }

    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [bridge?.log?.length]);

  if (!isOpen) return null;

  async function handleStop() {
    setStopping(true);
    try {
      await fetch(`${BRIDGE}/stop`, { method: 'POST', signal: AbortSignal.timeout(3000) });
      onStatusChange();
      setTimeout(onClose, 800);
    } catch {
      setStopping(false);
    }
  }

  const phase = bridge?.phase ?? 'offline';
  const isConnected = phase === 'connected';
  const isWorking = phase === 'waiting' || phase === 'tunneling';
  const bridgeOffline = bridge === null;

  // Phase display config
  const phaseConfig: Record<string, { color: string; bg: string; border: string; dot: string; label: string }> = {
    offline:    { color: 'var(--text-muted)',       bg: 'var(--bg-card)',              border: 'var(--border-mid)',              dot: 'var(--text-muted)',   label: 'Bridge not running' },
    waiting:    { color: 'rgb(253,186,116)',         bg: 'rgba(251,146,60,0.08)',       border: 'rgba(251,146,60,0.3)',           dot: 'rgb(251,146,60)',     label: 'Waiting for LM Studio…' },
    tunneling:  { color: 'rgb(147,197,253)',         bg: 'rgba(59,130,246,0.08)',       border: 'rgba(59,130,246,0.3)',           dot: 'rgb(59,130,246)',     label: 'Opening tunnel…' },
    connected:  { color: 'rgb(134,239,172)',         bg: 'rgba(34,197,94,0.08)',        border: 'rgba(34,197,94,0.3)',            dot: 'rgb(34,197,94)',      label: 'Connected' },
    error:      { color: 'rgb(252,165,165)',         bg: 'rgba(239,68,68,0.08)',        border: 'rgba(239,68,68,0.3)',            dot: 'rgb(239,68,68)',      label: 'Error — retrying…' },
    stopped:    { color: 'var(--text-muted)',        bg: 'var(--bg-card)',              border: 'var(--border-mid)',              dot: 'var(--text-muted)',   label: 'Stopped' },
  };
  const pc = phaseConfig[phase] ?? phaseConfig.offline;

  function logColor(level: string) {
    if (level === 'ok') return 'rgb(134,239,172)';
    if (level === 'warn') return 'rgb(253,186,116)';
    if (level === 'error') return 'rgb(252,165,165)';
    return 'var(--text-secondary)';
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1001, width: 'min(540px, 94vw)',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)',
        borderRadius: 16, padding: '24px 24px 20px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
              Local AI Connection
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Use LM Studio instead of OpenAI
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        {/* Status bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 10, marginBottom: 18,
          background: pc.bg, border: `1px solid ${pc.border}`,
        }}>
          <span style={{
            width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
            background: pc.dot,
            boxShadow: isConnected ? `0 0 8px ${pc.dot}` : 'none',
            animation: isWorking ? 'pulse 1.4s ease-in-out infinite' : 'none',
          }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: pc.color, flex: 1 }}>
            {isConnected
              ? `Connected · ${bridge?.model ?? 'LM Studio'}`
              : pc.label}
          </span>
          {isConnected && bridge?.tunnelURL && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
              {bridge.tunnelURL}
            </span>
          )}
        </div>

        {/* Instructions (only when bridge is offline) */}
        {bridgeOffline && (
          <div style={{ padding: '14px 16px', borderRadius: 10, marginBottom: 18, background: 'rgba(108,173,223,0.06)', border: '1px solid rgba(108,173,223,0.15)' }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--tb-blue)' }}>
              How to connect
            </p>
            <ol style={{ margin: 0, padding: '0 0 0 18px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.9 }}>
              <li>Open <strong style={{ color: 'var(--text-primary)' }}>LM Studio</strong> → load a model → click <strong style={{ color: 'var(--text-primary)' }}>Start Server</strong></li>
              <li>
                Find <strong style={{ color: 'var(--tb-orange)' }}>Start Grove with LM Studio</strong> in the project folder and double-click it
                <div style={{ marginTop: 4, padding: '4px 8px', borderRadius: 5, background: 'rgba(0,0,0,0.2)', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                  ~/Desktop/TechBirmingham/sponsor-research-ai/
                </div>
              </li>
              <li>Come back here — this panel will update automatically ✅</li>
            </ol>
          </div>
        )}

        {/* Live log (when bridge is running) */}
        {!bridgeOffline && bridge!.log.length > 0 && (
          <div style={{
            borderRadius: 10, overflow: 'hidden', marginBottom: 18,
            border: '1px solid var(--border-mid)',
          }}>
            <div style={{ padding: '6px 12px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-mid)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Bridge Log
            </div>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', maxHeight: 140, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
              {bridge!.log.map((l, i) => (
                <div key={i} style={{ color: logColor(l.level), lineHeight: 1.6 }}>
                  <span style={{ opacity: 0.4, marginRight: 8 }}>
                    {new Date(l.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  {l.msg}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {/* Currently connected via Vercel DB (but bridge offline) */}
        {bridgeOffline && currentURL && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, marginBottom: 18, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgb(34,197,94)', display: 'inline-block' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'rgb(134,239,172)' }}>Saved connection active</span>
            </div>
            <button
              onClick={async () => {
                await fetch('/api/lmstudio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'disconnect' }) });
                onStatusChange();
                onClose();
              }}
              style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', background: 'rgba(239,68,68,0.1)', color: 'rgb(252,165,165)', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              Disconnect
            </button>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border-mid)' }}>
            Close
          </button>
          {!bridgeOffline && (
            <button
              onClick={handleStop}
              disabled={stopping}
              style={{ flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: stopping ? 'not-allowed' : 'pointer', background: 'rgba(239,68,68,0.1)', color: 'rgb(252,165,165)', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              {stopping ? 'Stopping…' : 'Stop & Use OpenAI'}
            </button>
          )}
        </div>

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}</style>
      </div>
    </>
  );
}
