import React from 'react';
import LongformDoc, {
  type LongformSection,
} from '../components/LongformDoc';

/**
 * /cite — recommended citation formats for journalists and researchers
 * citing the WeThePeople platform. Audit item #5 (citability).
 *
 * The structure intentionally separates "citing the platform itself"
 * from "citing the underlying primary source." Journalists should cite
 * the primary source whenever possible (it's stronger), and reference
 * WeThePeople as the aggregator only.
 */

const SECTIONS: LongformSection[] = [
  {
    num: 1,
    id: 'principle',
    title: 'Cite the primary source first',
    body: [
      "Almost every data point on the platform links back to its primary source: a Senate LDA filing, an FEC committee report, a USASpending award, a roll-call vote on Congress.gov, an SEC filing, a FARA registration. When you cite the platform in your reporting, link the primary source. WeThePeople is the aggregator, not the publisher of record.",
      "If you can't link the primary source for some reason (the original record has been removed, your CMS doesn't allow long URLs, etc.), use the platform's permalink for the entity or sector view. Every page on this site has a stable, shareable URL that does not change based on session state.",
    ],
  },
  {
    num: 2,
    id: 'recommended-format',
    title: 'Recommended citation format',
    body: [
      "When attribution to the platform is appropriate, use one of the following:",
    ],
    list: [
      'Inline: "...according to FEC records aggregated by WeThePeople."',
      'Parenthetical: "(WeThePeople, retrieved 2026-05-02, using FEC committee filings)"',
      'Footnote / endnote: "WeThePeople, https://wethepeopleforus.com/politics/people/{id}, retrieved 2026-05-02. Underlying data: U.S. Federal Election Commission, Committee Reports, https://www.fec.gov/data/committees/."',
    ],
  },
  {
    num: 3,
    id: 'per-dataset',
    title: 'Per-dataset attribution',
    body: [
      "When you cite a specific dataset, prefer the canonical attribution line from the publishing agency. The lines below are what we use internally and what we recommend for reproduction:",
    ],
    list: [
      'Lobbying records: U.S. Senate Office of Public Records, Lobbying Disclosure Act database (lda.senate.gov)',
      'Campaign finance: U.S. Federal Election Commission (fec.gov/data)',
      'Federal contracts: USASpending.gov',
      'Congressional votes: Congress.gov roll-call votes',
      'Bill text and actions: Congress.gov',
      'STOCK Act trades: U.S. House Clerk and U.S. Senate Office of Public Records, Periodic Transaction Reports',
      'FARA filings: U.S. Department of Justice, Foreign Agents Registration Act unit (efile.fara.gov)',
      'SEC filings: U.S. Securities and Exchange Commission, EDGAR (sec.gov/edgar)',
      'EPA toxic releases: U.S. Environmental Protection Agency, Toxic Release Inventory (epa.gov/toxics-release-inventory-tri-program)',
      'FDA recalls: U.S. Food and Drug Administration, OpenFDA (open.fda.gov)',
      'Federal Register: U.S. Office of the Federal Register (federalregister.gov)',
      'Treasury fiscal data: U.S. Department of the Treasury, Fiscal Data (fiscaldata.treasury.gov)',
    ],
  },
  {
    num: 4,
    id: 'data-export',
    title: 'Bulk data and reproducibility',
    body: [
      "Most data tables on the platform expose a CSV/JSON export so you can take the slice you used into your own analysis. Look for the Download link on data tables (e.g., politician trades, company donations, lobbying filings).",
      "For reproducibility, every data-heavy page displays a 'Data through {date}' badge so your citation can pin the exact data window. The platform also publishes a daily snapshot manifest at /api/bulk/manifest with checksums of every aggregate dataset for auditability.",
    ],
  },
  {
    num: 5,
    id: 'corrections',
    title: 'Errors and corrections',
    body: [
      "If you spot an error before or after publishing, please email wethepeopleforus@gmail.com with the URL of the page, the field that's wrong, and the correct value (with a link to the primary source if possible). Corrections that change a published datum are logged on /corrections so you can verify the platform updated.",
    ],
  },
];

export default function CitePage() {
  return (
    <LongformDoc
      overline="For Journalists"
      title="How to cite WeThePeople."
      lastUpdated="May 2026"
      sections={SECTIONS}
    />
  );
}
