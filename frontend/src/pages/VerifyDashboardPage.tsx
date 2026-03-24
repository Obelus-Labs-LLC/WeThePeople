import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Users, BarChart3, ArrowRight, Search, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { getDashboardStats, getVerifications, type DashboardStatsResponse, type VerificationItem } from '../api/claims';
import VerificationCard from '../components/VerificationCard';
import TierBadge from '../components/TierBadge';
import { VerifySectorHeader } from '../components/SectorHeader';

export default function VerifyDashboardPage() {
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [recent, setRecent] = useState<VerificationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<VerificationItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getDashboardStats(),
      getVerifications({ limit: 10 }),
    ])
      .then(([s, v]) => {
        setStats(s);
        setRecent(v.items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (searchQuery.length < 3) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        // Fetch a larger batch and filter client-side since backend doesn't have full-text q param
        const res = await getVerifications({ limit: 100 });
        const lowerQuery = searchQuery.toLowerCase();
        const filtered = res.items.filter((item) =>
          item.text.toLowerCase().includes(lowerQuery) ||
          (item.person_id || '').toLowerCase().includes(lowerQuery) ||
          (item.category || '').toLowerCase().includes(lowerQuery)
        );
        setSearchResults(filtered);
      } catch {
        // silently fail
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  const tierDist = stats?.tier_distribution || {};
  const totalEvaluated = stats?.total_evaluated || 0;
  const displayItems = searchQuery.length >= 3 ? searchResults : recent;

  return (
    <div className="min-h-screen px-4 py-6 sm:px-8">
      <VerifySectorHeader />

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/20">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Claim Verification</h1>
            <p className="text-sm text-slate-400">Compare what they say to what they do</p>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Claims', value: stats.total_claims.toLocaleString(), icon: BarChart3, color: 'text-emerald-400' },
            { label: 'Evaluated', value: stats.total_evaluated.toLocaleString(), icon: CheckCircle2, color: 'text-blue-400' },
            { label: 'Entities Checked', value: stats.unique_entities.toLocaleString(), icon: Users, color: 'text-violet-400' },
            { label: 'Categories', value: Object.keys(stats.category_distribution).length.toLocaleString(), icon: BarChart3, color: 'text-orange-400' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
              <div className="text-xl font-bold text-white">{s.value}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tier distribution */}
      {totalEvaluated > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5 mb-8">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Verification Distribution
          </h3>
          <div className="flex items-center gap-2 mb-3">
            {['strong', 'moderate', 'weak', 'none'].map((tier) => {
              const count = tierDist[tier] || 0;
              const pct = totalEvaluated > 0 ? (count / totalEvaluated) * 100 : 0;
              return (
                <div key={tier} className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <TierBadge tier={tier} size="sm" />
                    <span className="text-xs text-slate-400 font-mono">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5">
                    <div
                      className={`h-full rounded-full transition-all ${
                        tier === 'strong' ? 'bg-emerald-500' :
                        tier === 'moderate' ? 'bg-yellow-500' :
                        tier === 'weak' ? 'bg-orange-500' : 'bg-slate-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search + CTA */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search verifications..."
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
          />
        </div>
        <Link
          to="/verify/submit"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-600/20 no-underline shrink-0"
        >
          Submit New Verification <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Recent / Search results */}
      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
          {searchQuery.length >= 3 ? `Search Results (${searchResults.length})` : 'Recent Verifications'}
        </h3>
        {displayItems.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {displayItems.map((item) => (
              <VerificationCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-8 text-center">
            <ShieldCheck className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              {searchQuery.length >= 3
                ? 'No matching verifications found.'
                : 'No verifications yet. Submit the first one!'}
            </p>
            <Link
              to="/verify/submit"
              className="inline-flex items-center gap-1 mt-3 text-sm text-emerald-400 hover:text-emerald-300"
            >
              Verify a claim <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
