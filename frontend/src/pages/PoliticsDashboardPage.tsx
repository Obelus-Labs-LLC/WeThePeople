import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../api/client";
import type { DashboardStats, Person, RecentAction } from "../api/types";
import { StatCard, ProgressBar, LoadingSpinner, EmptyState, PartyBadge, ChamberBadge } from "../components/ui";

const PoliticsDashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [actions, setActions] = useState<RecentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiClient.getDashboardStats(),
      apiClient.getPeople({ has_ledger: true, limit: 6 }),
      apiClient.getRecentActions(8),
    ])
      .then(([statsRes, peopleRes, actionsRes]) => {
        setStats(statsRes);
        setPeople(peopleRes.people || []);
        setActions(actionsRes || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load dashboard");
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingSpinner message="Loading dashboard..." />;
  if (error) return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center">
      <div className="text-red-700 font-medium">{error}</div>
      <button className="mt-3 px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors" onClick={() => window.location.reload()}>
        Retry
      </button>
    </div>
  );

  const tierSegments = stats ? [
    { label: "Strong", value: stats.by_tier.strong || 0, color: "bg-emerald-500" },
    { label: "Moderate", value: stats.by_tier.moderate || 0, color: "bg-amber-500" },
    { label: "Weak", value: stats.by_tier.weak || 0, color: "bg-orange-500" },
    { label: "None", value: stats.by_tier.none || 0, color: "bg-slate-300" },
  ] : [];

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-8 text-white">
        <h1 className="text-3xl font-bold tracking-tight">
          Tracking what politicians do — not just what they say
        </h1>
        <p className="mt-2 text-slate-300 max-w-2xl">
          We The People tracks legislative actions, votes, and bills to generate
          evidence-backed accountability scores for every member of Congress.
        </p>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="People Tracked" value={stats.total_people} accent="blue" />
          <StatCard label="Activity Entries" value={stats.total_claims} accent="amber" />
          <StatCard label="Actions Monitored" value={stats.total_actions.toLocaleString()} accent="emerald" />
          <StatCard label="Match Rate" value={`${stats.match_rate}%`} accent="rose" subtitle={`${stats.total_bills.toLocaleString()} bills tracked`} />
        </div>
      )}

      {/* Tier distribution */}
      {stats && (
        <div className="rounded-xl bg-white border border-stone-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-900 mb-4">Activity Ledger Distribution</h2>
          <ProgressBar segments={tierSegments} height="lg" />
        </div>
      )}

      {/* Featured members */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-stone-900">Featured Members</h2>
          <Link to="/politics/people" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            View all &rarr;
          </Link>
        </div>
        {people.length === 0 ? (
          <EmptyState title="No members with ledger data" message="Members will appear here once claims are processed." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {people.map((person) => (
              <Link
                key={person.person_id}
                to={`/politics/people/${person.person_id}`}
                className="group rounded-xl bg-white border border-stone-200 p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-stone-900 group-hover:text-blue-700 transition-colors truncate">
                      {person.display_name}
                    </div>
                    <div className="mt-1 text-sm text-stone-500">
                      {person.state}
                    </div>
                  </div>
                  {person.photo_url ? (
                    <img
                      src={person.photo_url}
                      alt={person.display_name}
                      className="flex-shrink-0 h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex-shrink-0 h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-500">
                      {person.display_name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <PartyBadge party={person.party} />
                  <ChamberBadge chamber={person.chamber} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent activity */}
      {actions.length > 0 && (
        <div className="rounded-xl bg-white border border-stone-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-900 mb-4">Recent Activity</h2>
          <div className="divide-y divide-stone-100">
            {actions.map((action) => (
              <div key={action.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-900 truncate">{action.title}</div>
                    {action.summary && (
                      <div className="mt-0.5 text-xs text-stone-500 line-clamp-1">{action.summary}</div>
                    )}
                    <div className="mt-1 text-xs text-stone-400">
                      {action.person_id.replace(/_/g, ' ')}
                      {action.bill_type && action.bill_number && (
                        <span className="ml-2">
                          {action.bill_type.toUpperCase()} {action.bill_number}
                        </span>
                      )}
                    </div>
                  </div>
                  {action.date && (
                    <div className="flex-shrink-0 text-xs text-stone-400 tabular-nums">
                      {new Date(action.date).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PoliticsDashboardPage;
