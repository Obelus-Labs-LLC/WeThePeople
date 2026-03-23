import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MapPin, Check, ArrowRight, AlertTriangle, Vote, TrendingUp, Scale, Loader2 } from 'lucide-react';
import { getApiBaseUrl } from '../api/client';
import Footer from '../components/Footer';

const API_BASE = getApiBaseUrl();

const SECTOR_OPTIONS = [
  { value: 'politics', label: 'Politics', checked: true },
  { value: 'finance', label: 'Finance', checked: true },
  { value: 'health', label: 'Health', checked: true },
  { value: 'technology', label: 'Technology', checked: true },
  { value: 'energy', label: 'Energy', checked: true },
  { value: 'transportation', label: 'Transportation', checked: true },
];

interface DigestPreviewRep {
  name: string;
  party: string;
  chamber: string;
  person_id: string;
  photo_url?: string;
  trades: Array<{
    ticker: string;
    asset_name?: string;
    transaction_type: string;
    amount_range: string;
    transaction_date: string | null;
  }>;
  votes: Array<{
    question: string;
    vote_date: string | null;
    result: string;
    position: string;
    related_bill: string | null;
  }>;
  anomalies: Array<{
    pattern_type: string;
    title: string;
    score: number;
  }>;
}

interface DigestPreview {
  zip_code: string;
  state: string;
  representatives: DigestPreviewRep[];
  generated_at: string;
  message?: string;
}

