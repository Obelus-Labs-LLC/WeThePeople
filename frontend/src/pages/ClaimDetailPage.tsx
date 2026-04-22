import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { apiClient } from "../api/client";
import type { LedgerClaimResponse } from "../api/types";
import BackButton from "../components/BackButton";
import { PoliticsSectorHeader } from "../components/SectorHeader";
import {
  researchContainerVariants,
  researchItemVariants,
} from "../components/research/ResearchToolLayout";

// ── Tier / color maps keyed to design tokens ─────────────────────────
const TIER_COLORS: Record<string, string> = {
  strong: "var(--color-green)",
  moderate: "var(--color-dem)",
  weak: "var(--color-accent)",
  none: "var(--color-red)",
};

const PROGRESS_COLORS: Record<string, string> = {
  enacted: "var(--color-green)",
  passed_committee: "var(--color-accent)",
  introduced: "var(--color-dem)",
  stalled: "var(--color-red)",
  not_started: "var(--color-text-3)",
};

const RELEVANCE_COLORS: Record<string, string> = {
  high: "var(--color-green)",
  medium: "var(--color-dem)",
  low: "var(--color-accent)",
};

// ── Helpers ──────────────────────────────────────────────────────────
function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function tierColor(tier: string): string {
  return TIER_COLORS[tier] ?? TIER_COLORS.none;
}

// ── Timing descriptions ──────────────────────────────────────────────
const TIMING_DESC: Record<string, string> = {
  follow_through: "Action taken after the statement was made, indicating follow-through.",
  retroactive_credit: "Statement references action that was already taken.",
  concurrent: "Statement and action occurred around the same time.",
  pre_commitment: "Statement was made before any related legislative action.",
};

// ── Shared styles ────────────────────────────────────────────────────
const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "var(--color-bg)",
  color: "var(--color-text-1)",
  position: "relative",
};

