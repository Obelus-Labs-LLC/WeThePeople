import React, { useEffect, useState } from 'react';
import {
  SectorCompaniesLayout,
  type CompanyStat,
} from '../components/sector/SectorCompaniesLayout';
import { SECTOR_MAP } from '../components/sector/sectorConfig';
import {
  getAgricultureCompanies,
  type AgricultureCompanyListItem,
} from '../api/agriculture';

const SUB_SECTORS: Record<string, { label: string; color: string }> = {
  diversified:      { label: 'Diversified',     color: '#2EC4B6' },
  specialty:        { label: 'Specialty',       color: '#B06FD8' },
  agroagriculture:  { label: 'Agrochemical',    color: '#3DB87A' },
  petroagriculture: { label: 'Petrochemical',   color: '#C5A028' },
  industrial_gas:   { label: 'Industrial Gas',  color: '#4A7FDE' },
};

function renderStats(c: AgricultureCompanyListItem): CompanyStat[] {
  return [
    { label: 'Contracts', value: c.contract_count ?? 0 },
    { label: 'Filings', value: c.filing_count ?? 0 },
    { label: 'Enforce', value: c.enforcement_count ?? 0 },
  ];
}

export default function AgricultureCompaniesPage() {
  const config = SECTOR_MAP.agriculture;
  const [companies, setCompanies] = useState<AgricultureCompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    getAgricultureCompanies({ limit: 200 })
      .then((res) => {
        if (stale) return;
        setCompanies(Array.isArray(res.companies) ? res.companies : []);
      })
      .catch((err) => { console.warn('[AgricultureCompaniesPage] fetch failed:', err); })
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
      subtitle="Seed, fertilizer, equipment, and food-system companies — tracked through USDA contracts, lobbying, and enforcement."
      dataCredit="USDA + USASPENDING + SENATE LDA"
      entities={companies}
      loading={loading}
      subSectors={SUB_SECTORS}
      renderStats={renderStats}
    />
  );
}
