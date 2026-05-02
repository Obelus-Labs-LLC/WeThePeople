import React, { useState } from 'react';
import { Flag, X } from 'lucide-react';

/**
 * Tiny "report an error on this data point" affordance. Audit item #9.
 *
 * Renders a flag icon next to a data row; clicking it opens a small
 * inline form that captures the user's note + the row context, and
 * submits to the existing /tips POST endpoint with category="data_error".
 *
 * The shape of the submission matches the backend tips schema:
 *   {
 *     category: "data_error",
 *     subject: "{record_kind} {record_id}",
 *     body: "user's note",
 *     evidence: { url, record_id, record_kind, ...context }
 *   }
 *
 * Usage:
 *   <ReportErrorButton recordKind="trade" recordId={trade.id} context={{ ticker: trade.ticker, person: trade.person_id }} />
 *
 * No frontend state machine — submit, show "thanks" for 3 seconds, then
 * close. Failures show inline; we don't fail the surrounding view.
 */
interface ReportErrorButtonProps {
  /** Human-friendly type ("trade", "donation", "lobbying filing"). */
  recordKind: string;
  /** Stable id for the row being flagged. */
  recordId: string | number;
  /** Extra context attached to the submission (any JSON-serializable). */
  context?: Record<string, unknown>;
  /** Optional URL of the page being flagged; defaults to window.location. */
  pageUrl?: string;
}

const REPORT_ENDPOINT = '/tips';

export default function ReportErrorButton({
  recordKind,
  recordId,
  context,
  pageUrl,
}: ReportErrorButtonProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const url = pageUrl || (typeof window !== 'undefined' ? window.location.href : '');

  const submit = async () => {
    const trimmed = note.trim();
    if (!trimmed) {
      setError('Add a brief note about what looks wrong.');
      return;
    }
    if (trimmed.length < 20) {
      setError(`Add a few more details (at least 20 characters; you have ${trimmed.length}).`);
      return;
    }
    setSubmitting(true);
    setError('');
    // The /tips schema has fixed fields (subject/body/hint_sector/
    // hint_entity/related_story_slug) — no separate category/evidence
    // fields. We pack the row context into the body and use
    // hint_entity to make these reports filterable in the moderation
    // queue. Subject is "data_error: {kind} #{id}" so a triager can
    // see at a glance these are data-row reports rather than story
    // tips. body is min 20 / max 5000 chars on the backend.
    const subject = `data_error: ${recordKind} #${recordId}`.slice(0, 255);
    const ctxLines = Object.entries(context || {})
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `  ${k}: ${String(v)}`)
      .join('\n');
    const body = [
      trimmed,
      '',
      `[reporter context]`,
      `  url: ${url}`,
      `  record_kind: ${recordKind}`,
      `  record_id: ${recordId}`,
      ctxLines,
    ].filter(Boolean).join('\n').slice(0, 5000);
    try {
      const resp = await fetch('/api' + REPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject,
          body,
          hint_entity: `${recordKind}:${recordId}`,
        }),
      });
      if (!resp.ok) {
        // Don't surface the raw body — keep the failure message human.
        if (resp.status === 429) {
          setError('Too many reports. Try again in a minute.');
        } else if (resp.status === 401) {
          setError('Sign in to report errors.');
        } else {
          setError('Could not submit. Try again or email wethepeopleforus@gmail.com.');
        }
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
      setSubmitting(false);
      setTimeout(() => {
        setOpen(false);
        setSubmitted(false);
        setNote('');
      }, 2500);
    } catch {
      setError('Network error — please retry.');
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center text-zinc-700 hover:text-amber-500 transition-colors"
        title="Report an error on this row"
        aria-label={`Report an error on ${recordKind} ${recordId}`}
      >
        <Flag size={11} />
      </button>
    );
  }

  return (
    <div
      className="inline-block ml-2 align-middle"
      style={{
        background: 'var(--color-surface, rgba(255,255,255,0.04))',
        border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
        borderRadius: 8,
        padding: 10,
        minWidth: 240,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-amber-400">
          Report error: {recordKind} #{recordId}
        </span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setNote('');
            setError('');
          }}
          className="text-zinc-600 hover:text-zinc-400"
          aria-label="Close"
        >
          <X size={12} />
        </button>
      </div>
      {submitted ? (
        <div className="text-xs text-emerald-400 py-2">
          Thanks. We&rsquo;ll review and post the correction at /corrections.
        </div>
      ) : (
        <>
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setError('');
            }}
            placeholder="What's wrong with this row?"
            rows={3}
            className="w-full text-xs"
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid var(--color-border, rgba(255,255,255,0.12))',
              background: 'var(--color-bg, transparent)',
              color: 'var(--color-text-1, #e5e5e5)',
              outline: 'none',
              resize: 'vertical',
              marginBottom: 6,
            }}
          />
          {error && (
            <div className="text-xs text-red-400 mb-2" role="alert">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setNote('');
                setError('');
              }}
              className="text-xs px-2 py-1 text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !note.trim()}
              className="text-xs px-2.5 py-1 rounded-md bg-amber-500 text-black font-bold disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Send'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
