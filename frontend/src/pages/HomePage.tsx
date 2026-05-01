import React, { useEffect, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { SECTORS } from "../data/sectors";
import { useAuth } from "../contexts/AuthContext";
import { getApiBaseUrl } from "../api/client";
import {
  fetchInfluenceStats,
  fetchTopLobbying,
  fetchTopContracts,
  type InfluenceStats,
  type InfluenceLeader,
} from "../api/influence";
import {
  ArrowRight,
  MapPin,
  TrendingUp,
} from "lucide-react";
import Footer from "../components/Footer";
import SiteHeader from "../components/SiteHeader";

// Per-sector background tints shown on hover over a tile (see redesign spec).
// No icons on tiles — the slug label + name + tagline + accent bar carry meaning.
const SECTOR_BG_TINTS: Record<string, string> = {
  politics:       "rgba(40, 70, 130, 0.18)",
  finance:        "rgba(30, 100, 70, 0.18)",
  health:         "rgba(120, 30, 65, 0.18)",
  energy:         "rgba(130, 70, 20, 0.18)",
  technology:     "rgba(65, 30, 140, 0.18)",
  defense:        "rgba(25, 30, 80, 0.18)",
  transportation: "rgba(25, 60, 100, 0.18)",
  chemicals:      "rgba(15, 80, 80, 0.18)",
  agriculture:    "rgba(35, 85, 25, 0.18)",
  telecom:        "rgba(15, 55, 95, 0.18)",
  education:      "rgba(65, 20, 130, 0.18)",
};

// Keep in sync with App.tsx routes and SECTORS in src/data/sectors.ts.
// Leaderboard rows whose sector isn't keyed here are dropped silently —
// previously that meant chemicals/agriculture/telecom/education entries
// disappeared from the homepage even though the API returned them.
const SECTOR_ROUTES: Record<string, string> = {
  finance: "/finance",
  health: "/health",
  tech: "/technology",
  technology: "/technology",
  energy: "/energy",
  transportation: "/transportation",
  defense: "/defense",
  chemicals: "/chemicals",
  agriculture: "/agriculture",
  telecom: "/telecom",
  education: "/education",
};

function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

// ─────────────────────────────────────────────────────────────────────
// Stats ticker — horizontally scrolling between hero and sector grid
// ─────────────────────────────────────────────────────────────────────

function StatsTicker({ stats }: { stats: InfluenceStats | null }) {
  // Only show ticker entries we can actually back with live data. The
  // ticker used to fall back to hard-coded numbers ("$4.2B in lobbying
  // tracked, 535 politicians monitored, ...") whenever /influence/stats
  // failed — that presented fabricated figures as live data, which is
  // exactly the fabrication-guard problem we cleaned up elsewhere.
  // Static-only entries (sector count, sources count) are safe; live
  // entries are skipped if the stats payload is missing.
  const items: string[] = [];
  if (stats) {
    items.push(`${formatMoney(stats.total_lobbying_spend)} in lobbying tracked`);
    items.push(`${stats.politicians_connected.toLocaleString()} politicians monitored`);
    items.push(`${formatMoney(stats.total_contract_value)} in gov contracts`);
    items.push(`${stats.total_enforcement_actions.toLocaleString()} enforcement actions`);
  }
  items.push(`${SECTORS.length} industry sectors`);
  items.push("30+ government data sources");
  // Doubled for seamless translateX(-50%) loop
  const loop = [...items, ...items];

  return (
    <div
      className="flex items-center overflow-hidden"
      style={{
        borderTop: "1px solid var(--color-border)",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      {/* Fixed LIVE badge */}
      <div
        className="flex items-center shrink-0"
        style={{
          gap: 8,
          padding: "10px 20px",
          borderRight: "1px solid var(--color-border)",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--color-accent)",
          }}
        />
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--color-accent-text)",
          }}
        >
          Live
        </span>
      </div>

      {/* Scrolling track */}
      <div className="flex-1 overflow-hidden" style={{ padding: "10px 0" }}>
        <div className="animate-ticker flex whitespace-nowrap">
          {loop.map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                color: "var(--color-text-2)",
                padding: "0 28px",
              }}
            >
              {item}
              <span
                style={{
                  marginLeft: 28,
                  color: "var(--color-accent-text)",
                }}
              >
                ·
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Personalized rail — logged-in users see their picked sectors first
// with quick-jumps to each, plus a "your watchlist" pill row when
// they've followed entities. Renders nothing for signed-out users
// or for signed-in users who haven't completed onboarding (so the
// landing page doesn't sprout an empty card).
// ─────────────────────────────────────────────────────────────────────

