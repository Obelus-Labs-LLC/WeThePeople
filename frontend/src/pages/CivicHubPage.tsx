import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Target, Users, FileText, Shield, Trophy, ChevronRight,
  ThumbsUp, ThumbsDown, ArrowUpRight, Megaphone, BookOpen,
} from 'lucide-react';
import {
  fetchPromises, fetchProposals, fetchLeaderboard,
  PromiseItem, ProposalItem,
} from '../api/civic';

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-zinc-400 bg-zinc-800',
  in_progress: 'text-blue-400 bg-blue-500/15',
  partially_fulfilled: 'text-amber-400 bg-amber-500/15',
  fulfilled: 'text-emerald-400 bg-emerald-500/15',
  broken: 'text-red-400 bg-red-500/15',
  retired: 'text-zinc-500 bg-zinc-800',
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
      <div
        className="h-full bg-amber-500 rounded-full transition-all"
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function PromiseCard({ item }: { item: PromiseItem }) {
  const sc = STATUS_COLORS[item.status] || STATUS_COLORS.pending;
  return (
    <Link
      to={`/civic/promises/${item.id}`}
      className="block bg-zinc-900/60 border border-white/10 rounded-xl p-4 hover:border-amber-500/30 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors line-clamp-2">
          {item.title}
        </h3>
        <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded ${sc}`} style={{ fontFamily: 'Oswald, sans-serif' }}>
          {item.status.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-500 mb-3">
        <span className="font-mono">{item.person_name || item.person_id}</span>
        {item.category && <span className="px-1.5 py-0.5 rounded border border-zinc-800 uppercase text-[10px]">{item.category}</span>}
      </div>
      <ProgressBar value={item.progress} />
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-zinc-600 font-mono">{item.progress}% complete</span>
        <span className="text-[10px] text-zinc-600">{item.milestones?.length || 0} milestones</span>
      </div>
    </Link>
  );
}

function ProposalCard({ item }: { item: ProposalItem }) {
  return (
    <div className="bg-zinc-900/60 border border-white/10 rounded-xl p-4 hover:border-amber-500/30 transition-colors">
      <h3 className="text-sm font-semibold text-zinc-200 mb-1 line-clamp-2">{item.title}</h3>
      <p className="text-xs text-zinc-500 line-clamp-2 mb-3">{item.body}</p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-emerald-500"><ThumbsUp size={12} /> {item.upvotes}</span>
          <span className="flex items-center gap-1 text-red-400"><ThumbsDown size={12} /> {item.downvotes}</span>
        </div>
        {item.category && <span className="text-[10px] text-zinc-600 uppercase">{item.category}</span>}
      </div>
    </div>
  );
}

export default function CivicHubPage() {
  const [promises, setPromises] = useState<PromiseItem[]>([]);
  const [proposals, setProposals] = useState<ProposalItem[]>([]);
  const [promiseTotal, setPromiseTotal] = useState(0);
  const [proposalTotal, setProposalTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetchPromises({ limit: 6, sort: 'hot' }),
      fetchProposals({ limit: 6, sort: 'hot' }),
    ]).then(([prom, prop]) => {
        if (cancelled) return;
      if (prom.status === 'fulfilled') { setPromises(prom.value.items); setPromiseTotal(prom.value.total); }
      if (prop.status === 'fulfilled') { setProposals(prop.value.items); setProposalTotal(prop.value.total); }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <main id="main-content" className="min-h-screen bg-slate-950 text-white">
      {/* Hero */}
      <div className="px-4 pt-14 pb-10 text-center max-w-3xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold mb-3" style={{ fontFamily: 'Oswald, sans-serif' }}>
          <span className="text-amber-400">Civic</span> Hub
        </h1>
        <p className="text-zinc-400 text-sm leading-relaxed max-w-xl mx-auto">
          Track political promises, propose policy ideas, annotate bills, and earn badges for civic participation.
          Your engagement is scored using Wilson confidence intervals — quality contributions rise to the top.
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-16">
        {/* Feature cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-12">
          {[
            { to: '/civic/promises', icon: Target, label: 'Promise Tracker', desc: 'Hold politicians accountable', color: 'text-amber-400' },
            { to: '/civic/proposals', icon: Megaphone, label: 'Proposals', desc: 'Citizen policy ideas', color: 'text-blue-400' },
            { to: '/civic/annotations', icon: BookOpen, label: 'Bill Annotations', desc: 'Annotate legislation', color: 'text-emerald-400' },
            { to: '/civic/badges', icon: Trophy, label: 'Badges', desc: 'Civic achievements', color: 'text-purple-400' },
            { to: '/civic/verify', icon: Shield, label: 'Verify', desc: 'Confirm your district', color: 'text-cyan-400' },
          ].map((f) => (
            <Link
              key={f.to}
              to={f.to}
              className="bg-zinc-900/60 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors group text-center"
            >
              <f.icon size={24} className={`mx-auto mb-2 ${f.color}`} />
              <div className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">{f.label}</div>
              <div className="text-[10px] text-zinc-600 mt-0.5">{f.desc}</div>
            </Link>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-20" aria-busy="true">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" role="status">
              <span className="sr-only">Loading civic data...</span>
            </div>
          </div>
        )}

        {!loading && (
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Promises */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2" style={{ fontFamily: 'Oswald, sans-serif' }}>
                  <Target size={18} className="text-amber-400" />
                  Promise Tracker
                  <span className="text-xs text-zinc-600 font-mono ml-1">{promiseTotal}</span>
                </h2>
                <Link to="/civic/promises" className="text-xs text-zinc-500 hover:text-amber-400 transition-colors flex items-center gap-1">
                  View all <ChevronRight size={12} />
                </Link>
              </div>
              {promises.length === 0 ? (
                <div className="text-center py-12 bg-zinc-900/40 rounded-xl border border-white/5">
                  <Target size={32} className="mx-auto text-zinc-700 mb-3" />
                  <p className="text-zinc-500 text-sm mb-1">No promises tracked yet.</p>
                  <p className="text-zinc-600 text-xs">Be the first to submit a politician's promise for accountability tracking.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {promises.map((p) => <PromiseCard key={p.id} item={p} />)}
                </div>
              )}
            </section>

            {/* Proposals */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2" style={{ fontFamily: 'Oswald, sans-serif' }}>
                  <Megaphone size={18} className="text-blue-400" />
                  Citizen Proposals
                  <span className="text-xs text-zinc-600 font-mono ml-1">{proposalTotal}</span>
                </h2>
                <Link to="/civic/proposals" className="text-xs text-zinc-500 hover:text-amber-400 transition-colors flex items-center gap-1">
                  View all <ChevronRight size={12} />
                </Link>
              </div>
              {proposals.length === 0 ? (
                <div className="text-center py-12 bg-zinc-900/40 rounded-xl border border-white/5">
                  <Megaphone size={32} className="mx-auto text-zinc-700 mb-3" />
                  <p className="text-zinc-500 text-sm mb-1">No proposals yet.</p>
                  <p className="text-zinc-600 text-xs">Submit a policy proposal and let the community vote on it.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {proposals.map((p) => <ProposalCard key={p.id} item={p} />)}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
