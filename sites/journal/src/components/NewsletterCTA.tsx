import { Mail, ArrowRight } from 'lucide-react';

export function NewsletterCTA() {
  return (
    <section className="rounded-xl border border-zinc-800 bg-gradient-to-br from-amber-950/20 via-zinc-900/80 to-zinc-900/80 p-8 sm:p-12">
      <div className="max-w-2xl mx-auto text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-400/15 mb-5">
          <Mail size={22} className="text-amber-400" />
        </div>
        <h2
          className="text-2xl sm:text-3xl font-bold text-white mb-3"
          style={{ fontFamily: 'Oswald, sans-serif' }}
        >
          Stay Informed
        </h2>
        <p className="text-zinc-400 text-base leading-relaxed mb-6">
          Get weekly data-driven investigations delivered to your inbox.
          Our digest includes congressional trades, lobbying activity,
          enforcement actions, and more — all backed by public records.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="https://wethepeopleforus.com/digest"
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg transition-colors text-sm font-semibold"
          >
            Subscribe to the Weekly Digest
            <ArrowRight size={16} />
          </a>
        </div>
        <p className="text-xs text-zinc-600 mt-4">
          Free. Unsubscribe anytime. Powered by the WeThePeople data platform.
        </p>
      </div>
    </section>
  );
}
