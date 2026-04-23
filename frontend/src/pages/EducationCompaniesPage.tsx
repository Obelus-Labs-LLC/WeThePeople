import React, { useEffect, useState } from 'react';
import {
  SectorCompaniesLayout,
  type CompanyStat,
} from '../components/sector/SectorCompaniesLayout';
import { SECTOR_MAP } from '../components/sector/sectorConfig';
import {
  getEducationCompanies,
  type EducationCompanyListItem,
} from '../api/education';

const SUB_SECTORS: Record<string, { label: string; color: string }> = {
  edtech: { label: 'EdTech', color: '#B06FD8' },
  publishing: { label: 'Publishing', color: '#3DB87A' },
  student_lending: { label: 'Student Lending', color: '#C5A028' },
  for_profit_college: { label: 'For-Profit College', color: '#E63946' },
  testing: { label: 'Testing', color: '#4A7FDE' },
  higher_ed_services: { label: 'Higher Ed Services', color: '#8B5CF6' },
  k12_services: { label: 'K-12 Services', color: '#EC4899' },
};

function renderStats(c: EducationCompanyListItem): CompanyStat[] {
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

export default function EducationCompaniesPage() {
  const config = SECTOR_MAP.education;
  const [companies, setCompanies] = useState<EducationCompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    getEducationCompanies({ limit: 200 })
      .then((res) => {
        if (stale) return;
        setCompanies(Array.isArray(res.companies) ? res.companies : []);
      })
      .catch((err) => { console.warn('[EducationCompaniesPage] fetch failed:', err); })
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
      title="Education explorer"
      subtitle="EdTech, publishing, student lending, and for-profit college operators traced through contracts, lobbying, and enforcement."
      dataCredit="USASPENDING + SENATE LDA + ED.GOV"
      entities={companies}
      loading={loading}
      subSectors={SUB_SECTORS}
      renderStats={renderStats}
    />
  );
}
