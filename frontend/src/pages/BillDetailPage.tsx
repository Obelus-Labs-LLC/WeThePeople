import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { BillResponse, ActionSearchResponse, ActionSearchResult } from '../api/types';
import BackButton from '../components/BackButton';
import { PoliticsSectorHeader } from '../components/SectorHeader';

// ── Status color map ──

const STATUS_COLORS: Record<string, string> = {
  introduced: '#6B7280',
  in_committee: '#F59E0B',
  passed_house: '#3B82F6',
  passed_one: '#3B82F6',
  passed_senate: '#3B82F6',
  passed_both: '#8B5CF6',
  enacted: '#10B981',
  became_law: '#10B981',
  vetoed: '#EF4444',
  failed: '#EF4444',
};

// ── Pipeline stages ──

const PIPELINE_STAGES = [
  'Introduced',
  'Committee',
  'House Floor',
  'Senate Floor',
  'President',
  'Law',
] as const;

function statusToStageIndex(status: string | null): number {
  if (!status) return 0;
  const map: Record<string, number> = {
    introduced: 0,
    in_committee: 1,
    passed_house: 2,
    passed_one: 2,
    passed_senate: 3,
    passed_both: 4,
    enacted: 5,
    became_law: 5,
    vetoed: 4,
    failed: 0, // could be at any stage; default to 0
  };
  return map[status] ?? 0;
}

// ── Helpers ──

