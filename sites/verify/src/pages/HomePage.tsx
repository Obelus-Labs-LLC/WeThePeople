import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Link2, FileText, Youtube, Loader2, ArrowRight, Database } from 'lucide-react';
import { apiPost, apiFetch } from '../api/client';

type InputType = 'TEXT' | 'URL' | 'YOUTUBE';

function detectInputType(value: string): InputType {
  const trimmed = value.trim();
  if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(trimmed)) return 'YOUTUBE';
  if (/^https?:\/\//i.test(trimmed)) return 'URL';
  return 'TEXT';
}

const TYPE_ICON = {
  TEXT: FileText,
  URL: Link2,
  YOUTUBE: Youtube,
} as const;

const TYPE_COLOR = {
  TEXT: 'text-zinc-400 border-zinc-700',
  URL: 'text-blue-400 border-blue-800',
  YOUTUBE: 'text-red-400 border-red-800',
} as const;

interface DashboardStats {
  total_claims: number;
  total_evaluated: number;
  unique_entities: number;
}

export default function HomePage() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const inputType = detectInputType(input);
  const TypeIcon = TYPE_ICON[inputType];

  // Fetch dashboard stats on mount
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<DashboardStats>('/claims/dashboard/stats', { signal: controller.signal })
      .then(setStats)
      .catch(() => {}); // Silent fail -- stats are optional
    return () => controller.abort();
  }, []);

  const handleVerify = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setError('Enter a claim, article text, or URL above to get started.');
      return;
    }
    if (trimmed.length < 20) {
      setError(`Text is too short (${trimmed.length} characters). Enter at least 20 characters so the engine can extract verifiable claims.`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const detected = detectInputType(trimmed);
      let result;

      if (detected === 'URL' || detected === 'YOUTUBE') {
        result = await apiPost('/claims/verify-url', { url: trimmed });
      } else {
        result = await apiPost('/claims/verify', { text: trimmed });
      }

      // Navigate to results page with the data in state
      navigate('/results/quick', { state: { result, inputText: trimmed } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('429')) {
        setError('Rate limit reached. Free accounts can verify 5 claims per day. Try again tomorrow or upgrade to Enterprise for unlimited access.');
      } else if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')) {
        setError('Could not reach the verification server. Check your internet connection and try again.');
      } else {
        setError(`Verification failed: ${msg}. Try shorter text or a different URL.`);
      }
    } finally {
      setLoading(false);
    }
  }, [input, navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleVerify();
    }
  };

  return (
    <main id="main-content" className="flex-1 flex flex-col items-center justify-center px-4 py-16 sm:py-24">
      <div className="w-full max-w-2xl mx-auto">
        {/* Shield icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Shield className="w-8 h-8 text-amber-400" />
          </div>
        </div>

        {/* Heading */}
        <h1
          className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-center mb-3"
          style={{ fontFamily: 'Oswald, sans-serif' }}
        >
          <span className="text-amber-400">VERITAS</span>
        </h1>
        <p className="text-center text-zinc-400 text-lg mb-2">
          Zero-LLM Claim Verification Engine
        </p>
        <p className="text-center text-zinc-600 text-sm mb-10 max-w-md mx-auto">
          Paste any political claim, article text, or URL. Claims are extracted
          deterministically and verified against 29+ government data sources.
        </p>

        {/* Input area */}
        <div className="relative mb-4">
          <label htmlFor="verify-input" className="block text-sm text-zinc-400 mb-2">
            Paste a claim, article text, or URL to verify
          </label>
          <textarea
            id="verify-input"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder={'Examples:\n  "Lockheed Martin received $45 billion in defense contracts"\n  https://example.com/article-about-lobbying'}
            rows={6}
            disabled={loading}
            aria-describedby={error ? 'verify-error' : undefined}
            className="w-full bg-zinc-900/80 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-zinc-600 text-sm leading-relaxed resize-none focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all disabled:opacity-50"
          />

          {/* Input type badge */}
          {input.trim().length > 0 && (
            <div className={`absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${TYPE_COLOR[inputType]}`}>
              <TypeIcon size={12} />
              {inputType}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div id="verify-error" role="alert" className="mb-4 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Verify button */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {loading ? 'Verifying claims, please wait...' : ''}
        </div>

        <button
          onClick={handleVerify}
          disabled={loading || input.trim().length < 5}
          className="w-full flex items-center justify-center gap-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-semibold text-sm uppercase tracking-wider px-6 py-3.5 rounded-xl transition-all"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Verifying...
            </>
          ) : (
            <>
              VERIFY
              <ArrowRight size={16} />
            </>
          )}
        </button>

        <p className="text-center text-zinc-700 text-xs mt-3">
          Ctrl+Enter to submit
        </p>

        {/* Stats bar */}
        {stats && (stats.total_claims > 0 || stats.total_evaluated > 0) && (
          <div className="mt-12 flex items-center justify-center gap-6 text-xs text-zinc-600">
            <div className="flex items-center gap-1.5">
              <Database size={12} className="text-zinc-700" />
              <span className="font-mono text-zinc-500">{stats.total_claims.toLocaleString()}</span>
              <span>claims indexed</span>
            </div>
            <span className="text-zinc-800">|</span>
            <div className="flex items-center gap-1.5">
              <Shield size={12} className="text-zinc-700" />
              <span className="font-mono text-zinc-500">{stats.total_evaluated.toLocaleString()}</span>
              <span>verified</span>
            </div>
            <span className="text-zinc-800">|</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-zinc-500">{stats.unique_entities.toLocaleString()}</span>
              <span>entities</span>
            </div>
          </div>
        )}

        {/* Vault link */}
        <div className="mt-8 text-center">
          <a
            href="/vault"
            onClick={(e) => { e.preventDefault(); navigate('/vault'); }}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-amber-400 transition-colors"
          >
            Browse verification vault
            <ArrowRight size={12} />
          </a>
        </div>
      </div>
    </main>
  );
}
