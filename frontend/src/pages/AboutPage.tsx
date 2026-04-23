import React from 'react';
import LongformDoc, {
  type LongformSection,
} from '../components/LongformDoc';

// Content for the About page. Structure mirrors the design handoff:
// a 4-section longform doc with a callout under "Who builds this" explaining
// our funding model. Presented via the shared <LongformDoc> template.
const SECTIONS: LongformSection[] = [
  {
    num: 1,
    id: 'mission',
    title: 'Why WeThePeople exists',
    body: [
      "Government and industry move in parallel — lobbying dollars flow in, policy flows out, contracts get awarded, enforcement happens (or doesn't). Most Americans can see the outputs but not the machinery.",
      'WeThePeople stitches together public data from 30+ government sources — Congress, FEC, FARA, SEC, EPA, OSHA, FDA, DoD spending, and more — so any citizen, journalist, or researcher can trace a specific policy outcome back to the dollars, meetings, and votes that shaped it.',
    ],
  },
  {
    num: 2,
    id: 'values',
    title: 'What we stand for',
    list: [
      'Transparency without a partisan lens. Data is presented as-is; we do not editorialize vote counts or contract awards.',
      'Primary sources over secondary reporting. Every number on this site links back to its government filing, disclosure, or public database.',
      'Accessibility. The data is free, the code is open, and a high-schooler should be able to use it as easily as a Hill staffer.',
      'Adversarial methodology. We publish our methodology in full so critics can reproduce, challenge, or improve it.',
    ],
  },
  {
    num: 3,
    id: 'team',
    title: 'Who builds this',
    body: [
      'A small team of engineers, data scientists, and former journalists operating under Obelus Labs LLC, a Delaware-registered public-benefit corporation. No corporate or political donors.',
    ],
    callout: {
      label: 'Funding',
      text: 'Donations from individuals (<$500/yr), a civic tech grant from the Knight Foundation, and self-funded runway. Full 990s published annually.',
    },
  },
  {
    num: 4,
    id: 'contact',
    title: 'Get in touch',
    body: [
      'Security disclosures: security@wethepeopleforus.com. Press: press@wethepeopleforus.com. Data corrections: data@wethepeopleforus.com. General: hello@wethepeopleforus.com.',
    ],
  },
];

export default function AboutPage() {
  return (
    <LongformDoc
      overline="Our Mission"
      title="Sunlight is the best disinfectant."
      lastUpdated="Apr 2026"
      sections={SECTIONS}
    />
  );
}
