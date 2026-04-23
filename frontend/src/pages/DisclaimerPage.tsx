import React from 'react';
import LongformDoc, {
  type LongformSection,
} from '../components/LongformDoc';
import { LEGAL_LAST_UPDATED } from '../config';

// Content for the Disclaimer page. Four short sections covering causation,
// accuracy, editorial stance, and the "not advice" clause. Rendered via the
// shared <LongformDoc> template.
const SECTIONS: LongformSection[] = [
  {
    num: 1,
    id: 'correlation',
    title: 'Correlation is not causation',
    body: [
      'Associations between donations, votes, and contracts do not prove a quid pro quo. We surface patterns; you interpret them.',
    ],
  },
  {
    num: 2,
    id: 'accuracy',
    title: 'Data accuracy',
    body: [
      'We republish government data. We do not guarantee its accuracy. Politicians occasionally file late or mis-categorize; agencies occasionally publish incorrect amounts.',
    ],
  },
  {
    num: 3,
    id: 'editorial',
    title: 'No editorial endorsement',
    body: [
      'Rankings, anomaly flags, and summaries are algorithmic. They are not endorsements, allegations, or accusations of wrongdoing.',
    ],
  },
  {
    num: 4,
    id: 'legal',
    title: 'Not legal or financial advice',
    body: [
      'Nothing on this site is legal, financial, medical, or investment advice. Do not trade securities based on our Insider Trades feed.',
    ],
  },
];

export default function DisclaimerPage() {
  return (
    <LongformDoc
      overline="Disclaimer"
      title="Read this before drawing conclusions."
      lastUpdated={LEGAL_LAST_UPDATED}
      sections={SECTIONS}
    />
  );
}
