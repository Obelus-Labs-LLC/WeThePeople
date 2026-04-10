import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Trophy, ShieldCheck, Target, BookOpen, Megaphone, Vote, CheckCheck, FileText, ScrollText } from 'lucide-react';
import { fetchBadges, fetchMyBadges, BadgeItem, UserBadgeItem } from '../api/civic';

const ICON_MAP: Record<string, typeof Trophy> = {
  vote: Vote,
  'check-check': CheckCheck,
  trophy: Trophy,
  target: Target,
  'book-open': BookOpen,
  'file-text': FileText,
  megaphone: Megaphone,
  scroll: ScrollText,
  'shield-check': ShieldCheck,
};

const CATEGORY_COLORS: Record<string, string> = {
  engagement: 'text-amber-400 border-amber-500/20',
  research: 'text-emerald-400 border-emerald-500/20',
  community: 'text-blue-400 border-blue-500/20',
  verification: 'text-cyan-400 border-cyan-500/20',
};

const LEVEL_LABELS = ['', 'Bronze', 'Silver', 'Gold'];

export default function BadgesPage() {
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  const [earned, setEarned] = useState<UserBadgeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([fetchBadges(), fetchMyBadges()])
      .then(([b, e]) => {
        if (b.status === 'fulfilled') setBadges(b.value.items);
        if (e.status === 'fulfilled') setEarned(e.value.items);
        setLoading(false);
      });
  }, []);

  const earnedSlugs = new Set(earned.map((e) => e.badge_slug));

  const grouped = badges.reduce<Record<string, BadgeItem[]>>((acc, b) => {
    (acc[b.category] ||= []).push(b);
    return acc;
  }, {});

  return (
    <main id="main-content" className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-10 sm:py-14">
        <Link to="/civic" className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-amber-400 transition-colors mb-6">
          <ArrowLeft size={14} /> Civic Hub
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <Trophy size={28} className="text-amber-400" />
          <h1 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: 'Oswald, sans-serif' }}>
            <span className="text-amber-400">Civic</span> Badges
          </h1>
        </div>
        <p className="text-zinc-500 text-sm mb-8">
          Earn badges through civic participation. Vote on promises, annotate bills, submit proposals, and verify your identity.
        </p>

        {/* Summary */}
        <div className="flex items-center gap-6 mb-8 text-sm">
          <div className="bg-zinc-900/60 border border-white/10 rounded-lg px-4 py-3">
            <div className="text-2xl font-bold text-amber-400" style={{ fontFamily: 'Oswald, sans-serif' }}>{earned.length}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Earned</div>
          </div>
          <div className="bg-zinc-900/60 border border-white/10 rounded-lg px-4 py-3">
            <div className="text-2xl font-bold text-zinc-500" style={{ fontFamily: 'Oswald, sans-serif' }}>{badges.length - earned.length}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Remaining</div>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-20" aria-busy="true">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" role="status">
              <span className="sr-only">Loading badges...</span>
            </div>
          </div>
        )}

        {!loading && Object.entries(grouped).map(([category, items]) => {
          const cc = CATEGORY_COLORS[category] || 'text-zinc-400 border-zinc-700';
          return (
            <section key={category} className="mb-8">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-3" style={{ fontFamily: 'Oswald, sans-serif' }}>
                {category}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((b) => {
                  const isEarned = earnedSlugs.has(b.slug);
                  const Icon = ICON_MAP[b.icon] || Trophy;
                  return (
                    <div
                      key={b.slug}
                      className={`relative rounded-xl p-4 border transition-all ${
                        isEarned
                          ? `bg-zinc-900/80 ${cc}`
                          : 'bg-zinc-900/30 border-white/5 opacity-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Icon size={20} className={isEarned ? cc.split(' ')[0] : 'text-zinc-700'} />
                        <div>
                          <div className="text-sm font-semibold text-zinc-200">{b.name}</div>
                          {b.level > 1 && (
                            <span className="text-[10px] text-zinc-600">{LEVEL_LABELS[b.level] || `Level ${b.level}`}</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500">{b.description}</p>
                      {isEarned && (
                        <div className="absolute top-3 right-3">
                          <ShieldCheck size={14} className="text-emerald-400" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
