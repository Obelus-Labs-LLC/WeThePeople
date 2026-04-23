import React from 'react';
import { useNavigate } from 'react-router-dom';
import StatusPage from '../components/StatusPage';

/**
 * 404 page. Matches the design: big Playfair "4" on each side of a gold
 * ringed "0" with a red LED-dot accent. ERROR 404 mono overline, italic
 * headline, and two actions (Home + Report broken link).
 *
 * The "Report a broken link" action opens a pre-filled mailto to support
 * with the bad path captured. Previously we surfaced a sector-link grid on
 * this page; the new design moves that affordance to the home/search flow.
 */
const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  const currentPath =
    typeof window !== 'undefined' ? window.location.pathname : '';

  const art = (
    <div
      style={{
        marginBottom: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontStyle: 'italic',
          fontWeight: 900,
          fontSize: 'clamp(96px, 14vw, 140px)',
          color: 'var(--color-accent-dim)',
          letterSpacing: '-0.05em',
          lineHeight: 1,
        }}
      >
        4
      </div>
      <div
        style={{
          width: 'clamp(80px, 11vw, 110px)',
          height: 'clamp(80px, 11vw, 110px)',
          border: '3px solid var(--color-accent)',
          borderRadius: '50%',
          margin: '0 6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <span
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 700,
            fontSize: 'clamp(44px, 6vw, 64px)',
            color: 'var(--color-accent)',
          }}
        >
          0
        </span>
        <span
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: 'var(--color-red)',
            boxShadow: '0 0 12px var(--color-red)',
          }}
        />
      </div>
      <div
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontStyle: 'italic',
          fontWeight: 900,
          fontSize: 'clamp(96px, 14vw, 140px)',
          color: 'var(--color-accent-dim)',
          letterSpacing: '-0.05em',
          lineHeight: 1,
        }}
      >
        4
      </div>
    </div>
  );

  const reportBrokenLink = () => {
    const subject = encodeURIComponent('Broken link report');
    const body = encodeURIComponent(
      `I hit a 404 on the path: ${currentPath}\n\nI got there from: ` +
        (typeof document !== 'undefined' && document.referrer
          ? document.referrer
          : '(direct nav)'),
    );
    window.location.href = `mailto:support@wethepeopleforus.com?subject=${subject}&body=${body}`;
  };

  return (
    <StatusPage
      art={art}
      code="404"
      title="This page doesn't exist."
      message="Either the URL is wrong, the page moved, or we removed it. If you followed a link from another site, let us know so we can redirect it."
      actions={[
        { label: 'Back to home', primary: true, onClick: () => navigate('/') },
        { label: 'Report a broken link', onClick: reportBrokenLink },
      ]}
      footer={
        currentPath ? (
          <div
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 11,
              color: 'var(--color-text-3)',
              wordBreak: 'break-all',
              letterSpacing: '0.04em',
            }}
          >
            {currentPath}
          </div>
        ) : undefined
      }
    />
  );
};

export default NotFoundPage;
