import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Target, Shield, Trophy, ChevronRight,
  ThumbsUp, ThumbsDown, Megaphone, BookOpen, Plus, X,
} from 'lucide-react';
import {
  fetchPromises, fetchProposals,
  createPromise, createProposal,
  PromiseItem, ProposalItem,
} from '../api/civic';
import { CivicSectorHeader } from '../components/SectorHeader';
import { useAuth } from '../contexts/AuthContext';

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

function ProposalSubmitForm({ onSubmitted, onCancel }: { onSubmitted: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [sector, setSector] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!title.trim() || !body.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await createProposal({ title: title.trim(), body: body.trim(), category: category || undefined, sector: sector || undefined });
      onSubmitted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed');
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-zinc-900/80 border border-blue-500/30 rounded-xl p-4 mb-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-white">New Proposal</h4>
        <button onClick={onCancel} className="text-zinc-500 hover:text-white"><X size={16} /></button>
      </div>
      <input
        type="text" value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="Short, specific title (e.g., 'Cap prescription drug markups at 200%')"
        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
        maxLength={140}
      />
      <textarea
        value={body} onChange={(e) => setBody(e.target.value)}
        placeholder="Explain the proposal: what problem it solves, what it changes, who benefits."
        rows={5}
        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none resize-none"
        maxLength={2000}
      />
      <div className="grid grid-cols-2 gap-2">
        <select value={sector} onChange={(e) => setSector(e.target.value)} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:border-blue-500 focus:outline-none">
          <option value="">Sector (optional)</option>
          <option value="politics">Politics</option><option value="finance">Finance</option><option value="health">Health</option>
          <option value="technology">Technology</option><option value="energy">Energy</option><option value="transportation">Transportation</option>
          <option value="defense">Defense</option><option value="chemicals">Chemicals</option><option value="agriculture">Agriculture</option>
          <option value="telecom">Telecom</option><option value="education">Education</option>
        </select>
        <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (e.g., healthcare)"
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none" maxLength={40} />
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white">Cancel</button>
        <button onClick={submit} disabled={!title.trim() || !body.trim() || submitting}
          className="px-4 py-1.5 bg-blue-500 text-white text-xs font-bold rounded hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider">
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </div>
  );
}

function PromiseSubmitForm({ onSubmitted, onCancel }: { onSubmitted: () => void; onCancel: () => void }) {
  const [personId, setPersonId] = useState('');
  const [personName, setPersonName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!personId.trim() || !title.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await createPromise({
        person_id: personId.trim(), person_name: personName.trim() || undefined,
        title: title.trim(), description: description.trim() || undefined,
        source_url: sourceUrl.trim() || undefined, category: category || undefined,
      });
      onSubmitted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed');
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-zinc-900/80 border border-amber-500/30 rounded-xl p-4 mb-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-white">Track a Promise</h4>
        <button onClick={onCancel} className="text-zinc-500 hover:text-white"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input type="text" value={personId} onChange={(e) => setPersonId(e.target.value)} placeholder="person_id (e.g., mitch_mcconnell)"
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none" maxLength={80} />
        <input type="text" value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Display name (optional)"
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none" maxLength={120} />
      </div>
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Promise headline (e.g., 'Repeal the ACA')"
        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none" maxLength={140} />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What did they say? What does fulfillment look like?" rows={3}
        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none resize-none" maxLength={1000} />
      <div className="grid grid-cols-2 gap-2">
        <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="Source URL (speech, tweet, interview)"
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none" />
        <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (optional)"
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none" maxLength={40} />
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white">Cancel</button>
        <button onClick={submit} disabled={!personId.trim() || !title.trim() || submitting}
          className="px-4 py-1.5 bg-amber-500 text-black text-xs font-bold rounded hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider">
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </div>
  );
}

export default function CivicHubPage() {
  const { isAuthenticated } = useAuth();
  const [promises, setPromises] = useState<PromiseItem[]>([]);
  const [proposals, setProposals] = useState<ProposalItem[]>([]);
  const [promiseTotal, setPromiseTotal] = useState(0);
  const [proposalTotal, setProposalTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPromiseForm, setShowPromiseForm] = useState(false);
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

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
  }, [refreshTick]);

  const onProposalSubmitted = () => { setShowProposalForm(false); setRefreshTick(x => x + 1); };
  const onPromiseSubmitted = () => { setShowPromiseForm(false); setRefreshTick(x => x + 1); };

  return (
    <main id="main-content" className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <CivicSectorHeader />
      </div>

      {/* Hero */}
      <div className="px-4 pt-6 pb-10 text-center max-w-3xl mx-auto">
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
                <div className="flex items-center gap-3">
                  {isAuthenticated && !showPromiseForm && (
                    <button onClick={() => setShowPromiseForm(true)}
                      className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold">
                      <Plus size={12} /> New
                    </button>
                  )}
                  <Link to="/civic/promises" className="text-xs text-zinc-500 hover:text-amber-400 transition-colors flex items-center gap-1">
                    View all <ChevronRight size={12} />
                  </Link>
                </div>
              </div>
              {showPromiseForm && <PromiseSubmitForm onSubmitted={onPromiseSubmitted} onCancel={() => setShowPromiseForm(false)} />}
              {!isAuthenticated && (
                <div className="text-xs text-zinc-500 mb-3">
                  <Link to="/login" className="text-amber-400 hover:underline">Log in</Link> to submit a promise.
                </div>
              )}
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
                <div className="flex items-center gap-3">
                  {isAuthenticated && !showProposalForm && (
                    <button onClick={() => setShowProposalForm(true)}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold">
                      <Plus size={12} /> New
                    </button>
                  )}
                  <Link to="/civic/proposals" className="text-xs text-zinc-500 hover:text-amber-400 transition-colors flex items-center gap-1">
                    View all <ChevronRight size={12} />
                  </Link>
                </div>
              </div>
              {showProposalForm && <ProposalSubmitForm onSubmitted={onProposalSubmitted} onCancel={() => setShowProposalForm(false)} />}
              {!isAuthenticated && (
                <div className="text-xs text-zinc-500 mb-3">
                  <Link to="/login" className="text-blue-400 hover:underline">Log in</Link> to submit a proposal.
                </div>
              )}
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
