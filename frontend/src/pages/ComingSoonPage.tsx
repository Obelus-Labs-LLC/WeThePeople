import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import StatusPage from '../components/StatusPage';
import { SECTORS } from '../data/sectors';

/**
 * "Coming soon" page used for sectors that are scheduled but not yet live.
 * Matches the design: three concentric gold rings with "WTP" centered, a
 * "COMING SOON" overline, italic Playfair headline, and two actions (Get
 * notified -> digest signup, Back to dashboard -> /).
 *
 * If the `:slug` param matches a known sector, we personalize the headline
 * with the sector name. Otherwise we fall back to the generic "Still in the
 * lab." copy from the spec.
 */
const ComingSoonPage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const sector = slug ? SECTORS.find((s) => s.slug === slug) : undefined;

  const title = sector ? `${sector.name} is coming.` : 'Still in the lab.';
  const message = sector
    ? `${sector.tagline} We're gathering public data sources and building connectors. Subscribe to the weekly digest to get notified the day it ships.`
    : "This page is under active development. Subscribe to the weekly digest to get notified when it ships \u2014 we're aiming for Q2 2026.";

  const art = (
    <div
      style={{
        marginBottom: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ position: 'relative', width: 120, height: 120 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '1.5px solid var(--color-accent)',
              opacity: 1 - i * 0.3,
              transform: `scale(${1 - i * 0.18})`,
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: 36,
            color: 'var(--color-accent)',
          }}
        >
          WTP
        </div>
      </div>
    </div>
  );

  return (
    <StatusPage
      art={art}
      overline="Coming Soon"
      title={title}
      message={message}
      actions={[
        {
          label: 'Get notified',
          primary: true,
          onClick: () => navigate('/digest'),
        },
        { label: 'Back to dashboard', onClick: () => navigate('/') },
      ]}
    />
  );
};

export default ComingSoonPage;
