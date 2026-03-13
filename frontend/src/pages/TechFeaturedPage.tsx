import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Loader2 } from 'lucide-react';
import DomeGallery from '../components/DomeGallery';
import BackButton from '../components/BackButton';
import { getTechCompanies, type TechCompanyListItem } from '../api/tech';

// ── Company logo URL (local first, then API, then generated avatar) ──

const LOCAL_LOGOS = new Set([
  'adobe', 'akamai', 'alphabet', 'alteryx', 'amazon', 'amd', 'analog-devices',
  'ansys', 'apple', 'applied-materials', 'applovin', 'arista-networks', 'atlassian',
  'autodesk', 'bentley-systems', 'booking-holdings', 'broadcom', 'c3ai', 'cadence',
  'check-point', 'cisco', 'cloudflare', 'commvault', 'confluent', 'corning',
  'crowdstrike', 'cyberark', 'datadog', 'dell-technologies', 'digitalocean',
  'doordash', 'dynatrace', 'elastic', 'electronic-arts', 'etsy', 'f5-networks',
  'fastly', 'fortinet', 'garmin', 'gitlab', 'hashicorp', 'hp-inc', 'hubspot',
  'ibm', 'intel', 'intuit', 'juniper-networks', 'kla-corp', 'lam-research',
  'microsoft', 'nvidia', 'uber', 'workday',
]);

function companyLogoUrl(company: TechCompanyListItem): string {
  if (LOCAL_LOGOS.has(company.company_id)) {
    return `/logos/${company.company_id}.png`;
  }
  if (company.logo_url) return company.logo_url;
  const initials = company.display_name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=18181B&color=a1a1aa&size=256&font-size=0.4&bold=true`;
}

const SECTOR_COLORS: Record<string, string> = {
  platform: '#8B5CF6',
  enterprise: '#2563EB',
  semiconductor: '#F59E0B',
  automotive: '#10B981',
  media: '#EC4899',
};

function getSectorColor(sector: string): string {
  return SECTOR_COLORS[sector?.toLowerCase()] || '#52525B';
}

export default function TechFeaturedPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<TechCompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTechCompanies({ limit: 200 })
      .then((res) => setCompanies(res.companies || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Build image array for DomeGallery
  const galleryImages = useMemo(
    () =>
      companies.map((co) => ({
        src: companyLogoUrl(co),
        alt: `${co.display_name}${co.ticker ? ` (${co.ticker})` : ''}`,
        id: co.company_id,
      })),
    [companies]
  );

  const handleItemClick = (originalIndex: number) => {
    if (originalIndex >= 0 && originalIndex < companies.length) {
      const company = companies[originalIndex];
      navigate(`/technology/${company.company_id}`);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#09090B]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="animate-spin text-zinc-500" />
          <span className="font-body text-lg text-zinc-500">Loading companies...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#060010] overflow-hidden">
      {/* Header overlay — sits above the dome */}
      <div className="relative z-30 shrink-0 px-8 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <BackButton to="/technology" label="Tech Dashboard" />
            <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-zinc-50 xl:text-5xl">
              Featured Companies
            </h1>
            <p className="mt-1 font-body text-lg text-zinc-500">
              {companies.length} companies tracked &mdash; click any tile to explore
            </p>
          </div>

          {/* Legend */}
          <div className="hidden lg:flex items-center gap-4">
            {Object.entries(SECTOR_COLORS).map(([sector, color]) => (
              <div key={sector} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                <span className="font-heading text-xs tracking-widest uppercase text-zinc-500">
                  {sector}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DomeGallery — fills remaining space */}
      <div className="flex-1 relative">
        <DomeGallery
          images={galleryImages}
          onItemClick={handleItemClick}
          overlayBlurColor="#060010"
          fit={0.5}
          segments={35}
          dragSensitivity={20}
          dragDampening={2}
          maxVerticalRotationDeg={5}
          enlargeTransitionMs={300}
          imageBorderRadius="16px"
          openedImageBorderRadius="20px"
          openedImageWidth="350px"
          openedImageHeight="350px"
          grayscale={false}
        />

        {/* Center hint text */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <span className="font-mono text-xs tracking-widest uppercase text-zinc-600 bg-black/40 backdrop-blur-sm px-4 py-2 rounded-full border border-zinc-800/50">
            Drag to rotate &bull; Click to explore
          </span>
        </div>
      </div>
    </div>
  );
}
