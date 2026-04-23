import React, { useEffect, useState } from 'react';
import {
  SectorCompaniesLayout,
  type CompanyStat,
} from '../components/sector/SectorCompaniesLayout';
import { SECTOR_MAP } from '../components/sector/sectorConfig';
import {
  getEnergyCompanies,
  type EnergyCompanyListItem,
} from '../api/energy';

const SUB_SECTORS: Record<string, { label: string; color: string }> = {
  oil_gas: { label: 'Oil & Gas', color: '#C5A028' },
  utility: { label: 'Utility', color: '#4A7FDE' },
  renewable: { label: 'Renewable', color: '#3DB87A' },
  pipeline: { label: 'Pipeline', color: '#E63946' },
  services: { label: 'Services', color: '#B06FD8' },
};

function renderStats(c: EnergyCompanyListItem): CompanyStat[] {
  const emissions = c.emission_count ?? 0;
  return [
    {
      label: 'Emissions',
      value: emissions,
      accent: emissions > 0 ? '#E63946' : undefined,
    },
    { label: 'Contracts', value: c.contract_count ?? 0 },
    { label: 'Filings', value: c.filing_count ?? 0 },
  ];
}

export default function EnergyCompaniesPage() {
  const config = SECTOR_MAP.energy;
  const [companies, setCompanies] = useState<EnergyCompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    getEnergyCompanies({ limit: 200 })
      .then((res) => {
        if (stale) return;
        setCompanies(Array.isArray(res.companies) ? res.companies : []);
      })
      .catch((err) => { console.warn('[EnergyCompaniesPage] fetch failed:', err); })
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
      title="Energy explorer"
      subtitle="Oil, gas, utilities, renewables, and pipelines tracked through contracts, lobbying, EPA emissions, and SEC filings."
      dataCredit="EPA FLIGHT + USASPENDING + SENATE LDA"
      entities={companies}
      loading={loading}
      subSectors={SUB_SECTORS}
      renderStats={renderStats}
    />
  );
}
