import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, XCircle, ArrowLeft, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import SpotlightCard from '../components/SpotlightCard';
import {
  getAllComplaints,
  getComplaintSummary,
  type CFPBComplaintItem,
  type ComplaintSummary,
} from '../api/finance';

// ── Helpers ──

function fmtNum(n: number): string {
  return n.toLocaleString();
}

// ── Primary Metric Card ──

function PrimaryMetricCard({ total }: { total: number }) {
  return (
    <SpotlightCard
      className="rounded-xl border border-white/10 bg-white/[0.03] animate-scale-in"
      spotlightColor="rgba(255, 51, 102, 0.10)"
    >
      <div className="p-6 text-center" style={{ animationDelay: '100ms' }}>
        <p className="font-mono text-xs uppercase tracking-wider text-white/40 mb-3">
          Total Complaints
        </p>
        <p className="font-heading text-6xl font-bold text-[#FF3366]">
          {fmtNum(total)}
        </p>
      </div>
    </SpotlightCard>
  );
}

// ── Timely Response Rate Card ──

function TimelyResponseCard({ rate }: { rate: number | null }) {
  const pct = rate != null ? rate : 0;
  const isGood = pct >= 90;

  return (
    <SpotlightCard
      className="rounded-xl border border-white/10 bg-white/[0.03] animate-fade-up"
      spotlightColor="rgba(52, 211, 153, 0.10)"
    >
    <div
      className="p-6"
      style={{ animationDelay: '150ms', animationFillMode: 'both' }}
    >
      <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-white mb-4">
        Timely Response Rate
      </h2>
      <div className="flex items-end gap-3 mb-4">
        <span className={`font-mono text-4xl font-bold ${isGood ? 'text-[#00FF9D]' : 'text-[#FF3366]'}`}>
          {pct.toFixed(1)}%
        </span>
        <span className="font-body text-xs text-white/30 pb-1">of complaints responded to on time</span>
      </div>
      {/* Progress bar */}
      <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${pct}%`,
            backgroundColor: isGood ? '#00FF9D' : pct >= 70 ? '#F59E0B' : '#FF3366',
          }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-[10px] text-white/20">0%</span>
        <span className="font-mono text-[10px] text-white/20">100%</span>
      </div>
    </div>
    </SpotlightCard>
  );
}

// ── Product Breakdown Card ──

function ProductBreakdownCard({ byProduct, total }: { byProduct: Record<string, number>; total: number }) {
  const sorted = Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <SpotlightCard
      className="rounded-xl border border-white/10 bg-white/[0.03] animate-fade-up"
      spotlightColor="rgba(255, 51, 102, 0.10)"
    >
    <div
      className="p-6"
      style={{ animationDelay: '200ms', animationFillMode: 'both' }}
    >
      <h2 className="font-heading text-lg font-bold uppercase tracking-wider text-white mb-6">
        Product Breakdown
      </h2>
      <div className="space-y-5">
        {sorted.map(([product, count], idx) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={product}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-body text-sm text-white/60 truncate mr-4">{product}</span>
                <span className="font-mono text-sm font-bold text-[#FF3366] flex-shrink-0">
                  {fmtNum(count)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#FF3366] transition-all duration-1000 ease-out"
                  style={{
                    width: `${pct}%`,
                    animationDelay: `${500 + idx * 100}ms`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </SpotlightCard>
  );
}

// ── Company Responses Grid ──

function ResponsesGridCard({ byResponse }: { byResponse: Record<string, number> }) {
  const sorted = Object.entries(byResponse).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <SpotlightCard
      className="rounded-xl border border-white/10 bg-white/[0.03] animate-fade-up"
      spotlightColor="rgba(255, 51, 102, 0.10)"
    >
    <div
      className="p-6"
      style={{ animationDelay: '300ms', animationFillMode: 'both' }}
    >
      <h2 className="font-heading text-lg font-bold uppercase tracking-wider text-white mb-6">
        Company Responses
      </h2>
      <div className="grid grid-cols-2 gap-4">
        {sorted.map(([response, count]) => (
          <div
            key={response}
            className="rounded border border-white/5 bg-white/5 p-3 text-center"
          >
            <p className="font-mono text-2xl font-bold text-white mb-1">{fmtNum(count)}</p>
            <p className="font-body text-xs text-white/40 leading-tight">{response}</p>
          </div>
        ))}
      </div>
    </div>
    </SpotlightCard>
  );
}

// ── Feed Item with Disputed Badge + Narrative Expansion ──

function FeedItem({ complaint }: { complaint: CFPBComplaintItem }) {
  const [expanded, setExpanded] = useState(false);
  const cfpbUrl = complaint.complaint_id
    ? `https://www.consumerfinance.gov/data-research/consumer-complaints/search/detail/${complaint.complaint_id}`
    : null;

  const hasNarrative = !!complaint.complaint_narrative;
  const isDisputed = complaint.consumer_disputed === 'Yes';

  return (
    <div className="rounded-lg border border-white/10 bg-[#0A0A0A] p-5 transition-all duration-150 hover:border-[rgba(255,51,102,0.5)]">
      {/* Top meta row */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/5 pb-4 mb-4">
        <span className="font-body text-sm font-semibold text-white">
          {complaint.company_name}
        </span>
        {complaint.product && (
          <span className="rounded bg-[rgba(255,51,102,0.1)] px-2 py-1 font-mono text-xs font-bold text-[#FF3366] border border-[rgba(255,51,102,0.3)]">
            {complaint.product}
          </span>
        )}
        {isDisputed && (
          <span className="inline-flex items-center gap-1 rounded bg-[rgba(245,158,11,0.15)] px-2 py-1 font-mono text-xs font-bold text-[#F59E0B] border border-[rgba(245,158,11,0.3)]">
            <AlertTriangle size={12} />
            DISPUTED
          </span>
        )}
        {complaint.date_received && (
          <span className="rounded bg-white/10 px-2 py-1 font-mono text-xs text-white/40">
            {complaint.date_received}
          </span>
        )}
        {complaint.state && (
          <span className="rounded bg-white/10 px-2 py-1 font-mono text-xs text-white/40">
            {complaint.state}
          </span>
        )}
        {cfpbUrl && (
          <a
            href={cfpbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto font-mono text-[10px] text-white/20 hover:text-[#FF3366] transition-colors no-underline"
          >
            CFPB &rarr;
          </a>
        )}
      </div>

      {/* Issue */}
      <p className="font-body text-base text-white/80 leading-relaxed mb-3">
        {complaint.issue}
        {complaint.sub_issue ? ` — ${complaint.sub_issue}` : ''}
      </p>

      {/* Narrative expansion */}
      {hasNarrative && (
        <div className="mb-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 font-mono text-xs text-white/30 hover:text-white/50 transition-colors bg-transparent border-0 cursor-pointer p-0"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Hide narrative' : 'Show consumer narrative'}
          </button>
          {expanded && (
            <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.03] p-4">
              <p className="font-body text-sm text-white/60 leading-relaxed whitespace-pre-wrap">
                {complaint.complaint_narrative}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Bottom status bar */}
      <div className="flex items-center justify-between rounded bg-[#111111] border border-white/5 px-3 py-3">
        <span className="font-mono text-xs text-white/50">
          {complaint.company_response || 'No response'}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-xs">
          {complaint.timely_response === 'Yes' ? (
            <>
              <CheckCircle size={16} strokeWidth={1.5} className="text-[#00FF9D]" />
              <span className="text-[#00FF9D]">Timely</span>
            </>
          ) : (
            <>
              <XCircle size={16} strokeWidth={1.5} className="text-[#FF3366]" />
              <span className="text-[#FF3366]">Not Timely</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

// ── Page ──

export default function ComplaintsDashboardPage() {
  const [summary, setSummary] = useState<ComplaintSummary | null>(null);
  const [complaints, setComplaints] = useState<CFPBComplaintItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getComplaintSummary(),
      getAllComplaints({ limit: 50 }),
    ])
      .then(([summaryRes, complaintsRes]) => {
        setSummary(summaryRes);
        setComplaints(complaintsRes.complaints || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-transparent">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#FF3366] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-transparent">
      {/* Background glow */}
      <div
        className="pointer-events-none absolute -right-[200px] -top-[200px] z-0"
        style={{
          width: 800,
          height: 800,
          background: '#FF3366',
          borderRadius: '50%',
          filter: 'blur(200px)',
          opacity: 0.1,
        }}
      />

      <div className="relative z-10 flex flex-1 flex-col overflow-hidden px-8 py-8 lg:px-12">
        {/* Header */}
        <div className="mb-8 animate-fade-up">
          <Link
            to="/finance"
            className="mb-4 inline-flex items-center gap-2 font-body text-sm text-white/50 transition-colors hover:text-white no-underline"
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </Link>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="font-heading text-4xl font-bold uppercase tracking-wide text-white xl:text-6xl">
                Consumer Complaints
              </h1>
              <p className="mt-1 font-body text-lg text-white/50">
                CFPB complaint data across all tracked institutions
              </p>
            </div>
            <div className="hidden md:block text-right">
              <p className="font-mono text-[11px] text-white/30">
                LIVE DATABASE
              </p>
              <p className="font-mono text-[11px] text-[#FF3366]">
                {summary ? fmtNum(summary.total_complaints) : '—'} RECORDS
              </p>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid flex-1 grid-cols-1 gap-8 overflow-hidden xl:grid-cols-12">
          {/* Left Column: Analytics */}
          <div className="flex flex-col gap-6 overflow-y-auto xl:col-span-4">
            {summary && (
              <>
                <PrimaryMetricCard total={summary.total_complaints} />
                <TimelyResponseCard rate={summary.timely_response_pct} />
                <ProductBreakdownCard byProduct={summary.by_product} total={summary.total_complaints} />
                <ResponsesGridCard byResponse={summary.by_response} />
              </>
            )}
          </div>

          {/* Right Column: Feed */}
          <div
            className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] xl:col-span-8 animate-fade-up"
            style={{ animationDelay: '400ms', animationFillMode: 'both' }}
          >
            {/* Feed header */}
            <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-6 py-5">
              <h2 className="font-heading text-xl font-bold uppercase tracking-wider text-white">
                Complaint Feed
              </h2>
              <div className="flex items-center gap-2 rounded-full border border-[rgba(255,51,102,0.3)] bg-[rgba(255,51,102,0.2)] px-3 py-1">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF3366] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#FF3366]" />
                </span>
                <span className="font-mono text-xs font-bold text-[#FF3366]">LIVE</span>
              </div>
            </div>

            {/* Feed content */}
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {complaints.length === 0 ? (
                <p className="font-body text-sm text-white/40">No complaints on record.</p>
              ) : (
                complaints.map((c) => <FeedItem key={c.id} complaint={c} />)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
