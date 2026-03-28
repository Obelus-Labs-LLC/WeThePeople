import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Mail, BarChart3, Shield, Zap } from 'lucide-react';

export default function SubscribePage() {
  return (
    <main className="flex-1 px-4 py-10 sm:py-16">
      <div className="max-w-[720px] mx-auto">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          Back to Journal
        </Link>

        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-400/15 mb-5">
            <Mail size={26} className="text-amber-400" />
          </div>
          <h1
            className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-3"
            style={{ fontFamily: 'Oswald, sans-serif' }}
          >
            Subscribe to The Weekly Digest
          </h1>
          <p className="text-zinc-400 text-base leading-relaxed max-w-xl mx-auto">
            Get a weekly email with data-driven investigations, congressional trade alerts,
            lobbying activity summaries, and enforcement action roundups — personalized
            to your representatives.
          </p>
        </div>

        {/* What you get */}
        <div className="grid gap-4 mb-10">
          {[
            {
              icon: BarChart3,
              title: 'Data Investigations',
              description: 'Long-form stories that follow the money from industry to politics, backed by public records.',
            },
            {
              icon: Zap,
              title: 'Trade Alerts',
              description: 'When your representatives buy or sell stocks, you\'ll know about it — with filing delay tracking.',
            },
            {
              icon: Shield,
              title: 'Enforcement Roundup',
              description: 'Regulatory actions, sanctions checks, and enforcement patterns across all 7 sectors.',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="flex gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-400/15 shrink-0">
                  <Icon size={20} className="text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white mb-1">{item.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA to main site digest */}
        <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-amber-950/20 via-zinc-900/80 to-zinc-900/80 p-8 text-center">
          <p className="text-zinc-400 text-sm mb-5">
            The digest is managed through the main WeThePeople platform.
            Enter your zip code to get a preview tailored to your representatives.
          </p>
          <a
            href="https://wethepeopleforus.com/digest"
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg transition-colors text-sm font-semibold"
          >
            Sign Up on WeThePeople
            <ArrowRight size={16} />
          </a>
          <p className="text-xs text-zinc-600 mt-4">
            Free. Unsubscribe anytime. No spam.
          </p>
        </div>
      </div>
    </main>
  );
}
