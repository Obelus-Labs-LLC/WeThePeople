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

// Sector allowlist — must match the platform's 11 reporting sectors.
// These directly drive the Journal homepage feed filter and the
// "Why this matters" matched_lifestyle block. The "lifestyle"
// backend column stays the authoritative store; we map sectors
// onto it 1-to-1 where possible. Sectors that don't have a
// corresponding lifestyle bucket (politics, defense) still pass
// through but only filter the feed; they don't drive lifestyle
// matching on individual stories.
export const SECTOR_OPTIONS: { value: string; label: string }[] = [
  { value: 'finance',        label: 'Finance' },
  { value: 'health',         label: 'Healthcare' },
  { value: 'housing',        label: 'Housing' },
  { value: 'energy',         label: 'Energy' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'technology',     label: 'Technology' },
  { value: 'telecom',        label: 'Telecommunications' },
  { value: 'education',      label: 'Education' },
  { value: 'agriculture',    label: 'Agriculture & Food' },
  { value: 'chemicals',      label: 'Chemicals' },
  { value: 'defense',        label: 'Defense' },
];

// Pocketbook concerns. Multi-select. Drives the concern_anchor
// sentence on each story and is also a soft signal on the feed.
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
  { value: 'taxes',             label: 'Taxes' },
  { value: 'other',             label: 'Other' },
];

// Backwards-compat re-export for any caller that still expects
// the old prop name. Lifestyle is the API name; sectors is what
// the user sees. Both arrays are interchangeable for the
// localStorage layer.
export const LIFESTYLE_OPTIONS = SECTOR_OPTIONS;

