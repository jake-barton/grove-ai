// Company list — dark redesign with stagger + hover-lift + anim-expand
// Every save goes to DB (PATCH) → syncCompanyToSheets → sheet stays in sync
'use client';

import { useState } from 'react';
import { Company } from '@/lib/types';
import {
  Building2,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Trash2,
  CheckCircle,
  Edit2,
  X,
  Save,
  ExternalLink,
  Globe,
  Mail,
  Linkedin,
  Calendar,
  FileText,
  Link as LinkIcon,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface CompanyListProps {
  companies: Company[];
  onRefresh: () => void;
  onDelete?: (id: string) => Promise<void>;
  onApprove?: (id: string, approved: boolean) => Promise<void>;
  onUpdate?: (id: string, data: Partial<Company>) => Promise<void>;
}

// ── small helpers ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      {children}
    </div>
  );
}

function LinkOut({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm hover:underline break-all"
      style={{ color: 'var(--tb-teal)' }}
    >
      {label}
      <ExternalLink className="w-3 h-3 shrink-0" />
    </a>
  );
}

function StatusBadge({ status }: { status: Company['outreach_status'] }) {
  const map: Record<Company['outreach_status'], { bg: string; color: string; border: string }> = {
    not_started: { bg: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: 'rgba(255,255,255,0.08)' },
    in_progress: { bg: 'rgba(255,209,102,0.1)', color: '#ffd166', border: 'rgba(255,209,102,0.2)' },
    completed:   { bg: 'rgba(0,196,176,0.1)',   color: 'var(--tb-teal)', border: 'rgba(0,196,176,0.2)' },
  };
  const labels: Record<Company['outreach_status'], string> = {
    not_started: 'Not started',
    in_progress: 'In progress',
    completed:   'Completed',
  };
  const s = map[status];
  return (
    <span
      className="inline-block px-2 py-0.5 text-xs rounded-full font-medium"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {labels[status]}
    </span>
  );
}

// ── edit form ─────────────────────────────────────────────────────────────────

interface EditFormProps {
  company: Company;
  onSave: (data: Partial<Company>) => Promise<void>;
  onCancel: () => void;
}

