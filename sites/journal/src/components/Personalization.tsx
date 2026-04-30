/**
 * Personalization layer for the journal site.
 *
 * Pieces:
 *   - PersonalizationProvider:  reads/writes onboarding state to
 *                               localStorage so anonymous readers
 *                               (the disengaged audience) get the
 *                               full personalized experience without
 *                               signing up. Logged-in readers
 *                               eventually sync to /auth/onboarding,
 *                               but v1 is anonymous-only.
 *   - usePersonalization:       hook returning the current state +
 *                               actions (open modal, save, clear).
 *   - OnboardingModal:          first-time prompt. Asks 3 questions:
 *                               zip, lifestyle (1-3), current concern.
 *   - WhyThisMattersBlock:      consumes /stories/{slug}/personalization
 *                               and renders matched_lifestyle +
 *                               concern_anchor + your_representatives
 *                               at the top of every story.
 *   - StoryActionPanel:         consumes /stories/{slug}/actions and
 *                               renders the Action Panel at the
 *                               bottom of every story.
 *
 * Design rules baked in:
 *   - The disengaged-audience thesis: every component must be
 *     readable without civic-domain knowledge. Plain language only.
 *   - Hide-not-fail: any API failure or empty result hides the
 *     component instead of showing a broken / empty state.
 *   - One concrete next step per story (Action Panel) is the
 *     payoff for engagement. We don't beg; we offer.
 *   - Personalization persists 90 days then re-prompts, so users
 *     who've moved or whose priorities shifted get a fresh ask.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getApiBase } from '../api/client';

const API_BASE = getApiBase();

// localStorage key. Bumping this resets every reader's onboarding —
// only do that when the schema meaningfully changes.
const STORAGE_KEY = 'wtp.personalization.v1';
// 90-day TTL on stored personalization. After that the modal
// re-prompts so we capture changes (move, shift in priorities).
const STORAGE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// Allowlists must match the backend's ONBOARDING_LIFESTYLE_CATEGORIES
// + ONBOARDING_CONCERNS in routers/auth.py. Keep in sync.
export const LIFESTYLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'banking',        label: 'Banking & credit' },
  { value: 'healthcare',     label: 'Healthcare' },
  { value: 'housing',        label: 'Housing & rent' },
  { value: 'energy',         label: 'Energy & utilities' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'tech',           label: 'Tech & internet' },
  { value: 'education',      label: 'Education' },
  { value: 'food',           label: 'Food & groceries' },
  { value: 'work',           label: 'Work & wages' },
  { value: 'kids',           label: 'Kids & family' },
];

export const CONCERN_OPTIONS: { value: string; label: string }[] = [
  { value: 'rent_too_high',     label: 'Rent or mortgage costs' },
  { value: 'healthcare_costs',  label: 'Healthcare costs' },
  { value: 'student_loans',     label: 'Student loans' },
  { value: 'fuel_prices',       label: 'Fuel prices' },
  { value: 'groceries',         label: 'Grocery prices' },
  { value: 'wages',             label: 'Wages and pay' },
  { value: 'childcare',         label: 'Childcare costs' },
  { value: 'credit_card_debt',  label: 'Credit card debt' },
  { value: 'retirement',        label: 'Retirement savings' },
  { value: 'other',             label: 'Other' },
];

interface PersonalizationState {
  zip: string;
  state: string | null;
  lifestyle: string[];
  concern: string;
  savedAt: number; // unix ms
}

interface PersonalizationContextValue {
  state: PersonalizationState | null;
  isComplete: boolean;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  save: (next: Omit<PersonalizationState, 'savedAt' | 'state'>) => Promise<void>;
  clear: () => void;
}

const PersonalizationContext = createContext<PersonalizationContextValue | null>(null);

function loadFromStorage(): PersonalizationState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersonalizationState;
    if (typeof parsed?.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > STORAGE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveToStorage(state: PersonalizationState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or storage disabled; degrade silently.
  }
}

function clearStorage() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function PersonalizationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersonalizationState | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Restore on mount.
  useEffect(() => {
    setState(loadFromStorage());
  }, []);

  const save = useCallback(
    async (next: Omit<PersonalizationState, 'savedAt' | 'state'>) => {
      // Resolve state from zip server-side (single round-trip; reuses
      // the backend's _zip_to_state). On any failure we still save
      // locally with state=null — the rep widget gracefully hides.
      let resolvedState: string | null = null;
      try {
        const res = await fetch(
          `${API_BASE}/auth/personalization/zip-state?zip=${encodeURIComponent(next.zip)}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (typeof data?.state === 'string') resolvedState = data.state;
        }
      } catch {
        // ignore; fallback below.
      }
      const full: PersonalizationState = {
        ...next,
        state: resolvedState,
        savedAt: Date.now(),
      };
      saveToStorage(full);
      setState(full);
      setIsModalOpen(false);
    },
    [],
  );

  const clear = useCallback(() => {
    clearStorage();
    setState(null);
  }, []);

  const value = useMemo<PersonalizationContextValue>(
    () => ({
      state,
      isComplete: state !== null,
      isModalOpen,
      openModal: () => setIsModalOpen(true),
      closeModal: () => setIsModalOpen(false),
      save,
      clear,
    }),
    [state, isModalOpen, save, clear],
  );

  return (
    <PersonalizationContext.Provider value={value}>
      {children}
    </PersonalizationContext.Provider>
  );
}

export function usePersonalization(): PersonalizationContextValue {
  const ctx = useContext(PersonalizationContext);
  if (!ctx) {
    throw new Error('usePersonalization must be used inside PersonalizationProvider');
  }
  return ctx;
}

// ── Onboarding Modal ──────────────────────────────────────────────

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(7, 9, 12, 0.85)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  zIndex: 9999,
};

const modalCardStyle: React.CSSProperties = {
  maxWidth: 520,
  width: '100%',
  background: 'var(--color-surface)',
  border: '1px solid rgba(235,229,213,0.12)',
  borderRadius: 16,
  padding: '28px 28px 24px',
  color: 'var(--color-text-1)',
  maxHeight: '90vh',
  overflowY: 'auto',
};

const modalHeadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 900,
  fontSize: 26,
  lineHeight: 1.15,
  marginBottom: 8,
};

const modalSubheadStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  lineHeight: 1.55,
  color: 'var(--color-text-2)',
  marginBottom: 20,
};

const fieldLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--color-text-2)',
  display: 'block',
  marginBottom: 8,
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

const chipBaseStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  padding: '8px 12px',
  borderRadius: 999,
  border: '1px solid rgba(235,229,213,0.15)',
  background: 'transparent',
  color: 'var(--color-text-1)',
  cursor: 'pointer',
  transition: 'all 0.15s',
};

const chipActiveStyle: React.CSSProperties = {
  ...chipBaseStyle,
  background: 'var(--color-accent)',
  color: '#07090C',
  borderColor: 'var(--color-accent)',
};

export function OnboardingModal() {
  const { isModalOpen, closeModal, save } = usePersonalization();
  const [zip, setZip] = useState('');
  const [lifestyle, setLifestyle] = useState<string[]>([]);
  const [concern, setConcern] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isModalOpen) return null;

  const toggleLifestyle = (val: string) => {
    setLifestyle((prev) => {
      if (prev.includes(val)) return prev.filter((x) => x !== val);
      if (prev.length >= 3) return prev; // cap at 3
      return [...prev, val];
    });
  };

  const handleSubmit = async () => {
    setError(null);
    if (!/^\d{5}$/.test(zip.trim())) {
      setError('Please enter a 5-digit ZIP code.');
      return;
    }
    if (lifestyle.length === 0) {
      setError('Pick at least one category.');
      return;
    }
    if (!concern) {
      setError('Pick what matters most to you right now.');
      return;
    }
    setSubmitting(true);
    try {
      await save({ zip: zip.trim(), lifestyle, concern });
    } catch {
      setError("Something went wrong saving that. We'll try again next visit.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={modalOverlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div style={modalCardStyle} role="dialog" aria-modal="true">
        <h2 style={modalHeadingStyle}>Make this about you</h2>
        <p style={modalSubheadStyle}>
          Most stories about money in politics aren&apos;t written for you.
          They&apos;re written for people who already follow this stuff.
          Three quick answers and we&apos;ll show you what each story means
          for your bills, your senators, and your bank. We don&apos;t ask
          for your name or email.
        </p>

        {/* ZIP */}
        <div style={{ marginBottom: 20 }}>
          <label style={fieldLabelStyle} htmlFor="onb-zip">
            Your ZIP code
          </label>
          <input
            id="onb-zip"
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="48043"
            value={zip}
            onChange={(e) =>
              setZip(e.target.value.replace(/\D/g, '').slice(0, 5))
            }
            style={inputStyle}
          />
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--color-text-3)',
              marginTop: 6,
            }}
          >
            Used to find your senators and house rep. Not stored anywhere
            except your browser.
          </div>
        </div>

        {/* Lifestyle */}
        <div style={{ marginBottom: 20 }}>
          <label style={fieldLabelStyle}>
            What do you spend money on? Pick up to 3
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {LIFESTYLE_OPTIONS.map((opt) => {
              const active = lifestyle.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleLifestyle(opt.value)}
                  style={active ? chipActiveStyle : chipBaseStyle}
                  disabled={!active && lifestyle.length >= 3}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Concern */}
        <div style={{ marginBottom: 20 }}>
          <label style={fieldLabelStyle} htmlFor="onb-concern">
            What&apos;s hurting your wallet most right now?
          </label>
          <select
            id="onb-concern"
            value={concern}
            onChange={(e) => setConcern(e.target.value)}
            style={inputStyle}
          >
            <option value="">Pick one…</option>
            {CONCERN_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--color-red)',
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={closeModal}
            style={{
              ...chipBaseStyle,
              padding: '10px 18px',
              fontSize: 14,
            }}
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              ...chipActiveStyle,
              padding: '10px 22px',
              fontSize: 14,
              fontWeight: 700,
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Saving…' : 'Show me'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── "Why this matters to you" block ────────────────────────────────

interface PersonalizationPayload {
  matched_lifestyle: string[];
  your_representatives: Array<{
    person_id: string;
    display_name: string;
    chamber: string;
    party: string | null;
    state: string | null;
    photo_url: string | null;
  }>;
  concern_anchor: string | null;
  has_personalization: boolean;
}

const lifestyleLabel = (val: string): string =>
  LIFESTYLE_OPTIONS.find((o) => o.value === val)?.label ?? val;

export function WhyThisMattersBlock({ slug }: { slug: string }) {
  const { state, openModal } = usePersonalization();
  const [data, setData] = useState<PersonalizationPayload | null>(null);

  useEffect(() => {
    if (!slug) return;
    if (!state) {
      // Anonymous reader. Show a soft prompt to onboard. The block
      // itself stays small so it doesn't feel like a paywall.
      setData(null);
      return;
    }
    const params = new URLSearchParams();
    if (state.state) params.set('state', state.state);
    if (state.lifestyle?.length) params.set('lifestyle', state.lifestyle.join(','));
    if (state.concern) params.set('concern', state.concern);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    fetch(`${API_BASE}/stories/${slug}/personalization?${params}`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => clearTimeout(t));
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [slug, state]);

  // Soft-prompt to onboard for anonymous readers.
  if (!state) {
    return (
      <div
        style={{
          marginBottom: 24,
          padding: '14px 18px',
          border: '1px solid rgba(197,160,40,0.25)',
          background: 'rgba(197,160,40,0.06)',
          borderRadius: 12,
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          lineHeight: 1.55,
          color: 'var(--color-text-1)',
        }}
      >
        <strong>Make this story about you.</strong>{' '}
        Three quick answers and we&apos;ll show you what this means for
        your bills and your senators.{' '}
        <button
          type="button"
          onClick={openModal}
          style={{
            background: 'transparent',
            border: 0,
            padding: 0,
            color: 'var(--color-accent-text)',
            textDecoration: 'underline',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 'inherit',
          }}
        >
          Personalize (30 seconds)
        </button>
      </div>
    );
  }

  if (!data || !data.has_personalization) {
    return null;
  }

  return (
    <div
      style={{
        marginBottom: 24,
        padding: '16px 20px',
        border: '1px solid rgba(197,160,40,0.25)',
        background: 'rgba(197,160,40,0.05)',
        borderRadius: 12,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-accent-text)',
          marginBottom: 10,
        }}
      >
        Why this matters to you
      </div>

      {data.concern_anchor && (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            lineHeight: 1.6,
            color: 'var(--color-text-1)',
            marginBottom: 10,
          }}
        >
          {data.concern_anchor}
        </p>
      )}

      {data.matched_lifestyle.length > 0 && (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--color-text-2)',
            marginBottom: data.your_representatives.length > 0 ? 10 : 0,
          }}
        >
          This story touches{' '}
          {data.matched_lifestyle.map((c, i) => (
            <span key={c}>
              {i > 0 && i === data.matched_lifestyle.length - 1 ? ' and ' : i > 0 ? ', ' : ''}
              <strong style={{ color: 'var(--color-text-1)' }}>
                {lifestyleLabel(c).toLowerCase()}
              </strong>
            </span>
          ))}{' '}
          — categories you said matter to you.
        </p>
      )}

      {data.your_representatives.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
              marginBottom: 6,
            }}
          >
            Your representatives ({state.state ?? 'state unknown'})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.your_representatives.slice(0, 8).map((r) => (
              <Link
                key={r.person_id}
                to={`/politics/people/${r.person_id}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px 4px 4px',
                  background: 'rgba(235,229,213,0.04)',
                  border: '1px solid rgba(235,229,213,0.1)',
                  borderRadius: 999,
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--color-text-1)',
                  textDecoration: 'none',
                }}
              >
                {r.photo_url ? (
                  <img
                    src={r.photo_url}
                    alt=""
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <span style={{ width: 22 }} />
                )}
                <span>{r.display_name}</span>
                {r.party && (
                  <span style={{ color: 'var(--color-text-3)', fontSize: 11 }}>
                    ({r.party})
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Story Action Panel ─────────────────────────────────────────────

interface StoryAction {
  id: number;
  action_type: string;
  title: string;
  description: string | null;
  is_passive: boolean;
  geographic_filter: string | null;
  script_template: string | null;
  external_url: string | null;
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  call_rep: 'Call your rep',
  switch_provider: 'Switch providers',
  check_redress: 'Check if you&apos;re owed money',
  attend_hearing: 'Attend a hearing',
  read_more: 'Read the source',
  verify_data: 'Verify the data',
  register_to_vote: 'Register to vote',
};

export function StoryActionPanel({ slug }: { slug: string }) {
  const { state } = usePersonalization();
  const [actions, setActions] = useState<StoryAction[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!slug) return;
    const params = new URLSearchParams();
    if (state?.state) params.set('state', state.state);
    fetch(`${API_BASE}/stories/${slug}/actions?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.actions && Array.isArray(d.actions)) {
          setActions(d.actions);
        }
      })
      .catch(() => {
        /* silent */
      })
      .finally(() => setLoaded(true));
  }, [slug, state]);

  if (!loaded || actions.length === 0) return null;

  const passive = actions.filter((a) => a.is_passive);
  const active = actions.filter((a) => !a.is_passive);

  const renderAction = (a: StoryAction) => {
    const safeUrl = a.external_url && /^https?:\/\//.test(a.external_url)
      ? a.external_url
      : null;
    return (
      <div
        key={a.id}
        style={{
          padding: '14px 16px',
          background: 'rgba(235,229,213,0.04)',
          border: '1px solid rgba(235,229,213,0.1)',
          borderRadius: 10,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--color-text-3)',
            marginBottom: 6,
          }}
          dangerouslySetInnerHTML={{
            __html: ACTION_TYPE_LABELS[a.action_type] ?? a.action_type,
          }}
        />
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--color-text-1)',
            marginBottom: a.description ? 4 : 8,
          }}
        >
          {a.title}
        </div>
        {a.description && (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              lineHeight: 1.55,
              color: 'var(--color-text-2)',
              marginBottom: 8,
            }}
          >
            {a.description}
          </p>
        )}
        {a.script_template && (
          <details style={{ marginBottom: 8 }}>
            <summary
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--color-accent-text)',
                cursor: 'pointer',
              }}
            >
              Script
            </summary>
            <pre
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                lineHeight: 1.55,
                color: 'var(--color-text-1)',
                background: 'rgba(7,9,12,0.3)',
                padding: 10,
                borderRadius: 6,
                marginTop: 6,
                whiteSpace: 'pre-wrap',
              }}
            >
              {a.script_template}
            </pre>
          </details>
        )}
        {safeUrl && (
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              padding: '8px 14px',
              background: 'var(--color-accent)',
              color: '#07090C',
              borderRadius: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            Take action
          </a>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        marginTop: 32,
        marginBottom: 32,
        padding: '20px 22px',
        border: '1px solid rgba(235,229,213,0.1)',
        borderRadius: 14,
        background: 'var(--color-surface)',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 900,
          fontSize: 22,
          marginBottom: 6,
          color: 'var(--color-text-1)',
        }}
      >
        What you can do in 60 seconds
      </h2>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          color: 'var(--color-text-2)',
          marginBottom: 16,
        }}
      >
        We don&apos;t tell you what to think. We give you concrete, low-friction
        next steps. Take any of them, or none.
      </p>

      {passive.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
              marginBottom: 8,
            }}
          >
            Just for you (no politics required)
          </div>
          {passive.map(renderAction)}
        </div>
      )}

      {active.length > 0 && (
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
              marginBottom: 8,
            }}
          >
            Make your voice heard
          </div>
          {active.map(renderAction)}
        </div>
      )}
    </div>
  );
}
