import React, { useEffect, useState } from 'react';
import {
  SectorCompaniesLayout,
  type CompanyStat,
} from '../components/sector/SectorCompaniesLayout';
import { SECTOR_MAP } from '../components/sector/sectorConfig';
import {
  getDefenseCompanies,
  type DefenseCompanyListItem,
} from '../api/defense';

const SUB_SECTORS: Record<string, { label: string; color: string }> = {
  defense_prime:     { label: 'Prime',          color: '#E05555' },
  defense_sub:       { label: 'Subcontractor',  color: '#C5A028' },
  aerospace_defense: { label: 'Aerospace',      color: '#4A7FDE' },
  cybersecurity:     { label: 'Cyber',          color: '#B06FD8' },
  shipbuilding:      { label: 'Shipbuilding',   color: '#2EC4B6' },
  munitions:         { label: 'Munitions',      color: '#E05555' },
  intelligence:      { label: 'Intelligence',   color: '#3DB87A' },
  logistics_defense: { label: 'Logistics',      color: '#E05555' },
};

function renderStats(c: DefenseCompanyListItem): CompanyStat[] {
  return [
    { label: 'Lobbying', value: c.lobbying_count ?? 0 },
    { label: 'Contracts', value: c.contract_count ?? 0 },
    { label: 'Enforce', value: c.enforcement_count ?? 0 },
  ];
}

export default function DefenseCompaniesPage() {
  const config = SECTOR_MAP.defense;
  const [companies, setCompanies] = useState<DefenseCompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    getDefenseCompanies({ limit: 200 })
      .then((res) => {
        if (stale) return;
        setCompanies(Array.isArray(res.companies) ? res.companies : []);
      })
      .catch((err) => { console.warn('[DefenseCompaniesPage] fetch failed:', err); })
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
      subtitle="Prime contractors, aerospace manufacturers, cybersecurity, munitions, and defense services — tracked through DoD contracts, lobbying, and enforcement."
      dataCredit="USASPENDING + SENATE LDA + SAM.gov"
      entities={companies}
      loading={loading}
      subSectors={SUB_SECTORS}
      renderStats={renderStats}
    />
  );
}