function formatBillType(bt: string): string {
  const map: Record<string, string> = {
    hr: 'H.R.',
    s: 'S.',
    hjres: 'H.J.Res.',
    sjres: 'S.J.Res.',
    hconres: 'H.Con.Res.',
    sconres: 'S.Con.Res.',
    hres: 'H.Res.',
    sres: 'S.Res.',
  };
  return map[bt.toLowerCase()] || bt.toUpperCase();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getCongressOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

const PARTY_COLORS: Record<string, string> = {
  D: '#3B82F6',
  R: '#EF4444',
  I: '#A855F7',
};

function partyColor(party: string | null): string {
  if (!party) return '#6B7280';
  return PARTY_COLORS[party.charAt(0).toUpperCase()] || '#6B7280';
}

function partyLabel(party: string | null): string {
  if (!party) return 'Unknown';
  const p = party.charAt(0).toUpperCase();
  if (p === 'D') return 'Democrat';
  if (p === 'R') return 'Republican';
  if (p === 'I') return 'Independent';
  return party;
}

function getInitials(name: string): string {
  return name
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

// ── Component ──

export default function BillDetailPage() {
  const { bill_id } = useParams<{ bill_id: string }>();
  const [bill, setBill] = useState<BillResponse | null>(null);
  const [relatedActions, setRelatedActions] = useState<ActionSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bill_id) return;
    setLoading(true);
    setError(null);

    apiClient
      .getBill(bill_id)
      .then((billRes) => {
        setBill(billRes);
        // Fetch related actions after we have the bill data
        return apiClient
          .searchActions({
            bill_congress: billRes.congress,
            bill_type: billRes.bill_type,
            bill_number: billRes.bill_number,
            simple: true,
            limit: 10,
          })
          .then((actionsRes) => setRelatedActions(actionsRes.actions || []))
          .catch(() => {
            // Non-critical — don't fail the page
          });
      })
      .catch((err) => setError(err.message || 'Failed to load bill'))
      .finally(() => setLoading(false));
  }, [bill_id]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: '#020617' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <span className="font-body text-sm text-slate-400">Loading bill details...</span>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: '#020617' }}>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-8 text-center">
          <p className="font-heading text-xl font-bold uppercase text-red-400">Error</p>
          <p className="mt-2 font-body text-sm text-red-300/70">{error}</p>
          <div className="mt-4">
            <BackButton to="/politics/activity" label="Activity" />
          </div>
        </div>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: '#020617' }}>
        <p className="font-body text-slate-500">Bill not found.</p>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[bill.status_bucket || ''] || '#6B7280';
  const currentStage = statusToStageIndex(bill.status_bucket);
  const primarySponsor = bill.sponsors.find((s) => s.role === 'sponsor');
  const cosponsors = bill.sponsors.filter((s) => s.role === 'cosponsor');

  // Sort timeline descending (most recent first)
  const sortedTimeline = [...bill.timeline].sort(
    (a, b) => new Date(b.action_date || '').getTime() - new Date(a.action_date || '').getTime()
  );

  // Meta items for the header row
  const metaItems: string[] = [];
  metaItems.push(`${getCongressOrdinal(bill.congress)} Congress`);
  if (bill.policy_area) metaItems.push(bill.policy_area);
  if (bill.introduced_date) metaItems.push(`Introduced ${formatDate(bill.introduced_date)}`);
  if (bill.latest_action_date) metaItems.push(`Latest ${formatDate(bill.latest_action_date)}`);

  return (
    <div
      className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden"
    >
      {/* ── Header (non-scrolling) ── */}
      <div className="flex-shrink-0 px-8 pt-8 pb-0">
        <PoliticsSectorHeader />
        <div className="mb-2">
          <BackButton to="/politics/activity" label="Activity" />
        </div>
        <div className="flex items-center justify-end mb-6">
          <a
            href={bill.congress_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-body text-sm text-blue-400 transition-colors hover:text-blue-300 no-underline"
          >
            View on Congress.gov &rarr;
          </a>
        </div>

        {/* Bill ID tag */}
        <div className="mb-4">
          <span
            className="inline-block font-mono text-xl font-bold px-4 py-1.5 rounded-full"
            style={{
              backgroundColor: 'rgba(59,130,246,0.2)',
              border: '1px solid rgba(59,130,246,0.3)',
              color: '#60A5FA',
            }}
          >
            {formatBillType(bill.bill_type)} {bill.bill_number}
          </span>
        </div>

        {/* Title */}
        <h1 className="font-heading text-4xl font-bold uppercase leading-tight text-white 2xl:text-6xl">
          {bill.title}
        </h1>

        {/* Status badge + Meta row */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* Status badge */}
          {bill.status_bucket && (
            <span
              className="inline-block rounded-full px-3 py-1 text-sm font-bold uppercase"
              style={{
                backgroundColor: `${statusColor}33`,
                color: statusColor,
                border: `1px solid ${statusColor}4D`,
              }}
            >
              {bill.status_bucket.replace(/_/g, ' ')}
            </span>
          )}

          {/* Meta items separated by dots */}
          {metaItems.map((item, i) => (
            <React.Fragment key={i}>
              {(i > 0 || bill.status_bucket) && (
                <span className="text-slate-600 text-sm select-none">&middot;</span>
              )}
              <span className="font-body text-sm text-slate-400">{item}</span>
            </React.Fragment>
          ))}
        </div>

        {/* ── Progress Pipeline ── */}
        <div className="relative mt-8 mb-10">
          <div className="flex items-start justify-between">
            {PIPELINE_STAGES.map((stage, idx) => {
              const isCompleted = idx < currentStage;
              const isCurrent = idx === currentStage;
              return (
                <div key={stage} className="relative z-10 flex flex-col items-center" style={{ flex: 1 }}>
                  {/* Node */}
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      isCurrent ? 'ring-4 ring-blue-500/20' : ''
                    }`}
                    style={
                      isCompleted
                        ? { backgroundColor: '#3B82F6', border: '4px solid #1E3A5F' }
                        : isCurrent
                          ? { backgroundColor: '#60A5FA', border: '4px solid #60A5FA' }
                          : { backgroundColor: '#0F172A', border: '2px solid #334155' }
                    }
                  >
                    {isCompleted && <div className="h-2 w-2 rounded-full bg-white" />}
                  </div>
                  {/* Label */}
                  <span className="mt-3 text-center font-body text-xs uppercase text-slate-400">
                    {stage}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Connecting line */}
          <div
            className="absolute top-4 left-0 right-0 h-1 -translate-y-1/2"
            style={{ backgroundColor: '#1E293B', zIndex: 0, marginLeft: '8.33%', marginRight: '8.33%' }}
          />
        </div>
      </div>

      {/* ── Main Content (scrollable on desktop, natural flow on mobile) ── */}
      <div className="flex-1 lg:min-h-0 lg:overflow-y-auto px-8 pb-8">
        <div className="grid grid-cols-1 gap-8 2xl:grid-cols-3">
          {/* ── Left / Center (col-span-2) ── */}
          <div className="2xl:col-span-2 space-y-8">
            {/* Summary Card */}
            <div
              className="rounded-2xl border p-8"
              style={{ backgroundColor: '#0F172A', borderColor: '#1E293B' }}
            >
              <h2 className="font-heading text-2xl font-bold uppercase text-white mb-4">Summary</h2>
              {bill.summary_text ? (
                <p className="font-body text-xl leading-relaxed text-white/70">{bill.summary_text}</p>
              ) : (
                <p className="font-body text-base text-slate-500">No summary available.</p>
              )}

              {/* Subjects */}
              {bill.subjects_json && bill.subjects_json.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {bill.subjects_json.map((subject) => (
                    <span
                      key={subject}
                      className="rounded-lg border px-3 py-1 font-body text-sm text-slate-300"
                      style={{ backgroundColor: '#1E293B', borderColor: '#334155' }}
                    >
                      {subject}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Sponsors Card */}
            <div
              className="rounded-2xl border p-8"
              style={{ backgroundColor: '#0F172A', borderColor: '#1E293B' }}
            >
              <h2 className="font-heading text-2xl font-bold uppercase text-white mb-6">Sponsors</h2>

              {/* Primary sponsor */}
              {primarySponsor && (
                <div className="mb-6">
                  <div className="flex items-center gap-5">
                    {/* Avatar */}
                    {primarySponsor.photo_url ? (
                      <img
                        src={primarySponsor.photo_url}
                        alt={primarySponsor.display_name}
                        className="h-20 w-20 rounded-full border-2 object-cover"
                        style={{ borderColor: '#334155' }}
                      />
                    ) : (
                      <div
                        className="flex h-20 w-20 items-center justify-center rounded-full font-heading text-2xl font-bold text-white"
                        style={{ backgroundColor: `${partyColor(primarySponsor.party)}33` }}
                      >
                        {getInitials(primarySponsor.display_name)}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      {/* Name */}
                      {primarySponsor.person_id ? (
                        <Link
                          to={`/politics/people/${primarySponsor.person_id}`}
                          className="font-body text-xl font-bold text-white transition-colors hover:text-blue-400 no-underline"
                        >
                          {primarySponsor.display_name}
                        </Link>
                      ) : (
                        <span className="font-body text-xl font-bold text-white">
                          {primarySponsor.display_name}
                        </span>
                      )}

                      {/* Party + State + Role */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {primarySponsor.party && (
                          <span
                            className="rounded-full px-2.5 py-0.5 font-mono text-xs font-bold"
                            style={{
                              backgroundColor: `${partyColor(primarySponsor.party)}22`,
                              color: partyColor(primarySponsor.party),
                            }}
                          >
                            {partyLabel(primarySponsor.party)}
                          </span>
                        )}
                        {primarySponsor.state && (
                          <span className="font-mono text-sm text-slate-400">{primarySponsor.state}</span>
                        )}
                        <span
                          className="rounded-full px-2 py-0.5 font-heading text-xs font-bold uppercase tracking-wider"
                          style={{
                            backgroundColor: 'rgba(59,130,246,0.1)',
                            color: '#60A5FA',
                          }}
                        >
                          Primary Sponsor
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Cosponsors */}
              {cosponsors.length > 0 && (
                <div className="space-y-3">
                  {primarySponsor && (
                    <div className="border-t pt-4 mb-2" style={{ borderColor: '#1E293B' }}>
                      <span className="font-heading text-xs font-bold uppercase tracking-wider text-slate-500">
                        Cosponsors ({cosponsors.length})
                      </span>
                    </div>
                  )}
                  {cosponsors.map((cs) => (
                    <div key={cs.bioguide_id} className="flex items-center gap-3">
                      {/* Avatar */}
                      {cs.photo_url ? (
                        <img
                          src={cs.photo_url}
                          alt={cs.display_name}
                          className="h-10 w-10 rounded-full border-2 object-cover"
                          style={{ borderColor: '#334155' }}
                        />
                      ) : (
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-full font-heading text-sm font-bold text-white"
                          style={{ backgroundColor: `${partyColor(cs.party)}33` }}
                        >
                          {getInitials(cs.display_name)}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        {cs.person_id ? (
                          <Link
                            to={`/politics/people/${cs.person_id}`}
                            className="font-body text-sm font-semibold text-white transition-colors hover:text-blue-400 no-underline"
                          >
                            {cs.display_name}
                          </Link>
                        ) : (
                          <span className="font-body text-sm font-semibold text-white">
                            {cs.display_name}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Party dot */}
                        {cs.party && (
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: partyColor(cs.party) }}
                          />
                        )}
                        {cs.state && (
                          <span className="font-mono text-xs text-slate-500">{cs.state}</span>
                        )}
                        <span
                          className="rounded-full px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wider"
                          style={{
                            backgroundColor: 'rgba(148,163,184,0.1)',
                            color: '#94A3B8',
                          }}
                        >
                          Co-Sponsor
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {bill.sponsors.length === 0 && (
                <p className="font-body text-sm text-slate-500">No sponsor information available.</p>
              )}
            </div>
          </div>

          {/* ── Right Column ── */}
          <div className="space-y-8">
            {/* Timeline Card */}
            <div
              className="rounded-2xl border p-8 max-h-[600px] overflow-y-auto"
              style={{ backgroundColor: '#0F172A', borderColor: '#1E293B' }}
            >
              <h2 className="font-heading text-2xl font-bold uppercase text-white mb-6">Timeline</h2>

              {sortedTimeline.length === 0 ? (
                <p className="font-body text-sm text-slate-500">No timeline data available.</p>
              ) : (
                <div className="relative pl-6">
                  {/* Vertical line */}
                  <div
                    className="absolute w-px top-0 bottom-0"
                    style={{ left: '7px', backgroundColor: 'rgba(255,255,255,0.05)' }}
                  />

                  <div className="space-y-5">
                    {sortedTimeline.map((entry, idx) => (
                      <div key={idx} className="relative flex gap-4">
                        {/* Dot */}
                        <div
                          className="absolute rounded-full"
                          style={{
                            width: '16px',
                            height: '16px',
                            left: '-17px',
                            top: '2px',
                            backgroundColor: idx === 0 ? '#60A5FA' : 'rgba(255,255,255,0.1)',
                            border: '2px solid #0F172A',
                          }}
                        />

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          {entry.action_date && (
                            <span className="font-mono text-sm text-slate-400">
                              {formatDate(entry.action_date)}
                            </span>
                          )}
                          <p className="mt-0.5 font-body text-sm text-white/70 leading-relaxed">
                            {entry.action_text}
                          </p>
                          {entry.action_type && (
                            <span
                              className="mt-1 inline-block rounded px-1.5 py-0.5 font-heading uppercase text-slate-500"
                              style={{ fontSize: '10px' }}
                            >
                              {entry.action_type}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Related Actions Card */}
            {relatedActions.length > 0 && (
              <div
                className="rounded-2xl border p-8"
                style={{ backgroundColor: '#0F172A', borderColor: '#1E293B' }}
              >
                <h2 className="font-heading text-2xl font-bold uppercase text-white mb-4">
                  Related Actions
                </h2>

                <div className="space-y-3">
                  {relatedActions.map((action) => (
                    <div
                      key={action.id}
                      className="rounded-lg border p-3"
                      style={{ borderColor: '#1E293B' }}
                    >
                      <p className="font-body text-sm text-white/80 line-clamp-2">{action.title}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        {action.date && (
                          <span className="font-mono text-xs text-slate-500">
                            {formatDate(action.date)}
                          </span>
                        )}
                        {action.source_url && (
                          <a
                            href={action.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-body text-xs text-blue-400 transition-colors hover:text-blue-300 no-underline"
                          >
                            Source &rarr;
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
