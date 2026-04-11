import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useParams } from 'react-router-dom';
import {
  MapPin, Search, AlertTriangle, TrendingUp, TrendingDown,
  Users, Shield, DollarSign, Clock, ExternalLink, Share2,
  ChevronDown, ChevronUp, AlertCircle, Building2, Vote,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiBaseUrl } from '../api/client';

// ── Types ──

interface RedFlags {
  anomaly_count: number;
  late_disclosures: number;
  committee_stock_overlaps: number;
  top_anomaly: { title: string; score: number; pattern_type: string } | null;
}

interface Trade {
  ticker: string | null;
  asset_name: string | null;
  transaction_type: string;
  amount_range: string | null;
  transaction_date: string | null;
  disclosure_date: string | null;
  reporting_gap: string | null;
  owner: string | null;
}

interface Donor {
  entity_id: string;
  entity_type: string;
  pac_name: string | null;
  total_amount: number;
  donation_count: number;
}

interface CommitteeInfo {
  committee_name: string;
  committee_chamber: string;
  role: string;
  thomas_id: string;
}

interface AnomalyInfo {
  pattern_type: string;
  title: string;
  score: number;
  description: string | null;
  detected_at: string | null;
}

interface VoteInfo {
  question: string;
  vote_date: string | null;
  result: string | null;
  position: string | null;
  related_bill: string | null;
}

interface Representative {
  person_id: string;
  name: string;
  party: string;
  chamber: string;
  state: string;
  photo_url: string | null;
  bioguide_id: string;
  red_flags: RedFlags;
  trades: Trade[];
  donors: Donor[];
  committees: CommitteeInfo[];
  anomalies: AnomalyInfo[];
  votes: VoteInfo[];
}

interface LookupResponse {
  zip_code: string;
  state: string;
  representative_count: number;
  representatives: Representative[];
  generated_at: string;
}

// ── Constants ──

const PARTY_COLORS: Record<string, string> = { D: '#3B82F6', R: '#EF4444', I: '#A855F7' };
const PARTY_BG: Record<string, string> = { D: 'rgba(59,130,246,0.12)', R: 'rgba(239,68,68,0.12)', I: 'rgba(168,85,247,0.12)' };

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico',
};

// ── Helpers ──

function partyColor(party: string): string {
  return PARTY_COLORS[party?.charAt(0)] || '#6B7280';
}

function partyBg(party: string): string {
  return PARTY_BG[party?.charAt(0)] || 'rgba(107,114,128,0.12)';
}

function partyLabel(party: string): string {
  const map: Record<string, string> = { D: 'Democrat', R: 'Republican', I: 'Independent' };
  return map[party?.charAt(0)] || party;
}

