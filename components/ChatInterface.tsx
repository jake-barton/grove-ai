// Chat interface — Grove × TechBirmingham dark redesign
'use client';

import { useRef, useEffect, useState } from 'react';
import { Message } from '@/lib/types';
import { Send, Square, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ThinkingStep, ResearchProgress } from '@/app/page';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading: boolean;
  onStop?: () => void;
  onExtractCompanies?: () => void;
  thinkingSteps?: ThinkingStep[];
  researchProgress?: ResearchProgress | null;
}

// ── Thinking / progress panel ────────────────────────────────────────────────
function ThinkingPanel({ steps, progress }: { steps: ThinkingStep[]; progress: ResearchProgress | null }) {
  const [collapsed, setCollapsed] = useState(false);
  const stepsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps.length]);

  const pct = progress ? Math.round(((progress.current) / progress.total) * 100) : 0;

  return (
    <div
      className="anim-slide-up mx-6 mb-1 rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border-mid)', background: 'var(--bg-elevated)' }}
    >
      {/* Header row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
        onClick={() => setCollapsed(c => !c)}
        style={{ borderBottom: collapsed ? 'none' : '1px solid var(--border)' }}
      >
        {/* Pulsing dot */}
        <span
          className="status-pip w-2 h-2 rounded-full shrink-0"
          style={{ background: 'var(--tb-teal)' }}
        />
        <span className="text-xs font-semibold flex-1" style={{ color: 'var(--tb-teal)' }}>
          {progress
            ? `Researching ${progress.company} — ${progress.current + 1} of ${progress.total}`
            : 'Grove is working…'}
        </span>
        {progress && (
          <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
            {pct}%
          </span>
        )}
        <ChevronDown
          className="w-3.5 h-3.5 shrink-0 transition-transform duration-200"
          style={{ color: 'var(--text-secondary)', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
        />
      </button>

      {!collapsed && (
        <>
          {/* Progress bar */}
          {progress && progress.total > 0 && (
            <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <div
                className="relative h-1.5 rounded-full overflow-hidden"
                style={{ background: 'var(--bg-card)' }}
              >
                <div
                  className="progress-bar-shimmer absolute left-0 top-0 h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${pct}%`,
                    background: 'linear-gradient(90deg, var(--tb-teal-dark), var(--tb-teal))',
                    minWidth: pct > 0 ? '8px' : '0',
                  }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {progress.current} done
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {progress.total - progress.current} remaining
                </span>
              </div>
            </div>
          )}

          {/* Step log */}
          <div className="px-4 py-2 max-h-52 overflow-y-auto space-y-1.5">
            {steps.map((step, i) => (
              <div
                key={i}
                className="anim-step-in flex items-start gap-2.5"
                style={{ animationDelay: `${i * 20}ms` }}
              >
                <span className="text-sm leading-none mt-0.5 shrink-0">{step.icon ?? '›'}</span>
                <div className="min-w-0">
                  <p className="text-xs leading-snug" style={{ color: 'var(--text-primary)' }}>
                    {step.text}
                  </p>
                  {step.sub && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {step.sub}
                    </p>
                  )}
                </div>
              </div>
            ))}
            <div ref={stepsEndRef} />
          </div>
        </>
      )}
    </div>
  );
}