function DecorLayer({ accent = "var(--color-accent)" }: { accent?: string } = {}) {
  return (
    <div style={{ pointerEvents: "none", position: "fixed", inset: 0, zIndex: 0 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at 50% -20%, ${accent} 0%, transparent 60%)`,
          opacity: 0.06,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(235,229,213,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(235,229,213,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          opacity: 0.5,
        }}
      />
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────
const ClaimDetailPage: React.FC = () => {
  const { claim_id } = useParams<{ claim_id: string }>();
  const [claim, setClaim] = useState<LedgerClaimResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!claim_id) return;
    setLoading(true);
    setError(null);
    apiClient
      .getClaim(claim_id)
      .then((data) => {
        if (cancelled) return;
        setClaim(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Failed to load claim");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [claim_id]);

  // ── Loading ──
  if (loading) {
    return (
      <div style={pageStyle}>
        <DecorLayer />
        <div
          style={{
            position: "relative",
            zIndex: 10,
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "14px",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "999px",
              border: "3px solid rgba(235,229,213,0.1)",
              borderTopColor: "var(--color-accent)",
              animation: "spin 0.9s linear infinite",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--color-text-3)",
            }}
          >
            Loading action detail…
          </span>
          <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div style={pageStyle}>
        <DecorLayer accent="var(--color-red)" />
        <div
          style={{
            position: "relative",
            zIndex: 10,
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: "520px" }}>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "18px",
                color: "var(--color-red)",
                margin: 0,
              }}
            >
              {error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!claim) {
    return (
      <div style={pageStyle}>
        <DecorLayer />
        <div
          style={{
            position: "relative",
            zIndex: 10,
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p style={{ fontFamily: "var(--font-body)", fontSize: "16px", color: "var(--color-text-3)" }}>
            Action not found.
          </p>
        </div>
      </div>
    );
  }

  const tc = tierColor(claim.tier);
  const score = claim.score ?? 0;
  const action = claim.matched_action;

  return (
    <div style={pageStyle}>
      <DecorLayer accent={tc} />
      <div
        style={{
          position: "relative",
          zIndex: 10,
          margin: "0 auto",
          maxWidth: "1100px",
          padding: "48px 32px 64px",
        }}
      >
        <motion.div
          variants={researchContainerVariants}
          initial="hidden"
          animate="visible"
          style={{ display: "flex", flexDirection: "column", gap: "28px" }}
        >
          {/* ── Header ── */}
          <motion.div variants={researchItemVariants} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <PoliticsSectorHeader />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
              <BackButton to={`/politics/people/${claim.person_id}`} label={claim.display_name} />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--color-text-3)",
                }}
              >
                Action Detail
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
              <span style={{ position: "relative", display: "inline-flex", height: "8px", width: "8px" }}>
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "999px",
                    background: tc,
                    opacity: 0.45,
                    animation: "research-ping 1.6s cubic-bezier(0,0,0.2,1) infinite",
                  }}
                />
                <span
                  style={{
                    position: "relative",
                    display: "inline-flex",
                    height: "8px",
                    width: "8px",
                    borderRadius: "999px",
                    background: tc,
                    boxShadow: `0 0 10px ${tc}`,
                  }}
                />
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: tc,
                }}
              >
                Tier · {claim.tier}
              </span>
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontWeight: 900,
                fontSize: "clamp(32px, 4vw, 48px)",
                letterSpacing: "-0.02em",
                lineHeight: 1.08,
                color: "var(--color-text-1)",
                margin: 0,
              }}
            >
              {claim.normalized_text}
            </h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "4px" }}>
              {claim.intent_type && (
                <Chip accent="var(--color-dem)">{humanize(claim.intent_type)}</Chip>
              )}
              {claim.policy_area && <Chip accent="var(--color-text-3)">{claim.policy_area}</Chip>}
              {claim.claim_date && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--color-text-3)",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  {formatDate(claim.claim_date)}
                </span>
              )}
            </div>
          </motion.div>

          {/* ── Score Hero ── */}
          <motion.div
            variants={researchItemVariants}
            style={{
              borderRadius: "16px",
              border: "1px solid rgba(235,229,213,0.08)",
              background: "var(--color-surface)",
              padding: "28px",
              display: "flex",
              alignItems: "center",
              gap: "28px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "260px" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "var(--color-text-3)",
                }}
              >
                Relevance Score
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "64px",
                  fontWeight: 600,
                  color: tc,
                  lineHeight: 1,
                }}
              >
                {Math.round(score * 100)}%
              </span>
              <div
                style={{
                  height: "6px",
                  width: "100%",
                  maxWidth: "280px",
                  background: "rgba(235,229,213,0.08)",
                  borderRadius: "999px",
                  overflow: "hidden",
                  marginTop: "4px",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.round(score * 100)}%`,
                    background: tc,
                    transition: "width 1s ease",
                  }}
                />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: "260px" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "var(--color-text-3)",
                }}
              >
                Key Signals
              </span>
              {claim.why && claim.why.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
                  {claim.why.map((signal, i) => (
                    <Chip key={i} accent="var(--color-dem)">
                      {signal}
                    </Chip>
                  ))}
                </div>
              ) : (
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "13px",
                    color: "var(--color-text-3)",
                    margin: "10px 0 0",
                  }}
                >
                  No signals available
                </p>
              )}
            </div>
          </motion.div>

          {/* ── Assessment Grid ── */}
          <motion.div
            variants={researchItemVariants}
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}
          >
            <AssessmentCard label="Timing" accent={tc}>
              {claim.timing ? (
                <>
                  <p
                    style={{
                      fontFamily: "var(--font-display)",
                      fontStyle: "italic",
                      fontSize: "28px",
                      color: "var(--color-text-1)",
                      margin: "6px 0 6px",
                      lineHeight: 1.1,
                    }}
                  >
                    {humanize(claim.timing)}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: "13px",
                      color: "var(--color-text-3)",
                      lineHeight: 1.55,
                      margin: 0,
                    }}
                  >
                    {TIMING_DESC[claim.timing] ?? "Timing relationship between claim and action."}
                  </p>
                </>
              ) : (
                <NotAssessed />
              )}
            </AssessmentCard>

            <AssessmentCard label="Progress" accent={tc}>
              {claim.progress ? (
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                    fontSize: "28px",
                    color: PROGRESS_COLORS[claim.progress] ?? "var(--color-text-3)",
                    margin: "6px 0 0",
                    lineHeight: 1.1,
                  }}
                >
                  {humanize(claim.progress)}
                </p>
              ) : (
                <NotAssessed />
              )}
            </AssessmentCard>

            <AssessmentCard label="Relevance" accent={tc}>
              {claim.relevance ? (
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                    fontSize: "28px",
                    color: RELEVANCE_COLORS[claim.relevance] ?? "var(--color-text-3)",
                    margin: "6px 0 0",
                    lineHeight: 1.1,
                  }}
                >
                  {claim.relevance.charAt(0).toUpperCase() + claim.relevance.slice(1)}
                </p>
              ) : (
                <NotAssessed />
              )}
            </AssessmentCard>
          </motion.div>

          {/* ── Matched Legislative Action ── */}
          {action && (
            <motion.div
              variants={researchItemVariants}
              style={{
                borderRadius: "16px",
                border: "1px solid rgba(235,229,213,0.08)",
                background: "var(--color-surface)",
                padding: "28px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "13px",
                  fontWeight: 700,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "var(--color-text-1)",
                  margin: 0,
                }}
              >
                Matched Legislative Action
              </h2>

              {action.bill_type && action.bill_number && (
                <span
                  style={{
                    display: "inline-block",
                    alignSelf: "flex-start",
                    padding: "5px 12px",
                    borderRadius: "999px",
                    border: "1px solid rgba(74,127,222,0.3)",
                    background: "rgba(74,127,222,0.08)",
                    color: "var(--color-dem)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                  }}
                >
                  {action.bill_type.toUpperCase()} {action.bill_number}
                </span>
              )}

              <h3
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "18px",
                  fontWeight: 500,
                  color: "var(--color-text-1)",
                  margin: 0,
                  lineHeight: 1.4,
                }}
              >
                {action.title}
              </h3>

              {action.date && (
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--color-text-3)",
                    margin: 0,
                  }}
                >
                  {formatDate(action.date)}
                </p>
              )}

              {action.summary && (
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "14px",
                    color: "var(--color-text-2)",
                    lineHeight: 1.6,
                    margin: 0,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {action.summary}
                </p>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "6px" }}>
                {claim.matched_bill_id && (
                  <Link
                    to={`/politics/bill/${claim.matched_bill_id}`}
                    style={pillLinkStyle("var(--color-dem)")}
                  >
                    View Bill Detail →
                  </Link>
                )}
                {action.source_url && (
                  <a
                    href={action.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={pillLinkStyle("var(--color-text-3)")}
                  >
                    View Source →
                  </a>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Footer actions ── */}
          <motion.div
            variants={researchItemVariants}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              paddingTop: "8px",
            }}
          >
            {claim.source_url ? (
              <a
                href={claim.source_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--color-text-3)",
                  textDecoration: "none",
                }}
              >
                View Source →
              </a>
            ) : (
              <span />
            )}
            <Link
              to={`/politics/people/${claim.person_id}`}
              style={{
                padding: "10px 22px",
                borderRadius: "999px",
                background: "var(--color-accent)",
                color: "#0A0A0F",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                textDecoration: "none",
              }}
            >
              View Member Profile →
            </Link>
          </motion.div>
        </motion.div>
      </div>

      <style>{`
        @keyframes research-ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

// ── Inline sub-components ────────────────────────────────────────────
function Chip({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <span
      style={{
        padding: "5px 12px",
        borderRadius: "999px",
        border: `1px solid ${accent}55`,
        background: `${accent}14`,
        color: accent,
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

function AssessmentCard({
  label,
  children,
  accent,
}: {
  label: string;
  children: React.ReactNode;
  accent: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "20px",
        borderRadius: "14px",
        border: "1px solid rgba(235,229,213,0.08)",
        background: "var(--color-surface)",
        minHeight: "130px",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--color-text-3)",
        }}
      >
        {label}
      </span>
      {children}
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "3px",
          background: accent,
          opacity: 0.4,
        }}
      />
    </div>
  );
}

function NotAssessed() {
  return (
    <p
      style={{
        fontFamily: "var(--font-display)",
        fontStyle: "italic",
        fontSize: "24px",
        color: "var(--color-text-3)",
        margin: "6px 0 0",
        lineHeight: 1.1,
        opacity: 0.6,
      }}
    >
      Not assessed
    </p>
  );
}

function pillLinkStyle(color: string): React.CSSProperties {
  return {
    padding: "8px 18px",
    borderRadius: "999px",
    border: `1px solid ${color}55`,
    color,
    background: "transparent",
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  };
}

export default ClaimDetailPage;
