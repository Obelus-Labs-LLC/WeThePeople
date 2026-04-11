import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiClient } from "../api/client";
import type { LedgerClaimResponse } from "../api/types";
import BackButton from "../components/BackButton";
import { PoliticsSectorHeader } from "../components/SectorHeader";

// ── Tier color config ──────────────────────────────────────────────
const TIER_COLORS: Record<string, { solid: string; text: string; bg20: string; border30: string }> = {
  strong:   { solid: "#10B981", text: "#34D399", bg20: "rgba(16,185,129,0.2)",  border30: "rgba(16,185,129,0.3)"  },
  moderate: { solid: "#3B82F6", text: "#60A5FA", bg20: "rgba(59,130,246,0.2)",  border30: "rgba(59,130,246,0.3)"  },
  weak:     { solid: "#F59E0B", text: "#FBBF24", bg20: "rgba(245,158,11,0.2)",  border30: "rgba(245,158,11,0.3)"  },
  none:     { solid: "#EF4444", text: "#F87171", bg20: "rgba(239,68,68,0.2)",   border30: "rgba(239,68,68,0.3)"   },
};

const PROGRESS_COLORS: Record<string, string> = {
  enacted:          "#10B981",
  passed_committee: "#F59E0B",
  introduced:       "#3B82F6",
  stalled:          "#EF4444",
  not_started:      "#6B7280",
};

const RELEVANCE_COLORS: Record<string, string> = {
  high:   "#10B981",
  medium: "#3B82F6",
  low:    "#F59E0B",
};

