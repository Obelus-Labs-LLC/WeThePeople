import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, ShieldCheck, MapPin, CheckCircle2 } from 'lucide-react';
import { fetchVerificationStatus, verifyResidence } from '../api/civic';
import { useAuth } from '../contexts/AuthContext';
import { CivicSectorHeader } from '../components/SectorHeader';

const LEVEL_INFO = [
  { label: 'Unverified', desc: 'Email confirmed. Basic access.', color: 'text-zinc-500', bg: 'bg-zinc-800' },
  { label: 'Residence Verified', desc: 'Zip code confirmed. District-specific content unlocked.', color: 'text-amber-400', bg: 'bg-amber-500/15' },
  { label: 'Document Verified', desc: 'Full identity verified. Maximum trust level.', color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
];

export default function CivicVerifyPage() {
  const { isAuthenticated } = useAuth();
  const [level, setLevel] = useState(0);
  const [verifiedState, setVerifiedState] = useState<string | null>(null);
  const [verifiedZip, setVerifiedZip] = useState<string | null>(null);
  const [zip, setZip] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) return;
    fetchVerificationStatus()
      .then((data) => {
        if (cancelled) return;
        setLevel(data.level);
        setVerifiedState(data.verified_state);
        setVerifiedZip(data.verified_zip);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const handleVerify = async () => {
    if (!zip.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await verifyResidence(zip.trim());
      setMessage(res.message);
      setLevel(res.level);
      setVerifiedState(res.state);
      setVerifiedZip(res.zip);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    }
    setSubmitting(false);
  };

  return (
    <main id="main-content" className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <CivicSectorHeader />
      </div>
      <div className="max-w-2xl mx-auto px-4 py-10 sm:py-14">
        <Link to="/civic" className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-amber-400 transition-colors mb-6">
          <ArrowLeft size={14} /> Civic Hub
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <Shield size={28} className="text-cyan-400" />
          <h1 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: 'Oswald, sans-serif' }}>
            Citizen <span className="text-cyan-400">Verification</span>
          </h1>
        </div>
        <p className="text-zinc-500 text-sm mb-8">
          Verify your identity to unlock district-specific features and increase the weight of your civic participation.
        </p>

        {/* Tier ladder */}
        <div className="space-y-3 mb-10">
          {LEVEL_INFO.map((info, i) => {
            const active = level >= i;
            return (
              <div key={i} className={`flex items-center gap-4 rounded-xl p-4 border transition-all ${active ? `${info.bg} border-white/10` : 'bg-zinc-900/30 border-white/5 opacity-50'}`}>
                <div className={`shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${active ? info.bg : 'bg-zinc-800'}`}>
                  {active ? <CheckCircle2 size={20} className={info.color} /> : <span className="text-zinc-600 font-bold">{i}</span>}
                </div>
                <div>
                  <div className={`text-sm font-semibold ${active ? info.color : 'text-zinc-600'}`}>{info.label}</div>
                  <div className="text-xs text-zinc-500">{info.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        {!isAuthenticated ? (
          <div className="text-center py-8 bg-zinc-900/40 rounded-xl border border-white/5">
            <Shield size={32} className="mx-auto text-zinc-700 mb-3" />
            <p className="text-zinc-500 text-sm mb-3">You must be logged in to verify your identity.</p>
            <Link to="/login" className="text-amber-400 text-sm hover:underline">Log in</Link>
          </div>
        ) : level >= 1 ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 text-center">
            <ShieldCheck size={32} className="mx-auto text-emerald-400 mb-3" />
            <p className="text-emerald-400 font-semibold mb-1">Residence Verified</p>
            <p className="text-zinc-400 text-sm">
              {verifiedZip && <span className="font-mono">{verifiedZip}</span>}
              {verifiedState && <span> — {verifiedState}</span>}
            </p>
            <p className="text-zinc-600 text-xs mt-3">District-specific features are unlocked.</p>
          </div>
        ) : (
          <div className="bg-zinc-900/60 border border-white/10 rounded-xl p-6">
            <h2 className="text-sm font-bold text-zinc-300 mb-3 flex items-center gap-2">
              <MapPin size={14} className="text-amber-400" />
              Verify Your Residence
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              Enter your zip code to confirm your congressional district. This unlocks district-specific representative data and increases the weight of your votes.
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="Enter zip code"
                className="flex-1 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
                maxLength={5}
              />
              <button
                onClick={handleVerify}
                disabled={zip.length < 5 || submitting}
                className="px-5 py-2.5 bg-amber-500 text-black font-bold text-sm rounded-lg uppercase tracking-wider hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ fontFamily: 'Oswald, sans-serif' }}
              >
                {submitting ? 'Verifying...' : 'Verify'}
              </button>
            </div>
            {message && <p className="text-emerald-400 text-sm mt-3">{message}</p>}
            {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
          </div>
        )}
      </div>
    </main>
  );
}
