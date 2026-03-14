export interface Sector {
  slug: string;
  name: string;
  tagline: string;
  icon: string;
  gradient: string;
  route: string;
  available: boolean;
}

export const SECTORS: Sector[] = [
  {
    slug: "politics",
    name: "Politics",
    tagline: "Votes, bills, and financial records for every member of Congress",
    icon: "\u{1F3DB}\uFE0F",
    gradient: "from-blue-600 to-indigo-700",
    route: "/politics",
    available: true,
  },
  {
    slug: "finance",
    name: "Finance",
    tagline: "Audit Wall Street, crypto, and financial disclosures",
    icon: "\u{1F4B0}",
    gradient: "from-emerald-500 to-teal-700",
    route: "/finance",
    available: true,
  },
  {
    slug: "health",
    name: "Health",
    tagline: "FDA data, drug approvals, and pharmaceutical transparency",
    icon: "\u{1F3E5}",
    gradient: "from-rose-500 to-pink-700",
    route: "/health",
    available: false,
  },
  {
    slug: "chemicals",
    name: "Chemicals",
    tagline: "Chemical industry safety records and violations",
    icon: "\u2697\uFE0F",
    gradient: "from-amber-500 to-orange-700",
    route: "/chemicals",
    available: false,
  },
  {
    slug: "energy",
    name: "Oil, Gas & Energy",
    tagline: "Track energy sector environmental commitments",
    icon: "\u{1F6E2}\uFE0F",
    gradient: "from-slate-600 to-zinc-800",
    route: "/energy",
    available: false,
  },
  {
    slug: "technology",
    name: "Technology",
    tagline: "Patents, contracts, lobbying, and enforcement across Big Tech",
    icon: "\u{1F4BB}",
    gradient: "from-violet-500 to-purple-700",
    route: "/technology",
    available: true,
  },
  {
    slug: "defense",
    name: "Defense",
    tagline: "Military contracts, spending, and defense industry records",
    icon: "\u{1F6E1}\uFE0F",
    gradient: "from-red-600 to-rose-800",
    route: "/defense",
    available: false,
  },
  {
    slug: "agriculture",
    name: "Agriculture",
    tagline: "Food safety inspections, subsidies, and farming data",
    icon: "\u{1F33E}",
    gradient: "from-lime-500 to-green-700",
    route: "/agriculture",
    available: false,
  },
];
