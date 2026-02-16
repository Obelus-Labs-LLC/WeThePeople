import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../api/client";
import type { Person, ComparePersonData } from "../api/types";
import { PartyBadge, ChamberBadge, LoadingSpinner, EmptyState, PageHeader } from "../components/ui";

const TIER_COLORS: Record<string, string> = {
  strong: "bg-emerald-500",
  moderate: "bg-amber-500",
  weak: "bg-orange-500",
  none: "bg-slate-400",
};

const TIER_ORDER = ["strong", "moderate", "weak", "none"];

const ComparePage: React.FC = () => {
  const [people, setPeople] = useState<Person[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ComparePersonData[] | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Load people directory for picker
  useEffect(() => {
    apiClient
      .getPeople({ limit: 200 })
      .then((res) => {
        setPeople(res.people || []);
        setLoadingPeople(false);
      })
      .catch(() => setLoadingPeople(false));
  }, []);

  // Filter people for the picker dropdown
  const filteredPeople = useMemo(() => {
    if (!search) return people;
    const q = search.toLowerCase();
    return people.filter(
      (p) => p.display_name.toLowerCase().includes(q) || p.state.toLowerCase().includes(q)
    );
  }, [people, search]);

  const togglePerson = (personId: string) => {
    setSelected((prev) => {
      if (prev.includes(personId)) return prev.filter((id) => id !== personId);
      if (prev.length >= 4) return prev; // max 4
      return [...prev, personId];
    });
  };

  const runComparison = () => {
    if (selected.length < 2) return;
    setLoadingCompare(true);
    setError(null);
    setComparison(null);
    apiClient
      .comparePeople(selected)
      .then((res) => {
        setComparison(res.people);
        setLoadingCompare(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load comparison");
        setLoadingCompare(false);
      });
  };

  // Find display name from people list
  const nameOf = (personId: string) => {
    const p = people.find((x) => x.person_id === personId);
    return p ? p.display_name : personId.replace(/_/g, " ");
  };

  const personOf = (personId: string) => people.find((x) => x.person_id === personId);

  return (
    <div>
      <PageHeader
        title="Compare Members"
        subtitle="Select 2–4 members to compare their accountability records"
        breadcrumbs={[{ label: "Dashboard", to: "/politics" }, { label: "Compare" }]}
      />

      {/* Person Picker */}
      <div className="rounded-xl bg-white border border-stone-200 p-6 shadow-sm mb-6">
        <h2 className="text-base font-semibold text-stone-900 mb-3">Select Members</h2>

        {/* Selected chips */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {selected.map((id) => {
              const person = personOf(id);
              return (
                <button
                  key={id}
                  onClick={() => togglePerson(id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-200 transition-colors"
                >
                  {nameOf(id)}
                  {person && <PartyBadge party={person.party} compact />}
                  <span className="text-blue-400 ml-1">&times;</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Search + grid */}
        {loadingPeople ? (
          <LoadingSpinner message="Loading members..." />
        ) : (
          <>
            <input
              type="text"
              placeholder="Search by name or state..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-md rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm placeholder-stone-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-colors mb-4"
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
              {filteredPeople.map((person) => {
                const isSelected = selected.includes(person.person_id);
                const isDisabled = !isSelected && selected.length >= 4;
                return (
                  <button
                    key={person.person_id}
                    onClick={() => togglePerson(person.person_id)}
                    disabled={isDisabled}
                    className={`text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                      isSelected
                        ? "border-blue-400 bg-blue-50 text-blue-900 font-medium"
                        : isDisabled
                          ? "border-stone-200 bg-stone-50 text-stone-300 cursor-not-allowed"
                          : "border-stone-200 bg-white text-stone-700 hover:border-blue-300 hover:bg-blue-50"
                    }`}
                  >
                    <div className="truncate">{person.display_name}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <PartyBadge party={person.party} compact />
                      <span className="text-xs text-stone-400">{person.state}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Compare button */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={runComparison}
            disabled={selected.length < 2 || loadingCompare}
            className={`rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${
              selected.length < 2
                ? "bg-stone-200 text-stone-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {loadingCompare ? "Comparing..." : `Compare ${selected.length} Members`}
          </button>
          {selected.length < 2 && (
            <span className="text-xs text-stone-400">Select at least 2 members</span>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center mb-6">
          <div className="text-red-700 font-medium">{error}</div>
        </div>
      )}

      {/* Comparison Results */}
      {loadingCompare && <LoadingSpinner message="Loading comparison..." />}

      {comparison && comparison.length > 0 && (
        <div className="space-y-6">
          {/* Overview cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {comparison.map((data) => {
              const person = personOf(data.person_id);
              return (
                <Link
                  key={data.person_id}
                  to={`/politics/people/${data.person_id}`}
                  className="rounded-xl bg-white border border-stone-200 p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-500">
                      {nameOf(data.person_id).charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-stone-900 text-sm truncate">{nameOf(data.person_id)}</div>
                      <div className="flex items-center gap-1.5">
                        {person && <PartyBadge party={person.party} compact />}
                        {person && <ChamberBadge chamber={person.chamber} />}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div>
                      <div className="text-xl font-bold text-stone-900">{data.total_claims}</div>
                      <div className="text-xs text-stone-500">Claims</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-stone-900">{data.total_scored}</div>
                      <div className="text-xs text-stone-500">Scored</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Tier Distribution comparison */}
          <ComparisonSection title="Tier Distribution" subtitle="How their claims were rated">
            <div className="space-y-4">
              {comparison.map((data) => (
                <div key={data.person_id}>
                  <div className="text-sm font-medium text-stone-700 mb-1.5">{nameOf(data.person_id)}</div>
                  {data.total_scored === 0 ? (
                    <div className="text-xs text-stone-400 italic">No scored claims</div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-6 rounded-full bg-stone-100 overflow-hidden flex">
                        {TIER_ORDER.map((tier) => {
                          const pct = data.by_tier.percent[tier] || 0;
                          if (pct === 0) return null;
                          return (
                            <div
                              key={tier}
                              className={`${TIER_COLORS[tier]} h-full transition-all`}
                              style={{ width: `${pct}%` }}
                              title={`${tier}: ${pct}%`}
                            />
                          );
                        })}
                      </div>
                      <div className="flex gap-2 text-xs text-stone-500 shrink-0">
                        {TIER_ORDER.map((tier) => {
                          const raw = data.by_tier.raw[tier] || 0;
                          if (raw === 0) return null;
                          return (
                            <span key={tier} className="flex items-center gap-1">
                              <span className={`inline-block h-2 w-2 rounded-full ${TIER_COLORS[tier]}`} />
                              {raw}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="flex gap-4 mt-4 pt-3 border-t border-stone-100">
              {TIER_ORDER.map((tier) => (
                <span key={tier} className="flex items-center gap-1.5 text-xs text-stone-500">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${TIER_COLORS[tier]}`} />
                  <span className="capitalize">{tier}</span>
                </span>
              ))}
            </div>
          </ComparisonSection>

          {/* Timing comparison */}
          <ComparisonSection title="Timing Assessment" subtitle="When action was taken relative to the claim">
            <BreakdownBars
              comparison={comparison}
              nameOf={nameOf}
              field="by_timing"
              colors={{ before: "bg-emerald-500", during: "bg-blue-500", after: "bg-amber-500" }}
              order={["before", "during", "after"]}
            />
          </ComparisonSection>

          {/* Progress comparison */}
          <ComparisonSection title="Progress Assessment" subtitle="How far along the action went">
            <BreakdownBars
              comparison={comparison}
              nameOf={nameOf}
              field="by_progress"
              colors={{ completed: "bg-emerald-500", in_progress: "bg-blue-500", stalled: "bg-amber-500", not_started: "bg-slate-400" }}
              order={["completed", "in_progress", "stalled", "not_started"]}
            />
          </ComparisonSection>

          {/* Category breakdown */}
          <ComparisonSection title="Claim Categories" subtitle="Policy areas of their claims">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className="text-left py-2 pr-4 text-stone-500 font-medium">Category</th>
                    {comparison.map((data) => (
                      <th key={data.person_id} className="text-right py-2 px-3 text-stone-500 font-medium">
                        {nameOf(data.person_id).split(" ").pop()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {getAllCategories(comparison).map((cat) => (
                    <tr key={cat} className="border-b border-stone-100">
                      <td className="py-2 pr-4 text-stone-700 capitalize">{cat || "uncategorized"}</td>
                      {comparison.map((data) => (
                        <td key={data.person_id} className="text-right py-2 px-3 text-stone-900 tabular-nums">
                          {data.by_category[cat] || 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ComparisonSection>
        </div>
      )}

      {comparison && comparison.length === 0 && (
        <EmptyState title="No data" message="No comparison data available for the selected members." />
      )}
    </div>
  );
};

// Helper: section wrapper
const ComparisonSection: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, children }) => (
  <div className="rounded-xl bg-white border border-stone-200 p-6 shadow-sm">
    <h2 className="text-base font-semibold text-stone-900">{title}</h2>
    {subtitle && <p className="text-sm text-stone-500 mb-4">{subtitle}</p>}
    {!subtitle && <div className="mb-4" />}
    {children}
  </div>
);

// Helper: reusable breakdown bars for timing/progress
const BreakdownBars: React.FC<{
  comparison: ComparePersonData[];
  nameOf: (id: string) => string;
  field: "by_timing" | "by_progress";
  colors: Record<string, string>;
  order: string[];
}> = ({ comparison, nameOf, field, colors, order }) => (
  <>
    <div className="space-y-4">
      {comparison.map((data) => {
        const bucket = data[field];
        const total = Object.values(bucket.raw).reduce((s, v) => s + v, 0);
        return (
          <div key={data.person_id}>
            <div className="text-sm font-medium text-stone-700 mb-1.5">{nameOf(data.person_id)}</div>
            {total === 0 ? (
              <div className="text-xs text-stone-400 italic">No data</div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-6 rounded-full bg-stone-100 overflow-hidden flex">
                  {order.map((key) => {
                    const pct = bucket.percent[key] || 0;
                    if (pct === 0) return null;
                    return (
                      <div
                        key={key}
                        className={`${colors[key] || "bg-slate-400"} h-full transition-all`}
                        style={{ width: `${pct}%` }}
                        title={`${key.replace(/_/g, " ")}: ${pct}%`}
                      />
                    );
                  })}
                </div>
                <div className="flex gap-2 text-xs text-stone-500 shrink-0">
                  {order.map((key) => {
                    const raw = bucket.raw[key] || 0;
                    if (raw === 0) return null;
                    return (
                      <span key={key} className="flex items-center gap-1">
                        <span className={`inline-block h-2 w-2 rounded-full ${colors[key] || "bg-slate-400"}`} />
                        {raw}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
    {/* Legend */}
    <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-stone-100">
      {order.map((key) => (
        <span key={key} className="flex items-center gap-1.5 text-xs text-stone-500">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[key] || "bg-slate-400"}`} />
          <span className="capitalize">{key.replace(/_/g, " ")}</span>
        </span>
      ))}
    </div>
  </>
);

// Helper: get all unique categories across all compared people
function getAllCategories(comparison: ComparePersonData[]): string[] {
  const cats = new Set<string>();
  comparison.forEach((d) => {
    Object.keys(d.by_category).forEach((c) => cats.add(c));
  });
  return Array.from(cats).sort();
}

export default ComparePage;
