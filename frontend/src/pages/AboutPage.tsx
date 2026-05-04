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
      'Independently built and maintained by a solo operator under Obelus Labs LLC. No employees, no investors, no corporate or political donors.',
    ],
    callout: {
      label: 'Funding',
      text: 'Self-funded. No corporate grants, no political donors.',
    },
  },
  {
    num: 4,
    id: 'what-this-is-not',
    title: 'What WeThePeople is not',
    body: [
      "WeThePeople is a data platform. It is not a news outlet, not a political organization, and not making editorial claims about the entities it tracks. The numbers, dates, and source links are derived from primary government filings; the framing of any pattern as newsworthy or concerning is the reader's call, not ours.",
      'When the platform does publish written analysis (under The Influence Journal subdomain), every story is built from the same primary sources, follows a public editorial standard mapped to the SPJ Code of Ethics and AP guidelines on generative AI, and carries an explicit verification label. The journal is currently in editorial review.',
    ],
    callout: {
      label: 'Editorial standards',
      text: 'Public, dated, mapped to SPJ + AP. journal.wethepeopleforus.com/standards',
    },
  },
  {
    num: 5,
    id: 'open-source',
    title: 'Open source and data licensing',
    body: [
      'The WeThePeople codebase is published under the GNU AGPL-3.0 license. The license, the source repository, and a hash-stamped data manifest are public so anyone can inspect or reproduce the platform.',
      "Aggregated data on the site is derived from public government records and is offered under each source's original license. We do not relicense or claim ownership over the underlying data.",
    ],
    callout: {
      label: 'Code',
      text: 'AGPL-3.0 · github.com/Obelus-Labs-LLC/WeThePeople',
    },
  },
  {
    num: 6,
    id: 'contact',
    title: 'Get in touch',
    body: [
      'Press inquiries: press@wethepeopleforus.com (replies within 1 business day; faster if your deadline is tight).',
      'Data corrections, security disclosures, and general questions: wethepeopleforus@gmail.com.',
      'How to cite: see the citation guide at /cite for the recommended format and per-dataset attribution lines.',
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
