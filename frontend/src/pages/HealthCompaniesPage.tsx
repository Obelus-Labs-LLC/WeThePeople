import React, { useEffect, useState } from 'react';
import {
  SectorCompaniesLayout,
  type CompanyStat,
} from '../components/sector/SectorCompaniesLayout';
import { SECTOR_MAP } from '../components/sector/sectorConfig';
import {
  getHealthCompanies,
  type CompanyListItem as HealthCompany,
} from '../api/health';

const SUB_SECTORS: Record<string, { label: string; color: string }> = {
  pharma: { label: 'Pharma', color: '#E63946' },
  biotech: { label: 'Biotech', color: '#3DB87A' },
  insurer: { label: 'Insurer', color: '#4A7FDE' },
  pharmacy: { label: 'Pharmacy', color: '#C5A028' },
  distributor: { label: 'Distributor', color: '#B06FD8' },
};

function renderStats(c: HealthCompany): CompanyStat[] {
  return [
    {
      label: 'Adverse',
      value: c.adverse_event_count,
      accent: c.adverse_event_count > 0 ? '#E63946' : undefined,
    },
    {
      label: 'Recalls',
      value: c.recall_count,
      accent: c.recall_count > 0 ? '#E63946' : undefined,
    },
    { label: 'Trials', value: c.trial_count },
  ];
}

export default function HealthCompaniesPage() {
  const config = SECTOR_MAP.health;
  const [companies, setCompanies] = useState<HealthCompany[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    getHealthCompanies({ limit: 200 })
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
      title="Health explorer"
      subtitle="Pharma, biotech, insurers, pharmacies, and distributors tracked through FDA adverse events, recalls, clinical trials, and political activity."
      dataCredit="FDA FAERS + FDA RECALLS + CLINICALTRIALS.GOV"
      entities={companies}
      loading={loading}
      subSectors={SUB_SECTORS}
      renderStats={renderStats}
    />
  );
}
