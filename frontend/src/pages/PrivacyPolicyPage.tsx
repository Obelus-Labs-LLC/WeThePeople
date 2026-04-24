import React from 'react';
import LongformDoc, {
  type LongformSection,
} from '../components/LongformDoc';
import { LEGAL_LAST_UPDATED } from '../config';

// Content for the Privacy Policy page. Four sections covering what we collect,
// what we don't, user rights, and our cookie posture. Rendered via the shared
// <LongformDoc> template.
const SECTIONS: LongformSection[] = [
  {
    num: 1,
    id: 'collect',
    title: 'What we collect',
    list: [
      'Email (only if you create an account or subscribe to the digest)',
      'ZIP code (only if you use Find My Rep — never persisted)',
      'Anonymous usage analytics via a self-hosted instance (no third-party trackers)',
    ],
  },
  {
    num: 2,
    id: 'dont',
    title: "What we don't collect",
    list: [
      'No ad-tech cookies. No Facebook Pixel, no Google Analytics, no Segment.',
      'No precise geolocation.',
      'No political-affiliation inference.',
    ],
  },
  {
    num: 3,
    id: 'rights',
    title: 'Your rights',
    body: [
      'Email wethepeopleforus@gmail.com to export, correct, or delete your data. We respond within 30 days.',
    ],
  },
  {
    num: 4,
    id: 'cookies',
    title: 'Cookies',
    body: [
      'Session cookies only, first-party, for authentication. No third-party cookies of any kind.',
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LongformDoc
      overline="Privacy"
      title="What we collect and don't."
      lastUpdated={LEGAL_LAST_UPDATED}
      sections={SECTIONS}
    />
  );
}
