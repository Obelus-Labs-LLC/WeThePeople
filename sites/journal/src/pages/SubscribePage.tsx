import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Mail, BarChart3, Shield, Zap } from 'lucide-react';

const backLinkStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
  textDecoration: 'none',
  transition: 'color 0.2s',
};

export default function SubscribePage() {
  return (
    <main
      id="main-content"
      className="flex-1 px-4 py-10 sm:py-16"
      style={{ color: 'var(--color-text-1)' }}
    >
      <div className="max-w-[720px] mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 mb-8"
          style={backLinkStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-1)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-3)')}
        >
          <ArrowLeft size={12} />
          Back to Journal
        </Link>

        <div className="text-center mb-14">
          <div
            className="inline-flex items-center justify-center mb-5"
            style={{
              width: 56,
              height: 56,
              borderRadius: '999px',
              background: 'rgba(197,160,40,0.14)',
              border: '1px solid rgba(197,160,40,0.35)',
            }}
          >
            <Mail size={24} style={{ color: 'var(--color-accent-text)' }} />
          </div>
          <p
            className="mb-3"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              color: 'var(--color-accent-text)',
            }}
          >
            Weekly Digest
          </p>
          <h1
            className="mb-4"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 'clamp(34px, 5vw, 52px)',
              letterSpacing: '-0.025em',
              lineHeight: 1.05,
              color: 'var(--color-text-1)',
            }}
          >
            Subscribe to the Weekly Digest
          </h1>
          <p
            className="max-w-xl mx-auto"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '16px',
              lineHeight: 1.65,
              color: 'var(--color-text-2)',
            }}
          >
            Data-driven investigations, congressional trade alerts, lobbying activity summaries, and
            enforcement action roundups — personalized to your representatives.
          </p>
        </div>

        {/* What you get */}
        <div className="grid gap-4 mb-10">
          {[
            {
              icon: BarChart3,
              title: 'Data Investigations',
              description:
                'Long-form stories that follow the money from industry to politics, backed by public records.',
            },
            {
              icon: Zap,
              title: 'Trade Alerts',
              description:
                "When your representatives buy or sell stocks, you'll know about it — with filing delay tracking.",
            },
            {
              icon: Shield,
              title: 'Enforcement Roundup',
              description:
                'Regulatory actions, sanctions checks, and enforcement patterns across all 11 sectors.',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="flex gap-4"
                style={{
                  borderRadius: '14px',
                  border: '1px solid rgba(235,229,213,0.08)',
                  background: 'var(--color-surface)',
                  padding: '20px',
                }}
              >
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '10px',
                    background: 'rgba(197,160,40,0.12)',
                    border: '1px solid rgba(197,160,40,0.28)',
                  }}
                >
                  <Icon size={20} style={{ color: 'var(--color-accent-text)' }} />
                </div>
                <div>
                  <h3
                    className="mb-1"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      fontWeight: 700,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-1)',
                    }}
                  >
                    {item.title}
                  </h3>
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '14px',
                      lineHeight: 1.65,
                      color: 'var(--color-text-2)',
                    }}
                  >
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div
          className="text-center relative overflow-hidden"
          style={{
            borderRadius: '16px',
            border: '1px solid rgba(197,160,40,0.25)',
            background: 'linear-gradient(135deg, rgba(197,160,40,0.08) 0%, var(--color-surface) 60%)',
            padding: '36px 28px',
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(197,160,40,0.15) 1px, transparent 0)',
              backgroundSize: '24px 24px',
              opacity: 0.3,
              pointerEvents: 'none',
            }}
          />
          <div className="relative" style={{ zIndex: 1 }}>
            <p
              className="mb-5 max-w-xl mx-auto"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                lineHeight: 1.7,
                color: 'var(--color-text-2)',
              }}
            >
              The digest is managed through the main WeThePeople platform. Enter your zip code to get a
              preview tailored to your representatives.
            </p>
            <a
              href="https://wethepeopleforus.com/digest"
              className="inline-flex items-center gap-2 no-underline transition-all"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                padding: '13px 24px',
                borderRadius: '10px',
                background: 'var(--color-accent)',
                color: '#07090C',
                boxShadow: '0 0 0 1px rgba(197,160,40,0.4), 0 6px 22px rgba(197,160,40,0.18)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-accent-text)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--color-accent)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Sign Up on WeThePeople
              <ArrowRight size={14} />
            </a>
            <p
              className="mt-4"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'var(--color-text-3)',
              }}
            >
              Free · Unsubscribe anytime · No spam
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
