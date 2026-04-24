import React from 'react';
import LongformDoc, {
  type LongformSection,
} from '../components/LongformDoc';

// Content for the Methodology page. Structure mirrors the design handoff:
// a 5-section longform doc covering data sources, the Influence Score,
// anomaly detection, corrections, and replicability. Presented via the
// shared <LongformDoc> template.
const SECTIONS: LongformSection[] = [
  {
    num: 1,
    id: 'sources',
    title: 'Data sources',
    body: [
      'Every metric on this site is computed from one of 30+ upstream government APIs or bulk downloads. We republish the raw identifiers so you can cross-reference independently.',
    ],
    list: [
      'Congressional votes & bios — Congress.gov + ProPublica + unitedstates/congress-legislators',
      'Lobbying disclosures — U.S. Senate LDA filings (quarterly)',
      'Foreign influence — FARA (quarterly)',
      'Campaign finance — FEC (continuous)',
      'Federal contracts — USASpending.gov + FPDS',
      'Enforcement — EPA ECHO, OSHA, SEC EDGAR, FDA, FDIC, CFPB, NLRB',
      'Insider trades — STOCK Act disclosures via House/Senate clerks',
      'Clinical trials — ClinicalTrials.gov',
      'Drug pricing — CMS NADAC, Medicare Part B/D',
    ],
  },
  {
    num: 2,
    id: 'influence-score',
    title: 'Influence Score (0\u201310)',
    body: [
      'The Influence Score is a composite weighted across three dimensions: lobbying intensity (normalized to sector median), contract share (% of total federal spend in sector), and enforcement deficit (actions expected given sector risk vs. actions observed).',
      'No score is higher than the sum of its inputs. Each component is shown on the entity profile so you can audit the math. If you think the weights are wrong, the full formula is in our open-source methodology repo.',
    ],
    callout: {
      label: 'Known limitations',
      text: 'Influence Score is descriptive, not predictive. It does not assert corruption or causation — only anomaly relative to sector peers.',
    },
  },
  {
    num: 3,
    id: 'anomaly-detection',
    title: 'Anomaly detection',
    body: [
      'We flag entities and politicians whose activity deviates \u22652\u03c3 from sector/cohort medians on lobbying, insider trading timing, or vote/contribution correlation. Flags are surfaced with confidence intervals, not as allegations.',
    ],
  },
  {
    num: 4,
    id: 'corrections',
    title: 'Corrections and data audits',
    body: [
      'Errors in upstream government data are frequent and often discovered weeks late. We run nightly reconciliation jobs and publish a public changelog of corrections at /changelog. If you find an error, email wethepeopleforus@gmail.com.',
    ],
  },
  {
    num: 5,
    id: 'replicability',
    title: 'Reproducing our work',
    body: [
      'All computation code is open-source at github.com/Obelus-Labs-LLC/WeThePeople. Raw exports available as CSV/Parquet at /data. Academic researchers can request a bulk ETL snapshot via wethepeopleforus@gmail.com.',
    ],
  },
];

export default function MethodologyPage() {
  return (
    <LongformDoc
      overline="Methodology"
      title="How we calculate what we publish."
      lastUpdated="Mar 2026"
      sections={SECTIONS}
    />
  );
}
