import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, RefreshCw, FileX, Edit3, ArrowRight } from 'lucide-react';

import { getApiBase } from '../api/client';

const API_BASE = getApiBase();

interface Correction {
  id: number;
  story_id: number;
  story_title: string;
  story_slug: string;
  type: string;
  description: string;
  date: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function typeIcon(type: string) {
  switch (type) {
    case 'retraction': return <FileX size={16} className="text-red-400" />;
    case 'correction': return <Edit3 size={16} className="text-amber-400" />;
    case 'update': return <RefreshCw size={16} className="text-blue-400" />;
    case 'clarification': return <AlertTriangle size={16} className="text-yellow-400" />;
    default: return <Edit3 size={16} className="text-zinc-400" />;
  }
}

function typeLabel(type: string) {
  switch (type) {
    case 'retraction': return 'Retraction';
    case 'correction': return 'Correction';
    case 'update': return 'Update';
    case 'clarification': return 'Clarification';
    case 'reader_report': return 'Under Review';
    default: return type;
  }
}

function typeColor(type: string) {
  switch (type) {
    case 'retraction': return 'border-red-500/30 bg-red-950/20';
    case 'correction': return 'border-amber-500/30 bg-amber-950/20';
    case 'update': return 'border-blue-500/30 bg-blue-950/20';
    case 'clarification': return 'border-yellow-500/30 bg-yellow-950/20';
    default: return 'border-zinc-700 bg-zinc-900/30';
  }
}

export default function CorrectionsPage() {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/stories/corrections/all?limit=100`)
      .then((res) => res.json())
      .then((data) => {
        // Filter out reader_reports (those are internal)
        setCorrections(
          (data.corrections || []).filter((c: Correction) => c.type !== 'reader_report')
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main id="main-content" className="flex-1 px-4 py-10 sm:py-16">
      <div className="max-w-[720px] mx-auto">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          Back to Journal
        </Link>

        <p className="text-xs uppercase tracking-[0.2em] text-amber-400 font-medium mb-3">
          Editorial Standards
        </p>
        <h1
          className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-6"
          style={{ fontFamily: 'Oswald, sans-serif' }}
        >
          Corrections & Retractions
        </h1>

        {/* Policy statement */}
        <div className="space-y-5 mb-12 text-zinc-300 leading-[1.85] text-base">
          <p>
            The Influence Journal is committed to accuracy. When we get something wrong,
            we fix it publicly and promptly. Every correction and retraction is documented
            here for full transparency.
          </p>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <h2
              className="text-lg font-bold text-white"
              style={{ fontFamily: 'Oswald, sans-serif' }}
            >
              Our Corrections Policy
            </h2>
            <div className="space-y-3 text-sm text-zinc-400">
              <p>
                <strong className="text-zinc-200">Corrections</strong> are issued when a factual
                error is identified in a published story. We fix the error in the story text and
                add a visible correction notice at the top of the article.
              </p>
              <p>
                <strong className="text-zinc-200">Clarifications</strong> are issued when the
                original text was not technically wrong but could be misleading. We add context
                to prevent misinterpretation.
              </p>
              <p>
                <strong className="text-zinc-200">Retractions</strong> are issued when a story
                contains fundamental errors that cannot be fixed by a correction, such as data
                misattribution where an entity's records were incorrectly assigned to a different
                entity. Retracted stories remain visible with a prominent retraction notice so the
                record is complete.
              </p>
              <p>
                <strong className="text-zinc-200">Updates</strong> are issued when new data
                becomes available that materially changes the story's findings.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
            <h2
              className="text-lg font-bold text-white"
              style={{ fontFamily: 'Oswald, sans-serif' }}
            >
              Report an Error
            </h2>
            <p className="text-sm text-zinc-400">
              Anyone can report an error in a story. Use the "Report an error" button on any
              story page, or contact us at{' '}
              <a
                href="mailto:corrections@wethepeopleforus.com"
                className="text-amber-400/80 hover:text-amber-400 transition-colors"
              >
                corrections@wethepeopleforus.com
              </a>.
              We review all reports and respond within 48 hours.
            </p>
          </div>
        </div>

        {/* Correction log */}
        <h2
          className="text-xl font-bold text-white mb-6"
          style={{ fontFamily: 'Oswald, sans-serif' }}
        >
          Correction Log
        </h2>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" />
          </div>
        )}

        {!loading && corrections.length === 0 && (
          <p className="text-zinc-500 text-sm py-8">
            No corrections or retractions have been issued.
          </p>
        )}

        {!loading && corrections.length > 0 && (
          <div className="space-y-4">
            {corrections.map((c) => (
              <div
                key={c.id}
                className={`rounded-lg border p-5 ${typeColor(c.type)}`}
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">{typeIcon(c.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                        {typeLabel(c.type)}
                      </span>
                      {c.date && (
                        <span className="text-xs text-zinc-600">{formatDate(c.date)}</span>
                      )}
                    </div>
                    <Link
                      to={`/story/${c.story_slug}`}
                      className="text-sm font-semibold text-white hover:text-amber-400 transition-colors"
                    >
                      {c.story_title}
                    </Link>
                    <p className="text-sm text-zinc-400 leading-relaxed mt-2">
                      {c.description}
                    </p>
                  </div>
                  <Link
                    to={`/story/${c.story_slug}`}
                    className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors shrink-0"
                  >
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