function EditForm({ company, onSave, onCancel }: EditFormProps) {
  const [saving, setSaving] = useState(false);
  const [d, setD] = useState<Partial<Company>>({
    company_name:               company.company_name,
    industry:                   company.industry         ?? '',
    company_size:               company.company_size     ?? '',
    website:                    company.website          ?? '',
    linkedin_company:           company.linkedin_company ?? '',
    contact_name:               company.contact_name     ?? '',
    contact_position:           company.contact_position ?? '',
    contact_linkedin:           company.contact_linkedin ?? '',
    contact_info:               company.contact_info     ?? '',
    email_format:               company.email_format     ?? '',
    outreach_status:            company.outreach_status,
    draft:                      company.draft,
    sponsorship_likelihood_score: company.sponsorship_likelihood_score ?? 5,
    previous_events:            [...(company.previous_events ?? [])],
    confirmed_emails:           [...(company.confirmed_emails ?? [])],
    bounced_emails:             [...(company.bounced_emails   ?? [])],
    what_they_sponsored:        company.what_they_sponsored ?? '',
    why_good_fit:               company.why_good_fit        ?? '',
    relevant_links:             [...(company.relevant_links  ?? [])],
    notes:                      company.notes ?? '',
  });

  // Reusable add/remove list editor
  const arrField = (
    key: 'previous_events' | 'confirmed_emails' | 'bounced_emails' | 'relevant_links',
    label: string,
    placeholder: string,
  ) => {
    const arr = (d[key] as string[]) ?? [];
    return (
      <div>
        <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-secondary)' }}>{label}</label>
        {arr.map((v, i) => (
          <div key={i} className="flex gap-1 mb-1.5">
            <input
              value={v}
              onChange={e => {
                const next = [...arr];
                next[i] = e.target.value;
                setD(prev => ({ ...prev, [key]: next }));
              }}
              className="input-glow flex-1 px-3 py-1.5 text-sm rounded-lg"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)' }}
            />
            <button
              type="button"
              onClick={() => setD(prev => ({ ...prev, [key]: arr.filter((_, j) => j !== i) }))}
              className="btn-press px-2 rounded-lg"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setD(prev => ({ ...prev, [key]: [...arr, ''] }))}
          className="mt-0.5 text-xs font-semibold"
          style={{ color: 'var(--tb-teal)' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#7fffd4')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--tb-teal)')}
        >
          + Add {placeholder}
        </button>
      </div>
    );
  };

  const textField = (key: keyof Company, label: string, placeholder = '') => (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input
        type="text"
        value={(d[key] as string) ?? ''}
        placeholder={placeholder}
        onChange={e => setD(prev => ({ ...prev, [key]: e.target.value }))}
        className="input-glow w-full px-3 py-1.5 text-sm rounded-lg"
        style={{ background: 'var(--bg-input)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)' }}
      />
    </div>
  );

  const handleSave = async () => {
    setSaving(true);
    // Strip empty entries from array fields before saving
    const cleaned: Partial<Company> = {
      ...d,
      previous_events:  ((d.previous_events  as string[]) ?? []).filter(Boolean),
      confirmed_emails: ((d.confirmed_emails as string[]) ?? []).filter(Boolean),
      bounced_emails:   ((d.bounced_emails   as string[]) ?? []).filter(Boolean),
      relevant_links:   ((d.relevant_links   as string[]) ?? []).filter(Boolean),
    };
    await onSave(cleaned);
    setSaving(false);
  };

  return (
    <div className="space-y-4 mt-4">
      {/* ── Company basics ── */}
      <div className="grid grid-cols-2 gap-3">
        {textField('company_name', 'Company Name')}
        {textField('industry', 'Industry')}
        {textField('company_size', 'Company Size')}
        {textField('website', 'Website', 'https://')}
        {textField('linkedin_company', 'Company LinkedIn', 'https://linkedin.com/company/...')}
      </div>

      {/* ── Pipeline status ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-secondary)' }}>Outreach Status</label>
          <select
            value={d.outreach_status}
            onChange={e => setD(prev => ({ ...prev, outreach_status: e.target.value as Company['outreach_status'] }))}
            className="input-glow w-full px-3 py-1.5 text-sm rounded-lg"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)' }}
          >
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-secondary)' }}>Sponsorship Score (1–10)</label>
          <input
            type="number"
            min={1}
            max={10}
            value={d.sponsorship_likelihood_score ?? ''}
            onChange={e => setD(prev => ({ ...prev, sponsorship_likelihood_score: parseInt(e.target.value) || undefined }))}
            className="input-glow w-full px-3 py-1.5 text-sm rounded-lg"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* Draft toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!d.draft}
          onChange={e => setD(prev => ({ ...prev, draft: e.target.checked }))}
          className="w-4 h-4 rounded"
          style={{ accentColor: 'var(--tb-teal)' }}
        />
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Mark as Draft (col B — exclude from outreach)</span>
      </label>

      <hr style={{ borderColor: 'var(--border)' }} />

      {/* ── Contact ── */}
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Contact (→ Sheet col E)</p>
      <div className="grid grid-cols-2 gap-3">
        {textField('contact_name', 'Name')}
        {textField('contact_position', 'Position')}
        {textField('contact_linkedin', 'LinkedIn URL', 'https://linkedin.com/in/...')}
        {textField('contact_info', 'Email / Other contact')}
        {textField('email_format', 'Email Format Pattern (→ col D)', 'e.g. first.last@company.com')}
      </div>

      <hr style={{ borderColor: 'var(--border)' }} />

      {/* ── Sponsorship intel ── */}
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Sponsorship Intel</p>
      {arrField('previous_events', 'Previously Sponsored Events (→ col H)', 'event')}

      <div>
        <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-secondary)' }}>What They Sponsored (→ col I)</label>
        <textarea
          value={(d.what_they_sponsored as string) ?? ''}
          onChange={e => setD(prev => ({ ...prev, what_they_sponsored: e.target.value }))}
          rows={2}
          className="input-glow w-full px-3 py-1.5 text-sm rounded-lg resize-none"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)' }}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-secondary)' }}>Why Good Fit (→ col J)</label>
        <textarea
          value={(d.why_good_fit as string) ?? ''}
          onChange={e => setD(prev => ({ ...prev, why_good_fit: e.target.value }))}
          rows={3}
          className="input-glow w-full px-3 py-1.5 text-sm rounded-lg resize-none"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)' }}
        />
      </div>

      <hr style={{ borderColor: 'var(--border)' }} />

      {/* ── Email tracking ── */}
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Email Tracking</p>
      {arrField('confirmed_emails', 'Confirmed Emails (→ col F)', 'email')}
      {arrField('bounced_emails', 'Bounced Emails (→ col G)', 'email')}

      <hr style={{ borderColor: 'var(--border)' }} />

      {/* ── Links + notes ── */}
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Links & Notes</p>
      {arrField('relevant_links', 'Relevant Links (→ col L)', 'URL')}

      <div>
        <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-secondary)' }}>Notes (→ col K)</label>
        <textarea
          value={(d.notes as string) ?? ''}
          onChange={e => setD(prev => ({ ...prev, notes: e.target.value }))}
          rows={4}
          className="input-glow w-full px-3 py-1.5 text-sm rounded-lg resize-none"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)' }}
        />
      </div>

      {/* ── Actions ── */}
      <div className="flex gap-2 pt-1 pb-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-press flex items-center gap-2 px-4 py-2 text-white rounded-lg disabled:opacity-40 font-semibold text-sm"
          style={{ background: 'var(--tb-teal)' }}
          onMouseEnter={e => { if (!saving) e.currentTarget.style.background = 'var(--tb-teal-dark)'; }}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--tb-teal)')}
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save & Sync to Sheet'}
        </button>
        <button
          onClick={onCancel}
          className="btn-press flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', color: 'var(--text-secondary)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── view panel ────────────────────────────────────────────────────────────────

