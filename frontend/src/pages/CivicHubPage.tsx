import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Target, Shield, Trophy, ChevronRight,
  ThumbsUp, ThumbsDown, Megaphone, BookOpen, Plus, X,
} from 'lucide-react';
import {
  fetchPromises, fetchProposals,
  createPromise, createProposal,
  PromiseItem, ProposalItem,
} from '../api/civic';
import { CivicSectorHeader } from '../components/SectorHeader';
import { useAuth } from '../contexts/AuthContext';

// ─────────────────────────────────────────────────────────────────────
// Tokens (status / sector pill maps)
// ─────────────────────────────────────────────────────────────────────

// CSS custom properties can't accept an alpha suffix, so for `${hex}18` opacity
// combinations we keep parallel hex fallbacks alongside the semantic tokens.
const STATUS_TOKEN: Record<string, { token: string; hex: string; label: string }> = {
  pending:              { token: 'var(--color-text-3)', hex: '#6E7A85', label: 'Pending' },
  in_progress:          { token: 'var(--color-dem)',    hex: '#4A7FDE', label: 'In Progress' },
  partially_fulfilled:  { token: 'var(--color-accent)', hex: '#C5A028', label: 'Partially Fulfilled' },
  fulfilled:            { token: 'var(--color-green)',  hex: '#3DB87A', label: 'Fulfilled' },
  broken:               { token: 'var(--color-red)',    hex: '#E63946', label: 'Broken' },
  retired:              { token: 'var(--color-text-3)', hex: '#6E7A85', label: 'Retired' },
};

const getStatus = (s: string) => STATUS_TOKEN[s] || STATUS_TOKEN.pending;

// Feature nav pills (match HTML prototype order + tokens)
const FEATURE_PILLS: Array<{ to: string; label: string; icon: typeof Target; token: string; hex: string }> = [
  { to: '/civic/promises',    label: 'Promises',    icon: Target,    token: 'var(--color-accent)', hex: '#C5A028' },
  { to: '/civic/proposals',   label: 'Proposals',   icon: Megaphone, token: 'var(--color-dem)',    hex: '#4A7FDE' },
  { to: '/civic/annotations', label: 'Annotations', icon: BookOpen,  token: 'var(--color-green)',  hex: '#3DB87A' },
  { to: '/civic/badges',      label: 'Badges',      icon: Trophy,    token: 'var(--color-ind)',    hex: '#B06FD8' },
  { to: '/civic/verify',      label: 'Verify',      icon: Shield,    token: 'var(--color-verify)', hex: '#2EC4B6' },
];

// ─────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────

function ProgressBar({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      style={{
        height: 4,
        borderRadius: 2,
        background: 'var(--color-surface-2)',
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <div
        style={{
          height: '100%',
          borderRadius: 2,
          background: color,
          width: `${pct}%`,
          transition: 'width 0.6s ease',
        }}
      />
    </div>
  );
}

function EyebrowPill({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        border: '1px solid var(--color-accent-dim)',
        borderRadius: 20,
        padding: '5px 14px',
        background: 'var(--color-accent-dim)',
        marginBottom: 20,
      }}
    >
      <span
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--color-accent-text)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Promise card
// ─────────────────────────────────────────────────────────────────────

function PromiseCard({ item }: { item: PromiseItem }) {
  const st = getStatus(item.status);
  return (
    <Link
      to={`/civic/promises/${item.id}`}
      className="group"
      style={{
        display: 'block',
        padding: 18,
        borderRadius: 12,
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        transition: 'border-color 0.15s ease',
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text-1)',
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {item.title}
        </div>
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 10,
            fontWeight: 700,
            borderRadius: 20,
            padding: '3px 8px',
            background: `${st.hex}1F`,
            color: st.token,
            flexShrink: 0,
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {st.label}
        </span>
      </div>
      <div
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          color: 'var(--color-text-3)',
          marginBottom: 10,
        }}
      >
        {item.person_name || item.person_id}
        {item.category && (
          <>
            {' · '}
            <span style={{ letterSpacing: '0.05em', textTransform: 'uppercase' }}>{item.category}</span>
          </>
        )}
      </div>
      <ProgressBar value={item.progress} color={st.token} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: 'var(--color-text-3)',
          }}
        >
          {item.progress}% complete
        </span>
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 10,
            color: 'var(--color-text-3)',
          }}
        >
          {item.milestones?.length || 0} milestones
        </span>
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Proposal card
// ─────────────────────────────────────────────────────────────────────

