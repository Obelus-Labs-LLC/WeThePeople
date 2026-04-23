import React, { useEffect, useState } from 'react';
import {
  SectorCompaniesLayout,
  type CompanyStat,
} from '../components/sector/SectorCompaniesLayout';
import { SECTOR_MAP } from '../components/sector/sectorConfig';
import {
  getTransportationCompanies,
  type TransportationCompanyListItem,
} from '../api/transportation';

const SUB_SECTORS: Record<string, { label: string; color: string }> = {
  aviation: { label: 'Aviation', color: '#4A7FDE' },
  logistics: { label: 'Logistics', color: '#3DB87A' },
  motor_vehicle: { label: 'Motor Vehicle', color: '#C5A028' },
  rail: { label: 'Rail', color: '#8B5CF6' },
  ride_share: { label: 'Ride-Share', color: '#EC4899' },
  aerospace: { label: 'Aerospace', color: '#E63946' },
  maritime: { label: 'Maritime', color: '#06B6D4' },
};

function renderStats(c: TransportationCompanyListItem): CompanyStat[] {
  return [
    { label: 'Contracts', value: c.contract_count },
    { label: 'Lobbying', value: c.lobbying_count },
    {
      label: 'Enforce',
      value: c.enforcement_count,
      accent: c.enforcement_count > 0 ? '#E63946' : undefined,
    },
  ];
}

export default function TransportationCompaniesPage() {
  const config = SECTOR_MAP.transportation;
  const [companies, setCompanies] = useState<TransportationCompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    getTransportationCompanies({ limit: 200 })
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
      title="Transportation explorer"
      subtitle="Airlines, logistics, motor-vehicle, and aerospace operators traced through contracts, lobbying, and enforcement."
      dataCredit="USASPENDING + SENATE LDA + DOT/FAA"
      entities={companies}
      loading={loading}
      subSectors={SUB_SECTORS}
      renderStats={renderStats}
    />
  );
}
