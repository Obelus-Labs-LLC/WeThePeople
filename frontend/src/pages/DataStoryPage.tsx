import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Play, Pause, SkipForward, SkipBack } from 'lucide-react';
import { getApiBaseUrl } from '../api/client';

const API_BASE = getApiBaseUrl();

interface StoryStep {
  title: string;
  description: string;
  chartType: 'bar' | 'treemap' | 'comparison';
  data: { label: string; value: number; color: string }[];
}

const SECTOR_COLORS: Record<string, string> = {
  finance: '#34D399',
  health: '#F472B6',
  tech: '#A78BFA',
  energy: '#FB923C',
};

function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function DataStoryPage() {
  const [steps, setSteps] = useState<StoryStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [animatingBars, setAnimatingBars] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/influence/stats`).then((r) => r.json()),
      fetch(`${API_BASE}/influence/top-lobbying?limit=10`).then((r) => r.json()),
      fetch(`${API_BASE}/influence/top-contracts?limit=10`).then((r) => r.json()),
    ])
      .then(([stats, lobbyLeaders, contractLeaders]) => {
        const bySector = stats.by_sector || {};
        const storySteps: StoryStep[] = [
          {
            title: 'The Landscape',
            description: `Across four sectors, corporations spent ${formatMoney(stats.total_lobbying_spend)} on lobbying and secured ${formatMoney(stats.total_contract_value)} in government contracts. ${stats.total_enforcement_actions} enforcement actions were filed.`,
            chartType: 'bar',
            data: Object.entries(bySector as Record<string, Record<string, number>>).map(([sector, data]) => ({
              label: sector.charAt(0).toUpperCase() + sector.slice(1),
              value: data.lobbying || 0,
              color: SECTOR_COLORS[sector] || '#6B7280',
            })),
          },
          {
            title: 'Lobbying Powerhouses',
            description: 'These are the top spenders trying to influence legislation. Every dollar spent on lobbying is an investment in shaping policy.',
            chartType: 'bar',
            data: (lobbyLeaders.leaders || []).slice(0, 8).map((l: { display_name: string; total_lobbying?: number; sector?: string }) => ({
              label: l.display_name,
              value: l.total_lobbying || 0,
              color: SECTOR_COLORS[l.sector || ''] || '#6B7280',
            })),
          },
          {
            title: 'Government Contracts',
            description: 'The same companies that lobby Congress also win billions in government contracts. Coincidence?',
            chartType: 'bar',
            data: (contractLeaders.leaders || []).slice(0, 8).map((l: { display_name: string; total_contracts?: number; sector?: string }) => ({
              label: l.display_name,
              value: l.total_contracts || 0,
              color: SECTOR_COLORS[l.sector || ''] || '#6B7280',
            })),
          },
          {
            title: 'Lobbying vs Contracts',
            description: 'For every dollar spent on lobbying, these companies win far more in contracts. The return on investment speaks for itself.',
            chartType: 'comparison',
            data: Object.entries(bySector as Record<string, Record<string, number>>).map(([sector, data]) => ({
              label: sector.charAt(0).toUpperCase() + sector.slice(1),
              value: data.contracts || 0,
              color: SECTOR_COLORS[sector] || '#6B7280',
            })),
          },
          {
            title: 'Enforcement Gap',
            description: `Despite all this spending, only ${stats.total_enforcement_actions} enforcement actions were taken. Who is holding corporations accountable?`,
            chartType: 'bar',
            data: Object.entries(bySector as Record<string, Record<string, number>>).map(([sector, data]) => ({
              label: sector.charAt(0).toUpperCase() + sector.slice(1),
              value: data.enforcement || 0,
              color: SECTOR_COLORS[sector] || '#6B7280',
            })),
          },
        ];
        setSteps(storySteps);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Trigger bar animation on step change
  useEffect(() => {
    setAnimatingBars(false);
    const t = setTimeout(() => setAnimatingBars(true), 50);
    return () => clearTimeout(t);
  }, [currentStep]);

  // Auto-play
  useEffect(() => {
    if (!isPlaying || steps.length === 0) return;
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= steps.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [isPlaying, steps.length]);

  const step = steps[currentStep];
  const maxVal = step ? Math.max(...step.data.map((d) => d.value), 1) : 1;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-[900px] px-4 py-6 lg:px-16 lg:py-14">
        <Link to="/influence" className="inline-flex items-center gap-2 text-white/40 hover:text-white/70 text-sm mb-6 no-underline">
          <ArrowLeft className="w-4 h-4" /> Influence Explorer
        </Link>

        <div className="mb-10 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Follow the Money</h1>
          <p className="text-white/50">An animated data story about corporate influence in American politics.</p>
        </div>

        {step && (
          <div className="mb-8">
            {/* Step content */}
            <div className="text-center mb-8">
              <div className="inline-block rounded-full bg-blue-500/20 px-4 py-1 text-xs font-mono text-blue-400 mb-4">
                {currentStep + 1} / {steps.length}
              </div>
              <h2 className="text-2xl font-bold text-white mb-3 transition-all duration-500">
                {step.title}
              </h2>
              <p className="text-white/60 max-w-[600px] mx-auto leading-relaxed transition-all duration-500">
                {step.description}
              </p>
            </div>

            {/* Animated chart */}
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 min-h-[300px]">
              <div className="space-y-3">
                {step.data.map((d, i) => (
                  <div key={d.label} className="flex items-center gap-3">
                    <span className="text-sm text-white/70 truncate w-[180px] text-right">{d.label}</span>
                    <div className="flex-1 h-8 bg-white/5 rounded-lg overflow-hidden">
                      <div
                        className="h-full rounded-lg flex items-center px-3 transition-all ease-out"
                        style={{
                          width: animatingBars ? `${Math.max((d.value / maxVal) * 100, 2)}%` : '0%',
                          backgroundColor: d.color,
                          transitionDuration: `${800 + i * 150}ms`,
                          transitionDelay: `${i * 100}ms`,
                        }}
                      >
                        <span className="text-xs font-mono text-white font-bold whitespace-nowrap">
                          {step.chartType === 'bar' && d.value > maxVal * 0.15
                            ? formatMoney(d.value)
                            : ''}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-white/40 w-[80px]">
                      {formatMoney(d.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Playback controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setCurrentStep((p) => Math.max(p - 1, 0))}
            disabled={currentStep === 0}
            className="p-2 rounded-full bg-white/5 text-white/40 hover:text-white/70 disabled:opacity-20 transition-colors"
          >
            <SkipBack className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-3 rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
          >
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
          </button>
          <button
            onClick={() => setCurrentStep((p) => Math.min(p + 1, steps.length - 1))}
            disabled={currentStep >= steps.length - 1}
            className="p-2 rounded-full bg-white/5 text-white/40 hover:text-white/70 disabled:opacity-20 transition-colors"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {/* Step dots */}
        <div className="flex justify-center gap-2 mt-4">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => { setCurrentStep(i); setIsPlaying(false); }}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                i === currentStep ? 'bg-blue-400 scale-125' : i < currentStep ? 'bg-blue-400/40' : 'bg-white/10'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