function ProposalCard({ item }: { item: ProposalItem }) {
  const totalVotes = (item.upvotes || 0) + (item.downvotes || 0);
  const supportPct = totalVotes > 0 ? Math.round(((item.upvotes || 0) / totalVotes) * 100) : 0;
  return (
    <div
      style={{
        padding: '16px 18px',
        borderRadius: 12,
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        transition: 'border-color 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text-1)',
            marginBottom: 4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {item.title}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {item.category && (
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 10,
                color: 'var(--color-text-3)',
                background: 'var(--color-surface-2)',
                borderRadius: 4,
                padding: '2px 7px',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              {item.category}
            </span>
          )}
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: 'var(--color-text-3)',
            }}
          >
            {totalVotes.toLocaleString()} votes
          </span>
        </div>
      </div>
      {totalVotes > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, width: 60 }}>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--color-green)',
              lineHeight: 1,
            }}
          >
            {supportPct}%
          </div>
          <div style={{ width: 50 }}>
            <ProgressBar value={supportPct} color="var(--color-green)" />
          </div>
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 10,
              color: 'var(--color-text-3)',
            }}
          >
            support
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <button
          aria-label="Upvote"
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: '1px solid rgba(61,184,122,0.3)',
            background: 'rgba(61,184,122,0.1)',
            color: 'var(--color-green)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ThumbsUp size={14} />
        </button>
        <button
          aria-label="Downvote"
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: '1px solid rgba(230,57,70,0.3)',
            background: 'rgba(230,57,70,0.1)',
            color: 'var(--color-red)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ThumbsDown size={14} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Submit forms (re-skinned, same logic)
// ─────────────────────────────────────────────────────────────────────

const inputStyle = (accent: string): React.CSSProperties => ({
  width: '100%',
  padding: '9px 12px',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  color: 'var(--color-text-1)',
  outline: 'none',
});

function ProposalSubmitForm({ onSubmitted, onCancel }: { onSubmitted: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [sector, setSector] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!title.trim() || !body.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await createProposal({ title: title.trim(), body: body.trim(), category: category || undefined, sector: sector || undefined });
      onSubmitted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed');
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        padding: 18,
        borderRadius: 12,
        border: '1px solid rgba(74,127,222,0.3)',
        background: 'var(--color-surface)',
        marginBottom: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h4
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--color-text-1)',
            margin: 0,
          }}
        >
          New Proposal
        </h4>
        <button
          onClick={onCancel}
          aria-label="Close form"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text-3)',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <X size={16} />
        </button>
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Short, specific title (e.g., 'Cap prescription drug markups at 200%')"
        style={inputStyle('var(--color-dem)')}
        maxLength={140}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Explain the proposal: what problem it solves, what it changes, who benefits."
        rows={5}
        style={{ ...inputStyle('var(--color-dem)'), resize: 'none' }}
        maxLength={2000}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          style={inputStyle('var(--color-dem)')}
        >
          <option value="">Sector (optional)</option>
          <option value="politics">Politics</option>
          <option value="finance">Finance</option>
          <option value="health">Health</option>
          <option value="technology">Technology</option>
          <option value="energy">Energy</option>
          <option value="transportation">Transportation</option>
          <option value="defense">Defense</option>
          <option value="chemicals">Chemicals</option>
          <option value="agriculture">Agriculture</option>
          <option value="telecom">Telecom</option>
          <option value="education">Education</option>
        </select>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category (e.g., healthcare)"
          style={inputStyle('var(--color-dem)')}
          maxLength={40}
        />
      </div>
      {error && (
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            color: 'var(--color-red)',
            margin: 0,
          }}
        >
          {error}
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        <button
          onClick={onCancel}
          style={{
            padding: '7px 14px',
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--color-text-2)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!title.trim() || !body.trim() || submitting}
          style={{
            padding: '8px 16px',
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--color-dem)',
            background: 'rgba(74,127,222,0.12)',
            border: '1px solid var(--color-dem)',
            borderRadius: 8,
            cursor: (!title.trim() || !body.trim() || submitting) ? 'not-allowed' : 'pointer',
            opacity: (!title.trim() || !body.trim() || submitting) ? 0.5 : 1,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  );
}

