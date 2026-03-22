import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Search, Users, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { getApiBaseUrl } from '../api/client';
import { PoliticsSectorHeader } from '../components/SectorHeader';

// ── Types ──

interface Representative {
  person_id: string;
  display_name: string;
  party: string;
  chamber: string;
  state: string;
  district: string | null;
  photo_url: string | null;
  is_active: boolean;
}

interface RepLookupResponse {
  zip: string;
  total: number;
  representatives: Representative[];
}

// ── Constants ──

const PARTY_COLORS: Record<string, string> = { D: '#3B82F6', R: '#EF4444', I: '#A855F7' };

// ── Helpers ──

function partyColor(party: string): string {
  return PARTY_COLORS[party?.charAt(0)] || '#6B7280';
}

function partyLabel(party: string): string {
  const map: Record<string, string> = { D: 'Democrat', R: 'Republican', I: 'Independent' };
  return map[party?.charAt(0)] || party;
}

function chamberLabel(chamber: string): string {
  if (!chamber) return '';
  const c = chamber.toLowerCase();
  if (c.includes('senate') || c === 'upper') return 'Senate';
  return 'House';
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ── Page ──

export default function RepresentativeLookupPage() {
  const [zip, setZip] = useState('');
  const [submittedZip, setSubmittedZip] = useState('');
  const [reps, setReps] = useState<Representative[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataUnavailable, setDataUnavailable] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = zip.trim().replace(/\D/g, '').slice(0, 5);
    if (cleaned.length < 5) return;

    setLoading(true);
    setError(null);
    setDataUnavailable(false);
    setSearched(true);
    setSubmittedZip(cleaned);

    try {
      const res = await fetch(`${getApiBaseUrl()}/representatives?zip=${cleaned}`);
      if (res.status === 404) {
        setDataUnavailable(true);
        setReps([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RepLookupResponse = await res.json();
      setReps(data.representatives || []);
    } catch (err: any) {
      // Network error or non-existent endpoint
      setError('Unable to load data. Please try again.');
      setReps([]);
    } finally {
      setLoading(false);
    }
  };

  const isValidZip = zip.trim().replace(/\D/g, '').length >= 5;

  return (
    <div className="min-h-screen">
      <div className="relative z-10 mx-auto max-w-[1400px] px-8 py-10 lg:px-16 lg:py-14">
        {/* Nav */}
        <motion.nav
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <PoliticsSectorHeader />
        </motion.nav>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-10"
        >
          <p className="font-heading text-xs font-semibold tracking-[0.3em] text-blue-400 uppercase mb-3">
            Find Your Rep
          </p>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-white lg:text-5xl">
            Who Represents You?
          </h1>
          <p className="mt-3 max-w-2xl font-body text-base text-white/40 leading-relaxed">
            Enter your zip code to find your congressional representatives. See their voting records, legislative activity, and financial data.
          </p>
        </motion.div>

        {/* Search form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-10"
        >
          <form onSubmit={handleSubmit} className="flex gap-3 max-w-lg">
            <div className="relative flex-1">
              <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="Enter your zip code (e.g. 90210)"
                maxLength={10}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-12 py-3.5 font-mono text-lg text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none transition-colors tracking-wider"
              />
            </div>
            <button
              type="submit"
              disabled={!isValidZip || loading}
              className="flex items-center gap-2 rounded-xl bg-blue-500 px-6 py-3.5 font-body text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Search size={16} />
              Look Up
            </button>
          </form>
        </motion.div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}

        {/* Error state */}
        {!loading && searched && error && !dataUnavailable && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-xl border border-red-500/20 bg-red-500/5 py-12 text-center"
          >
            <AlertCircle size={40} className="mx-auto mb-4 text-red-400/50" />
            <p className="font-body text-sm text-red-300">{error}</p>
          </motion.div>
        )}

        {/* Data unavailable / coming soon */}
        {!loading && searched && dataUnavailable && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-xl border border-white/10 bg-white/[0.02] py-16 text-center"
          >
            <MapPin size={48} className="mx-auto mb-5 text-blue-500/30" />
            <h2 className="font-heading text-2xl font-bold text-white mb-3">
              Zip Code Lookup Coming Soon
            </h2>
            <p className="max-w-md mx-auto font-body text-sm text-white/40 leading-relaxed">
              We're building zip code-based representative lookup using census and redistricting data.
              In the meantime, you can browse all members on the People page.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Link
                to="/politics/people"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 font-body text-sm font-semibold text-white transition-colors hover:bg-blue-600 no-underline"
              >
                <Users size={16} />
                Browse All Members
              </Link>
              <Link
                to="/politics"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-5 py-2.5 font-body text-sm font-semibold text-white/70 transition-colors hover:border-white/20 hover:text-white no-underline"
              >
                Dashboard
              </Link>
            </div>
          </motion.div>
        )}

        {/* No results */}
        {!loading && searched && !dataUnavailable && reps.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-xl border border-white/10 bg-white/[0.02] py-16 text-center"
          >
            <AlertCircle size={40} className="mx-auto mb-4 text-white/10" />
            <p className="font-body text-sm text-white/40">
              No representatives found for zip code {submittedZip}.
            </p>
            <p className="mt-1 font-body text-xs text-white/20">
              Please check the zip code and try again.
            </p>
          </motion.div>
        )}

        {/* Results */}
        {!loading && reps.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <p className="mb-2 font-mono text-xs text-white/30">
              {reps.length} representative{reps.length !== 1 ? 's' : ''} for {submittedZip}
            </p>
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-blue-400/60" />
              <p className="font-body text-xs text-white/40 leading-relaxed">
                <span className="font-semibold text-white/50">State-level lookup</span> — Showing all senators and House members for your state.
                District-level matching is not yet available, so some House members shown may not represent your specific congressional district.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {reps.map((rep, idx) => (
                <motion.div
                  key={rep.person_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.1 }}
                >
                  <RepCard rep={rep} />
                </motion.div>
              ))}
            </div>

            {/* State legislature link */}
            {reps.length > 0 && reps[0].state && (
              <div className="mt-6 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 flex items-center justify-between">
                <div>
                  <p className="font-body text-sm font-semibold text-white/70">
                    Explore {reps[0].state} State Legislature
                  </p>
                  <p className="font-body text-xs text-white/30 mt-0.5">
                    Browse state-level legislators and bills
                  </p>
                </div>
                <Link
                  to={`/politics/states/${reps[0].state.toLowerCase()}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 font-body text-xs font-semibold text-cyan-400 hover:bg-cyan-500/20 transition-colors no-underline"
                >
                  <MapPin size={14} />
                  State Data
                </Link>
              </div>
            )}
          </motion.div>
        )}

        {/* Footer */}
        <div className="mt-16 border-t border-white/5 pt-6 flex items-center justify-between">
          <Link to="/politics" className="font-body text-sm text-white/50 hover:text-white transition-colors no-underline">
            &larr; Politics Dashboard
          </Link>
          <span className="font-mono text-[10px] text-white/15">WeThePeople</span>
        </div>
      </div>
    </div>
  );
}

// ── Rep Card ──

function RepCard({ rep }: { rep: Representative }) {
  const color = partyColor(rep.party);

  return (
    <Link
      to={`/politics/people/${rep.person_id}`}
      className="no-underline block"
    >
      <div
        className="group rounded-xl border border-white/5 p-6 transition-all duration-300 hover:border-white/10"
        style={{ backgroundColor: '#0F172A' }}
      >
        <div className="flex items-center gap-4">
          {rep.photo_url ? (
            <img
              src={rep.photo_url}
              alt={rep.display_name}
              className="h-16 w-16 rounded-full object-cover ring-2 ring-white/10"
            />
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full font-heading text-lg font-bold text-white ring-2 ring-white/10"
              style={{ backgroundColor: `${color}33` }}
            >
              {initials(rep.display_name)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-body text-lg font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
              {rep.display_name}
            </h3>
            <p className="font-mono text-xs text-white/30 mt-0.5">
              {rep.state}{rep.district ? `, District ${rep.district}` : ''}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-3 py-1 font-body text-xs font-bold uppercase"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {partyLabel(rep.party)}
          </span>
          <span className="rounded-full bg-white/5 px-3 py-1 font-body text-xs font-bold uppercase text-white/50">
            {chamberLabel(rep.chamber)}
          </span>
          {chamberLabel(rep.chamber) === 'Senate' && (
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-body text-[10px] font-bold text-emerald-400">
              Your Senator
            </span>
          )}
          {!rep.is_active && (
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 font-body text-[10px] text-red-400">
              Inactive
            </span>
          )}
        </div>

        {/* Contribute to campaign */}
        <a
          href={(() => {
            const q = encodeURIComponent(rep.display_name);
            const p = rep.party?.charAt(0);
            if (p === 'D') return `https://secure.actblue.com/search?q=${q}`;
            if (p === 'R') return `https://secure.winred.com/search?query=${q}`;
            return `https://www.fec.gov/data/candidates/?search=${q}`;
          })()}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-4 flex items-center justify-center gap-2 rounded-lg py-2 font-body text-xs font-semibold transition-colors"
          style={{
            backgroundColor: `${color}10`,
            color,
            borderWidth: 1,
            borderColor: `${color}20`,
          }}
        >
          ♥ Contribute to Campaign
        </a>
      </div>
    </Link>
  );
}