export default function ChatInterface({
  messages,
  onSendMessage,
  isLoading,
  onStop,
  onExtractCompanies,
  thinkingSteps = [],
  researchProgress = null,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };

  const hasCompanyData = (content: string) =>
    content.includes('Company:') &&
    content.includes('Industry:') &&
    (content.includes('Contact:') || content.includes('LinkedIn:'));

  const quickActions = [
    '🌲 Find 10 new Sloss.Tech sponsors in the Southeast',
    '🏦 Research fintech companies with event sponsorship history',
    '☁️ Find cloud & AI companies that sponsor tech conferences',
    '🤝 Find diversity-focused sponsors for Birmingham tech events',
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-surface)' }}>

      {/* ── Messages ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {messages.map((message, idx) => (
          <div
            key={message.id}
            className={`anim-slide-up flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            style={{ animationDelay: `${Math.min(idx * 30, 120)}ms` }}
          >
            {/* Grove avatar */}
            {message.role === 'assistant' && (
              <div
                className="grove-avatar w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mr-2.5 mt-0.5 select-none"
                style={{
                  background: 'linear-gradient(135deg, var(--tb-navy-mid) 0%, var(--tb-navy-light) 100%)',
                  border: '1px solid var(--tb-blue-dim)',
                }}
              >
                {/* 🌳 deciduous tree */}
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--tb-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="6"/>
                  <line x1="12" y1="14" x2="12" y2="21"/>
                  <line x1="8" y1="21" x2="16" y2="21"/>
                </svg>
              </div>
            )}

            <div
              className={`max-w-3xl rounded-xl px-4 py-3 ${message.role === 'user' ? '' : ''}`}
              style={
                message.role === 'user'
                  ? {
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-mid)',
                      color: 'var(--text-primary)',
                    }
                  : {
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                    }
              }
            >
              <div className="prose prose-sm max-w-none">
                {message.role === 'user' ? (
                  <div className="whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                    {message.content}
                  </div>
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ ...props }) => (
                        <a {...props} style={{ color: 'var(--tb-teal)' }} className="hover:underline font-medium" target="_blank" rel="noopener noreferrer" />
                      ),
                      h1: ({ ...props }) => <h1 {...props} className="text-xl font-bold mt-4 mb-2" />,
                      h2: ({ ...props }) => <h2 {...props} className="text-lg font-bold mt-3 mb-2" />,
                      h3: ({ ...props }) => <h3 {...props} className="text-base font-bold mt-2 mb-1" />,
                      p:  ({ ...props }) => <p  {...props} className="mb-2" />,
                      strong: ({ ...props }) => <strong {...props} className="font-semibold" style={{ color: 'var(--text-primary)' }} />,
                      ul: ({ ...props }) => <ul {...props} className="list-disc pl-5 mb-2 space-y-1" />,
                      ol: ({ ...props }) => <ol {...props} className="list-decimal pl-5 mb-2 space-y-1" />,
                      code: ({ ...props }) => (
                        <code {...props} className="px-1.5 py-0.5 rounded text-sm" style={{ background: 'var(--tb-teal-dim)', color: 'var(--tb-teal)', fontFamily: 'var(--font-mono)' }} />
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                )}
              </div>

              <div
                className="text-xs mt-1.5"
                style={{ color: 'var(--text-muted)' }}
                suppressHydrationWarning
              >
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>

              {/* Save to pipeline button */}
              {message.role === 'assistant' && hasCompanyData(message.content) && onExtractCompanies && (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <button
                    onClick={onExtractCompanies}
                    className="btn-press text-sm px-4 py-2 text-white rounded-lg font-medium"
                    style={{ background: 'var(--tb-teal)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--tb-teal-dark)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--tb-teal)')}
                  >
                    💾 Save Companies to Pipeline
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* ── Thinking panel (live research steps) ─────────────── */}
        {isLoading && thinkingSteps.length > 0 && (
          <ThinkingPanel steps={thinkingSteps} progress={researchProgress ?? null} />
        )}

        {/* ── Simple typing dots (before first step arrives) ───── */}
        {isLoading && thinkingSteps.length === 0 && (
          <div className="anim-slide-up flex justify-start items-center gap-2.5">
            <div
              className="grove-avatar w-8 h-8 rounded-xl flex items-center justify-center shrink-0 select-none"
              style={{
                background: 'linear-gradient(135deg, var(--tb-navy-mid) 0%, var(--tb-navy-light) 100%)',
                border: '1px solid var(--tb-blue-dim)',
              }}
            >
              {/* 🌳 deciduous tree */}
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--tb-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="6"/>
                <line x1="12" y1="14" x2="12" y2="21"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
              </svg>
            </div>
            <div
              className="rounded-xl px-4 py-3.5 flex items-center gap-1.5"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Quick actions (welcome screen only) ─────────────── */}
      {messages.length === 1 && (
        <div
          className="px-6 py-4"
          style={{ background: 'var(--bg-elevated)', borderTop: '1px solid var(--border)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-secondary)' }}>
            🌲 Quick actions
          </p>
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map((action, index) => (
              <button
                key={index}
                onClick={() => onSendMessage(action)}
                className="btn-press hover-lift text-left px-4 py-2.5 rounded-lg text-sm font-medium"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-mid)',
                  color: 'var(--text-secondary)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--tb-teal)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                  e.currentTarget.style.background = 'var(--tb-teal-dim)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-mid)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                  e.currentTarget.style.background = 'var(--bg-card)';
                }}
                disabled={isLoading}
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Input area ───────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="p-4 shrink-0"
        style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border)' }}
      >
        <div className="flex gap-2 items-center">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask Grove to research sponsors for Sloss.Tech…"
              className="input-glow w-full px-4 py-3 rounded-xl text-sm"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-mid)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
              }}
              disabled={isLoading}
            />
          </div>

          {isLoading ? (
            <button
              type="button"
              onClick={onStop}
              className="btn-press flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-white shrink-0"
              style={{ background: '#c0392b' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#a93226')}
              onMouseLeave={e => (e.currentTarget.style.background = '#c0392b')}
            >
              <Square className="w-4 h-4 fill-white" />
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="btn-press flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-white shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: 'var(--tb-teal)' }}
              onMouseEnter={e => { if (input.trim()) e.currentTarget.style.background = 'var(--tb-teal-dark)'; }}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--tb-teal)')}
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          )}
        </div>
        <p className="text-xs mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
          Grove · Powered by TechBirmingham · Research tool for Sloss.Tech sponsorship outreach
        </p>
      </form>
    </div>
  );
}