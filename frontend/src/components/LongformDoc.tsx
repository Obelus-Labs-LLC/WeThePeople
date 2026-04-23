import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Footer from './Footer';

/**
 * Longform legal/about/methodology doc template.
 *
 * Matches the design in `WTP Design - Legal, Utility & Auth.html`:
 *   - Hero: overline (gold caps) + Playfair italic title + mono last-updated meta
 *   - Two-column layout: sticky TOC sidebar + numbered sections with mono "NN" prefix
 *   - Optional callout box per section (gold-dim background)
 *   - Optional numbered list per section (mono numerals on left)
 *
 * Shared across AboutPage, MethodologyPage, DisclaimerPage, PrivacyPolicyPage,
 * TermsOfUsePage.
 */

export interface LongformCallout {
  label: string;
  text: string;
}

export interface LongformSection {
  num: number;
  id: string;
  title: string;
  body?: string[];
  list?: React.ReactNode[];
  callout?: LongformCallout;
}

export interface LongformDocProps {
  overline: string;
  title: string;
  lastUpdated: string;
  sections: LongformSection[];
  extras?: React.ReactNode;
  /** Optional slug of the current page used as a back-link target. Defaults to "/". */
  backTo?: string;
  backLabel?: string;
}

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
};

const scrollArea: React.CSSProperties = {
  flex: 1,
};

const contentWrap: React.CSSProperties = {
  maxWidth: 1100,
  width: '100%',
  margin: '0 auto',
  padding: '40px 40px 80px',
};

const backLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  color: 'var(--color-text-2)',
  textDecoration: 'none',
  marginBottom: 24,
  transition: 'color 150ms',
};

const heroWrap: React.CSSProperties = {
  marginBottom: 40,
  paddingBottom: 32,
  borderBottom: '1px solid var(--color-border)',
};

const overlineStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--color-accent-text)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginBottom: 14,
};

const titleStyle: React.CSSProperties = {
  fontFamily: "'Playfair Display', Georgia, serif",
  fontStyle: 'italic',
  fontWeight: 900,
  fontSize: 'clamp(34px, 5vw, 52px)',
  lineHeight: 1.05,
  letterSpacing: '-0.01em',
  color: 'var(--color-text-1)',
  marginBottom: 18,
};

const metaRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 14,
  fontFamily: "'Inter', sans-serif",
  fontSize: 12,
  color: 'var(--color-text-3)',
};

const metaMono: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 11,
  letterSpacing: '0.04em',
};

const metaDot: React.CSSProperties = {
  width: 3,
  height: 3,
  borderRadius: '50%',
  background: 'var(--color-text-3)',
};

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '220px minmax(0, 1fr)',
  gap: 56,
};

const tocSide: React.CSSProperties = {
  position: 'sticky',
  top: 16,
  height: 'fit-content',
  alignSelf: 'start',
};

const tocHeader: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
  marginBottom: 14,
};

const tocList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  borderLeft: '1px solid var(--color-border)',
};

const sectionBlock: React.CSSProperties = {
  marginBottom: 40,
};

const sectionHeadRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 16,
  marginBottom: 16,
};

const sectionNumStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--color-accent)',
};

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: "'Playfair Display', Georgia, serif",
  fontStyle: 'italic',
  fontWeight: 700,
  fontSize: 26,
  letterSpacing: '-0.01em',
  color: 'var(--color-text-1)',
  margin: 0,
};

const paragraphStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 15,
  lineHeight: 1.7,
  color: 'var(--color-text-2)',
  marginBottom: 14,
  maxWidth: 640,
};

const calloutStyle: React.CSSProperties = {
  margin: '20px 0',
  padding: '16px 20px',
  background: 'var(--color-accent-dim)',
  border: '1px solid rgba(197,160,40,0.3)',
  borderRadius: 10,
  maxWidth: 640,
};

const calloutLabel: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--color-accent-text)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 6,
};

const calloutText: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  lineHeight: 1.6,
  color: 'var(--color-text-1)',
};

const listWrap: React.CSSProperties = {
  listStyle: 'none',
  margin: '12px 0',
  padding: 0,
  maxWidth: 640,
};

const listItemStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  padding: '8px 0',
  borderBottom: '1px solid var(--color-border)',
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  lineHeight: 1.6,
  color: 'var(--color-text-2)',
};

const listNumStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--color-accent)',
  flexShrink: 0,
  width: 20,
};

export default function LongformDoc({
  overline,
  title,
  lastUpdated,
  sections,
  extras,
  backTo = '/',
  backLabel = 'Back to Home',
}: LongformDocProps) {
  const [active, setActive] = useState<string | undefined>(sections[0]?.id);

  const readMinutes = Math.max(1, Math.round(sections.length * 1.8));

  const onTocClick = (id: string) => {
    setActive(id);
    // Smooth-scroll to the target section
    if (typeof window !== 'undefined') {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div style={pageShell}>
      <div style={scrollArea}>
        <div style={contentWrap}>
          <Link
            to={backTo}
            style={backLinkStyle}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
          >
            <ArrowLeft size={14} /> {backLabel}
          </Link>

          {/* Hero */}
          <div style={heroWrap}>
            <div style={overlineStyle}>{overline}</div>
            <h1 style={titleStyle}>{title}</h1>
            <div style={metaRow}>
              <span style={metaMono}>
                LAST UPDATED · {lastUpdated.toUpperCase()}
              </span>
              <span style={metaDot} />
              <span>
                {sections.length} section{sections.length !== 1 ? 's' : ''} · ~{readMinutes} min read
              </span>
            </div>
          </div>

          <div style={grid} className="longform-grid">
            {/* TOC sidebar */}
            <aside style={tocSide} className="longform-toc">
              <div style={tocHeader}>Contents</div>
              <div style={tocList}>
                {sections.map((s) => {
                  const isActive = active === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onTocClick(s.id)}
                      style={{
                        padding: '6px 14px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 12,
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? 'var(--color-text-1)' : 'var(--color-text-3)',
                        borderLeft: isActive
                          ? '2px solid var(--color-accent)'
                          : '2px solid transparent',
                        marginLeft: -1,
                        transition: 'all 0.15s',
                      }}
                    >
                      {s.num}. {s.title}
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Content */}
            <div>
              {sections.map((s) => (
                <section key={s.id} id={s.id} style={sectionBlock}>
                  <div style={sectionHeadRow}>
                    <span style={sectionNumStyle}>{s.num.toString().padStart(2, '0')}</span>
                    <h2 style={sectionTitleStyle}>{s.title}</h2>
                  </div>
                  {(s.body || []).map((p, i) => (
                    <p key={i} style={paragraphStyle}>
                      {p}
                    </p>
                  ))}
                  {s.callout && (
                    <div style={calloutStyle}>
                      <div style={calloutLabel}>{s.callout.label}</div>
                      <div style={calloutText}>{s.callout.text}</div>
                    </div>
                  )}
                  {s.list && (
                    <ul style={listWrap}>
                      {s.list.map((li, i) => (
                        <li key={i} style={listItemStyle}>
                          <span style={listNumStyle}>
                            {(i + 1).toString().padStart(2, '0')}
                          </span>
                          <span>{li}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
              {extras}
            </div>
          </div>
        </div>

        {/* Responsive: collapse TOC below 820px */}
        <style>{`
          @media (max-width: 820px) {
            .longform-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
            .longform-toc { position: static !important; }
          }
        `}</style>
      </div>
      <Footer />
    </div>
  );
}