export default function DigestSignupPage() {
  const [email, setEmail] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [sectors, setSectors] = useState<Record<string, boolean>>(
    Object.fromEntries(SECTOR_OPTIONS.map((s) => [s.value, s.checked]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [preview, setPreview] = useState<DigestPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const selectedSectors = Object.entries(sectors)
      .filter(([, v]) => v)
      .map(([k]) => k);

    try {
      const res = await fetch(`${API_BASE}/digest/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, zip_code: zipCode, sectors: selectedSectors }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Subscription failed');
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const loadPreview = async () => {
    const cleaned = zipCode.replace(/\D/g, '').slice(0, 5);
    if (cleaned.length !== 5) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch(`${API_BASE}/digest/preview/${cleaned}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Preview failed');
      setPreview(data);
    } catch (err: any) {
      setPreviewError(err.message || 'Could not load preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const partyColor = (p: string) => {
    if (p === 'D') return 'text-blue-400';
    if (p === 'R') return 'text-red-400';
    return 'text-slate-400';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-6 shadow-lg shadow-blue-600/30">
            <Mail className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold mb-4">Your Weekly Influence Report</h1>
          <p className="text-lg text-slate-400 max-w-xl mx-auto">
            Get a personalized email about what your representatives did this week
            — trades, votes, lobbying, and more.
          </p>
        </div>

        {/* Success state */}
        {submitted ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
            <Check className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">You're subscribed!</h2>
            <p className="text-slate-400">
              Check your email to verify your subscription. Once verified, you'll receive your first weekly digest.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 mt-6 text-blue-400 hover:text-blue-300 transition-colors no-underline"
            >
              <ArrowRight className="w-4 h-4" /> Back to home
            </Link>
          </div>
        ) : (
          <>
            {/* Subscription form */}
            <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-white/[0.03] p-8 mb-8">
              <div className="grid sm:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Zip code</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      maxLength={5}
                      pattern="[0-9]{5}"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                      placeholder="90210"
                      className="w-full pl-10 pr-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Sector checkboxes */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-400 mb-3">Sectors to track</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {SECTOR_OPTIONS.map((s) => (
                    <label
                      key={s.value}
                      className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 cursor-pointer transition-colors ${
                        sectors[s.value]
                          ? 'border-blue-500/30 bg-blue-500/10 text-white'
                          : 'border-white/10 bg-white/[0.02] text-white/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={sectors[s.value]}
                        onChange={(e) => setSectors({ ...sectors, [s.value]: e.target.checked })}
                        className="sr-only"
                      />
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          sectors[s.value] ? 'bg-blue-500 border-blue-500' : 'border-white/20'
                        }`}
                      >
                        {sectors[s.value] && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="text-sm font-medium">{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {submitError && (
                <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !email || zipCode.length !== 5}
                className="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Subscribing...</>
                ) : (
                  <><Mail className="w-5 h-5" /> Subscribe to Weekly Digest</>
                )}
              </button>
            </form>

            {/* Preview section */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8">
              <h3 className="text-lg font-bold text-white mb-2">Preview your digest</h3>
              <p className="text-sm text-slate-400 mb-4">
                Enter your zip code above, then click below to see a sample of what you'll receive.
              </p>
              <button
                onClick={loadPreview}
                disabled={previewLoading || zipCode.length !== 5}
                className="rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {previewLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Loading preview...</>
                ) : (
                  <>Preview for {zipCode || '?????'}</>
                )}
              </button>

              {previewError && (
                <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
                  {previewError}
                </div>
              )}

              {preview && (
                <div className="mt-6 space-y-6">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <MapPin className="w-4 h-4" />
                    <span>Zip: {preview.zip_code}</span>
                    <span className="text-white/20">|</span>
                    <span>State: {preview.state}</span>
                    <span className="text-white/20">|</span>
                    <span>{preview.representatives.length} representative{preview.representatives.length !== 1 ? 's' : ''}</span>
                  </div>

                  {preview.representatives.map((rep) => (
                    <div key={rep.person_id} className="rounded-lg border border-white/5 bg-white/[0.02] p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <Link
                          to={`/politics/people/${rep.person_id}`}
                          className="font-bold text-white hover:text-blue-400 transition-colors no-underline"
                        >
                          {rep.name}
                        </Link>
                        <span className={`text-xs font-bold ${partyColor(rep.party)}`}>
                          ({rep.party})
                        </span>
                        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/40">
                          {rep.chamber}
                        </span>
                      </div>

                      {/* Trades */}
                      {rep.trades.length > 0 && (
                        <div className="mb-3">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">
                            <TrendingUp className="w-3.5 h-3.5" /> Trades ({rep.trades.length})
                          </div>
                          <div className="space-y-1">
                            {rep.trades.slice(0, 5).map((t, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-white/60">
                                <span className={`font-bold ${t.transaction_type === 'purchase' ? 'text-green-400' : 'text-red-400'}`}>
                                  {t.transaction_type === 'purchase' ? 'BUY' : 'SELL'}
                                </span>
                                <span className="font-mono text-white/80">{t.ticker || t.asset_name}</span>
                                <span className="text-white/30">{t.amount_range}</span>
                                {t.transaction_date && <span className="text-white/20">{t.transaction_date}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Votes */}
                      {rep.votes.length > 0 && (
                        <div className="mb-3">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">
                            <Vote className="w-3.5 h-3.5" /> Votes ({rep.votes.length})
                          </div>
                          <div className="space-y-1">
                            {rep.votes.slice(0, 5).map((v, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-white/60">
                                <span className={`font-bold ${v.position === 'Yea' ? 'text-green-400' : v.position === 'Nay' ? 'text-red-400' : 'text-white/40'}`}>
                                  {v.position}
                                </span>
                                <span className="text-white/80 truncate">{v.question}</span>
                                {v.related_bill && <span className="font-mono text-white/30">{v.related_bill}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Anomalies */}
                      {rep.anomalies.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">
                            <AlertTriangle className="w-3.5 h-3.5" /> Suspicious Patterns ({rep.anomalies.length})
                          </div>
                          <div className="space-y-1">
                            {rep.anomalies.map((a, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-white/60">
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  a.score >= 8 ? 'bg-red-500/20 text-red-400' : a.score >= 6 ? 'bg-orange-500/20 text-orange-400' : 'bg-amber-500/20 text-amber-400'
                                }`}>{a.score.toFixed(0)}</span>
                                <span className="text-white/80">{a.title}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {rep.trades.length === 0 && rep.votes.length === 0 && rep.anomalies.length === 0 && (
                        <p className="text-xs text-white/30">No activity in the last 7 days</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}
