import { Mail, ArrowRight } from 'lucide-react';

export function NewsletterCTA() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        borderRadius: '16px',
        border: '1px solid rgba(197,160,40,0.25)',
        background:
          'linear-gradient(135deg, rgba(197,160,40,0.08) 0%, var(--color-surface) 60%)',
        padding: '40px 32px',
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
          opacity: 0.35,
          pointerEvents: 'none',
        }}
      />
      <div className="relative max-w-2xl mx-auto text-center" style={{ zIndex: 1 }}>
        <div
          className="inline-flex items-center justify-center mb-5"
          style={{
            width: 48,
            height: 48,
            borderRadius: '999px',
            background: 'rgba(197,160,40,0.14)',
            border: '1px solid rgba(197,160,40,0.35)',
          }}
        >
          <Mail size={20} style={{ color: 'var(--color-accent-text)' }} />
        </div>
        <div
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
        </div>
        <h2
          className="mb-4"
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: 'clamp(28px, 4vw, 40px)',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            color: 'var(--color-text-1)',
          }}
        >
          Stay Informed
        </h2>
        <p
          className="mb-6 max-w-xl mx-auto"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '15px',
            lineHeight: 1.7,
            color: 'var(--color-text-2)',
          }}
        >
          Get weekly data-driven investigations delivered to your inbox. Congressional trades,
          lobbying activity, enforcement actions, and more — all backed by public records.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="https://wethepeopleforus.com/digest"
            className="inline-flex items-center gap-2 no-underline transition-all"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              padding: '12px 22px',
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
            Subscribe to the Digest
            <ArrowRight size={14} />
          </a>
        </div>
        <p
          className="mt-5"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--color-text-3)',
          }}
        >
          Free · Unsubscribe anytime · Powered by the WeThePeople data platform
        </p>
      </div>
    </section>
  );
}
