import React from 'react';
import { ShieldCheck, Database, Brain, BarChart3, Lock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import TierBadge from '../components/TierBadge';
import { VerifySectorHeader } from '../components/SectorHeader';

const PIPELINE_STEPS = [
  {
    icon: Database,
    title: 'Ingest',
    description:
      'Claims are extracted from the submitted text or URL using AI. Each distinct, verifiable political claim is isolated and categorized.',
  },
  {
    icon: Brain,
    title: 'Match',
    description:
      'Each claim is matched against 9 data sources including congressional votes, bills, trades, lobbying records, government contracts, enforcement actions, and campaign donations.',
  },
  {
    icon: BarChart3,
    title: 'Evaluate',
    description:
      'Matches are scored on relevance, progress (did the action support the claim?), and timing. A composite score determines the verification tier.',
  },
];

const DATA_SOURCES = [
  { name: 'Congressional Votes', description: 'Roll call votes from Congress.gov' },
  { name: 'Bills & Legislation', description: 'Introduced, passed, and signed bills' },
  { name: 'Congressional Trades', description: 'Stock trades by members of Congress' },
  { name: 'Lobbying Disclosures', description: 'Senate LDA lobbying filings' },
  { name: 'Government Contracts', description: 'USASpending.gov federal contracts' },
  { name: 'Enforcement Actions', description: 'FTC, DOJ, EPA enforcement records' },
  { name: 'Campaign Donations', description: 'FEC PAC and individual contributions' },
  { name: 'Committee Memberships', description: 'Committee assignments and leadership' },
  { name: 'State Legislation', description: 'OpenStates state-level bills and votes' },
];

const TIER_DEFINITIONS = [
  {
    tier: 'strong' as const,
    title: 'Strong Evidence',
    description: 'Direct legislative action match with high relevance, follow-through timing, and significant legislative progress (e.g., bill passed committee or chamber). Or a strong match boosted by corroborating cross-data evidence.',
    threshold: 'Categorical: direct match + progress + timing',
  },
  {
    tier: 'moderate' as const,
    title: 'Moderate Evidence',
    description: 'Related legislative activity found with partial overlap, or a weak legislative match strengthened by cross-data evidence from votes, trades, lobbying, contracts, enforcement, donations, committees, or SEC filings.',
    threshold: 'Categorical: related activity or cross-data boost',
  },
  {
    tier: 'weak' as const,
    title: 'Weak Evidence',
    description: 'Tangential connection found — low overlap, retroactive timing, or only boilerplate civic terms match. Alternatively, no legislative match but at least one cross-data source provides supporting evidence.',
    threshold: 'Categorical: tangential connection or single cross-data match',
  },
  {
    tier: 'none' as const,
    title: 'Unverified',
    description: 'No matching records found across any of the 9 data sources. The claim cannot be verified against public records in our database.',
    threshold: 'No matching evidence found',
  },
];

export default function VerifyMethodologyPage() {
  return (
    <div className="min-h-screen px-4 py-6 sm:px-8">
      <VerifySectorHeader />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto"
      >
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="w-6 h-6 text-emerald-400" />
          <h1 className="text-2xl font-bold text-white">Verification Methodology</h1>
        </div>
        <p className="text-sm text-slate-400 mb-10">
          How we verify political claims against the public record.
        </p>

        {/* Pipeline steps */}
        <section className="mb-12">
          <h2 className="text-lg font-bold text-white mb-6">How It Works</h2>
          <div className="grid gap-4">
            {PIPELINE_STEPS.map((step, i) => (
              <div
                key={step.title}
                className="flex gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-5"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <step.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-slate-500">Step {i + 1}</span>
                    <h3 className="text-sm font-bold text-white">{step.title}</h3>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Data sources */}
        <section className="mb-12">
          <h2 className="text-lg font-bold text-white mb-6">Data Sources</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {DATA_SOURCES.map((src) => (
              <div
                key={src.name}
                className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3"
              >
                <Database className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white">{src.name}</p>
                  <p className="text-xs text-slate-500">{src.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tier definitions */}
        <section className="mb-12">
          <h2 className="text-lg font-bold text-white mb-6">Verification Tiers</h2>
          <div className="grid gap-4">
            {TIER_DEFINITIONS.map((def) => (
              <div
                key={def.tier}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-5"
              >
                <div className="flex items-center justify-between mb-2">
                  <TierBadge tier={def.tier} size="md" />
                  <span className="text-xs font-mono text-slate-500">{def.threshold}</span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1">{def.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{def.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Rate limits */}
        <section className="mb-12">
          <h2 className="text-lg font-bold text-white mb-4">Access Tiers</h2>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-start gap-3 mb-4">
              <Lock className="w-5 h-5 text-yellow-400 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-white mb-1">Free Tier</h3>
                <p className="text-sm text-slate-400">5 verifications per day. Browse all existing verifications freely.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-white mb-1">Enterprise</h3>
                <p className="text-sm text-slate-400">
                  Unlimited verifications, API access, bulk processing, and custom integrations.
                  Contact us for pricing.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <div className="text-center mb-10">
          <Link
            to="/verify/submit"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-600/20 no-underline"
          >
            Try It Now <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
