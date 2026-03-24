import React, { useEffect, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { SECTORS } from "../data/sectors";
import DecryptedText from "../components/DecryptedText";
import FloatingLines from "../components/FloatingLines";
import {
  fetchInfluenceStats,
  fetchTopLobbying,
  fetchTopContracts,
  type InfluenceStats,
  type InfluenceLeader,
} from "../api/influence";
import {
  DollarSign,
  FileText,
  Shield,
  Users,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  MapPin,
  Search,
  Newspaper,
} from "lucide-react";
import Footer from "../components/Footer";
import { getApiBaseUrl } from "../api/client";

const ANOMALY_API = getApiBaseUrl();

interface TopAnomaly {
  id: number;
  pattern_type: string;
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  score: number;
  title: string;
}

const ANOMALY_PATTERN_LABELS: Record<string, string> = {
  trade_near_vote: "Trade Near Vote",
  lobbying_spike: "Lobbying Spike",
  enforcement_gap: "Enforcement Gap",
  revolving_door: "Revolving Door",
};

function SuspiciousPatternsTeaser() {
  const [anomalies, setAnomalies] = useState<TopAnomaly[]>([]);

  useEffect(() => {
    fetch(`${ANOMALY_API}/anomalies/top?limit=3`)
      .then((r) => r.json())
      .then((data) => setAnomalies(data.anomalies || []))
      .catch(() => {});
  }, []);

  if (anomalies.length === 0) return null;

  return (
    <div className="pb-12">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <h3 className="text-xl font-bold text-white">Suspicious Patterns</h3>
        </div>
        <div className="space-y-2">
          {anomalies.map((a) => (
            <Link
              key={a.id}
              to="/influence/anomalies"
              className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-4 py-3 hover:bg-white/[0.08] transition-colors no-underline group"
            >
              <div
                className={`w-8 h-8 rounded flex items-center justify-center text-white font-bold text-sm ${
                  a.score >= 8 ? "bg-red-500" : a.score >= 6 ? "bg-orange-500" : "bg-amber-500"
                }`}
              >
                {a.score.toFixed(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-medium truncate group-hover:text-amber-400 transition-colors">
                  {a.title}
                </div>
                <div className="text-[10px] text-white/30">
                  {ANOMALY_PATTERN_LABELS[a.pattern_type] || a.pattern_type}
                </div>
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-3 text-center">
          <Link
            to="/influence/anomalies"
            className="inline-flex items-center gap-1.5 text-sm text-amber-400 hover:text-amber-300 transition-colors"
          >
            View all suspicious patterns <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

interface StoryTeaser {
  slug: string;
  title: string;
  summary: string;
  sector: string;
}

const SECTOR_BADGE_COLORS: Record<string, string> = {
  finance: "bg-emerald-500/20 text-emerald-400",
  health: "bg-rose-500/20 text-rose-400",
  technology: "bg-violet-500/20 text-violet-400",
  energy: "bg-orange-500/20 text-orange-400",
  transportation: "bg-blue-500/20 text-blue-400",
  defense: "bg-red-500/20 text-red-400",
  politics: "bg-blue-500/20 text-blue-400",
};

function LatestStoriesTeaser() {
  const [stories, setStories] = useState<StoryTeaser[]>([]);

  useEffect(() => {
    fetch(`${ANOMALY_API}/stories/latest?limit=3`)
      .then((r) => r.json())
      .then((data) => setStories(Array.isArray(data) ? data : data.stories || []))
      .catch(() => {});
  }, []);

  if (stories.length === 0) return null;

  return (
    <div className="pb-12">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center gap-2 mb-4">
          <Newspaper className="w-5 h-5 text-blue-400" />
          <h3 className="text-xl font-bold text-white">Latest Stories</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stories.map((s) => (
            <Link
              key={s.slug}
              to={`/stories/${s.slug}`}
              className="bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/[0.08] transition-colors no-underline group"
            >
              {s.sector && (
                <span
                  className={`inline-block text-[10px] uppercase font-semibold px-2 py-0.5 rounded mb-2 ${
                    SECTOR_BADGE_COLORS[s.sector] || "bg-slate-500/20 text-slate-400"
                  }`}
                >
                  {s.sector}
                </span>
              )}
              <div className="text-sm font-bold text-white mb-1 group-hover:text-blue-400 transition-colors line-clamp-2">
                {s.title}
              </div>
              <div className="text-xs text-white/50 leading-relaxed line-clamp-3">
                {s.summary}
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-3 text-center">
          <Link
            to="/stories"
            className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            View all stories <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// Free Unsplash images (Unsplash license — free for commercial use)
const FLAG_BG =
  "https://images.unsplash.com/photo-1508433957232-3107f5fd5995?w=1920&q=80&auto=format";

// TODO: Import from utils/helpers.ts
function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

const SECTOR_COLORS: Record<string, string> = {
  finance: "text-emerald-400",
  health: "text-rose-400",
  tech: "text-violet-400",
  energy: "text-orange-400",
  transportation: "text-blue-400",
  defense: "text-red-400",
};

const SECTOR_ROUTES: Record<string, string> = {
  finance: "/finance",
  health: "/health",
  tech: "/technology",
  energy: "/energy",
  transportation: "/transportation",
  defense: "/defense",
};

/** Left-border accent color per sector slug */
const SECTOR_ACCENT: Record<string, string> = {
  politics: "border-l-blue-500",
  finance: "border-l-emerald-500",
  health: "border-l-rose-500",
  // Future sectors - not yet implemented
  chemicals: "border-l-amber-500",
  energy: "border-l-orange-500",
  technology: "border-l-violet-500",
  transportation: "border-l-blue-500",
  // Future sectors - not yet implemented
  defense: "border-l-red-500",
  agriculture: "border-l-lime-500",
};

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<InfluenceStats | null>(null);
  const [topLobbying, setTopLobbying] = useState<InfluenceLeader[]>([]);
  const [topContracts, setTopContracts] = useState<InfluenceLeader[]>([]);
  const [zipCode, setZipCode] = useState("");
  const zipInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchInfluenceStats().then(setStats).catch(() => {});
    fetchTopLobbying(5).then((r) => setTopLobbying(r.leaders)).catch(() => {});
    fetchTopContracts(5).then((r) => setTopContracts(r.leaders)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-white relative">
      {/* FLAG_BG covering entire page (fixed) */}
      <div
        className="fixed inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${FLAG_BG})` }}
      />
      {/* Dark overlay (fixed) */}
      <div className="fixed inset-0 bg-slate-950/75" />
      {/* FloatingLines over entire page (fixed) */}
      <div className="fixed inset-0 opacity-20 mix-blend-screen">
        <FloatingLines
          linesGradient={['#e90101', '#fafafa', '#0804fb']}
          animationSpeed={0.5}
        />
      </div>
      {/* Gradient fade (fixed) */}
      <div className="fixed inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-950" />

      {/* All content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Hero section — Zip Code CTA */}
        <div className="flex flex-col items-center pt-20 pb-12 px-4">
          {/* Brand */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-14 w-14 rounded-xl bg-blue-600 flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-blue-600/30">
              WP
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white">
              We The People
            </h1>
          </div>

          <h2 className="text-2xl sm:text-4xl font-bold text-white text-center mb-3 leading-tight">
            <DecryptedText
              text="Who represents you? Follow the money."
              animateOn="view"
              sequential={true}
              speed={100}
              revealDirection="start"
              className="text-white"
              encryptedClassName="text-white/20"
            />
          </h2>

          <p className="text-white/80 text-center text-lg sm:text-xl max-w-lg mb-8 font-medium">
            Enter your zip code to see your representatives and who's paying them
          </p>

          {/* Zip code form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const cleaned = zipCode.replace(/\D/g, "").slice(0, 5);
              if (cleaned.length === 5) {
                navigate(`/politics/find-rep?zip=${cleaned}`);
              } else if (zipInputRef.current) {
                zipInputRef.current.focus();
              }
            }}
            className="flex items-center gap-3 mb-8 w-full max-w-lg justify-center"
          >
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400" />
              <input
                ref={zipInputRef}
                type="text"
                inputMode="numeric"
                maxLength={5}
                pattern="[0-9]{5}"
                placeholder="Enter zip code"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                className="pl-10 pr-4 py-4 w-64 sm:w-80 rounded-lg bg-white/10 border border-white/20 text-white text-xl placeholder-white/30 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={zipCode.replace(/\D/g, "").length !== 5}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Search className="w-5 h-5" />
              <span className="hidden sm:inline">Find My Representatives</span>
              <span className="sm:hidden">Find Reps</span>
            </button>
          </form>

          {/* Digest CTA */}
          <Link
            to="/digest"
            className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors mb-3 no-underline"
          >
            Get weekly updates in your inbox <ArrowRight className="w-3.5 h-3.5" />
          </Link>

          {/* Follow on X */}
          <a
            href="https://x.com/WTPForUs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-300 transition-colors mb-6 no-underline"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Follow @WTPForUs on X
          </a>

          {/* Aggregate stats bar */}
          {stats && (
            <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3 sm:gap-6 mb-4">
              {[
                { icon: DollarSign, label: "Lobbying Tracked", value: formatMoney(stats.total_lobbying_spend) },
                { icon: FileText, label: "Gov Contracts", value: formatMoney(stats.total_contract_value) },
                { icon: Shield, label: "Enforcement Actions", value: stats.total_enforcement_actions.toLocaleString() },
                { icon: Users, label: "Politicians Connected", value: stats.politicians_connected.toLocaleString() },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-4 py-2">
                  <s.icon className="w-4 h-4 text-blue-400" />
                  <div>
                    <div className="text-lg font-bold text-white">{s.value}</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Verify Claims CTA */}
        <div className="max-w-5xl mx-auto px-4 -mt-2 pb-6">
          <button
            onClick={() => navigate("/verify")}
            className="w-full relative group rounded-xl border-l-2 border-l-emerald-500 bg-emerald-500/[0.06] backdrop-blur-sm border border-emerald-500/20 p-5 text-left transition-all duration-200 hover:bg-emerald-500/[0.12] hover:border-emerald-500/30 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 focus:ring-emerald-500"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 shadow-lg shadow-emerald-600/20 shrink-0">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold text-white mb-0.5">
                  Verify Claims
                </div>
                <div className="text-sm text-emerald-300/70 leading-snug">
                  Compare what politicians say to what they actually do — check speeches, press releases, and campaign promises against the legislative record.
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-emerald-400 opacity-50 group-hover:opacity-100 transition-opacity shrink-0" />
            </div>
          </button>
        </div>

        {/* Sector grid */}
        <div className="max-w-5xl mx-auto px-4 -mt-4 pb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SECTORS.map((sector) => (
              <button
                key={sector.slug}
                onClick={() =>
                  sector.available
                    ? navigate(sector.route)
                    : undefined
                }
                className={`relative group rounded-xl border-l-2 ${SECTOR_ACCENT[sector.slug] || "border-l-slate-500"} bg-white/[0.04] backdrop-blur-sm border border-white/10 p-5 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 focus:ring-blue-500 ${
                  sector.available
                    ? "hover:bg-white/[0.08] hover:border-white/20 cursor-pointer"
                    : "opacity-50 pointer-events-none"
                }`}
              >
                <div className="text-2xl mb-2">
                  {sector.icon}
                </div>
                <div className="text-base font-bold text-white mb-1">
                  {sector.name}
                </div>
                <div className="text-sm text-white/60 leading-snug">
                  {sector.tagline}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Influence Leaderboard */}
        {(topLobbying.length > 0 || topContracts.length > 0) && (
          <div className="pb-16">
            <div className="max-w-5xl mx-auto px-4">
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp className="w-5 h-5 text-blue-400" />
                <h3 className="text-xl font-bold text-white">Influence Leaderboard</h3>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Top Lobbying Spenders */}
                {topLobbying.length > 0 && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                    <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                      Top Lobbying Spenders
                    </h4>
                    <div className="space-y-3">
                      {topLobbying.map((l, i) => (
                        <Link
                          key={l.entity_id}
                          to={`${SECTOR_ROUTES[l.sector] || "/"}/${l.entity_id}`}
                          className="flex items-center justify-between hover:bg-white/5 rounded-lg px-2 py-1.5 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-slate-500 text-sm w-5">{i + 1}.</span>
                            <span className="text-white font-medium text-sm">{l.display_name}</span>
                            <span className={`text-xs uppercase font-semibold ${SECTOR_COLORS[l.sector] || "text-slate-400"}`}>
                              {l.sector}
                            </span>
                          </div>
                          <span className="text-emerald-400 font-mono text-sm">
                            {formatMoney(l.total_lobbying || 0)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Contract Recipients */}
                {topContracts.length > 0 && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                    <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                      Top Gov Contract Recipients
                    </h4>
                    <div className="space-y-3">
                      {topContracts.map((l, i) => (
                        <Link
                          key={l.entity_id}
                          to={`${SECTOR_ROUTES[l.sector] || "/"}/${l.entity_id}`}
                          className="flex items-center justify-between hover:bg-white/5 rounded-lg px-2 py-1.5 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-slate-500 text-sm w-5">{i + 1}.</span>
                            <span className="text-white font-medium text-sm">{l.display_name}</span>
                            <span className={`text-xs uppercase font-semibold ${SECTOR_COLORS[l.sector] || "text-slate-400"}`}>
                              {l.sector}
                            </span>
                          </div>
                          <span className="text-blue-400 font-mono text-sm">
                            {formatMoney(l.total_contracts || 0)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 text-center">
                <Link
                  to="/influence"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  View full Influence Explorer <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Suspicious Patterns teaser */}
        <SuspiciousPatternsTeaser />

        {/* Latest Stories teaser */}
        <LatestStoriesTeaser />

        <Footer />
      </div>
    </div>
  );
};

export default HomePage;