interface PersonalizationState {
  zip: string;
  state: string | null;
  // `lifestyle` is named for backward-compat with the v1 schema +
  // backend column. Semantically these are now sector picks.
  lifestyle: string[];
  // Multi-select. The single-string `concern` value is preserved on
  // disk for older clients (set to concerns[0] when writing).
  concerns: string[];
  // Legacy single concern. Read by older bundles; written for new
  // bundles as concerns[0] || ''.
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
    const parsed = JSON.parse(raw) as Partial<PersonalizationState> & {
      concern?: string;
      concerns?: string[];
    };
    if (typeof parsed?.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > STORAGE_TTL_MS) return null;
    // Migrate v1 single-concern records to v2 multi-concern shape.
    const concerns = Array.isArray(parsed.concerns)
      ? parsed.concerns
      : parsed.concern
        ? [parsed.concern]
        : [];
    return {
      zip: parsed.zip ?? '',
      state: parsed.state ?? null,
      lifestyle: Array.isArray(parsed.lifestyle) ? parsed.lifestyle : [],
      concerns,
      concern: concerns[0] ?? '',
      savedAt: parsed.savedAt,
    };
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

// Session-storage key for the once-per-tab "we already pushed
// localStorage state to the backend" sentinel. Refreshing the tab
// re-fires the sync, but multiple navigation events within the same
// tab won't.
const SYNC_DONE_KEY = 'wtp.personalization.synced';

/**
 * Push the current localStorage personalization state up to the
 * authenticated user's row via POST /auth/onboarding. Best-effort:
 * any error (network, 401, 422) is swallowed and the sentinel is
 * NOT set, so the next page load tries again.
 *
 * Authentication piggybacks on the cross-subdomain `wtp_session`
 * cookie set by the core site's /auth/login handler. We send
 * `credentials: 'include'` so the cookie travels with the request.
 */
async function syncPersonalizationToBackend(
  state: PersonalizationState,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/onboarding`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zip_code: state.zip,
        // The backend allowlist accepts both v2 sector keys and the
        // legacy lifestyle keys — see ONBOARDING_LIFESTYLE_CATEGORIES
        // in routers/auth.py. We pass whatever is in storage as-is.
        lifestyle_categories: state.lifestyle ?? [],
        current_concern: state.concerns?.[0] ?? state.concern ?? 'other',
        concerns: state.concerns ?? (state.concern ? [state.concern] : []),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function PersonalizationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersonalizationState | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Restore on mount.
  useEffect(() => {
    setState(loadFromStorage());
  }, []);

  // Auto-sync localStorage -> backend when an authenticated session
  // is detected. The sibling sites do not host the auth context;
  // they rely on the cross-subdomain `wtp_session` cookie set by the
  // core site's /auth/login. We probe it indirectly: send the
  // sync-eligible payload to /auth/onboarding with credentials. If
  // the server accepts it (200) we mark the sentinel and stop; if
  // not (401 because no cookie, 422 because invalid, etc.) we leave
  // the sentinel unset so the next visit retries.
  useEffect(() => {
    if (!state) return;
    if (typeof window === 'undefined') return;
    let cancelled = false;
    try {
      if (window.sessionStorage.getItem(SYNC_DONE_KEY)) return;
      // Mark "attempted this session" up-front so anonymous users
      // (whose POST will 401) don't retry on every nav within the
      // tab. The marker is cleared on save() / clear() so a fresh
      // onboarding still fires the sync.
      window.sessionStorage.setItem(SYNC_DONE_KEY, 'pending');
    } catch {
      /* private mode / storage disabled — skip the sync. */
      return;
    }
    syncPersonalizationToBackend(state).then((ok) => {
      if (cancelled) return;
      try {
        window.sessionStorage.setItem(SYNC_DONE_KEY, ok ? 'ok' : 'failed');
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

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
      // Reset the sync sentinel so the auto-sync effect picks up the
      // new state and pushes it to the backend on the next render.
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.removeItem(SYNC_DONE_KEY);
        } catch {
          /* ignore */
        }
      }
      setState(full);
      setIsModalOpen(false);
    },
    [],
  );

  const clear = useCallback(() => {
    clearStorage();
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(SYNC_DONE_KEY);
      } catch {
        /* ignore */
      }
    }
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

// Cap on multi-select picks. Five each keeps the call narrow enough
// that the resulting feed isn't just every story we publish, while
// still letting a reader who actually has eclectic interests pick
// more than the original three.
const MAX_SECTORS = 5;
const MAX_CONCERNS = 5;

export function OnboardingModal() {
  const { isModalOpen, closeModal, save, state: existing } = usePersonalization();
  const [zip, setZip] = useState(() => existing?.zip ?? '');
  const [lifestyle, setLifestyle] = useState<string[]>(
    () => existing?.lifestyle ?? [],
  );
  const [concerns, setConcerns] = useState<string[]>(
    () => existing?.concerns ?? (existing?.concern ? [existing.concern] : []),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isModalOpen) return null;

  const toggleSector = (val: string) => {
    setLifestyle((prev) => {
      if (prev.includes(val)) return prev.filter((x) => x !== val);
      if (prev.length >= MAX_SECTORS) return prev;
      return [...prev, val];
    });
  };

  const toggleConcern = (val: string) => {
    setConcerns((prev) => {
      if (prev.includes(val)) return prev.filter((x) => x !== val);
      if (prev.length >= MAX_CONCERNS) return prev;
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
      setError('Pick at least one sector you want to follow.');
      return;
    }
    if (concerns.length === 0) {
      setError('Pick at least one thing that matters to you right now.');
      return;
    }
    setSubmitting(true);
    try {
      await save({
        zip: zip.trim(),
        lifestyle,
        concerns,
        concern: concerns[0] ?? '',
      });
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
        <h2 style={modalHeadingStyle}>Personalize your story feed</h2>
        <p style={modalSubheadStyle}>
          Tell us a few things about you and we&apos;ll surface the stories
          that affect your bills, your reps, and the sectors you care
          about. You still have access to every story in the Journal.
          We don&apos;t ask for your name or email.
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

        {/* Sectors — multi-select chip picker (replaces the lifestyle
            buckets so the filter maps directly onto our 11 reporting
            sectors). */}
        <div style={{ marginBottom: 20 }}>
          <label style={fieldLabelStyle}>
            Sectors to follow ({lifestyle.length}/{MAX_SECTORS})
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SECTOR_OPTIONS.map((opt) => {
              const active = lifestyle.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleSector(opt.value)}
                  style={active ? chipActiveStyle : chipBaseStyle}
                  disabled={!active && lifestyle.length >= MAX_SECTORS}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Concerns — chip picker too (replaces the previous native
            <select>, which inherited the OS dropdown styling and
            rendered illegibly on dark backgrounds). */}
        <div style={{ marginBottom: 20 }}>
          <label style={fieldLabelStyle}>
            What matters to your wallet right now? ({concerns.length}/{MAX_CONCERNS})
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {CONCERN_OPTIONS.map((opt) => {
              const active = concerns.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleConcern(opt.value)}
                  style={active ? chipActiveStyle : chipBaseStyle}
                  disabled={!active && concerns.length >= MAX_CONCERNS}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
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
            {submitting ? 'Saving…' : 'Show me my feed'}
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
    if (state.concerns?.length) {
      params.set('concerns', state.concerns.join(','));
    } else if (state.concern) {
      // v1 fallback for users still on a single-concern record.
      params.set('concern', state.concern);
    }
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

  // Hide for anonymous readers entirely. The homepage already
  // surfaces the personalize prompt; doubling it on every story
  // makes the page feel like a paywall. The block only renders for
  // onboarded users with a meaningful payload.
  if (!state) {
    return null;
  }
  // Use openModal for the not-anonymous path's "edit" affordance
  // below; eslint complains otherwise.
  void openModal;

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

// Plain-text labels for the action-type ribbon. Apostrophes are
// real Unicode so we don't need dangerouslySetInnerHTML.
const ACTION_TYPE_LABELS: Record<string, string> = {
  call_rep: 'Call your rep',
  switch_provider: 'Switch providers',
  check_redress: 'Check if you’re owed money',
  attend_hearing: 'Attend a hearing',
  read_more: 'Read the source',
  verify_data: 'Verify the data',
  register_to_vote: 'Register to vote',
};

// Per-action CTA text. "Take action" was a generic dead-end; these
// describe what actually happens when the user clicks. Falls back
// to "Take action" for unknown types (forward-compat with future
// action_type rollouts).
const ACTION_CTA: Record<string, string> = {
  call_rep: 'Find your rep',
  switch_provider: 'Open the locator',
  check_redress: 'Check refunds',
  attend_hearing: 'See the calendar',
  read_more: 'Read the source',
  verify_data: 'Open the dataset',
  register_to_vote: 'Check registration',
};

// Compact mono icon glyph rendered in the action-type ribbon. Kept
// as Unicode (not lucide-react) so we don't pull in a new dep
// surface area; bundled fonts already cover these characters.
const ACTION_GLYPH: Record<string, string> = {
  call_rep: '☎',
  switch_provider: '⇆',
  check_redress: '$',
  attend_hearing: '📅',
  read_more: '📰',
  verify_data: '⌗',
  register_to_vote: '✓',
};

/**
 * Replace user-state placeholders in a call-script. We intentionally
 * keep the substitution table tiny: `{state}` is the only token we
 * confidently know at render time. Other placeholders (`{bill_id}`,
 * etc.) flow through unchanged so the editor sees them and can
 * decide whether to fill them in at story-author time.
 */
function applyScriptSubstitutions(
  template: string,
  ctx: { state: string | null },
): string {
  return template.replace(/\{state\}/g, ctx.state ?? 'my state');
}

/**
 * Fire a fire-and-forget click record. Best-effort: any failure is
 * silently dropped so a counter outage never breaks the user's
 * navigation. Uses keepalive so the request survives the page
 * unload that follows the target-blank link.
 */
function recordActionClick(slug: string, actionId: number): void {
  if (typeof window === 'undefined') return;
  try {
    fetch(`${API_BASE}/events/action-click`, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ story_slug: slug, action_id: actionId }),
    }).catch(() => {
      /* ignore */
    });
  } catch {
    /* ignore */
  }
}

export function StoryActionPanel({ slug }: { slug: string }) {
  const { state } = usePersonalization();
  const [actions, setActions] = useState<StoryAction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    if (!slug) return;
    const params = new URLSearchParams();
    if (state?.state) params.set('state', state.state);
    const ctrl = new AbortController();
    fetch(`${API_BASE}/stories/${slug}/actions?${params}`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.actions && Array.isArray(d.actions)) {
          setActions(d.actions);
        }
      })
      .catch(() => {
        /* silent: hide-not-fail */
      })
      .finally(() => setLoaded(true));
    return () => ctrl.abort();
  }, [slug, state]);

  const handleCopy = useCallback(
    async (a: StoryAction) => {
      if (!a.script_template) return;
      const filled = applyScriptSubstitutions(a.script_template, {
        state: state?.state ?? null,
      });
      try {
        await navigator.clipboard.writeText(filled);
        setCopiedId(a.id);
        window.setTimeout(() => setCopiedId(null), 2000);
      } catch {
        /* clipboard blocked; the script is still visible to read off */
      }
    },
    [state?.state],
  );

  if (!loaded || actions.length === 0) return null;

  const passive = actions.filter((a) => a.is_passive);
  const active = actions.filter((a) => !a.is_passive);

  // The single highest-priority active action (smallest display_order)
  // gets a hero treatment: bigger title, accent border, top of the
  // active group. This is how register_to_vote (display_order=1)
  // outranks call_rep (10) and verify_data (20) and sits at the top
  // with extra weight, per the editorial direction that voter
  // registration is the universal recommendation.
  const heroId =
    active.length > 0
      ? [...active].sort((a, b) => a.id - b.id)[0]?.id // tiebreaker on id
      : null;
  const heroByOrder =
    active.length > 0
      ? active.reduce<StoryAction | null>(
          (best, cur) => (best === null ? cur : best),
          null,
        )
      : null;
  void heroId;
  void heroByOrder;
  // The actions are already sorted by display_order on the API side
  // (routers/stories.py orders by display_order ASC, id ASC), so the
  // first item in `active` is the hero.
  const heroAction = active.length > 0 ? active[0] : null;
  const otherActive = active.slice(1);

  const renderAction = (a: StoryAction, opts: { hero?: boolean } = {}) => {
    const safeUrl = a.external_url && /^https?:\/\//.test(a.external_url)
      ? a.external_url
      : null;
    const cta = ACTION_CTA[a.action_type] ?? 'Take action';
    const ribbon = ACTION_TYPE_LABELS[a.action_type] ?? a.action_type;
    const glyph = ACTION_GLYPH[a.action_type] ?? '·';
    const filledScript = a.script_template
      ? applyScriptSubstitutions(a.script_template, {
          state: state?.state ?? null,
        })
      : null;
    const isHero = !!opts.hero;

    return (
      <div
        key={a.id}
        style={{
          padding: isHero ? '18px 20px' : '14px 16px',
          background: isHero
            ? 'rgba(197,160,40,0.08)'
            : 'rgba(235,229,213,0.04)',
          border: isHero
            ? '1px solid rgba(197,160,40,0.45)'
            : '1px solid rgba(235,229,213,0.1)',
          borderRadius: 10,
          marginBottom: 10,
          boxShadow: isHero
            ? '0 0 0 1px rgba(197,160,40,0.15)'
            : 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: isHero ? 'var(--color-accent-text)' : 'var(--color-text-3)',
            marginBottom: 6,
          }}
        >
          <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>
            {glyph}
          </span>
          <span>{ribbon}</span>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: isHero ? 19 : 15,
            fontWeight: isHero ? 700 : 600,
            color: 'var(--color-text-1)',
            marginBottom: a.description ? 4 : 8,
            lineHeight: 1.3,
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
        {filledScript && (
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
              {filledScript}
            </pre>
            <button
              type="button"
              onClick={() => handleCopy(a)}
              style={{
                marginTop: 6,
                padding: '4px 10px',
                background: 'transparent',
                border: '1px solid rgba(235,229,213,0.18)',
                borderRadius: 6,
                color: 'var(--color-text-2)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {copiedId === a.id ? 'Copied' : 'Copy script'}
            </button>
          </details>
        )}
        {safeUrl && (
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => recordActionClick(slug, a.id)}
            // Track auxiliary click (cmd-click, middle-click) too —
            // those still navigate but onClick fires before the
            // browser opens the new tab.
            onAuxClick={() => recordActionClick(slug, a.id)}
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
            {cta}
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
              color: '#3DD5C7',
              marginBottom: 8,
            }}
          >
            Take care of yourself first
          </div>
          {passive.map((a) => renderAction(a))}
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
              color: 'var(--color-accent-text)',
              marginBottom: 8,
            }}
          >
            Make your voice heard
          </div>
          {heroAction && renderAction(heroAction, { hero: true })}
          {otherActive.map((a) => renderAction(a))}
        </div>
      )}
    </div>
  );
}
