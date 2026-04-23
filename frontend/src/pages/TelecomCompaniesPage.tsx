import React, { useEffect, useState } from 'react';
import {
  SectorCompaniesLayout,
  type CompanyStat,
} from '../components/sector/SectorCompaniesLayout';
import { SECTOR_MAP } from '../components/sector/sectorConfig';
import {
  getTelecomCompanies,
  type TelecomCompanyListItem,
} from '../api/telecom';

const SUB_SECTORS: Record<string, { label: string; color: string }> = {
  wireless: { label: 'Wireless', color: '#4A7FDE' },
  broadband: { label: 'Broadband', color: '#3DB87A' },
  cable: { label: 'Cable', color: '#C5A028' },
  satellite: { label: 'Satellite', color: '#B06FD8' },
  fiber: { label: 'Fiber', color: '#EC4899' },
  voip: { label: 'VoIP', color: '#06B6D4' },
  infrastructure: { label: 'Infrastructure', color: '#E63946' },
};

function renderStats(c: TelecomCompanyListItem): CompanyStat[] {
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

export default function TelecomCompaniesPage() {
  const config = SECTOR_MAP.telecom;
  const [companies, setCompanies] = useState<TelecomCompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    getTelecomCompanies({ limit: 200 })
      .then((res) => {
        if (stale) return;
        setCompanies(Array.isArray(res.companies) ? res.companies : []);
      })
      .catch((err) => { console.warn('[TelecomCompaniesPage] fetch failed:', err); })
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
      title="Telecommunications explorer"
      subtitle="Wireless, broadband, cable, and satellite carriers tracked through contracts, lobbying, and FCC enforcement."
      dataCredit="USASPENDING + SENATE LDA + FCC"
      entities={companies}
      loading={loading}
      subSectors={SUB_SECTORS}
      renderStats={renderStats}
    />
  );
}
