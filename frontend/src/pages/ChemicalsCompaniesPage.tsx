import React, { useEffect, useState } from 'react';
import {
  SectorCompaniesLayout,
  type CompanyStat,
} from '../components/sector/SectorCompaniesLayout';
import { SECTOR_MAP } from '../components/sector/sectorConfig';
import {
  getChemicalsCompanies,
  type ChemicalCompanyListItem,
} from '../api/chemicals';

const SUB_SECTORS: Record<string, { label: string; color: string }> = {
  diversified: { label: 'Diversified', color: '#B06FD8' },
  specialty: { label: 'Specialty', color: '#8B5CF6' },
  agrochemical: { label: 'Agrochemical', color: '#3DB87A' },
  petrochemical: { label: 'Petrochemical', color: '#C5A028' },
  industrial_gas: { label: 'Industrial Gas', color: '#4A7FDE' },
};

function renderStats(c: ChemicalCompanyListItem): CompanyStat[] {
  return [
    { label: 'Contracts', value: c.contract_count },
    { label: 'Filings', value: c.filing_count },
    {
      label: 'Enforce',
      value: c.enforcement_count,
      accent: c.enforcement_count > 0 ? '#E63946' : undefined,
    },
  ];
}

export default function ChemicalsCompaniesPage() {
  const config = SECTOR_MAP.chemicals;
  const [companies, setCompanies] = useState<ChemicalCompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    getChemicalsCompanies({ limit: 200 })
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
      title="Chemicals explorer"
      subtitle="Major chemicals manufacturers tracked through contracts, lobbying, EPA ECHO enforcement, and SEC filings."
      dataCredit="USASPENDING + SENATE LDA + EPA ECHO"
      entities={companies}
      loading={loading}
      subSectors={SUB_SECTORS}
      renderStats={renderStats}
    />
  );
}
