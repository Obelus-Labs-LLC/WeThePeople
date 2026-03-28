import { Link } from 'react-router-dom';
import { ArrowLeft, Database, Shield, Eye, ArrowRight } from 'lucide-react';

export default function AboutPage() {
  return (
    <main className="flex-1 px-4 py-10 sm:py-16">
      <article className="max-w-[720px] mx-auto">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          Back to Journal
        </Link>

        <p className="text-xs uppercase tracking-[0.2em] text-amber-400 font-medium mb-3">
          About
        </p>
        <h1
          className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-6"
          style={{ fontFamily: 'Oswald, sans-serif' }}
        >
          About The Influence Journal
        </h1>

        <div className="space-y-6 mb-12">
          <p className="text-zinc-300 leading-[1.85] text-base">
            The Influence Journal is the investigative arm of WeThePeople, a civic
            transparency platform that tracks how corporations lobby Congress, win
            government contracts, face enforcement actions, and donate to politicians.
          </p>
          <p className="text-zinc-300 leading-[1.85] text-base">
            Every story published here is generated from public government records.
            We analyze data from Senate lobbying disclosures, USASpending.gov federal
            contracts, SEC filings, the Federal Register, FEC campaign finance reports,
            and dozens of other public databases to surface patterns of corporate
            influence that would otherwise remain buried in raw data.
          </p>
          <p className="text-zinc-300 leading-[1.85] text-base">
            Our goal is simple: follow the money from industry to politics.
          </p>
        </div>

        {/* Principles */}
        <h2
          className="text-xl font-bold text-white mb-6"
          style={{ fontFamily: 'Oswald, sans-serif' }}
        >
          Our Principles
        </h2>
        <div className="grid gap-4 mb-12">
          {[
            {
              icon: Database,
              title: 'Data-First',
              description: 'Every claim is backed by public government data. We cite our sources so you can verify every finding independently.',
            },
            {
              icon: Eye,
              title: 'Transparent Methodology',
              description: 'Our data collection, analysis, and story generation pipeline is documented. We publish our methodology so you know exactly how we work.',
            },
            {
              icon: Shield,
              title: 'No Editorial Opinions',
              description: 'We present the data and let readers draw their own conclusions. Our stories contain facts and context, not opinions or partisan framing.',
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

        {/* Data sources */}
        <h2
          className="text-xl font-bold text-white mb-4"
          style={{ fontFamily: 'Oswald, sans-serif' }}
        >
          Data Sources
        </h2>
        <p className="text-zinc-400 text-sm leading-relaxed mb-4">
          Our investigations draw from 30+ public data sources across 7 sectors:
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-12">
          {[
            'Senate LDA (Lobbying)',
            'USASpending.gov (Contracts)',
            'SEC EDGAR (Filings)',
            'Federal Register (Enforcement)',
            'FEC (Campaign Finance)',
            'Congress.gov (Legislation)',
            'House Financial Disclosures (Trades)',
            'OpenFDA (Health)',
            'USPTO PatentsView (Tech)',
            'EPA GHGRP (Emissions)',
            'NHTSA (Vehicle Safety)',
            'ClinicalTrials.gov (Health)',
          ].map((source) => (
            <li key={source} className="text-sm text-zinc-500 flex items-start gap-2">
              <span className="text-amber-400 mt-1 shrink-0">&#8226;</span>
              {source}
            </li>
          ))}
        </ul>

        {/* Links */}
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href="https://wethepeopleforus.com/methodology"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg transition-colors text-sm font-medium"
          >
            View Full Methodology
            <ArrowRight size={14} />
          </a>
          <a
            href="https://wethepeopleforus.com"
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-zinc-800 hover:border-zinc-700 text-zinc-300 rounded-lg transition-colors text-sm font-medium"
          >
            Explore WeThePeople
            <ArrowRight size={14} />
          </a>
        </div>
      </article>
    </main>
  );
}
