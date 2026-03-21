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
    tagline: "Votes, bills, donor networks, and accountability for every member of Congress",
    icon: "\u{1F3DB}\uFE0F",
    gradient: "from-blue-600 to-indigo-700",
    route: "/politics",
    available: true,
  },
  {
    slug: "finance",
    name: "Finance",
    tagline: "How Wall Street lobbies Washington and who profits",
    icon: "\u{1F4B0}",
    gradient: "from-emerald-500 to-teal-700",
    route: "/finance",
    available: true,
  },
  {
    slug: "health",
    name: "Health",
    tagline: "Pharma lobbying, FDA enforcement, and government contracts",
    icon: "\u{1F3E5}",
    gradient: "from-rose-500 to-pink-700",
    route: "/health",
    available: true,
  },
  // Future sectors - not yet implemented
  {
    slug: "chemicals",
    name: "Chemicals",
    tagline: "Chemical industry lobbying and EPA enforcement",
    icon: "\u2697\uFE0F",
    gradient: "from-amber-500 to-orange-700",
    route: "/chemicals",
    available: false,
  },
  {
    slug: "energy",
    name: "Oil, Gas & Energy",
    tagline: "Oil money in politics — lobbying, emissions policy, and enforcement",
    icon: "\u{1F6E2}\uFE0F",
    gradient: "from-orange-500 to-red-700",
    route: "/energy",
    available: true,
  },
  {
    slug: "technology",
    name: "Technology",
    tagline: "Big Tech's political playbook — lobbying, contracts, and enforcement",
    icon: "\u{1F4BB}",
    gradient: "from-violet-500 to-purple-700",
    route: "/technology",
    available: true,
  },
  // Future sectors - not yet implemented
  {
    slug: "defense",
    name: "Defense",
    tagline: "Military contracts, lobbying, and Congressional oversight",
    icon: "\u{1F6E1}\uFE0F",
    gradient: "from-red-600 to-rose-800",
    route: "/defense",
    available: false,
  },
  {
    slug: "agriculture",
    name: "Agriculture",
    tagline: "Farm subsidies, lobbying, and food safety enforcement",
    icon: "\u{1F33E}",
    gradient: "from-lime-500 to-green-700",
    route: "/agriculture",
    available: false,
  },
];
