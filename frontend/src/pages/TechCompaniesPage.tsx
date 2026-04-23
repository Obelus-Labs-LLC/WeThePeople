import React, { useEffect, useState } from 'react';
import {
  SectorCompaniesLayout,
  type CompanyStat,
} from '../components/sector/SectorCompaniesLayout';
import { SECTOR_MAP } from '../components/sector/sectorConfig';
import {
  getTechCompanies,
  type TechCompanyListItem,
} from '../api/tech';

const SUB_SECTORS: Record<string, { label: string; color: string }> = {
  platform: { label: 'Platform', color: '#B06FD8' },
  enterprise: { label: 'Enterprise', color: '#4A7FDE' },
  semiconductor: { label: 'Semiconductor', color: '#C5A028' },
  automotive: { label: 'Automotive', color: '#3DB87A' },
  media: { label: 'Media', color: '#EC4899' },
};

function renderStats(c: TechCompanyListItem): CompanyStat[] {
  return [
    { label: 'Patents', value: c.patent_count },
    { label: 'Contracts', value: c.contract_count },
    { label: 'Filings', value: c.filing_count },
  ];
}

export default function TechCompaniesPage() {
  const config = SECTOR_MAP.technology;
  const [companies, setCompanies] = useState<TechCompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    getTechCompanies({ limit: 200 })
      .then((res) => {
        if (stale) return;
        setCompanies(Array.isArray(res.companies) ? res.companies : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, []);

  return (
    <SectorCompaniesLayout
      config={config}
      title="Technology explorer"
      subtitle="Platform, enterprise, semiconductor, automotive, and media giants tracked through patents, contracts, and SEC filings."
      dataCredit="USPTO + USASPENDING + SEC EDGAR"
      entities={companies}
      loading={loading}
      subSectors={SUB_SECTORS}
      renderStats={renderStats}
    />
  );
}
