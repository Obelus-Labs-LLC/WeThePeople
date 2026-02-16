import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiClient } from "../api/client";
import type { LedgerEntry, PersonProfile, PersonFinance, PersonPerformance } from "../api/types";
import {
  TierBadge, PartyBadge, ChamberBadge, StatCard, ProgressBar,
  LoadingSpinner, EmptyState, PageHeader,
} from "../components/ui";

type Tab = "overview" | "activity" | "finance";

const PersonPage: React.FC = () => {
  const { person_id } = useParams<{ person_id: string }>();
  const [tab, setTab] = useState<Tab>("overview");

  // Core data
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Profile (lazy)
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Performance
  const [perf, setPerf] = useState<PersonPerformance | null>(null);

  // Finance (lazy)
  const [finance, setFinance] = useState<PersonFinance | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);

  // Tier filter for activity tab
  const [tierFilter, setTierFilter] = useState<string>("all");

  useEffect(() => {
    if (!person_id) return;
    setLoading(true);
    setError(null);

    Promise.all([
      apiClient.getLedgerForPerson(person_id, { limit: 100 }),
      apiClient.getPersonPerformance(person_id).catch(() => null),
    ])
      .then(([ledgerRes, perfRes]) => {
        setEntries(ledgerRes.entries || []);
        setTotal(ledgerRes.total || 0);
        if (perfRes) setPerf(perfRes);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load person data");
        setLoading(false);
      });
  }, [person_id]);

  // Lazy-load profile on mount
  useEffect(() => {
    if (!person_id) return;
    setProfileLoading(true);
    apiClient.getPersonProfile(person_id)
      .then(setProfile)
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [person_id]);

  // Lazy-load finance when tab selected
  useEffect(() => {
    if (tab !== "finance" || !person_id || finance) return;
    setFinanceLoading(true);
    apiClient.getPersonFinance(person_id)
      .then(setFinance)
      .catch(() => {})
      .finally(() => setFinanceLoading(false));
  }, [tab, person_id, finance]);

  const displayName = profile?.display_name || person_id?.replace(/_/g, " ") || "";

  const filteredEntries = tierFilter === "all"
    ? entries
    : entries.filter((e) => e.tier === tierFilter);

  const tierSegments = perf ? [
    { label: "Strong", value: perf.by_tier.strong || 0, color: "bg-emerald-500" },
    { label: "Moderate", value: perf.by_tier.moderate || 0, color: "bg-amber-500" },
    { label: "Weak", value: perf.by_tier.weak || 0, color: "bg-orange-500" },
    { label: "None", value: perf.by_tier.none || 0, color: "bg-slate-300" },
  ] : [];

  if (!person_id) return <div className="text-red-600">Missing person_id in URL.</div>;
  if (loading) return <LoadingSpinner message="Loading profile..." />;
  if (error) return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center">
      <div className="text-red-700 font-medium">{error}</div>
    </div>
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "activity", label: `Activity (${total})` },
    { key: "finance", label: "Finance" },
  ];

  return (
    <div>
      <PageHeader
        title={displayName}
        breadcrumbs={[
          { label: "People", to: "/politics/people" },
          { label: displayName },
        ]}
      />

      {/* Profile header */}
      <div className="rounded-xl bg-white border border-stone-200 p-6 shadow-sm mb-6">
        <div className="flex items-start gap-5">
          {profile?.thumbnail ? (
            <img
              src={profile.thumbnail}
              alt={displayName}
              className="h-20 w-20 rounded-xl object-cover flex-shrink-0"
            />
          ) : (
            <div className="h-20 w-20 rounded-xl bg-slate-100 flex items-center justify-center text-2xl font-bold text-slate-400 flex-shrink-0">
              {displayName.charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {profile?.infobox?.party && <PartyBadge party={profile.infobox.party} />}
              {profile?.infobox?.office && (
                <ChamberBadge chamber={profile.infobox.office.includes("Senate") ? "senate" : "house"} />
              )}
            </div>
            {profileLoading ? (
              <div className="text-sm text-stone-400">Loading bio...</div>
            ) : profile?.summary ? (
              <p className="text-sm text-stone-600 line-clamp-3">{profile.summary}</p>
            ) : null}
            {profile?.url && (
              <a href={profile.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-blue-600 hover:underline">
                Wikipedia &rarr;
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-stone-200 mb-6">
        <nav className="flex gap-0 -mb-px">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="space-y-6">
          {perf && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Activity Entries" value={perf.total_claims} accent="blue" />
              <StatCard label="Evaluated" value={perf.total_scored} accent="emerald" />
              <StatCard
                label="Match Rate"
                value={perf.total_claims > 0 ? `${Math.round((perf.total_scored / perf.total_claims) * 100)}%` : "0%"}
                accent="amber"
              />
              <StatCard label="Categories" value={Object.keys(perf.by_category).length} accent="slate" />
            </div>
          )}

          {perf && perf.total_scored > 0 && (
            <div className="rounded-xl bg-white border border-stone-200 p-6 shadow-sm">
              <h3 className="text-base font-semibold text-stone-900 mb-3">Accountability Breakdown</h3>
              <ProgressBar segments={tierSegments} height="md" />
            </div>
          )}

          {profile?.infobox && Object.keys(profile.infobox).length > 0 && (
            <div className="rounded-xl bg-white border border-stone-200 p-6 shadow-sm">
              <h3 className="text-base font-semibold text-stone-900 mb-3">Quick Facts</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {Object.entries(profile.infobox).slice(0, 10).map(([key, val]) => (
                  <div key={key} className="flex gap-2">
                    <dt className="text-stone-500 capitalize whitespace-nowrap">{key.replace(/_/g, " ")}:</dt>
                    <dd className="text-stone-800 truncate">{val}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}

      {tab === "activity" && (
        <div>
          <div className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white p-0.5 mb-4 w-fit">
            {["all", "strong", "moderate", "weak", "none"].map((val) => (
              <button
                key={val}
                onClick={() => setTierFilter(val)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                  tierFilter === val
                    ? "bg-slate-800 text-white"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                {val}
              </button>
            ))}
          </div>

          {filteredEntries.length === 0 ? (
            <EmptyState title="No activity" message={tierFilter !== "all" ? "No entries match this tier filter." : "No activity entries found for this person."} />
          ) : (
            <div className="space-y-3">
              {filteredEntries.map((entry) => (
                <Link
                  key={entry.claim_id}
                  to={`/politics/claim/${entry.claim_id}`}
                  className="block rounded-xl bg-white border border-stone-200 p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-stone-800 line-clamp-2">{entry.normalized_text}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                        {entry.claim_date && <span>{new Date(entry.claim_date).toLocaleDateString()}</span>}
                        {entry.policy_area && <span className="px-1.5 py-0.5 bg-stone-100 rounded">{entry.policy_area}</span>}
                        {entry.matched_bill_id && (
                          <span className="text-blue-600">{entry.matched_bill_id}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <TierBadge tier={entry.tier} />
                    </div>
                  </div>
                  {entry.score !== null && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-stone-100 overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${Math.min(entry.score * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-stone-500 tabular-nums">{(entry.score * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "finance" && (
        <div>
          {financeLoading ? (
            <LoadingSpinner message="Loading finance data..." />
          ) : !finance || !finance.totals ? (
            <EmptyState title="No finance data" message="FEC data is not available for this member." />
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  label="Total Raised"
                  value={`$${(finance.totals.receipts / 1_000_000).toFixed(1)}M`}
                  accent="emerald"
                />
                <StatCard
                  label="Total Spent"
                  value={`$${(finance.totals.disbursements / 1_000_000).toFixed(1)}M`}
                  accent="amber"
                />
                <StatCard
                  label="Cash on Hand"
                  value={`$${(finance.totals.cash_on_hand / 1_000_000).toFixed(1)}M`}
                  accent="blue"
                />
              </div>

              {finance.top_donors.length > 0 && (
                <div className="rounded-xl bg-white border border-stone-200 p-6 shadow-sm">
                  <h3 className="text-base font-semibold text-stone-900 mb-4">Top Donors</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-stone-200 text-stone-500">
                          <th className="text-left py-2 font-medium">Name</th>
                          <th className="text-left py-2 font-medium">Employer</th>
                          <th className="text-right py-2 font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {finance.top_donors.map((donor, i) => (
                          <tr key={i} className="border-b border-stone-100 last:border-0">
                            <td className="py-2.5 text-stone-800">{donor.name}</td>
                            <td className="py-2.5 text-stone-500">{donor.employer}</td>
                            <td className="py-2.5 text-right font-medium text-stone-800 tabular-nums">
                              ${donor.amount.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PersonPage;