function PromiseSubmitForm({ onSubmitted, onCancel }: { onSubmitted: () => void; onCancel: () => void }) {
  const [personId, setPersonId] = useState('');
  const [personName, setPersonName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!personId.trim() || !title.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await createPromise({
        person_id: personId.trim(),
        person_name: personName.trim() || undefined,
        title: title.trim(),
        description: description.trim() || undefined,
        source_url: sourceUrl.trim() || undefined,
        category: category || undefined,
      });
      onSubmitted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed');
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        padding: 18,
        borderRadius: 12,
        border: '1px solid var(--color-accent-dim)',
        background: 'var(--color-surface)',
        marginBottom: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h4
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--color-text-1)',
            margin: 0,
          }}
        >
          Track a Promise
        </h4>
        <button
          onClick={onCancel}
          aria-label="Close form"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text-3)',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input
          type="text"
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          placeholder="person_id (e.g., mitch_mcconnell)"
          style={inputStyle('var(--color-accent)')}
          maxLength={80}
        />
        <input
          type="text"
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          placeholder="Display name (optional)"
          style={inputStyle('var(--color-accent)')}
          maxLength={120}
        />
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Promise headline (e.g., 'Repeal the ACA')"
        style={inputStyle('var(--color-accent)')}
        maxLength={140}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What did they say? What does fulfillment look like?"
        rows={3}
        style={{ ...inputStyle('var(--color-accent)'), resize: 'none' }}
        maxLength={1000}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="Source URL (speech, tweet, interview)"
          style={inputStyle('var(--color-accent)')}
        />
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category (optional)"
          style={inputStyle('var(--color-accent)')}
          maxLength={40}
        />
      </div>
      {error && (
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            color: 'var(--color-red)',
            margin: 0,
          }}
        >
          {error}
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        <button
          onClick={onCancel}
          style={{
            padding: '7px 14px',
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--color-text-2)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!personId.trim() || !title.trim() || submitting}
          style={{
            padding: '8px 16px',
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--color-accent-text)',
            background: 'var(--color-accent-dim)',
            border: '1px solid var(--color-accent)',
            borderRadius: 8,
            cursor: (!personId.trim() || !title.trim() || submitting) ? 'not-allowed' : 'pointer',
            opacity: (!personId.trim() || !title.trim() || submitting) ? 0.5 : 1,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export default function CivicHubPage() {
  const { isAuthenticated } = useAuth();
  const [promises, setPromises] = useState<PromiseItem[]>([]);
  const [proposals, setProposals] = useState<ProposalItem[]>([]);
  const [promiseTotal, setPromiseTotal] = useState(0);
  const [proposalTotal, setProposalTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPromiseForm, setShowPromiseForm] = useState(false);
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetchPromises({ limit: 6, sort: 'hot' }),
      fetchProposals({ limit: 6, sort: 'hot' }),
    ]).then(([prom, prop]) => {
      if (cancelled) return;
      if (prom.status === 'fulfilled') { setPromises(prom.value.items); setPromiseTotal(prom.value.total); }
      if (prop.status === 'fulfilled') { setProposals(prop.value.items); setProposalTotal(prop.value.total); }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [refreshTick]);

  const onProposalSubmitted = () => { setShowProposalForm(false); setRefreshTick(x => x + 1); };
  const onPromiseSubmitted = () => { setShowPromiseForm(false); setRefreshTick(x => x + 1); };

  return (
    <main
      id="main-content"
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        color: 'var(--color-text-1)',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 40px 0' }}>
        <CivicSectorHeader />
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 40px 64px' }}>
        {/* Hero */}
        <div style={{ marginBottom: 28 }}>
          <EyebrowPill label="Civic Engagement" />
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(32px, 5vw, 44px)',
              color: 'var(--color-text-1)',
              margin: '0 0 8px 0',
              letterSpacing: '-0.01em',
              lineHeight: 1.08,
            }}
          >
            Civic Hub
          </h1>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              color: 'var(--color-text-2)',
              maxWidth: 560,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Track political promises, vote on policy proposals, and earn badges for civic participation.
            Contributions scored using Wilson confidence intervals — quality rises to the top.
          </p>
        </div>

        {/* Feature nav pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
          {FEATURE_PILLS.map((pill) => (
            <Link
              key={pill.to}
              to={pill.to}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'transparent',
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--color-text-2)',
                textDecoration: 'none',
                transition: 'border-color 0.15s ease, background 0.15s ease, color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = pill.token;
                e.currentTarget.style.background = `${pill.hex}18`;
                e.currentTarget.style.color = pill.token;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--color-text-2)';
              }}
            >
              <pill.icon size={13} />
              {pill.label}
            </Link>
          ))}
        </div>

        {loading && (
          <div
            style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}
            aria-busy="true"
          >
            <div
              style={{
                height: 32,
                width: 32,
                borderRadius: '50%',
                border: '2px solid var(--color-border)',
                borderTopColor: 'var(--color-accent)',
                animation: 'spin 1s linear infinite',
              }}
              role="status"
            >
              <span className="sr-only">Loading civic data…</span>
            </div>
          </div>
        )}

        {!loading && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: 32,
            }}
          >
            {/* Promises section */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--color-text-1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Target size={14} style={{ color: 'var(--color-accent)' }} />
                  Active Promises
                  <span style={{ color: 'var(--color-text-3)', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 400 }}>
                    — {promiseTotal.toLocaleString()} tracked
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {isAuthenticated && !showPromiseForm && (
                    <button
                      onClick={() => setShowPromiseForm(true)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '7px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--color-accent)',
                        background: 'var(--color-accent-dim)',
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--color-accent-text)',
                        cursor: 'pointer',
                      }}
                    >
                      <Plus size={12} /> Track a Promise
                    </button>
                  )}
                  <Link
                    to="/civic/promises"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 12,
                      color: 'var(--color-text-3)',
                      textDecoration: 'none',
                    }}
                  >
                    View all <ChevronRight size={12} />
                  </Link>
                </div>
              </div>
              {showPromiseForm && (
                <PromiseSubmitForm onSubmitted={onPromiseSubmitted} onCancel={() => setShowPromiseForm(false)} />
              )}
              {!isAuthenticated && (
                <div
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 12,
                    color: 'var(--color-text-3)',
                    marginBottom: 12,
                  }}
                >
                  <Link
                    to="/login"
                    style={{ color: 'var(--color-accent-text)', textDecoration: 'underline' }}
                  >
                    Log in
                  </Link>{' '}
                  to submit a promise.
                </div>
              )}
              {promises.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '48px 0',
                    background: 'var(--color-surface)',
                    borderRadius: 12,
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <Target
                    size={32}
                    style={{ margin: '0 auto 12px', color: 'var(--color-text-3)', display: 'block' }}
                  />
                  <p style={{ color: 'var(--color-text-2)', fontSize: 13, margin: '0 0 4px', fontFamily: "'Inter', sans-serif" }}>
                    No promises tracked yet.
                  </p>
                  <p style={{ color: 'var(--color-text-3)', fontSize: 11, margin: 0, fontFamily: "'Inter', sans-serif" }}>
                    Be the first to submit a politician's promise for accountability tracking.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {promises.map((p) => <PromiseCard key={p.id} item={p} />)}
                </div>
              )}
            </section>

            {/* Proposals section */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--color-text-1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Megaphone size={14} style={{ color: 'var(--color-dem)' }} />
                  Citizen Proposals
                  <span style={{ color: 'var(--color-text-3)', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 400 }}>
                    — {proposalTotal.toLocaleString()} submitted
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {isAuthenticated && !showProposalForm && (
                    <button
                      onClick={() => setShowProposalForm(true)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '7px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--color-dem)',
                        background: 'rgba(74,127,222,0.12)',
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--color-dem)',
                        cursor: 'pointer',
                      }}
                    >
                      <Plus size={12} /> Submit Proposal
                    </button>
                  )}
                  <Link
                    to="/civic/proposals"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 12,
                      color: 'var(--color-text-3)',
                      textDecoration: 'none',
                    }}
                  >
                    View all <ChevronRight size={12} />
                  </Link>
                </div>
              </div>
              {showProposalForm && (
                <ProposalSubmitForm onSubmitted={onProposalSubmitted} onCancel={() => setShowProposalForm(false)} />
              )}
              {!isAuthenticated && (
                <div
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 12,
                    color: 'var(--color-text-3)',
                    marginBottom: 12,
                  }}
                >
                  <Link
                    to="/login"
                    style={{ color: 'var(--color-dem)', textDecoration: 'underline' }}
                  >
                    Log in
                  </Link>{' '}
                  to submit a proposal.
                </div>
              )}
              {proposals.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '48px 0',
                    background: 'var(--color-surface)',
                    borderRadius: 12,
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <Megaphone
                    size={32}
                    style={{ margin: '0 auto 12px', color: 'var(--color-text-3)', display: 'block' }}
                  />
                  <p style={{ color: 'var(--color-text-2)', fontSize: 13, margin: '0 0 4px', fontFamily: "'Inter', sans-serif" }}>
                    No proposals yet.
                  </p>
                  <p style={{ color: 'var(--color-text-3)', fontSize: 11, margin: 0, fontFamily: "'Inter', sans-serif" }}>
                    Submit a policy proposal and let the community vote on it.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {proposals.map((p) => <ProposalCard key={p.id} item={p} />)}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </main>
  );
}