function chamberLabel(chamber: string): string {
  if (!chamber) return '';
  const c = chamber.toLowerCase();
  if (c.includes('senate') || c === 'upper') return 'Senator';
  return 'Representative';
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function tradeIcon(type: string) {
  const t = type?.toLowerCase();
  if (t === 'purchase' || t === 'buy') return <TrendingUp size={14} className="text-emerald-400" />;
  if (t === 'sale' || t === 'sell' || t === 'sale (full)' || t === 'sale (partial)') return <TrendingDown size={14} className="text-red-400" />;
  return <TrendingUp size={14} className="text-white/30" />;
}

function totalRedFlags(flags: RedFlags): number {
  return flags.anomaly_count + flags.late_disclosures + flags.committee_stock_overlaps;
}

// ── Page ──

export default function ZipLookupPage() {
  const [searchParams] = useSearchParams();
  const [zip, setZip] = useState('');
  const [data, setData] = useState<LookupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const doSearch = async (zipCode: string) => {
    const cleaned = zipCode.trim().replace(/\D/g, '').slice(0, 5);
    if (cleaned.length < 5) return;

    setZip(cleaned);
    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const res = await fetch(`${getApiBaseUrl()}/lookup/${cleaned}`);
      if (res.status === 404) {
        setError('No data found for this zip code. Please check and try again.');
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: LookupResponse = await res.json();
      setData(json);
    } catch {
      setError('Unable to load data. Please try again.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // Auto-search from URL param
  useEffect(() => {
    const urlZip = searchParams.get('zip');
    if (urlZip && urlZip.replace(/\D/g, '').length === 5) {
      setZip(urlZip.replace(/\D/g, '').slice(0, 5));
      doSearch(urlZip);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(zip);
    // Update URL without reload
    const url = new URL(window.location.href);
    url.searchParams.set('zip', zip.replace(/\D/g, '').slice(0, 5));
    window.history.replaceState({}, '', url.toString());
  };

  const isValidZip = zip.trim().replace(/\D/g, '').length >= 5;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Subtle gradient bg */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/[0.03] rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-600/[0.02] rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10 lg:px-12 lg:py-14">
        {/* Nav */}
        <motion.nav
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12 flex items-center justify-between"
        >
          <Link to="/" className="font-heading text-sm font-bold tracking-wider text-white/50 hover:text-white transition-colors no-underline">
            WeThePeople
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/politics" className="font-body text-xs text-white/40 hover:text-white transition-colors no-underline">
              Dashboard
            </Link>
            <Link to="/politics/people" className="font-body text-xs text-white/40 hover:text-white transition-colors no-underline">
              All Members
            </Link>
          </div>
        </motion.nav>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mb-12 text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/5 px-4 py-1.5 mb-6">
            <Shield size={14} className="text-amber-400" />
            <span className="font-mono text-xs text-amber-400/80">Accountability Tool</span>
          </div>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-white lg:text-5xl xl:text-6xl">
            What are your representatives{' '}
            <span className="text-amber-400">doing</span>?
          </h1>
          <p className="mt-4 max-w-2xl mx-auto font-body text-base text-white/40 leading-relaxed">
            Enter your zip code to see trades, donors, committee conflicts, voting records,
            and anomalies for every representative in your state.
          </p>
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mb-14"
        >
          <form onSubmit={handleSubmit} className="flex gap-3 max-w-xl mx-auto">
            <div className="relative flex-1">
              <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-400/40" />
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="Enter your zip code"
                maxLength={10}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-12 py-4 font-mono text-xl text-white placeholder:text-white/20 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/20 transition-all tracking-widest"
              />
            </div>
            <button
              type="submit"
              disabled={!isValidZip || loading}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-8 py-4 font-body text-sm font-bold text-slate-950 transition-all hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Search size={16} />
              Look Up
            </button>
          </form>
        </motion.div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            <p className="font-body text-sm text-white/30">Looking up your representatives...</p>
          </div>
        )}

        {/* Error */}
        {!loading && searched && error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-red-500/20 bg-red-500/5 py-12 text-center max-w-xl mx-auto"
          >
            <AlertCircle size={40} className="mx-auto mb-4 text-red-400/50" />
            <p className="font-body text-sm text-red-300">{error}</p>
          </motion.div>
        )}

        {/* Results */}
        {!loading && data && data.representatives.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
            {/* State header */}
            <div className="mb-8 text-center">
              <p className="font-mono text-xs text-white/30 mb-1">
                {data.representative_count} representative{data.representative_count !== 1 ? 's' : ''} found
              </p>
              <h2 className="font-heading text-2xl font-bold text-white">
                {STATE_NAMES[data.state] || data.state}
              </h2>
              <p className="font-mono text-xs text-white/20 mt-1">Zip code {data.zip_code}</p>
            </div>

            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 max-w-3xl mx-auto">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-400/60" />
              <p className="font-body text-xs text-white/40 leading-relaxed">
                <span className="font-semibold text-white/50">State-level lookup</span> — Showing all senators and House members for your state.
                District-level matching is coming soon.
              </p>
            </div>

            {/* Rep cards */}
            <div className="mt-8 space-y-6">
              {data.representatives.map((rep, idx) => (
                <motion.div
                  key={rep.person_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: idx * 0.08 }}
                >
                  <RepCard rep={rep} zip={data.zip_code} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* No results */}
        {!loading && searched && data && data.representatives.length === 0 && !error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-white/10 bg-white/[0.02] py-16 text-center max-w-xl mx-auto"
          >
            <Users size={40} className="mx-auto mb-4 text-white/10" />
            <p className="font-body text-sm text-white/40">
              No tracked representatives found for {STATE_NAMES[data.state] || data.state}.
            </p>
            <Link
              to="/politics/people"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-5 py-2.5 font-body text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition-colors no-underline"
            >
              <Users size={14} />
              Browse All Members
            </Link>
          </motion.div>
        )}

        {/* Footer */}
        <div className="mt-20 border-t border-white/5 pt-6 flex items-center justify-between">
          <Link to="/politics" className="font-body text-sm text-white/30 hover:text-white transition-colors no-underline">
            Politics Dashboard
          </Link>
          <span className="font-mono text-[10px] text-white/10">WeThePeople</span>
        </div>
      </div>
    </div>
  );
}


// ── Rep Card (expanded, with sections) ──

function RepCard({ rep, zip }: { rep: Representative; zip: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const color = partyColor(rep.party);
  const flags = totalRedFlags(rep.red_flags);

  // Cleanup copy timer on unmount
  React.useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/lookup?zip=${zip}`;
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Header — always visible */}
      <div
        className="flex items-center gap-5 px-6 py-5 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Photo */}
        {rep.photo_url ? (
          <img
            src={rep.photo_url}
            alt={rep.name}
            className="h-16 w-16 rounded-full object-cover ring-2 ring-white/10 shrink-0"
          />
        ) : (
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full font-heading text-lg font-bold text-white ring-2 ring-white/10 shrink-0"
            style={{ backgroundColor: `${color}33` }}
          >
            {initials(rep.name)}
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-heading text-lg font-bold text-white truncate">
              {rep.name}
            </h3>
            <span
              className="rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: `${color}20`, color }}
            >
              {rep.party}
            </span>
            <span className="rounded-full bg-white/5 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-white/40">
              {chamberLabel(rep.chamber)}
            </span>
          </div>
          <p className="mt-1 font-mono text-xs text-white/25">
            {rep.state} &middot; {rep.chamber === 'senate' ? 'U.S. Senate' : 'U.S. House'}
          </p>
        </div>

        {/* Red flags badge */}
        {flags > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 shrink-0">
            <AlertTriangle size={14} className="text-amber-400" />
            <span className="font-mono text-xs font-bold text-amber-400">{flags}</span>
            <span className="font-body text-[10px] text-amber-400/60 hidden sm:inline">flag{flags !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Quick stats */}
        <div className="hidden md:flex items-center gap-4 shrink-0">
          {rep.trades.length > 0 && (
            <div className="text-center">
              <p className="font-mono text-sm font-bold text-white">{rep.trades.length}</p>
              <p className="font-body text-[10px] text-white/25">trades</p>
            </div>
          )}
          {rep.donors.length > 0 && (
            <div className="text-center">
              <p className="font-mono text-sm font-bold text-white">{rep.donors.length}</p>
              <p className="font-body text-[10px] text-white/25">donors</p>
            </div>
          )}
          {rep.committees.length > 0 && (
            <div className="text-center">
              <p className="font-mono text-sm font-bold text-white">{rep.committees.length}</p>
              <p className="font-body text-[10px] text-white/25">committees</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleShare}
            className="p-2 rounded-lg border border-white/5 hover:border-white/10 text-white/30 hover:text-white/60 transition-colors"
            title="Copy share link"
          >
            <Share2 size={14} />
          </button>
          {copied && (
            <span className="font-mono text-[10px] text-amber-400 animate-pulse">Copied!</span>
          )}
          {expanded ? (
            <ChevronUp size={18} className="text-white/20" />
          ) : (
            <ChevronDown size={18} className="text-white/20" />
          )}
        </div>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/5 px-6 py-5 space-y-6">
              {/* Red Flags section */}
              {flags > 0 && (
                <Section title="Red Flags" icon={<AlertTriangle size={14} className="text-amber-400" />} accent="amber">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {rep.red_flags.anomaly_count > 0 && (
                      <FlagPill label="Anomalies detected" count={rep.red_flags.anomaly_count} />
                    )}
                    {rep.red_flags.late_disclosures > 0 && (
                      <FlagPill label="Late trade disclosures" count={rep.red_flags.late_disclosures} />
                    )}
                    {rep.red_flags.committee_stock_overlaps > 0 && (
                      <FlagPill label="Committee-stock overlaps" count={rep.red_flags.committee_stock_overlaps} />
                    )}
                  </div>
                  {rep.red_flags.top_anomaly && (
                    <div className="mt-3 rounded-lg border border-amber-500/10 bg-amber-500/5 px-4 py-3">
                      <p className="font-body text-xs text-amber-300/80">{rep.red_flags.top_anomaly.title}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="font-mono text-[10px] text-amber-400/50">
                          Score: {rep.red_flags.top_anomaly.score.toFixed(1)}/10
                        </span>
                        <span className="font-mono text-[10px] text-white/20">
                          {rep.red_flags.top_anomaly.pattern_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {/* Recent Trades */}
              <Section title="Recent Trades" icon={<TrendingUp size={14} className="text-emerald-400" />} accent="emerald">
                {rep.trades.length === 0 ? (
                  <EmptyState text="No recent trades in the last 90 days" />
                ) : (
                  <div className="space-y-2">
                    {rep.trades.map((t, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg bg-white/[0.02] px-4 py-2.5">
                        {tradeIcon(t.transaction_type)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-white">
                              {t.ticker || 'N/A'}
                            </span>
                            <span className={`font-mono text-[10px] uppercase ${
                              t.transaction_type?.toLowerCase().includes('purchase') ? 'text-emerald-400' :
                              t.transaction_type?.toLowerCase().includes('sale') ? 'text-red-400' : 'text-white/30'
                            }`}>
                              {t.transaction_type}
                            </span>
                          </div>
                          {t.asset_name && t.asset_name !== t.ticker && (
                            <p className="font-body text-[10px] text-white/25 truncate">{t.asset_name}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-xs text-white/60">{t.amount_range || '--'}</p>
                          <p className="font-mono text-[10px] text-white/20">{formatDate(t.transaction_date)}</p>
                        </div>
                        {t.reporting_gap && (
                          <div className="shrink-0 flex items-center gap-1" title={`Reporting gap: ${t.reporting_gap}`}>
                            <Clock size={10} className="text-white/20" />
                            <span className={`font-mono text-[10px] ${
                              parseInt(t.reporting_gap) > 45 ? 'text-amber-400' : 'text-white/20'
                            }`}>
                              {t.reporting_gap}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Top Donors */}
              <Section title="Top Donors" icon={<DollarSign size={14} className="text-blue-400" />} accent="blue">
                {rep.donors.length === 0 ? (
                  <EmptyState text="No donor data available" />
                ) : (
                  <div className="space-y-2">
                    {rep.donors.map((d, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg bg-white/[0.02] px-4 py-2.5">
                        <Building2 size={14} className="text-blue-400/40 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm font-medium text-white truncate">
                            {d.pac_name || d.entity_id}
                          </p>
                          <p className="font-mono text-[10px] text-white/25">
                            {d.entity_type} &middot; {d.donation_count} contribution{d.donation_count !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <span className="font-mono text-sm font-bold text-blue-400 shrink-0">
                          {formatCurrency(d.total_amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Committees */}
              <Section title="Committees" icon={<Users size={14} className="text-purple-400" />} accent="purple">
                {rep.committees.length === 0 ? (
                  <EmptyState text="No committee data available" />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {rep.committees.map((c, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                      >
                        <p className="font-body text-xs text-white/70">{c.committee_name}</p>
                        <p className="font-mono text-[10px] text-white/20 mt-0.5">
                          {c.role !== 'member' ? c.role.replace(/_/g, ' ') + ' \u00b7 ' : ''}{c.committee_chamber}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Recent Votes */}
              <Section title="Recent Votes" icon={<Vote size={14} className="text-cyan-400" />} accent="cyan">
                {rep.votes.length === 0 ? (
                  <EmptyState text="No recent votes in the last 90 days" />
                ) : (
                  <div className="space-y-2">
                    {rep.votes.map((v, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg bg-white/[0.02] px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-xs text-white/70 leading-relaxed">
                            {v.question}
                          </p>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            {v.related_bill && (
                              <span className="font-mono text-[10px] text-cyan-400/60">{v.related_bill}</span>
                            )}
                            <span className="font-mono text-[10px] text-white/20">{formatDate(v.vote_date)}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`font-mono text-xs font-bold ${
                            v.position?.toLowerCase() === 'yea' || v.position?.toLowerCase() === 'yes' ? 'text-emerald-400' :
                            v.position?.toLowerCase() === 'nay' || v.position?.toLowerCase() === 'no' ? 'text-red-400' :
                            'text-white/30'
                          }`}>
                            {v.position || '--'}
                          </span>
                          {v.result && (
                            <p className="font-mono text-[10px] text-white/20 mt-0.5">{v.result}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Profile link */}
              <div className="flex items-center justify-between pt-2">
                <Link
                  to={`/politics/people/${rep.person_id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2 font-body text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition-colors no-underline"
                >
                  <ExternalLink size={12} />
                  Full Profile
                </Link>
                <Link
                  to={`/politics/states/${rep.state.toLowerCase()}`}
                  className="inline-flex items-center gap-2 font-body text-xs text-white/30 hover:text-white/60 transition-colors no-underline"
                >
                  <MapPin size={12} />
                  {rep.state} State Page
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ── Sub-components ──

function Section({
  title,
  icon,
  accent,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h4 className="font-heading text-sm font-semibold text-white/70">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function FlagPill({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/10 bg-amber-500/5 px-3 py-2">
      <span className="font-mono text-sm font-bold text-amber-400">{count}</span>
      <span className="font-body text-[10px] text-amber-400/60">{label}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.01] py-4 text-center">
      <p className="font-body text-xs text-white/20">{text}</p>
    </div>
  );
}