interface PersonalizationPayload {
  completed: boolean;
  zip_code: string | null;
  home_state: string | null;
  lifestyle_categories: string[];
  current_concern: string | null;
}

interface WatchlistRow {
  id: number;
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  sector: string | null;
}

// Map onboarding sector keys to the SECTORS row in src/data/sectors.ts
// so we can render the user's picks as tiles with the right route.
function _sectorByOnboardingKey(key: string): typeof SECTORS[number] | null {
  const k = (key || "").toLowerCase();
  // Onboarding canonical → SECTORS slug
  const aliases: Record<string, string> = {
    finance: "finance",
    banking: "finance",
    health: "health",
    healthcare: "health",
    housing: "housing", // not in SECTORS yet; falls through
    energy: "energy",
    transportation: "transportation",
    technology: "technology",
    tech: "technology",
    telecom: "telecom",
    education: "education",
    agriculture: "agriculture",
    food: "agriculture",
    chemicals: "chemicals",
    defense: "defense",
  };
  const slug = aliases[k] || k;
  return SECTORS.find((s) => s.slug === slug) ?? null;
}

function PersonalizedRail() {
  const { isAuthenticated, authedFetch } = useAuth();
  const [pers, setPers] = useState<PersonalizationPayload | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    const apiBase = getApiBaseUrl();
    Promise.all([
      authedFetch(`${apiBase}/auth/personalization`)
        .then(async (r) => (r.ok ? r.json() : null))
        .catch(() => null),
      authedFetch(`${apiBase}/auth/watchlist`)
        .then(async (r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([p, w]) => {
      if (cancelled) return;
      if (p && p.completed) setPers(p);
      if (w && Array.isArray(w.items)) setWatchlist(w.items);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authedFetch]);

  // Hide entirely for signed-out users and for users who haven't
  // onboarded yet AND have no watchlist (nothing to render).
  if (!loaded) return null;
  if (!isAuthenticated) return null;
  if (!pers && watchlist.length === 0) return null;

  const userSectors = (pers?.lifestyle_categories ?? [])
    .map(_sectorByOnboardingKey)
    .filter((s): s is NonNullable<typeof s> => s !== null && s.available);

  // Cap watchlist preview at 6 so the rail stays compact.
  const watchlistPreview = watchlist.slice(0, 6);

  return (
    <section
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "32px 32px 8px",
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--color-accent-text)",
            marginBottom: 8,
          }}
        >
          For you
        </div>
        <h2
          style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 700,
            fontSize: 18,
            color: "var(--color-text-1)",
            margin: 0,
          }}
        >
          {userSectors.length > 0
            ? "Pick up where you left off"
            : "Your watchlist"}
        </h2>
      </div>

      {userSectors.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: watchlistPreview.length > 0 ? 14 : 0 }}>
          {userSectors.map((s) => (
            <Link
              key={s.slug}
              to={s.route}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid rgba(197,160,40,0.35)",
                background: "rgba(197,160,40,0.06)",
                color: "var(--color-text-1)",
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <span aria-hidden style={{ fontSize: 14 }}>{s.icon}</span>
              {s.name}
            </Link>
          ))}
          <Link
            to="/account?tab=personalization"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid var(--color-border)",
              color: "var(--color-text-3)",
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Edit
          </Link>
        </div>
      )}

      {watchlistPreview.length > 0 && (
        <div>
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--color-text-3)",
              marginBottom: 8,
            }}
          >
            Watchlist · {watchlist.length}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {watchlistPreview.map((w) => {
              const href = (() => {
                if (w.entity_type === "person" || w.entity_type === "politician") {
                  return `/politics/people/${w.entity_id}`;
                }
                if (w.entity_type === "bill") return `/politics/bill/${w.entity_id}`;
                if (w.entity_type === "institution" || w.sector === "finance") {
                  return `/finance/${w.entity_id}`;
                }
                if (w.entity_type === "sector") {
                  const found = SECTORS.find((s) => s.slug === w.entity_id);
                  return found?.route ?? "/";
                }
                if (w.entity_type === "company" && w.sector) {
                  const slug = w.sector === "tech" ? "technology" : w.sector;
                  return `/${slug}/${w.entity_id}`;
                }
                return "/";
              })();
              return (
                <Link
                  key={w.id}
                  to={href}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 999,
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-2)",
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 12,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    maxWidth: 220,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "inline-block",
                  }}
                >
                  {w.entity_name || w.entity_id}
                </Link>
              );
            })}
            {watchlist.length > 6 && (
              <Link
                to="/account?tab=follows"
                style={{
                  padding: "5px 10px",
                  borderRadius: 999,
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-3)",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  textDecoration: "none",
                }}
              >
                +{watchlist.length - 6} more
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sector tile grid — hairline-divided grid, BG tint + accent bar on hover
// ─────────────────────────────────────────────────────────────────────

function SectorGrid() {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 32px" }}>
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--color-text-3)",
            marginBottom: 8,
          }}
        >
          Or browse by industry
        </div>
        <h2
          style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 700,
            fontSize: 18,
            color: "var(--color-text-1)",
            margin: 0,
          }}
        >
          {SECTORS.length} industries. One question: who's paying whom?
        </h2>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 1,
          border: "1px solid var(--color-border)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--color-border)", // hairline gap color
        }}
      >
        {SECTORS.map((sector) => {
          const isHover = hovered === sector.slug;
          const tint = SECTOR_BG_TINTS[sector.slug] || "transparent";
          return (
            <button
              key={sector.slug}
              type="button"
              onClick={() => (sector.available ? navigate(sector.route) : undefined)}
              onMouseEnter={() => setHovered(sector.slug)}
              onMouseLeave={() => setHovered(null)}
              disabled={!sector.available}
              className="relative text-left focus:outline-none"
              style={{
                padding: "24px 20px",
                background: isHover ? tint : "var(--color-surface)",
                cursor: sector.available ? "pointer" : "not-allowed",
                opacity: sector.available ? 1 : 0.45,
                transition: "background 0.25s",
                overflow: "hidden",
                border: "none",
              }}
            >
              {/* Sector slug label */}
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: isHover ? "var(--color-text-1)" : "var(--color-text-3)",
                  marginBottom: 8,
                  transition: "color 0.2s",
                }}
              >
                {sector.slug}
              </div>

              {/* Sector name */}
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--color-text-1)",
                  lineHeight: 1.2,
                }}
              >
                {sector.name}
              </div>

              {/* Tagline — always visible so each tile telegraphs what's
                  inside instead of hiding the promise behind a hover. */}
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  color: "var(--color-text-2)",
                  lineHeight: 1.5,
                  marginTop: 6,
                }}
              >
                {sector.tagline}
              </div>

              {/* Bottom accent bar — slides in on hover */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: "var(--color-accent)",
                  transform: isHover ? "scaleX(1)" : "scaleX(0)",
                  transformOrigin: "left",
                  transition: "transform 0.25s ease",
                }}
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Influence leaderboard — top lobbying + top contracts
// ─────────────────────────────────────────────────────────────────────

