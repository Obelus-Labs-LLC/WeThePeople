import React, { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { apiClient } from "../api/client";
import type { VoteDetailResponse, MemberVoteEntry } from "../api/types";
import BackButton from "../components/BackButton";
import { PoliticsSectorHeader } from "../components/SectorHeader";

type PositionFilter = "All" | "Yea" | "Nay" | "Not Voting" | "Present";

const POSITION_FILTERS: PositionFilter[] = [
  "All",
  "Yea",
  "Nay",
  "Not Voting",
  "Present",
];

const PARTY_COLORS: Record<string, string> = {
  D: "#3B82F6",
  R: "#EF4444",
  I: "#A855F7",
};

const PARTY_NAMES: Record<string, string> = {
  D: "Democrat",
  R: "Republican",
  I: "Independent",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Date unknown";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getCongressSuffix(congress: number): string {
  const mod10 = congress % 10;
  const mod100 = congress % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  if (mod10 === 1) return "st";
  if (mod10 === 2) return "nd";
  if (mod10 === 3) return "rd";
  return "th";
}

interface PartyBreakdown {
  party: string;
  yea: number;
  nay: number;
  notVoting: number;
  present: number;
  total: number;
}

function computePartyBreakdowns(
  memberVotes: MemberVoteEntry[]
): PartyBreakdown[] {
  const map: Record<string, PartyBreakdown> = {};
  for (const mv of memberVotes) {
    if (!map[mv.party]) {
      map[mv.party] = {
        party: mv.party,
        yea: 0,
        nay: 0,
        notVoting: 0,
        present: 0,
        total: 0,
      };
    }
    const p = map[mv.party];
    p.total++;
    if (mv.position === "Yea") p.yea++;
    else if (mv.position === "Nay") p.nay++;
    else if (mv.position === "Not Voting") p.notVoting++;
    else if (mv.position === "Present") p.present++;
  }
  // Sort: D, R, I, then others
  const order = ["D", "R", "I"];
  return Object.values(map).sort(
    (a, b) =>
      (order.indexOf(a.party) === -1 ? 99 : order.indexOf(a.party)) -
      (order.indexOf(b.party) === -1 ? 99 : order.indexOf(b.party))
  );
}

const VoteDetailPage: React.FC = () => {
  const { vote_id } = useParams<{ vote_id: string }>();
  const [vote, setVote] = useState<VoteDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] =
    useState<PositionFilter>("All");

  useEffect(() => {
    let cancelled = false;
    if (!vote_id) return;
    setLoading(true);
    setError(null);
    apiClient
      .getVoteDetail(Number(vote_id))
      .then((data) => {
        if (cancelled) return;
        setVote(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load vote details");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [vote_id]);

  const filteredMembers = useMemo(() => {
    if (!vote) return [];
    let members = vote.member_votes;
    if (positionFilter !== "All") {
      members = members.filter((m) => m.position === positionFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      members = members.filter((m) =>
        m.member_name.toLowerCase().includes(q)
      );
    }
    return members;
  }, [vote, search, positionFilter]);

  const partyBreakdowns = useMemo(() => {
    if (!vote) return [];
    return computePartyBreakdowns(vote.member_votes);
  }, [vote]);

  if (!vote_id) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="font-body text-red-400 text-lg">
          Missing vote_id in URL.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <div className="w-10 h-10 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
        <p className="font-body text-slate-400 text-lg">
          Loading vote details...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-8 max-w-md text-center">
          <p className="font-body text-red-400 text-lg mb-2">
            Error loading vote
          </p>
          <p className="font-body text-slate-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!vote) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="font-body text-slate-400 text-lg">
          Vote not found.
        </p>
      </div>
    );
  }

  const total =
    vote.yea_count +
    vote.nay_count +
    vote.not_voting_count +
    vote.present_count;
  const passed = vote.result.toLowerCase().includes("passed");
  const failed = vote.result.toLowerCase().includes("failed");

  const relatedBillSlug =
    vote.related_bill_type && vote.related_bill_number && vote.related_bill_congress
      ? `${vote.related_bill_type}${vote.related_bill_number}-${vote.related_bill_congress}`
      : null;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ── HEADER ── */}
      <div className="shrink-0 px-8 pt-6 pb-4">
        <PoliticsSectorHeader />
        <div className="mb-4">
          <BackButton to="/politics/activity" label="Activity" />
        </div>

        <p className="font-mono text-lg text-slate-400 tracking-wider mb-2">
          ROLL NO. {vote.roll_number} &bull;{" "}
          {vote.chamber.toUpperCase()} &bull;{" "}
          {vote.congress}
          {getCongressSuffix(vote.congress).toUpperCase()} CONGRESS &bull;
          SESSION {vote.session}
        </p>

        <h1 className="font-heading text-5xl xl:text-6xl font-bold uppercase text-white leading-tight mb-4">
          {vote.question}
        </h1>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {relatedBillSlug && (
            <Link
              to={`/politics/bill/${relatedBillSlug}`}
              className="inline-flex items-center bg-[#1E293B] border border-[#334155] rounded-full px-4 py-1.5 text-sm font-body text-slate-300 hover:text-white hover:border-slate-400 transition-colors"
            >
              Related Bill:{" "}
              {vote.related_bill_type!.toUpperCase()}{" "}
              {vote.related_bill_number}
            </Link>
          )}
          {vote.source_url && (
            <a
              href={vote.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center bg-[#1E293B] border border-[#334155] rounded-full px-4 py-1.5 text-sm font-body text-slate-300 hover:text-white hover:border-slate-400 transition-colors"
            >
              Official Record &rarr;
            </a>
          )}
        </div>

        {/* Result badge + date */}
        <div className="flex flex-wrap items-center gap-6">
          <span
            className={`inline-flex items-center font-heading text-3xl font-bold tracking-widest uppercase px-8 py-4 rounded-xl border ${
              passed
                ? "bg-[rgba(16,185,129,0.2)] text-emerald-400 border-[rgba(16,185,129,0.3)]"
                : failed
                  ? "bg-[rgba(239,68,68,0.2)] text-red-400 border-[rgba(239,68,68,0.3)]"
                  : "bg-[rgba(148,163,184,0.2)] text-slate-400 border-[rgba(148,163,184,0.3)]"
            }`}
          >
            {vote.result}
          </span>
          <span className="font-mono text-sm text-slate-400">
            {formatDate(vote.vote_date)}
          </span>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 min-h-0 flex flex-row gap-8 px-8 pb-8">
        {/* ── LEFT COLUMN (summary + party breakdown) ── */}
        <div className="hidden 2xl:flex flex-col gap-6 w-[40%] overflow-y-auto pr-2">
          {/* Vote Summary Card */}
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-6">
            <h2 className="font-heading text-xl uppercase text-white tracking-wider mb-4">
              Vote Summary
            </h2>
            <p className="text-slate-400 font-body text-sm mb-1">
              Total Votes
            </p>
            <p className="font-mono text-3xl font-bold text-white mb-5">
              {total}
            </p>

            {/* 2x2 stat grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <StatBox count={vote.yea_count} label="Yea" color="text-emerald-400" />
              <StatBox count={vote.nay_count} label="Nay" color="text-red-400" />
              <StatBox
                count={vote.not_voting_count}
                label="Not Voting"
                color="text-gray-500"
              />
              <StatBox
                count={vote.present_count}
                label="Present"
                color="text-yellow-500"
              />
            </div>

            {/* Stacked bar */}
            <div className="relative mb-2">
              <div className="flex h-12 rounded-full overflow-hidden">
                {total > 0 && (
                  <>
                    {vote.yea_count > 0 && (
                      <div
                        className="bg-emerald-500 transition-all duration-500"
                        style={{
                          width: `${(vote.yea_count / total) * 100}%`,
                        }}
                      />
                    )}
                    {vote.nay_count > 0 && (
                      <div
                        className="bg-red-500 transition-all duration-500"
                        style={{
                          width: `${(vote.nay_count / total) * 100}%`,
                        }}
                      />
                    )}
                    {vote.not_voting_count > 0 && (
                      <div
                        className="bg-gray-500 transition-all duration-500"
                        style={{
                          width: `${(vote.not_voting_count / total) * 100}%`,
                        }}
                      />
                    )}
                    {vote.present_count > 0 && (
                      <div
                        className="bg-yellow-500 transition-all duration-500"
                        style={{
                          width: `${(vote.present_count / total) * 100}%`,
                        }}
                      />
                    )}
                  </>
                )}
              </div>
              {/* Majority threshold line */}
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white" />
              <p className="absolute left-1/2 -translate-x-1/2 -top-4 text-[10px] text-slate-400 uppercase tracking-wider">
                Majority
              </p>
            </div>
          </div>

          {/* Party Breakdown Card */}
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-6">
            <h2 className="font-heading text-xl uppercase text-white tracking-wider mb-5">
              Party Breakdown
            </h2>
            <div className="flex flex-col gap-5">
              {partyBreakdowns.map((pb) => (
                <div key={pb.party}>
                  {/* Party header */}
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          PARTY_COLORS[pb.party] || "#64748B",
                      }}
                    />
                    <span className="font-body font-bold text-lg text-white">
                      {PARTY_NAMES[pb.party] || pb.party}
                    </span>
                  </div>
                  {/* Stats text */}
                  <p className="font-body text-sm text-slate-400 mb-2">
                    <span className="text-emerald-400 font-medium">
                      {pb.yea}
                    </span>{" "}
                    Yea &bull;{" "}
                    <span className="text-red-400 font-medium">
                      {pb.nay}
                    </span>{" "}
                    Nay &bull;{" "}
                    <span className="text-gray-500 font-medium">
                      {pb.notVoting}
                    </span>{" "}
                    NV
                  </p>
                  {/* Mini stacked bar */}
                  {pb.total > 0 && (
                    <div className="flex h-4 rounded-full overflow-hidden">
                      {pb.yea > 0 && (
                        <div
                          className="bg-emerald-500"
                          style={{
                            width: `${(pb.yea / pb.total) * 100}%`,
                          }}
                        />
                      )}
                      {pb.nay > 0 && (
                        <div
                          className="bg-red-500"
                          style={{
                            width: `${(pb.nay / pb.total) * 100}%`,
                          }}
                        />
                      )}
                      {pb.notVoting > 0 && (
                        <div
                          className="bg-gray-500"
                          style={{
                            width: `${(pb.notVoting / pb.total) * 100}%`,
                          }}
                        />
                      )}
                      {pb.present > 0 && (
                        <div
                          className="bg-yellow-500"
                          style={{
                            width: `${(pb.present / pb.total) * 100}%`,
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN (member votes table) ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0F172A] border border-[#1E293B] rounded-2xl">
          {/* Toolbar */}
          <div className="shrink-0 p-6 border-b border-[#1E293B]">
            <input
              type="text"
              placeholder="Search members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#0F172A] border border-[#334155] rounded-lg px-4 py-2.5 text-white font-body placeholder:text-slate-500 focus:border-blue-500 focus:outline-none transition-colors mb-3"
            />
            <div className="flex flex-wrap gap-2">
              {POSITION_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setPositionFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-body transition-colors ${
                    positionFilter === f
                      ? "bg-[#334155] text-white"
                      : "bg-[#0F172A] border border-[#1E293B] text-slate-400 hover:text-slate-200 hover:border-[#334155]"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Table header */}
          <div className="shrink-0 grid grid-cols-4 px-8 py-4 bg-[rgba(15,23,42,0.5)] border-b border-[#1E293B]">
            <span className="text-slate-400 text-sm uppercase font-medium tracking-wider font-body">
              Member
            </span>
            <span className="text-slate-400 text-sm uppercase font-medium tracking-wider font-body">
              Party
            </span>
            <span className="text-slate-400 text-sm uppercase font-medium tracking-wider font-body">
              State
            </span>
            <span className="text-slate-400 text-sm uppercase font-medium tracking-wider font-body">
              Position
            </span>
          </div>

          {/* Table body */}
          <div className="flex-1 overflow-y-auto">
            {filteredMembers.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <p className="font-body text-slate-500 text-sm">
                  No members match your filters.
                </p>
              </div>
            ) : (
              filteredMembers.map((m, idx) => (
                <div
                  key={`${m.bioguide_id}-${idx}`}
                  className="grid grid-cols-4 px-8 py-4 border-b border-[rgba(30,41,59,0.5)] hover:bg-[rgba(30,41,59,0.3)] transition-colors"
                >
                  {/* Name */}
                  <div>
                    {m.person_id ? (
                      <Link
                        to={`/politics/people/${m.person_id}`}
                        className="font-body text-lg font-bold text-white hover:text-blue-400 transition-colors"
                      >
                        {m.member_name}
                      </Link>
                    ) : (
                      <span className="font-body text-lg font-bold text-white">
                        {m.member_name}
                      </span>
                    )}
                  </div>
                  {/* Party */}
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          PARTY_COLORS[m.party] || "#64748B",
                      }}
                    />
                    <span className="font-body text-slate-300">
                      {m.party}
                    </span>
                  </div>
                  {/* State */}
                  <div className="flex items-center">
                    <span className="font-mono text-slate-400">
                      {m.state}
                    </span>
                  </div>
                  {/* Position badge */}
                  <div className="flex items-center">
                    <PositionBadge position={m.position} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Sub-components ── */

function StatBox({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: string;
}) {
  return (
    <div className="bg-[rgba(15,23,42,0.5)] rounded-xl p-4">
      <p className={`font-mono text-2xl font-bold ${color}`}>
        {count}
      </p>
      <p className="text-sm text-slate-400 uppercase font-body mt-1">
        {label}
      </p>
    </div>
  );
}

function PositionBadge({ position }: { position: string }) {
  let classes: string;
  switch (position) {
    case "Yea":
      classes =
        "bg-[rgba(16,185,129,0.2)] text-emerald-400 border border-[rgba(16,185,129,0.3)]";
      break;
    case "Nay":
      classes =
        "bg-[rgba(239,68,68,0.2)] text-red-400 border border-[rgba(239,68,68,0.3)]";
      break;
    case "Present":
      classes = "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30";
      break;
    default:
      // Not Voting or anything else
      classes = "bg-gray-700 text-gray-400 border border-gray-600";
      break;
  }
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs uppercase font-bold tracking-wider ${classes}`}
    >
      {position}
    </span>
  );
}

export default VoteDetailPage;
