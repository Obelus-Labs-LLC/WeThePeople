import React, { useState, useEffect } from 'react';
import { Search, Link2, FileText, Loader2, AlertCircle } from 'lucide-react';
import { getApiBaseUrl } from '../api/client';

interface EntityOption {
  id: string;
  name: string;
  type: 'politician' | 'tech' | 'finance' | 'health' | 'energy';
  subtype?: string;
}

interface ClaimSubmitFormProps {
  onSubmit: (data: {
    mode: 'text' | 'url';
    text?: string;
    url?: string;
    entity_id: string;
    entity_type: string;
  }) => void;
  loading?: boolean;
  error?: string | null;
}

export default function ClaimSubmitForm({ onSubmit, loading = false, error }: ClaimSubmitFormProps) {
  const [mode, setMode] = useState<'text' | 'url'>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [entityQuery, setEntityQuery] = useState('');
  const [entityResults, setEntityResults] = useState<EntityOption[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<EntityOption | null>(null);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Debounced entity search
  useEffect(() => {
    if (entityQuery.length < 2) {
      setEntityResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const base = getApiBaseUrl();
        const res = await fetch(`${base}/search?q=${encodeURIComponent(entityQuery)}&limit=10`);
        if (res.ok) {
          const data = await res.json();
          const options: EntityOption[] = (data.results || []).map((r: any) => ({
            id: r.id || r.person_id || r.entity_id,
            name: r.name || r.display_name || r.title,
            type: r.entity_type || r.type || 'politician',
            subtype: r.subtype || r.party || r.sector,
          }));
          setEntityResults(options);
          setShowDropdown(true);
        }
      } catch {
        // silently fail
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [entityQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntity) return;
    if (mode === 'text' && text.length < 20) return;
    if (mode === 'url' && url.length < 10) return;

    onSubmit({
      mode,
      text: mode === 'text' ? text : undefined,
      url: mode === 'url' ? url : undefined,
      entity_id: selectedEntity.id,
      entity_type: selectedEntity.type,
    });
  };

  const canSubmit =
    selectedEntity &&
    !loading &&
    ((mode === 'text' && text.length >= 20) || (mode === 'url' && url.length >= 10));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 p-1 bg-white/5 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setMode('text')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === 'text' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Paste Text
        </button>
        <button
          type="button"
          onClick={() => setMode('url')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === 'url' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          Enter URL
        </button>
      </div>

      {/* Text / URL input */}
      {mode === 'text' ? (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Claim text to verify
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a speech, press release, interview transcript, or campaign statement..."
            rows={6}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 resize-y"
          />
          <p className="mt-1 text-xs text-slate-500">
            Minimum 20 characters. We will extract and verify each claim individually.
          </p>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            URL to verify
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/article-or-speech..."
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
          />
          <p className="mt-1 text-xs text-slate-500">
            We will fetch the page, extract text, then verify each claim.
          </p>
        </div>
      )}

      {/* Entity search */}
      <div className="relative">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Who made this claim?
        </label>
        {selectedEntity ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
            <span className="text-sm text-white font-medium">{selectedEntity.name}</span>
            <span className="text-[10px] uppercase font-semibold text-emerald-400 bg-emerald-500/20 rounded px-1.5 py-0.5">
              {selectedEntity.type}
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedEntity(null);
                setEntityQuery('');
              }}
              className="ml-auto text-xs text-slate-400 hover:text-white"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={entityQuery}
              onChange={(e) => setEntityQuery(e.target.value)}
              onFocus={() => entityResults.length > 0 && setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              placeholder="Search politicians or companies..."
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin" />
            )}
            {showDropdown && entityResults.length > 0 && (
              <div className="absolute z-30 mt-1 w-full rounded-xl border border-white/10 bg-slate-900 shadow-xl max-h-60 overflow-auto">
                {entityResults.map((ent) => (
                  <button
                    key={`${ent.type}-${ent.id}`}
                    type="button"
                    onMouseDown={() => {
                      setSelectedEntity(ent);
                      setShowDropdown(false);
                      setEntityQuery('');
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-white/5 flex items-center gap-2 transition-colors"
                  >
                    <span className="text-sm text-white">{ent.name}</span>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 bg-white/5 rounded px-1.5 py-0.5">
                      {ent.type}
                    </span>
                    {ent.subtype && (
                      <span className="text-[10px] text-slate-500">{ent.subtype}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Rate limit notice */}
      <p className="text-xs text-slate-500">
        5 free verifications per day. Contact us for enterprise access with unlimited verifications.
      </p>

      {/* Submit */}
      <button
        type="submit"
        disabled={!canSubmit}
        className={`w-full rounded-xl px-6 py-3 text-sm font-semibold transition-all ${
          canSubmit
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
            : 'bg-white/5 text-slate-500 cursor-not-allowed'
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Verifying claims...
          </span>
        ) : (
          'Verify Claims'
        )}
      </button>
    </form>
  );
}
