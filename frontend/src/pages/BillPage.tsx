import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiClient } from "../api/client";
import type { BillResponse, BillTimelineAction } from "../api/types";
import { LoadingSpinner, EmptyState, PageHeader, ChamberBadge } from "../components/ui";

const STATUS_COLORS: Record<string, string> = {
  introduced: "bg-blue-500",
  in_committee: "bg-amber-500",
  passed_one: "bg-emerald-400",
  passed_both: "bg-emerald-500",
  enacted: "bg-emerald-600",
  vetoed: "bg-red-500",
  failed: "bg-red-400",
};

const BillPage: React.FC = () => {
  const { bill_id } = useParams<{ bill_id: string }>();
  const [bill, setBill] = useState<BillResponse | null>(null);
  const [actions, setActions] = useState<BillTimelineAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bill_id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      apiClient.getBill(bill_id),
      apiClient.getBillTimeline(bill_id),
    ])
      .then(([billRes, timelineRes]) => {
        setBill(billRes);
        setActions(
          (timelineRes.actions || []).sort(
            (a, b) => new Date(a.action_date || "").getTime() - new Date(b.action_date || "").getTime()
          )
        );
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load bill");
        setLoading(false);
      });
  }, [bill_id]);

  if (!bill_id) return <div className="text-red-600">Missing bill_id in URL.</div>;
  if (loading) return <LoadingSpinner message="Loading bill..." />;
  if (error) return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center">
      <div className="text-red-700 font-medium">{error}</div>
    </div>
  );
  if (!bill) return <EmptyState title="Bill not found" />;

  const statusColor = STATUS_COLORS[bill.status_bucket || ""] || "bg-slate-400";

  return (
    <div>
      <PageHeader
        title={bill.bill_id.toUpperCase()}
        breadcrumbs={[
          { label: "Dashboard", to: "/politics" },
          { label: bill.bill_id.toUpperCase() },
        ]}
      />

      {/* Bill header card */}
      <div className="rounded-xl bg-white border border-stone-200 p-6 shadow-sm mb-6">
        <h2 className="text-lg font-semibold text-stone-900 mb-3">{bill.title}</h2>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold text-white ${statusColor}`}>
            {(bill.status_bucket || "unknown").replace(/_/g, " ")}
          </span>
          {bill.policy_area && (
            <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
              {bill.policy_area}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {bill.introduced_date && (
            <div>
              <span className="text-stone-400">Introduced:</span>{" "}
              <span className="text-stone-700">{new Date(bill.introduced_date).toLocaleDateString()}</span>
            </div>
          )}
          {bill.latest_action_date && (
            <div>
              <span className="text-stone-400">Latest Action:</span>{" "}
              <span className="text-stone-700">{new Date(bill.latest_action_date).toLocaleDateString()}</span>
            </div>
          )}
          {bill.sponsor_person_id && (
            <div>
              <span className="text-stone-400">Sponsor:</span>{" "}
              <Link
                to={`/politics/people/${bill.sponsor_person_id}`}
                className="text-blue-600 hover:underline"
              >
                {bill.sponsor_person_id.replace(/_/g, " ")}
              </Link>
            </div>
          )}
        </div>

        {bill.source_urls.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {bill.source_urls.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                Source {i + 1} &rarr;
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="rounded-xl bg-white border border-stone-200 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900 mb-6">Timeline ({actions.length} actions)</h2>

        {actions.length === 0 ? (
          <EmptyState title="No timeline" message="No legislative actions recorded for this bill." />
        ) : (
          <div className="relative pl-6">
            {/* Vertical line */}
            <div className="absolute left-2.5 top-1 bottom-1 w-0.5 bg-stone-200" />

            <div className="space-y-6">
              {actions.map((action, i) => (
                <div key={action.id} className="relative">
                  {/* Dot */}
                  <div className={`absolute -left-3.5 top-1.5 h-3 w-3 rounded-full border-2 border-white ${
                    i === actions.length - 1 ? "bg-blue-500" : "bg-stone-300"
                  }`} />

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {action.action_date && (
                        <span className="text-xs font-medium text-stone-500 tabular-nums">
                          {new Date(action.action_date).toLocaleDateString()}
                        </span>
                      )}
                      {action.chamber && <ChamberBadge chamber={action.chamber} />}
                    </div>
                    {action.description && (
                      <p className="text-sm text-stone-700">{action.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BillPage;
