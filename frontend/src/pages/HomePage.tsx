import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { SECTORS } from "../data/sectors";
import DecryptedText from "../components/DecryptedText";
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
} from "lucide-react";

// Free Unsplash images (Unsplash license — free for commercial use)
const FLAG_BG =
  "https://images.unsplash.com/photo-1508433957232-3107f5fd5995?w=1920&q=80&auto=format";
const CAPITOL_BG =
  "https://images.unsplash.com/photo-1501466044931-62695aada8e9?w=1920&q=80&auto=format";

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
};

const SECTOR_ROUTES: Record<string, string> = {
  finance: "/finance/institution",
  health: "/health/company",
  tech: "/technology/company",
  energy: "/energy/company",
};

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<InfluenceStats | null>(null);
  const [topLobbying, setTopLobbying] = useState<InfluenceLeader[]>([]);
  const [topContracts, setTopContracts] = useState<InfluenceLeader[]>([]);

  useEffect(() => {
    fetchInfluenceStats().then(setStats).catch(() => {});
    fetchTopLobbying(5).then((r) => setTopLobbying(r.leaders)).catch(() => {});
    fetchTopContracts(5).then((r) => setTopContracts(r.leaders)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-white">
      {/* Hero with flag background */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${FLAG_BG})` }}
        />
        <div className="absolute inset-0 bg-slate-950/75" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-950" />

        <div className="relative z-10 flex flex-col items-center pt-20 pb-16 px-4">
          {/* Brand */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-14 w-14 rounded-xl bg-blue-600 flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-blue-600/30">
              WP
            </div>
            <h1 className="text-5xl font-bold tracking-tight text-white">
              We The People
            </h1>
          </div>

          <p className="text-lg text-blue-200/80 font-medium tracking-wide uppercase mb-2">
            Follow the Money from Industry to Politics
          </p>
          <div className="w-16 h-0.5 bg-blue-500/50 rounded-full mb-8" />

          <h2 className="text-2xl sm:text-3xl font-semibold text-white text-center mb-3">
            <DecryptedText
              text="Track how industries lobby your representatives"
              animateOn="view"
              sequential={true}
              speed={100}
              revealDirection="start"
              className="text-white"
              encryptedClassName="text-white/20"
            />
          </h2>

          <p className="text-slate-400 text-center max-w-xl mb-8">
            Lobbying, government contracts, enforcement actions, and political donations — across every major industry. Pick a sector to start exploring.
          </p>

          {/* Aggregate stats bar */}
          {stats && (
            <div className="flex flex-wrap justify-center gap-6 mb-4">
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
      </div>

      {/* Sector grid section with Capitol background */}
      <div className="relative flex-1 pb-8">
        <div
          className="absolute inset-0 bg-cover bg-top opacity-[0.04]"
          style={{ backgroundImage: `url(${CAPITOL_BG})` }}
        />

        <div className="relative z-10 max-w-5xl mx-auto px-4 -mt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {SECTORS.map((sector) => (
              <button
                key={sector.slug}
                onClick={() =>
                  navigate(
                    sector.available
                      ? sector.route
                      : `/coming-soon/${sector.slug}`
                  )
                }
                className={`relative group rounded-2xl bg-gradient-to-br ${sector.gradient} p-6 text-left shadow-lg shadow-black/30 hover:scale-[1.03] hover:shadow-2xl hover:shadow-black/40 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 focus:ring-blue-500 border border-white/10`}
              >
                {!sector.available && (
                  <span className="absolute top-3 right-3 rounded-full bg-black/30 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-white/80 uppercase tracking-wider border border-white/10">
                    Soon
                  </span>
                )}
                <div className="text-4xl mb-3 drop-shadow-lg">
                  {sector.icon}
                </div>
                <div className="text-xl font-bold text-white mb-1 drop-shadow-sm">
                  {sector.name}
                </div>
                <div className="text-sm text-white/70 leading-snug">
                  {sector.tagline}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Influence Leaderboard */}
      {(topLobbying.length > 0 || topContracts.length > 0) && (
        <div className="relative pb-16">
          <div
            className="absolute inset-0 bg-cover bg-top opacity-[0.04]"
            style={{ backgroundImage: `url(${CAPITOL_BG})` }}
          />
          <div className="relative z-10 max-w-5xl mx-auto px-4">
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

      {/* Footer */}
      <footer className="border-t border-white/5 bg-slate-950">
        <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            WeThePeople — Follow the money from industry to politics
          </span>
          <span className="text-xs text-slate-600">
            Photos by{" "}
            <a
              href="https://unsplash.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-slate-400 underline"
            >
              Unsplash
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