function ViewPanel({ company }: { company: Company }) {
  return (
    <div className="space-y-4 mt-4">
      {/* Website + LinkedIn links */}
      <div className="flex flex-wrap gap-3">
        {company.website && company.website !== 'Not found' && (
          <div className="flex items-center gap-1.5">
            <Globe className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
            <LinkOut href={company.website} label="Website" />
          </div>
        )}
        {company.linkedin_company && (
          <div className="flex items-center gap-1.5">
            <Linkedin className="w-4 h-4 shrink-0" style={{ color: 'var(--tb-teal)' }} />
            <LinkOut href={company.linkedin_company} label="Company LinkedIn" />
          </div>
        )}
      </div>

      {/* Company basics */}
      {(company.industry || company.company_size) && (
        <div className="grid grid-cols-2 gap-3">
          {company.industry && (
            <Field label="Industry">
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{company.industry}</p>
            </Field>
          )}
          {company.company_size && (
            <Field label="Size">
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{company.company_size}</p>
            </Field>
          )}
        </div>
      )}

      {/* Contact */}
      {company.contact_name && company.contact_name !== 'Not found' && (
        <Field label="Contact">
          <div className="flex flex-col gap-1">
            {company.contact_linkedin ? (
              <LinkOut
                href={company.contact_linkedin}
                label={`${company.contact_name}${company.contact_position ? ` — ${company.contact_position}` : ''}`}
              />
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {company.contact_name}
                {company.contact_position ? ` — ${company.contact_position}` : ''}
              </p>
            )}
            {company.contact_info && company.contact_info !== 'Not found' && (
              <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <Mail className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                {company.contact_info}
              </div>
            )}
            {company.email_format && company.email_format !== 'Not available' && (
              <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <Mail className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--tb-teal-dim)', color: 'var(--tb-teal)', fontFamily: 'var(--font-mono)' }}>
                  {company.email_format}
                </span>
              </div>
            )}
          </div>
        </Field>
      )}

      {/* Status + score + draft */}
      <div className="flex items-center gap-3 flex-wrap">
        <Field label="Status">
          <StatusBadge status={company.outreach_status} />
        </Field>
        {company.sponsorship_likelihood_score !== undefined && (
          <Field label="Score">
            <div className="flex items-center gap-1">
              <TrendingUp className="w-4 h-4" style={{ color: 'var(--tb-teal)' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--tb-teal)' }}>{company.sponsorship_likelihood_score}/10</span>
            </div>
          </Field>
        )}
        {company.draft && (
          <Field label="Flag">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(255,209,102,0.12)', color: '#ffd166', border: '1px solid rgba(255,209,102,0.2)' }}>Draft</span>
          </Field>
        )}
      </div>

      {/* Previously sponsored events */}
      {company.previous_events && company.previous_events.length > 0 && (
        <Field label="Previously Sponsored Events">
          <div className="flex flex-wrap gap-1.5">
            {company.previous_events.map((ev, i) => (
              <span key={i} className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                <Calendar className="w-3 h-3" />
                {ev}
              </span>
            ))}
          </div>
        </Field>
      )}

      {/* What they sponsored */}
      {company.what_they_sponsored && company.what_they_sponsored !== 'No verified sponsorships found' && (
        <Field label="What They Sponsored">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{company.what_they_sponsored}</p>
        </Field>
      )}

      {/* Why good fit */}
      {company.why_good_fit && (
        <Field label="Why Good Fit">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{company.why_good_fit}</p>
        </Field>
      )}

      {/* Email tracking */}
      {(company.confirmed_emails?.length > 0 || company.bounced_emails?.length > 0) && (
        <Field label="Emails">
          <div className="space-y-1">
            {company.confirmed_emails?.map((e, i) => (
              <div key={i} className="flex items-center gap-1.5 text-sm">
                <CheckCircle className="w-3.5 h-3.5" style={{ color: 'var(--tb-teal)' }} />
                <span style={{ color: 'var(--text-primary)' }}>{e}</span>
              </div>
            ))}
            {company.bounced_emails?.map((e, i) => (
              <div key={i} className="flex items-center gap-1.5 text-sm">
                <AlertCircle className="w-3.5 h-3.5" style={{ color: '#f87171' }} />
                <span className="line-through" style={{ color: 'var(--text-secondary)' }}>{e}</span>
              </div>
            ))}
          </div>
        </Field>
      )}

      {/* Relevant links */}
      {company.relevant_links && company.relevant_links.length > 0 && (
        <Field label="Relevant Links">
          <div className="space-y-1">
            {company.relevant_links.map((l, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                <LinkOut href={l} label={l.replace(/^https?:\/\//, '').substring(0, 50) + (l.length > 53 ? '…' : '')} />
              </div>
            ))}
          </div>
        </Field>
      )}

      {/* Notes */}
      {company.notes && (
        <Field label="Notes">
          <div className="flex items-start gap-1.5">
            <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{company.notes}</p>
          </div>
        </Field>
      )}
    </div>
  );
}

// ── main list ─────────────────────────────────────────────────────────────────

export default function CompanyList({
  companies,
  onRefresh,
  onDelete,
  onApprove,
  onUpdate,
}: CompanyListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingId,   setSavingId]   = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
    // Close edit when collapsing a different card
    setEditingId(prev => prev === id ? null : prev);
  };

  const startEdit = (id: string) => {
    setEditingId(id);
    setExpandedId(id);
  };

  const handleSave = async (id: string, data: Partial<Company>) => {
    setSavingId(id);
    if (onUpdate) await onUpdate(id, data);
    setEditingId(null);
    setSavingId(null);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    if (deletingId === id) {
      if (onDelete) await onDelete(id);
      setDeletingId(null);
      onRefresh();
    } else {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
    }
  };

  const handleApprove = async (id: string, current: boolean) => {
    if (onApprove) await onApprove(id, !current);
    onRefresh();
  };

  const approved = companies.filter(c => c.approved_for_export);
  const pending  = companies.filter(c => !c.approved_for_export);

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-surface)' }}>
      {/* ── Header ── */}
      <div className="p-4 shrink-0" style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-mid)' }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-primary)' }}>Sponsor Pipeline</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Sloss.Tech · TechBirmingham</p>
          </div>
          <button
            onClick={onRefresh}
            className="btn-press flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
            style={{ color: 'var(--tb-teal)', background: 'var(--tb-teal-dim)', border: '1px solid rgba(0,196,176,0.2)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--tb-teal-glow)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--tb-teal-dim)')}
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
        <div className="flex gap-3 text-xs">
          <span style={{ color: 'var(--text-secondary)' }}>
            <span className="font-bold" style={{ color: '#4ade80' }}>{approved.length}</span> approved
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            <span className="font-bold" style={{ color: 'var(--tb-yellow)' }}>{pending.length}</span> pending
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{companies.length}</span> total
          </span>
        </div>
      </div>

      {/* ── List ── */}
      <div className="stagger flex-1 overflow-y-auto" style={{ borderTop: 'none' }}>
        {companies.length === 0 ? (
          <div className="p-8 text-center">
            <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No companies yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Ask Grove to research companies to get started</p>
          </div>
        ) : (
          companies.map(company => {
            const id         = company.id ?? '';
            const isExpanded = expandedId === id;
            const isEditing  = editingId  === id;
            const isDeleting = deletingId === id;
            const isApproved = !!company.approved_for_export;

            return (
              <div
                key={id}
                className="anim-card-in"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                {/* ── Row header ── */}
                <div
                  className="hover-lift px-4 py-3 cursor-pointer"
                  style={{
                    background: isApproved ? 'rgba(0,196,176,0.04)' : 'var(--bg-card)',
                    borderLeft: isApproved ? '2px solid var(--tb-teal)' : '2px solid transparent',
                  }}
                  onClick={() => toggleExpand(id)}
                >
                  <div className="flex items-start gap-2">
                    {/* Expand toggle */}
                    <span className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {isExpanded
                        ? <ChevronDown  className="w-4 h-4" />
                        : <ChevronRight className="w-4 h-4" />
                      }
                    </span>

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{company.company_name}</span>
                        {isApproved && <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--tb-teal)' }} />}
                        {company.draft && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(255,209,102,0.12)', color: '#ffd166' }}>
                            Draft
                          </span>
                        )}
                      </div>
                      {company.industry && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>{company.industry}</p>
                      )}
                    </div>

                    {/* Score badge */}
                    {company.sponsorship_likelihood_score !== undefined && (
                      <div
                        className="flex items-center gap-1 text-xs px-2 py-0.5 rounded font-bold shrink-0"
                        style={{ background: 'var(--tb-teal-dim)', color: 'var(--tb-teal)' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <TrendingUp className="w-3 h-3" />
                        {company.sponsorship_likelihood_score}/10
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 mt-2 ml-6" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleApprove(id, isApproved)}
                      className="btn-press flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
                      style={
                        isApproved
                          ? { background: 'rgba(0,196,176,0.15)', color: 'var(--tb-teal)', border: '1px solid rgba(0,196,176,0.25)' }
                          : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-mid)' }
                      }
                      onMouseEnter={e => {
                        e.currentTarget.style.background = isApproved ? 'rgba(0,196,176,0.25)' : 'rgba(0,196,176,0.1)';
                        e.currentTarget.style.color = 'var(--tb-teal)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = isApproved ? 'rgba(0,196,176,0.15)' : 'var(--bg-elevated)';
                        e.currentTarget.style.color = isApproved ? 'var(--tb-teal)' : 'var(--text-secondary)';
                      }}
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {isApproved ? 'Approved' : 'Approve'}
                    </button>

                    <button
                      onClick={() => startEdit(id)}
                      disabled={savingId === id}
                      className="btn-press flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-mid)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--tb-teal-dim)'; e.currentTarget.style.color = 'var(--tb-teal)'; e.currentTarget.style.borderColor = 'rgba(0,196,176,0.25)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit
                    </button>

                    <button
                      onClick={() => handleDelete(id)}
                      className="btn-press flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
                      style={
                        isDeleting
                          ? { background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }
                          : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-mid)' }
                      }
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.12)'; e.currentTarget.style.color = '#f87171'; }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = isDeleting ? 'rgba(248,113,113,0.15)' : 'var(--bg-elevated)';
                        e.currentTarget.style.color = isDeleting ? '#f87171' : 'var(--text-secondary)';
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {isDeleting ? 'Confirm?' : 'Delete'}
                    </button>
                  </div>
                </div>

                {/* ── Expanded panel ── */}
                {isExpanded && (
                  <div
                    className="anim-expand px-4 pb-4 ml-6"
                    style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}
                  >
                    {isEditing ? (
                      <EditForm
                        company={company}
                        onSave={data => handleSave(id, data)}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <ViewPanel company={company} />
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