function LeaderboardSection({
  topLobbying,
  topContracts,
}: {
  topLobbying: InfluenceLeader[];
  topContracts: InfluenceLeader[];
}) {
  if (topLobbying.length === 0 && topContracts.length === 0) return null;

  const Card = ({
    title,
    rows,
    valueColor,
    valueKey,
  }: {
    title: string;
    rows: InfluenceLeader[];
    valueColor: string;
    valueKey: "total_lobbying" | "total_contracts";
  }) => (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        padding: 20,
      }}
    >
      <h3
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--color-text-3)",
          marginBottom: 14,
        }}
      >
        {title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map((l, i) => {
          // Skip rows whose sector we don't recognise — falling back to
          // "/" produced URLs like "//entity_id" (double slash) that
          // matched no route and 404'd via NotFoundPage.
          const sectorRoute = SECTOR_ROUTES[l.sector];
          if (!sectorRoute) return null;
          return (
          <Link
            key={l.entity_id}
            to={`${sectorRoute}/${l.entity_id}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 4px",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
            }}
          >
            <div className="flex items-center" style={{ gap: 12, minWidth: 0 }}>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  color: "var(--color-text-3)",
                  width: 20,
                }}
              >
                {i + 1}.
              </span>
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--color-text-1)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {l.display_name}
              </span>
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--color-text-3)",
                }}
              >
                {l.sector}
              </span>
            </div>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                color: valueColor,
                marginLeft: 12,
              }}
            >
              {formatMoney((l[valueKey] as number) || 0)}
            </span>
          </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px 48px" }}>
      <div className="flex items-center" style={{ gap: 10, marginBottom: 16 }}>
        <TrendingUp style={{ width: 20, height: 20, color: "var(--color-accent-text)" }} />
        <h2
          style={{
            fontFamily: "'Playfair Display', serif",
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: 22,
            color: "var(--color-text-1)",
            letterSpacing: "-0.01em",
            margin: 0,
          }}
        >
          Influence leaderboard
        </h2>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
        {topLobbying.length > 0 && (
          <Card
            title="Top lobbying spenders"
            rows={topLobbying}
            valueColor="var(--color-green)"
            valueKey="total_lobbying"
          />
        )}
        {topContracts.length > 0 && (
          <Card
            title="Top gov contract recipients"
            rows={topContracts}
            valueColor="var(--color-dem)"
            valueKey="total_contracts"
          />
        )}
      </div>

      <div style={{ marginTop: 18, textAlign: "center" }}>
        <Link
          to="/influence"
          className="inline-flex items-center"
          style={{
            gap: 8,
            fontFamily: "'Inter', sans-serif",
            fontSize: 15,
            fontWeight: 600,
            color: "var(--color-accent-text)",
            textDecoration: "none",
          }}
        >
          See the full Influence Explorer <ArrowRight style={{ width: 16, height: 16 }} />
        </Link>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<InfluenceStats | null>(null);
  const [topLobbying, setTopLobbying] = useState<InfluenceLeader[]>([]);
  const [topContracts, setTopContracts] = useState<InfluenceLeader[]>([]);
  const [zipCode, setZipCode] = useState("");
  const zipInputRef = useRef<HTMLInputElement>(null);
  const zipValid = zipCode.replace(/\D/g, "").length === 5;

  useEffect(() => {
    let cancelled = false;
    fetchInfluenceStats().then((s) => { if (!cancelled) setStats(s); }).catch((err) => { console.warn('[HomePage] fetch failed:', err); });
    fetchTopLobbying(5)
      .then((r) => { if (!cancelled) setTopLobbying(r.leaders); })
      .catch((err) => { console.warn('[HomePage] fetch failed:', err); });
    fetchTopContracts(5)
      .then((r) => { if (!cancelled) setTopContracts(r.leaders); })
      .catch((err) => { console.warn('[HomePage] fetch failed:', err); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text-1)" }}
    >
      <SiteHeader />

      {/* ── HERO ── */}
      <section
        className="flex flex-col items-center"
        style={{
          minHeight: "82vh",
          justifyContent: "center",
          padding: "80px 32px 60px",
          textAlign: "center",
          position: "relative",
        }}
      >
        <h1
          style={{
            fontFamily: "'Playfair Display', serif",
            fontStyle: "italic",
            fontWeight: 900,
            fontSize: "clamp(52px, 7vw, 96px)",
            lineHeight: 1.0,
            letterSpacing: "-0.01em",
            color: "var(--color-text-1)",
            margin: "0 0 16px",
            maxWidth: 900,
          }}
        >
          We The People.
        </h1>

        <p
          style={{
            fontFamily: "'Playfair Display', serif",
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: "clamp(20px, 2.5vw, 30px)",
            lineHeight: 1.5,
            color: "var(--color-text-2)",
            maxWidth: 680,
            margin: "0 auto 24px",
          }}
        >
          See who funds your representatives — every vote, every bill,
          every contract.
        </p>

        {/* Brief tension line — sharpens relevance without rage-bait. */}
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            letterSpacing: "0.02em",
            color: "var(--color-text-3)",
            margin: "0 0 28px",
          }}
        >
          Public records, made readable.
        </p>

        {/* ZIP form */}
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
          className="flex flex-wrap items-center justify-center"
          style={{ gap: 12, marginBottom: 32, width: "100%" }}
        >
          <div style={{ position: "relative" }}>
            <MapPin
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                width: 18,
                height: 18,
                color: zipValid ? "var(--color-accent-text)" : "var(--color-text-3)",
                transition: "color 0.2s",
              }}
            />
            <input
              ref={zipInputRef}
              type="text"
              inputMode="numeric"
              maxLength={5}
              pattern="[0-9]{5}"
              placeholder="Enter zip code"
              value={zipCode}
              onChange={(e) =>
                setZipCode(e.target.value.replace(/\D/g, "").slice(0, 5))
              }
              style={{
                width: 280,
                padding: "14px 14px 14px 42px",
                borderRadius: "var(--radius-card)",
                background: "var(--color-surface)",
                border: `1.5px solid ${zipValid ? "var(--color-accent)" : "var(--color-border-hover)"}`,
                fontFamily: "'Inter', sans-serif",
                fontSize: 16,
                color: "var(--color-text-1)",
                outline: "none",
                transition: "border-color 0.2s",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!zipValid}
            className="inline-flex items-center justify-center"
            style={{
              gap: 8,
              padding: "14px 24px",
              borderRadius: "var(--radius-card)",
              background: "rgba(197, 160, 40, 0.18)",
              color: "var(--color-accent-text)",
              fontFamily: "'Inter', sans-serif",
              fontSize: 15,
              fontWeight: 600,
              border: "1px solid rgba(197, 160, 40, 0.35)",
              cursor: zipValid ? "pointer" : "not-allowed",
              opacity: zipValid ? 1 : 0.45,
              transition: "opacity 0.2s",
            }}
          >
            <span>Find My Representatives</span>
            <ArrowRight style={{ width: 16, height: 16 }} />
          </button>
        </form>

        {/* Secondary links */}
        <div
          className="flex flex-wrap items-center justify-center"
          style={{ gap: 16, fontFamily: "'Inter', sans-serif", fontSize: 13 }}
        >
          <Link
            to="/digest"
            className="inline-flex items-center"
            style={{
              gap: 6,
              color: "var(--color-accent-text)",
              textDecoration: "none",
            }}
          >
            Get weekly digest <ArrowRight style={{ width: 14, height: 14 }} />
          </Link>
          <span style={{ color: "var(--color-text-3)" }}>·</span>
          <a
            href="https://x.com/WTPForUs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center"
            style={{
              gap: 6,
              color: "var(--color-text-3)",
              textDecoration: "none",
            }}
          >
            <svg style={{ width: 12, height: 12 }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            @WTPForUs
          </a>
        </div>
      </section>

      {/* ── PERSONALIZED RAIL (logged-in only) ── */}
      <PersonalizedRail />

      {/* ── STATS TICKER ── */}
      <StatsTicker stats={stats} />

      {/* ── SECTOR GRID ── */}
      <SectorGrid />

      {/* Sibling sites (Verify / Research / Journal) and Civic Hub now
          live exclusively in the EcosystemNav switcher at the top of the
          page; the redundant landing-page tile row was removed. */}

      {/* ── BELOW-FOLD DISCOVERY ── */}
      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 48 }}>
        <LeaderboardSection topLobbying={topLobbying} topContracts={topContracts} />
      </div>

      <Footer />
    </div>
  );
};

export default HomePage;
