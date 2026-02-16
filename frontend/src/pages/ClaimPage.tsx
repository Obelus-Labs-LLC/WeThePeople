import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiClient } from "../api/client";
import type { LedgerEntry } from "../api/types";
import { TierBadge, LoadingSpinner, EmptyState, PageHeader } from "../components/ui";

const ClaimPage: React.FC = () => {
  const { claim_id } = useParams<{ claim_id: string }>();
  const [claim, setClaim] = useState<LedgerEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!claim_id) return;
    setLoading(true);
    setError(null);
    apiClient
      .getClaim(claim_id)
      .then((res) => {
        setClaim(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load activity entry");
        setLoading(false);
      });
  }, [claim_id]);

  if (!claim_id) return <div className="text-red-600">Missing claim_id in URL.</div>;
  if (loading) return <LoadingSpinner message="Loading activity entry..." />;
  if (error) return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center">
      <div className="text-red-700 font-medium">{error}</div>
    </div>
  );
  if (!claim) return <EmptyState title="Activity entry not found" />;

  return (
    <div>
      <PageHeader
        title={`Activity #${claim.claim_id}`}
        breadcrumbs={[
          { label: "People", to: "/politics/people" },
          { label: claim.person_id.replace(/_/g, " "), to: `/politics/people/${claim.person_id}` },
          { label: `Activity #${claim.claim_id}` },
        ]}
      />

      {/* Main claim card */}
      <div className="rounded-xl bg-white border border-stone-200 p-6 shadow-sm mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <TierBadge tier={claim.tier} size="lg" />
          {claim.score !== null && (
            <div className="text-right">
              <div className="text-2xl font-bold text-stone-900">{(claim.score * 100).toFixed(0)}%</div>
              <div className="text-xs text-stone-500">Match Score</div>
            </div>
          )}
        </div>

        <p className="text-stone-800 leading-relaxed">{claim.normalized_text}</p>

        <div className="mt-4 flex flex-wrap gap-4 text-sm text-stone-500">
          {claim.claim_date && (
            <div>
              <span className="text-stone-400">Date:</span>{" "}
              <span className="text-stone-700">{new Date(claim.claim_date).toLocaleDateString()}</span>
            </div>
          )}
          {claim.intent_type && (
            <div>
              <span className="text-stone-400">Intent:</span>{" "}
              <span className="text-stone-700 capitalize">{claim.intent_type}</span>
            </div>
          )}
          {claim.policy_area && (
            <div>
              <span className="text-stone-400">Policy:</span>{" "}
              <span className="text-stone-700">{claim.policy_area}</span>
            </div>
          )}
        </div>
      </div>

      {/* Evidence signals */}
      {claim.why && claim.why.length > 0 && (
        <div className="rounded-xl bg-white border border-stone-200 p-6 shadow-sm mb-6">
          <h2 className="text-base font-semibold text-stone-900 mb-3">Evidence Signals</h2>
          <div className="flex flex-wrap gap-2">
            {claim.why.map((signal, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-800"
              >
                {signal}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Timing & Progress */}
      {(claim.timing || claim.progress || claim.relevance) && (
        <div className="rounded-xl bg-white border border-stone-200 p-6 shadow-sm mb-6">
          <h2 className="text-base font-semibold text-stone-900 mb-3">Assessment</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {claim.timing && (
              <div>
                <div className="text-xs text-stone-400 mb-1">Timing</div>
                <div className="text-sm font-medium text-stone-800 capitalize">{claim.timing}</div>
              </div>
            )}
            {claim.progress && (
              <div>
                <div className="text-xs text-stone-400 mb-1">Progress</div>
                <div className="text-sm font-medium text-stone-800 capitalize">{claim.progress}</div>
              </div>
            )}
            {claim.relevance && (
              <div>
                <div className="text-xs text-stone-400 mb-1">Relevance</div>
                <div className="text-sm font-medium text-stone-800 capitalize">{claim.relevance}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Source & Matched Bill */}
      <div className="flex flex-wrap gap-3">
        <a
          href={claim.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
        >
          View Source &rarr;
        </a>
        {claim.matched_bill_id && (
          <Link
            to={`/politics/bill/${claim.matched_bill_id}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            View Matched Bill: {claim.matched_bill_id}
          </Link>
        )}
      </div>
    </div>
  );
};

export default ClaimPage;
