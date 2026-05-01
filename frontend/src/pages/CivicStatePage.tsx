/**
 * CivicStatePage — per-state civic landing.
 *
 * Phase 3 thread C. Bridges federal (TrackedMember) + state
 * (StateLegislator + StateBill) into a single page so a reader
 * who lands at /civic/MI sees:
 *   - their two senators + their House rep + Michigan's state
 *     legislators all in one column
 *   - the most recent state bills (until the OpenStates bill
 *     sync runs the bills section is empty; the page handles
 *     the empty state gracefully)
 *
 * Linked from the PersonalizedRail on the homepage when the user's
 * onboarding state is known.
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getApiBaseUrl } from '../api/client';
import { US_STATE_NAMES } from '../data/usStateNames';

const API_BASE = getApiBaseUrl();

interface Rep {
  person_id?: string;
  display_name?: string;
  ocd_id?: string;
  name?: string;
  chamber: string | null;
  party: string | null;
  state?: string | null;
  district?: string | null;
  photo_url: string | null;
}

interface StateBill {
  bill_id: string;
  identifier: string | null;
  title: string | null;
  session: string | null;
  latest_action: string | null;
  latest_action_date: string | null;
  sponsor_name: string | null;
  source_url: string | null;
}

interface StatePayload {
  state: string;
  federal_reps: Rep[];
  state_legislators: { total: number; items: Rep[] };
  state_bills: { total: number; items: StateBill[] };
}

export default function CivicStatePage() {
  const { state } = useParams<{ state: string }>();
  const code = (state || '').toUpperCase();
  const stateName = US_STATE_NAMES[code] ?? code;

  const [data, setData] = useState<StatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code || code.length !== 2) {
      setError('Invalid state code.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/civic/state/${code}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? 'Failed to load');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <main
      className="px-6 py-12"
      style={{ maxWidth: 1100, margin: '0 auto', color: 'var(--color-text-1)' }}
    >
      <Link
        to="/civic"
        className="inline-flex items-center gap-2 mb-6 no-underline"
        style={{ color: 'var(--color-text-3)', fontSize: 13 }}
      >
        <ArrowLeft size={14} /> Civic Hub
      </Link>

      <header style={{ marginBottom: 28 }}>
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--color-accent-text)',
            marginBottom: 8,
          }}
        >
          Local civic graph
        </div>
        <h1
          style={{
            fontFamily: "'Playfair Display', serif",
            fontStyle: 'italic',
            fontWeight: 800,
            fontSize: 'clamp(28px, 4vw, 44px)',
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          {stateName}
        </h1>
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 15,
            color: 'var(--color-text-2)',
            margin: '8px 0 0',
          }}
        >
          Federal reps, state legislators, and recent state bills — all in one
          place.
        </p>
      </header>

      {loading && (
        <div style={{ color: 'var(--color-text-3)', fontSize: 14 }}>
          Loading {stateName} data…
        </div>
      )}
      {error && !loading && (
        <div
          style={{
            padding: '12px 14px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            color: '#fca5a5',
            borderRadius: 8,
          }}
        >
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* ── Federal reps ─────────────────────────────────────── */}
          <Section
            label={`Federal · ${data.federal_reps.length} reps`}
            heading="Your Congress members"
          >
            {data.federal_reps.length === 0 ? (
              <Empty>No federal reps tracked for this state yet.</Empty>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {data.federal_reps.map((r) => (
                  <RepCard
                    key={r.person_id ?? r.display_name ?? Math.random()}
                    href={r.person_id ? `/politics/people/${r.person_id}` : null}
                    name={r.display_name ?? '—'}
                    chamber={r.chamber ?? null}
                    party={r.party ?? null}
                    state={r.state ?? code}
                    photo_url={r.photo_url}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* ── State legislators ─────────────────────────────────── */}
          <Section
            label={`State · ${data.state_legislators.total} legislators`}
            heading={`${stateName} state legislature`}
          >
            {data.state_legislators.items.length === 0 ? (
              <Empty>No state legislators on record for {stateName}.</Empty>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                  {data.state_legislators.items.map((leg) => (
                    <RepCard
                      key={leg.ocd_id ?? leg.name ?? Math.random()}
                      href={null}
                      name={leg.name ?? '—'}
                      chamber={leg.chamber ?? null}
                      party={leg.party ?? null}
                      state={code}
                      district={leg.district ?? null}
                      photo_url={leg.photo_url}
                    />
                  ))}
                </div>
                {data.state_legislators.total > data.state_legislators.items.length && (
                  <p style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-3)' }}>
                    Showing {data.state_legislators.items.length} of{' '}
                    {data.state_legislators.total}. Full list in a future view.
                  </p>
                )}
              </>
            )}
          </Section>

          {/* ── Recent state bills ────────────────────────────────── */}
          <Section
            label={`State bills · ${data.state_bills.total} on record`}
            heading="Recent state bills"
          >
            {data.state_bills.items.length === 0 ? (
              <Empty>
                No state bills imported yet. Bill data lands once the
                OpenStates bill sync runs.
              </Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.state_bills.items.map((b) => (
                  <BillRow key={b.bill_id} bill={b} />
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function Section({
  label,
  heading,
  children,
}: {
  label: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--color-text-3)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <h2
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--color-text-1)',
          margin: '0 0 14px',
        }}
      >
        {heading}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '14px 16px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        fontFamily: "'Inter', sans-serif",
        fontSize: 13,
        color: 'var(--color-text-2)',
      }}
    >
      {children}
    </div>
  );
}

function RepCard({
  href,
  name,
  chamber,
  party,
  state,
  district,
  photo_url,
}: {
  href: string | null;
  name: string;
  chamber: string | null;
  party: string | null;
  state: string;
  district?: string | null;
  photo_url: string | null;
}) {
  const partyDot = party === 'D' ? '#4A7FDE' : party === 'R' ? '#E63946' : '#B06FD8';
  const meta = [chamber, party, district].filter(Boolean).join(' · ');
  const inner = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
      }}
    >
      {photo_url ? (
        <img
          src={photo_url}
          alt=""
          style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--color-surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-3)',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {(name || '?').slice(0, 1).toUpperCase()}
        </div>
      )}
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-text-3)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: partyDot,
              display: 'inline-block',
            }}
          />
          {meta || state}
        </div>
      </div>
    </div>
  );
  if (href) {
    return (
      <Link to={href} style={{ textDecoration: 'none' }}>
        {inner}
      </Link>
    );
  }
  return inner;
}

function BillRow({ bill }: { bill: StateBill }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--color-text-3)',
          marginBottom: 4,
        }}
      >
        {bill.identifier ?? bill.bill_id}
        {bill.session ? ` · ${bill.session}` : ''}
        {bill.latest_action_date ? ` · ${bill.latest_action_date}` : ''}
      </div>
      <div
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--color-text-1)',
          lineHeight: 1.4,
          marginBottom: 4,
        }}
      >
        {bill.title || bill.identifier || bill.bill_id}
      </div>
      {bill.latest_action && (
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-2)' }}>
          {bill.latest_action}
        </div>
      )}
      {bill.sponsor_name && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-text-3)',
            marginTop: 6,
          }}
        >
          Sponsor: {bill.sponsor_name}
        </div>
      )}
      {bill.source_url && (
        <a
          href={bill.source_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 6,
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            color: 'var(--color-accent-text)',
            textDecoration: 'underline',
          }}
        >
          Source <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}