// ── Helpers ────────────────────────────────────────────────────────
function humanize(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function tierColor(tier: string) {
  return TIER_COLORS[tier] ?? TIER_COLORS.none;
}

// ── Timing descriptions ────────────────────────────────────────────
const TIMING_DESC: Record<string, string> = {
  follow_through:     "Action taken after the statement was made, indicating follow-through.",
  retroactive_credit: "Statement references action that was already taken.",
  concurrent:         "Statement and action occurred around the same time.",
  pre_commitment:     "Statement was made before any related legislative action.",
};

// ── Component ──────────────────────────────────────────────────────
const ClaimDetailPage: React.FC = () => {
  const { claim_id } = useParams<{ claim_id: string }>();
  const [claim, setClaim] = useState<LedgerClaimResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!claim_id) return;
    setLoading(true);
    setError(null);
    apiClient
      .getClaim(claim_id)
      .then((data) => {
        setClaim(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load claim");
        setLoading(false);
      });
  }, [claim_id]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-blue-500" />
          <span className="font-body text-sm text-slate-400">Loading action detail...</span>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center max-w-lg">
          <p className="font-body text-red-400 text-lg">{error}</p>
        </div>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-body text-slate-500 text-lg">Action not found.</p>
      </div>
    );
  }

  const tc = tierColor(claim.tier);
  const score = claim.score ?? 0;
  const action = claim.matched_action;

  return (
    <div className="min-h-screen overflow-y-auto flex flex-col">
      <div className="mx-auto w-full max-w-6xl px-6 py-10 flex flex-col flex-1">

        {/* ── Header ── */}
        <PoliticsSectorHeader />
        <div className="mb-4">
          <BackButton to={`/politics/people/${claim.person_id}`} label={claim.display_name} />
        </div>
        <div className="flex items-center justify-end mb-10">
          <span className="font-mono text-sm text-slate-400 uppercase tracking-widest">
            Action Detail
          </span>
        </div>

        {/* ── Hero Card ── */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-8 mb-8">
          {/* Top row: tier + score */}
          <div className="flex items-center gap-8 mb-8">
            {/* Tier badge */}
            <div
              className="h-24 px-8 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: tc.bg20,
                border: `1px solid ${tc.border30}`,
              }}
            >
              <span
                className="font-heading text-4xl font-bold uppercase tracking-wider"
                style={{ color: tc.text }}
              >
                {claim.tier}
              </span>
            </div>

            {/* Score */}
            <div className="flex flex-col">
              <span className="font-mono text-6xl font-bold text-white">
                {Math.round(score * 100)}%
              </span>
              <span className="font-mono text-sm text-slate-400 uppercase tracking-widest mt-1">
                Relevance Score
              </span>
              {/* Progress bar */}
              <div className="h-2 w-64 bg-[#1E293B] rounded-full mt-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${Math.round(score * 100)}%`,
                    backgroundColor: tc.solid,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Claim text */}
          <p className="text-2xl md:text-3xl font-body text-white leading-relaxed">
            {claim.normalized_text}
          </p>

          {/* Meta row */}
          <div className="flex flex-wrap gap-3 mt-6">
            {claim.intent_type && (
              <span className="bg-[rgba(59,130,246,0.1)] border border-[rgba(59,130,246,0.2)] text-blue-400 px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-widest">
                {humanize(claim.intent_type)}
              </span>
            )}
            {claim.policy_area && (
              <span className="bg-[#1E293B] border border-[#334155] text-slate-300 px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-widest">
                {claim.policy_area}
              </span>
            )}
            {claim.claim_date && (
              <span className="font-mono text-sm text-slate-400 flex items-center">
                {formatDate(claim.claim_date)}
              </span>
            )}
          </div>
        </div>

        {/* ── Evidence Signals ── */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-8 mb-8">
          <h2 className="font-heading text-2xl uppercase text-white mb-6">Key Signals</h2>
          {claim.why && claim.why.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {claim.why.map((signal, i) => (
                <span
                  key={i}
                  className="bg-[rgba(59,130,246,0.1)] border border-[rgba(59,130,246,0.2)] px-4 py-2 rounded-lg text-blue-400 text-base font-medium"
                >
                  {signal}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 font-body">No signals available</p>
          )}
        </div>

        {/* ── Assessment Grid ── */}
        <div className="grid grid-cols-1 2xl:grid-cols-3 gap-8 mb-8">
          {/* Timing */}
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-8">
            <span className="font-mono text-sm text-slate-500 uppercase tracking-widest">
              Timing
            </span>
            {claim.timing ? (
              <>
                <p className="font-heading text-3xl text-white mt-2">
                  {humanize(claim.timing)}
                </p>
                <p className="font-body text-base text-slate-400 mt-2">
                  {TIMING_DESC[claim.timing] ?? "Timing relationship between claim and action."}
                </p>
              </>
            ) : (
              <p className="font-heading text-3xl text-slate-600 mt-2">Not assessed</p>
            )}
          </div>

          {/* Progress */}
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-8">
            <span className="font-mono text-sm text-slate-500 uppercase tracking-widest">
              Progress
            </span>
            {claim.progress ? (
              <p
                className="font-heading text-3xl mt-2"
                style={{ color: PROGRESS_COLORS[claim.progress] ?? "#6B7280" }}
              >
                {humanize(claim.progress)}
              </p>
            ) : (
              <p className="font-heading text-3xl text-slate-600 mt-2">Not assessed</p>
            )}
          </div>

          {/* Relevance */}
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-8">
            <span className="font-mono text-sm text-slate-500 uppercase tracking-widest">
              Relevance
            </span>
            {claim.relevance ? (
              <p
                className="font-heading text-3xl mt-2"
                style={{ color: RELEVANCE_COLORS[claim.relevance] ?? "#6B7280" }}
              >
                {claim.relevance.charAt(0).toUpperCase() + claim.relevance.slice(1)}
              </p>
            ) : (
              <p className="font-heading text-3xl text-slate-600 mt-2">Not assessed</p>
            )}
          </div>
        </div>

        {/* ── Matched Legislative Action ── */}
        {action && (
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-8 mb-8">
            <h2 className="font-heading text-2xl uppercase text-white mb-6">
              Matched Legislative Action
            </h2>

            {action.bill_type && action.bill_number && (
              <span className="inline-block bg-[rgba(59,130,246,0.1)] border border-[rgba(59,130,246,0.3)] px-4 py-1.5 rounded-full text-blue-400 font-mono font-bold text-sm mb-4">
                {action.bill_type.toUpperCase()} {action.bill_number}
              </span>
            )}

            <h3 className="text-xl text-white font-medium">{action.title}</h3>

            {action.date && (
              <p className="font-mono text-sm text-slate-400 mt-1">
                {formatDate(action.date)}
              </p>
            )}

            {action.summary && (
              <p className="text-base text-slate-400 mt-2 line-clamp-2">{action.summary}</p>
            )}

            <div className="flex flex-wrap gap-3 mt-6">
              {claim.matched_bill_id && (
                <Link
                  to={`/politics/bill/${claim.matched_bill_id}`}
                  className="border border-[rgba(59,130,246,0.3)] text-blue-400 px-6 py-2 rounded-full text-sm hover:bg-[rgba(59,130,246,0.1)] transition-colors"
                >
                  View Bill Detail &rarr;
                </Link>
              )}
              {action.source_url && (
                <a
                  href={action.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-[#334155] text-slate-300 px-6 py-2 rounded-full text-sm hover:bg-[rgba(59,130,246,0.1)] transition-colors"
                >
                  View Source &rarr;
                </a>
              )}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="flex justify-between items-center pt-8 mt-auto">
          {claim.source_url && (
            <a
              href={claim.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-body text-slate-400 hover:text-white transition-colors text-sm"
            >
              View Source &rarr;
            </a>
          )}
          <Link
            to={`/politics/people/${claim.person_id}`}
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-full uppercase tracking-wider font-bold text-sm transition-colors"
          >
            View Member Profile &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ClaimDetailPage;
