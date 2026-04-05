import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Shield, AlertTriangle, HelpCircle, CheckCircle } from 'lucide-react';
import { apiFetch } from '../api/client';

// -- Types matching the API response --

interface Evidence {
  source: string;
  source_url?: string;
  title: string;
  snippet: string;
  evidence_type?: string;
}

interface ClaimResult {
  claim_id: string;
  claim_text: string;
  category: string;
  signals?: string;
  score: number;
  status: 'supported' | 'partial' | 'unknown';
  confidence: number;
  evidence_count: number;
  evidence: Evidence[];
}

interface VerificationResult {
  claims_extracted: number;
  claims: ClaimResult[];
  source_url?: string;
  engine: string;
  summary: string;
}

// -- Verdict config --

const VERDICT_CONFIG = {
  supported: {
    label: 'SUPPORTED',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    icon: CheckCircle,
  },
  partial: {
    label: 'PARTIAL',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    icon: AlertTriangle,
  },
  unknown: {
    label: 'UNKNOWN',
    bg: 'bg-zinc-500/10',
    border: 'border-zinc-500/30',
    text: 'text-zinc-400',
    icon: HelpCircle,
  },
} as const;

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? 'text-emerald-400 border-emerald-500/30' :
    score >= 40 ? 'text-amber-400 border-amber-500/30' :
    'text-zinc-500 border-zinc-700';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border font-mono text-xs font-semibold ${color}`}>
      {score}
    </span>
  );
}

function EvidenceCard({ ev }: { ev: Evidence }) {
  return (
    <div className="bg-zinc-900/60 border border-white/10 rounded-xl p-4 card-hover">
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="text-xs font-medium text-amber-400/80 uppercase tracking-wider">
          {ev.source}
        </span>
        {ev.evidence_type && (
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-800 text-zinc-500 uppercase">
            {ev.evidence_type.replace('_', ' ')}
          </span>
        )}
      </div>
      <h4 className="text-sm font-semibold text-white mb-1.5">{ev.title}</h4>
      <p className="text-xs text-zinc-400 leading-relaxed mb-3">{ev.snippet}</p>
      {ev.source_url && (
        <a
          href={ev.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-amber-400 transition-colors"
        >
          View source
          <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}

export default function ResultsPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Data can come from navigation state (quick verify) or API fetch (saved ID)
  const stateResult = (location.state as { result?: VerificationResult })?.result;
  const [result, setResult] = useState<VerificationResult | null>(stateResult ?? null);
  const [loading, setLoading] = useState(!stateResult);
  const [error, setError] = useState('');

  useEffect(() => {
    // If we already have the result from state, no need to fetch
    if (stateResult) return;

    // For numeric IDs, fetch from the API
    if (id && id !== 'quick') {
      setLoading(true);
      apiFetch<VerificationResult>(`/api/v1/claims/${id}`)
        .then(setResult)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    } else if (!stateResult) {
      // No state data and no valid ID -- redirect home
      navigate('/');
    }
  }, [id, stateResult, navigate]);

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-amber-400 transition-colors mb-8"
          >
            <ArrowLeft size={14} />
            New Check
          </button>
          <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        </div>
      </main>
    );
  }

  if (!result) return null;

  const totalEvidence = result.claims.reduce((s, c) => s + c.evidence_count, 0);

  return (
    <main className="flex-1 px-4 py-10 sm:py-14">
      <div className="max-w-3xl mx-auto">
        {/* Back link */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-amber-400 transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          New Check
        </button>

        {/* Summary banner */}
        <div className="bg-zinc-900/60 border border-white/10 rounded-xl p-5 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={16} className="text-amber-400" />
            <span className="text-xs uppercase tracking-wider text-amber-400/80 font-medium">
              Veritas Report
            </span>
          </div>
          <p className="text-sm text-zinc-300 mb-3">{result.summary}</p>
          <div className="flex items-center gap-4 text-xs text-zinc-600">
            <span className="font-mono text-zinc-500">{result.claims_extracted}</span> claims extracted
            <span className="text-zinc-800">|</span>
            <span className="font-mono text-zinc-500">{totalEvidence}</span> evidence records
            <span className="text-zinc-800">|</span>
            engine: <span className="font-mono text-zinc-500">{result.engine}</span>
          </div>
          {result.source_url && (
            <a
              href={result.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-amber-400 transition-colors mt-2"
            >
              Source URL
              <ExternalLink size={10} />
            </a>
          )}
        </div>

        {/* Claims */}
        {result.claims.length === 0 && (
          <div className="text-center py-16 text-zinc-600 text-sm">
            No verifiable claims were detected in the submitted text.
          </div>
        )}

        {result.claims.map((claim, idx) => {
          const verdict = VERDICT_CONFIG[claim.status] || VERDICT_CONFIG.unknown;
          const VerdictIcon = verdict.icon;

          return (
            <section key={claim.claim_id || idx} className="mb-10">
              {/* Verdict banner */}
              <div className={`flex items-center justify-between gap-4 px-5 py-3.5 rounded-t-xl border ${verdict.bg} ${verdict.border}`}>
                <div className="flex items-center gap-2.5">
                  <VerdictIcon size={18} className={verdict.text} />
                  <span
                    className={`text-sm font-bold uppercase tracking-wider ${verdict.text}`}
                    style={{ fontFamily: 'Oswald, sans-serif' }}
                  >
                    {verdict.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <ScoreBadge score={claim.score} />
                  {claim.category !== 'general' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-800 text-zinc-500 uppercase">
                      {claim.category.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
              </div>

              {/* Claim text */}
              <div className="border-x border-white/10 bg-zinc-950/50 px-5 py-4">
                <p className="text-sm text-zinc-200 leading-relaxed">{claim.claim_text}</p>
                {claim.signals && (
                  <p className="text-xs text-zinc-600 mt-2 font-mono">{claim.signals}</p>
                )}
              </div>

              {/* Evidence cards */}
              <div className="border-x border-b border-white/10 rounded-b-xl bg-zinc-950/30 p-4">
                {claim.evidence.length === 0 ? (
                  <p className="text-xs text-zinc-600 text-center py-4">
                    No matching evidence found in available data sources.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-zinc-600 mb-2">
                      {claim.evidence_count} evidence source{claim.evidence_count !== 1 ? 's' : ''}
                    </p>
                    {claim.evidence.map((ev, evIdx) => (
                      <EvidenceCard key={evIdx} ev={ev} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
