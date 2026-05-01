/**
 * Tip submission page.
 *
 * Phase 2 contributor onboarding: a single-form page anyone can use
 * to send the editorial team a story idea, a pointer to a public
 * record, or context an existing story is missing. Posts to the
 * public POST /tips endpoint (rate-limited 5/min/IP).
 *
 * Design rules:
 *   - Subject + body are the only required fields. Anything else
 *     (name, email, sector hint, related-story slug) is optional.
 *     The disengaged-audience thesis says lower the bar first.
 *   - Hide-not-fail: a successful submission flips to a "thanks"
 *     state; on failure we surface the error inline and let the
 *     user retry without losing their text.
 *   - We never display the submitter IP back to the user; it's
 *     captured server-side for triage / abuse-control only.
 */

import { useState } from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import { getApiBase } from '../api/client';

const API_BASE = getApiBase();

const SECTOR_HINTS: { value: string; label: string }[] = [
  { value: '',               label: 'Not sure / pick later' },
  { value: 'finance',        label: 'Finance' },
  { value: 'health',         label: 'Healthcare' },
  { value: 'housing',        label: 'Housing' },
  { value: 'energy',         label: 'Energy' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'technology',     label: 'Technology' },
  { value: 'telecom',        label: 'Telecom' },
  { value: 'education',      label: 'Education' },
  { value: 'agriculture',    label: 'Agriculture & food' },
  { value: 'chemicals',      label: 'Chemicals' },
  { value: 'defense',        label: 'Defense' },
];

type SubmitState = 'idle' | 'submitting' | 'ok' | 'err';

export default function TipPage() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [hintSector, setHintSector] = useState('');
  const [hintEntity, setHintEntity] = useState('');
  const [relatedSlug, setRelatedSlug] = useState('');

  const [state, setState] = useState<SubmitState>('idle');
  const [error, setError] = useState<string | null>(null);

  usePageMeta({
    title: 'Send a tip — The Influence Journal',
    description:
      'Tip the editorial team about a story idea, a public record, or context an existing story is missing.',
    canonical: 'https://journal.wethepeopleforus.com/tip',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (subject.trim().length < 4) {
      setError('Give the subject a few more words so we can triage it.');
      return;
    }
    if (body.trim().length < 20) {
      setError('Tell us a little more (at least 20 characters).');
      return;
    }
    setState('submitting');
    try {
      const res = await fetch(`${API_BASE}/tips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          contact_email: contactEmail.trim() || undefined,
          contact_name: contactName.trim() || undefined,
          hint_sector: hintSector || undefined,
          hint_entity: hintEntity.trim() || undefined,
          related_story_slug: relatedSlug.trim() || undefined,
        }),
      });
      if (res.status === 429) {
        setError('Hit the rate limit. Try again in a minute.');
        setState('idle');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(
          (data && (data.detail || data.message)) ||
            `Submission failed (HTTP ${res.status}). Please try again.`,
        );
        setState('idle');
        return;
      }
      setState('ok');
    } catch {
      setError('Network error. Please try again.');
      setState('idle');
    }
  };

  if (state === 'ok') {
    return (
      <main
        id="main-content"
        className="flex-1 px-4 py-14"
        style={{ color: 'var(--color-text-1)' }}
      >
        <div className="max-w-[640px] mx-auto">
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 'clamp(28px, 4vw, 40px)',
              marginBottom: 12,
            }}
          >
            Thanks for the tip.
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 16,
              lineHeight: 1.6,
              color: 'var(--color-text-2)',
            }}
          >
            An editor will look at it. If you left an email and we have
            follow-up questions, we&apos;ll reach out. Otherwise we&apos;ll
            simply act on what you sent (or set it aside, if it doesn&apos;t
            line up with our coverage).
          </p>
        </div>
      </main>
    );
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: 'var(--color-text-2)',
    display: 'block',
    marginBottom: 6,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontFamily: 'var(--font-body)',
    fontSize: 15,
    border: '1px solid rgba(235,229,213,0.15)',
    borderRadius: 8,
    background: 'rgba(235,229,213,0.03)',
    color: 'var(--color-text-1)',
  };

  return (
    <main
      id="main-content"
      className="flex-1 px-4 py-14"
      style={{ color: 'var(--color-text-1)' }}
    >
      <div className="max-w-[640px] mx-auto">
        <header style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 'clamp(28px, 4vw, 40px)',
              marginBottom: 12,
            }}
          >
            Send a tip
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 16,
              lineHeight: 1.6,
              color: 'var(--color-text-2)',
            }}
          >
            Spotted a public record that deserves a closer look? Found
            context one of our stories is missing? Have a lead on
            money in politics we should follow? Tell us. We read every
            tip.
          </p>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--color-text-3)',
              marginTop: 8,
            }}
          >
            Only the subject and body are required. Email and name are
            optional. We never publish a tipster&apos;s identity without
            their explicit permission.
          </p>
        </header>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label htmlFor="tip-subject" style={labelStyle}>Subject</label>
            <input
              id="tip-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="One line — what is this about?"
              maxLength={255}
              style={inputStyle}
              required
            />
          </div>

          <div>
            <label htmlFor="tip-body" style={labelStyle}>Details</label>
            <textarea
              id="tip-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What did you see? Where did you see it? Who&rsquo;s involved?"
              rows={8}
              maxLength={5000}
              style={{ ...inputStyle, fontFamily: 'var(--font-body)', resize: 'vertical' }}
              required
            />
          </div>

          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label htmlFor="tip-name" style={labelStyle}>Your name (optional)</label>
              <input
                id="tip-name"
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                maxLength={120}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="tip-email" style={labelStyle}>Email (optional)</label>
              <input
                id="tip-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                maxLength={255}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label htmlFor="tip-sector" style={labelStyle}>Sector hint</label>
              <select
                id="tip-sector"
                value={hintSector}
                onChange={(e) => setHintSector(e.target.value)}
                style={{ ...inputStyle, color: 'var(--color-text-1)', background: 'rgba(20,24,30,0.85)' }}
              >
                {SECTOR_HINTS.map((s) => (
                  <option key={s.value || 'none'} value={s.value} style={{ color: '#0f172a' }}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tip-entity" style={labelStyle}>Entity (company / person)</label>
              <input
                id="tip-entity"
                type="text"
                value={hintEntity}
                onChange={(e) => setHintEntity(e.target.value)}
                maxLength={255}
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label htmlFor="tip-related" style={labelStyle}>
              Related story slug (optional)
            </label>
            <input
              id="tip-related"
              type="text"
              value={relatedSlug}
              onChange={(e) => setRelatedSlug(e.target.value)}
              placeholder="e.g. lobbying-firm-tarplin-downs-young-llc-..."
              maxLength={255}
              style={inputStyle}
            />
          </div>

          {error && (
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: '#fca5a5',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 8,
                padding: '10px 12px',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={state === 'submitting'}
              style={{
                padding: '10px 22px',
                borderRadius: 999,
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                fontWeight: 700,
                background: 'var(--color-accent)',
                color: '#07090C',
                border: '1px solid var(--color-accent)',
                cursor: state === 'submitting' ? 'wait' : 'pointer',
                opacity: state === 'submitting' ? 0.6 : 1,
              }}
            >
              {state === 'submitting' ? 'Sending…' : 'Send tip'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
