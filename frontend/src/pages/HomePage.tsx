import React, { useEffect, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { SECTORS } from "../data/sectors";
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

const SECTOR_ROUTES: Record<string, string> = {
  finance: "/finance",
  health: "/health",
  tech: "/technology",
  technology: "/technology",
  energy: "/energy",
  transportation: "/transportation",
  defense: "/defense",
};

function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

// ─────────────────────────────────────────────────────────────────────
// Hero overline badge — gold dim chip with pulsing dot
// ─────────────────────────────────────────────────────────────────────

function LiveBadge() {
  return (
    <div
      className="inline-flex items-center"
      style={{
        gap: 8,
        border: "1px solid var(--color-accent-dim)",
        borderRadius: "var(--radius-pill)",
        padding: "5px 14px",
        background: "var(--color-accent-dim)",
        marginBottom: 36,
      }}
    >
      <span
        className="animate-pulse-dot"
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
        Civic Transparency Platform
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Stats ticker — horizontally scrolling between hero and sector grid
// ─────────────────────────────────────────────────────────────────────

function StatsTicker({ stats }: { stats: InfluenceStats | null }) {
  const items = stats
    ? [
        `${formatMoney(stats.total_lobbying_spend)} in lobbying tracked`,
        `${stats.politicians_connected.toLocaleString()} politicians monitored`,
        `${SECTORS.length} industry sectors`,
        `${formatMoney(stats.total_contract_value)} in gov contracts`,
        `${stats.total_enforcement_actions.toLocaleString()} enforcement actions`,
        "30+ government data sources",
      ]
    : [
        "$4.2B in lobbying tracked",
        "535 politicians monitored",
        "11 industry sectors",
        "$8.7B in gov contracts",
        "50,000+ enforcement actions",
        "30+ government data sources",
      ];
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
          className="animate-pulse-dot"
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
            color: "var(--color-accent-text)",
            marginBottom: 8,
          }}
        >
          Explore by sector
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

              {/* Tagline — only on hover */}
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  color: "var(--color-text-2)",
                  lineHeight: 1.5,
                  marginTop: 6,
                  display: isHover ? "block" : "none",
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
// Ecosystem row — Civic Hub + sibling sites
// ─────────────────────────────────────────────────────────────────────

function EcosystemRow() {
  // Per CLOD prototype: column layout, 20px padding, border & bg both = accent @ 0.15 alpha,
  // label (14px 600, accent) + sub (12px TEXT2) + "Open →" (marginTop:8, 12px, accent).
  // Accent colours come from README spec tokens — gold / emerald / violet / crimson.
  const tiles = [
    {
      to: "/civic",
      external: false,
      title: "Civic Hub",
      tagline: "Promises, proposals, badges",
      accent: "var(--color-accent)",
      bg: "rgba(197, 160, 40, 0.15)",
      border: "rgba(197, 160, 40, 0.15)",
    },
    {
      to: "https://verify.wethepeopleforus.com",
      external: true,
      title: "Verify Claims",
      tagline: "Fact-check politicians",
      accent: "var(--color-verify)",
      bg: "rgba(16, 185, 129, 0.15)",
      border: "rgba(16, 185, 129, 0.15)",
    },
    {
      to: "https://research.wethepeopleforus.com",
      external: true,
      title: "Research Tools",
      tagline: "Patents, drugs, trials, trades",
      accent: "var(--color-research)",
      bg: "rgba(139, 92, 246, 0.15)",
      border: "rgba(139, 92, 246, 0.15)",
    },
    {
      to: "https://journal.wethepeopleforus.com",
      external: true,
      title: "Influence Journal",
      tagline: "Data-driven investigations",
      accent: "var(--color-journal)",
      bg: "rgba(230, 57, 70, 0.15)",
      border: "rgba(230, 57, 70, 0.15)",
    },
  ];

  return (
    <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px 40px" }}>
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {tiles.map((t) => {
          const content = (
            <>
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  color: t.accent,
                }}
              >
                {t.title}
              </div>
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  color: "var(--color-text-2)",
                }}
              >
                {t.tagline}
              </div>
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  color: t.accent,
                  marginTop: 8,
                }}
              >
                Open →
              </div>
            </>
          );
          const commonStyle: React.CSSProperties = {
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: 20,
            borderRadius: 10,
            background: t.bg,
            border: `1px solid ${t.border}`,
            textDecoration: "none",
            cursor: "pointer",
            transition: "background 0.2s",
          };
          return t.external ? (
            <a
              key={t.title}
              href={t.to}
              target="_blank"
              rel="noopener noreferrer"
              style={commonStyle}
            >
              {content}
            </a>
          ) : (
            <Link key={t.title} to={t.to} style={commonStyle}>
              {content}
            </Link>
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
        {rows.map((l, i) => (
          <Link
            key={l.entity_id}
            to={`${SECTOR_ROUTES[l.sector] || "/"}/${l.entity_id}`}
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
        ))}
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

      <div style={{ marginTop: 14, textAlign: "center" }}>
        <Link
          to="/influence"
          className="inline-flex items-center"
          style={{
            gap: 6,
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            color: "var(--color-accent-text)",
            textDecoration: "none",
          }}
        >
          View full Influence Explorer <ArrowRight style={{ width: 14, height: 14 }} />
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
        <LiveBadge />

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
            maxWidth: 640,
            margin: "0 auto 40px",
          }}
        >
          Follow the money behind every vote, every bill, every contract —
          across 11 sectors of corporate influence.
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

      {/* ── STATS TICKER ── */}
      <StatsTicker stats={stats} />

      {/* ── SECTOR GRID ── */}
      <SectorGrid />

      {/* ── ECOSYSTEM ── */}
      <EcosystemRow />

      {/* ── BELOW-FOLD DISCOVERY ── */}
      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 48 }}>
        <LeaderboardSection topLobbying={topLobbying} topContracts={topContracts} />
      </div>

      <Footer />
    </div>
  );
};

export default HomePage;
