import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../api/client";
import type { Person } from "../api/types";
import { PartyBadge, ChamberBadge, LoadingSpinner, EmptyState, PageHeader } from "../components/ui";

type PartyFilter = "all" | "D" | "R" | "I";
type ChamberFilter = "all" | "house" | "senate";

const PeoplePage: React.FC = () => {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [partyFilter, setPartyFilter] = useState<PartyFilter>("all");
  const [chamberFilter, setChamberFilter] = useState<ChamberFilter>("all");

  useEffect(() => {
    setLoading(true);
    apiClient
      .getPeople({ limit: 200 })
      .then((res) => {
        setPeople(res.people || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load people");
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    let result = people;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) => p.display_name.toLowerCase().includes(q) || p.state.toLowerCase().includes(q)
      );
    }
    if (partyFilter !== "all") {
      result = result.filter((p) => p.party.startsWith(partyFilter));
    }
    if (chamberFilter !== "all") {
      result = result.filter((p) =>
        chamberFilter === "house"
          ? p.chamber.toLowerCase().includes("house") || p.chamber.toLowerCase() === "lower"
          : p.chamber.toLowerCase().includes("senate") || p.chamber.toLowerCase() === "upper"
      );
    }
    return result;
  }, [people, search, partyFilter, chamberFilter]);

  return (
    <div>
      <PageHeader
        title="People Directory"
        subtitle={`${people.length} members tracked`}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <input
            type="text"
            placeholder="Search by name or state..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm placeholder-stone-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-colors"
          />
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white p-0.5">
          {(["all", "D", "R", "I"] as PartyFilter[]).map((val) => (
            <button
              key={val}
              onClick={() => setPartyFilter(val)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                partyFilter === val
                  ? "bg-slate-800 text-white"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              {val === "all" ? "All" : val === "D" ? "Dem" : val === "R" ? "Rep" : "Ind"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white p-0.5">
          {(["all", "house", "senate"] as ChamberFilter[]).map((val) => (
            <button
              key={val}
              onClick={() => setChamberFilter(val)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                chamberFilter === val
                  ? "bg-slate-800 text-white"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              {val === "all" ? "All" : val === "house" ? "House" : "Senate"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSpinner message="Loading directory..." />
      ) : error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center">
          <div className="text-red-700 font-medium">{error}</div>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No members found" message="Try adjusting your search or filters." />
      ) : (
        <>
          <div className="text-sm text-stone-500 mb-3">Showing {filtered.length} of {people.length}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((person) => (
              <Link
                key={person.person_id}
                to={`/politics/people/${person.person_id}`}
                className="group rounded-xl bg-white border border-stone-200 p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all"
              >
                <div className="flex items-center gap-3">
                  {person.photo_url ? (
                    <img
                      src={person.photo_url}
                      alt={person.display_name}
                      className="flex-shrink-0 h-11 w-11 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex-shrink-0 h-11 w-11 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-500">
                      {person.display_name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-stone-900 group-hover:text-blue-700 transition-colors truncate">
                      {person.display_name}
                    </div>
                    <div className="text-sm text-stone-500">{person.state}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <PartyBadge party={person.party} />
                  <ChamberBadge chamber={person.chamber} />
                  {person.is_active && (
                    <span className="ml-auto text-xs text-emerald-600 font-medium">Active</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default PeoplePage;
