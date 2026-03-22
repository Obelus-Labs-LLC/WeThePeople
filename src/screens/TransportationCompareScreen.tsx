import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Modal, FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { TransportationCompany, TransportationComparisonItem } from '../api/types';
import { LoadingSpinner, EmptyState } from '../components/ui';

const ACCENT = '#3B82F6';

type MetricFormat = 'number' | 'money' | 'pct';

type Metric = {
  key: keyof TransportationComparisonItem;
  label: string;
  format: MetricFormat;
  icon: string;
  color: string;
};

type MetricSection = {
  title: string;
  icon: string;
  color: string;
  metrics: Metric[];
};

const SECTIONS: MetricSection[] = [
  {
    title: 'Political Influence',
    icon: 'megaphone-outline',
    color: '#DC2626',
    metrics: [
      { key: 'lobbying_total', label: 'Lobbying Spend', format: 'money', icon: 'megaphone-outline', color: '#F59E0B' },
      { key: 'total_contract_value', label: 'Gov Contracts', format: 'money', icon: 'cash-outline', color: '#10B981' },
      { key: 'enforcement_count', label: 'Enforcement Actions', format: 'number', icon: 'alert-circle-outline', color: '#DC2626' },
      { key: 'total_penalties', label: 'Total Penalties', format: 'money', icon: 'shield-outline', color: '#DC2626' },
    ],
  },
  {
    title: 'Valuation',
    icon: 'trending-up',
    color: '#3B82F6',
    metrics: [
      { key: 'market_cap', label: 'Market Cap', format: 'money', icon: 'trending-up', color: '#3B82F6' },
      { key: 'profit_margin', label: 'Profit Margin', format: 'pct', icon: 'analytics-outline', color: '#10B981' },
    ],
  },
];

function DropdownPicker({
  label,
  selectedValue,
  options,
  onSelect,
}: {
  label: string;
  selectedValue: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const selectedLabel = options.find((o) => o.value === selectedValue)?.label || label;

  return (
    <View style={dropdownStyles.container}>
      <TouchableOpacity style={dropdownStyles.button} onPress={() => setVisible(true)}>
        <Text style={[dropdownStyles.buttonText, !selectedValue && dropdownStyles.placeholder]} numberOfLines={1}>
          {selectedValue ? selectedLabel : label}
        </Text>
        <Ionicons name="chevron-down" size={16} color={UI_COLORS.TEXT_MUTED} />
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={dropdownStyles.overlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={dropdownStyles.modal}>
            <Text style={dropdownStyles.modalTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[dropdownStyles.option, item.value === selectedValue && dropdownStyles.optionSelected]}
                  onPress={() => { onSelect(item.value); setVisible(false); }}
                >
                  <Text style={[dropdownStyles.optionText, item.value === selectedValue && dropdownStyles.optionTextSelected]}>
                    {item.label}
                  </Text>
                  {item.value === selectedValue && <Ionicons name="checkmark" size={16} color={ACCENT} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default function TransportationCompareScreen() {
  const navigation = useNavigation<any>();
  const [allCompanies, setAllCompanies] = useState<TransportationCompany[]>([]);
  const [selectedA, setSelectedA] = useState<string>('');
  const [selectedB, setSelectedB] = useState<string>('');
  const [comparison, setComparison] = useState<TransportationComparisonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    apiClient.getTransportationCompanies({ limit: 200 })
      .then((res) => {
        const list = res.companies || [];
        setAllCompanies(list);
        if (list.length >= 2) {
          setSelectedA(list[0].company_id);
          setSelectedB(list[1].company_id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedA && selectedB) {
      setComparing(true);
      apiClient.getTransportationComparison([selectedA, selectedB])
        .then((res) => setComparison(res.companies || []))
        .catch(() => {})
        .finally(() => setComparing(false));
    } else {
      setComparison([]);
    }
  }, [selectedA, selectedB]);

  const onRefresh = () => {
    setRefreshing(true);
    apiClient.getTransportationCompanies({ limit: 200 })
      .then((res) => setAllCompanies(res.companies || []))
      .catch(() => {})
      .finally(() => setRefreshing(false));
  };

  const optionsA = allCompanies
    .filter((c) => c.company_id !== selectedB)
    .map((c) => ({ value: c.company_id, label: c.ticker ? `${c.ticker} - ${c.display_name}` : c.display_name }));
  const optionsB = allCompanies
    .filter((c) => c.company_id !== selectedA)
    .map((c) => ({ value: c.company_id, label: c.ticker ? `${c.ticker} - ${c.display_name}` : c.display_name }));

  if (loading) return <LoadingSpinner message="Loading transportation companies..." />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <View style={styles.selectorCard}>
        <View style={styles.cardHeader}>
          <Ionicons name="git-compare-outline" size={16} color={ACCENT} />
          <Text style={styles.cardTitle}>Compare Transportation Companies</Text>
        </View>
        <View style={styles.selectorRow}>
          <DropdownPicker label="Select Company A" selectedValue={selectedA} options={optionsA} onSelect={setSelectedA} />
          <Text style={styles.vsText}>VS</Text>
          <DropdownPicker label="Select Company B" selectedValue={selectedB} options={optionsB} onSelect={setSelectedB} />
        </View>
      </View>

      {comparing && <LoadingSpinner message="Comparing..." />}

      {!comparing && comparison.length >= 2 && (
        <View style={styles.resultsSection}>
          {/* Entity headers */}
          <View style={styles.entityHeaderRow}>
            <TouchableOpacity style={styles.entityHeader} onPress={() => navigation.navigate('TransportationCompanyDetail', { company_id: comparison[0].company_id })}>
              <Text style={styles.entityName} numberOfLines={1}>{comparison[0].ticker || comparison[0].display_name}</Text>
              <Text style={styles.entitySub}>{comparison[0].sector_type}</Text>
            </TouchableOpacity>
            <View style={styles.vsCircle}><Text style={styles.vsCircleText}>VS</Text></View>
            <TouchableOpacity style={styles.entityHeader} onPress={() => navigation.navigate('TransportationCompanyDetail', { company_id: comparison[1].company_id })}>
              <Text style={styles.entityName} numberOfLines={1}>{comparison[1].ticker || comparison[1].display_name}</Text>
              <Text style={styles.entitySub}>{comparison[1].sector_type}</Text>
            </TouchableOpacity>
          </View>

          {SECTIONS.map((section) => (
            <View key={section.title}>
              <View style={styles.sectionHeader}>
                <Ionicons name={section.icon as any} size={14} color={section.color} />
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
              {section.metrics.map((metric) => (
                <ComparisonRow
                  key={metric.key}
                  metric={metric}
                  companies={comparison}
                />
              ))}
            </View>
          ))}
        </View>
      )}

      {!comparing && (!selectedA || !selectedB) && (
        <EmptyState title="Select two companies" message="Use the dropdowns above to pick transportation companies to compare" />
      )}
    </ScrollView>
  );
}

function ComparisonRow({
  metric,
  companies,
}: {
  metric: Metric;
  companies: TransportationComparisonItem[];
}) {
  const values = companies.map((c) => {
    const val = c[metric.key];
    return typeof val === 'number' ? val : 0;
  });
  const maxVal = Math.max(...values, 1);

  return (
    <View style={styles.metricCard}>
      <View style={styles.metricHeader}>
        <Ionicons name={metric.icon as any} size={14} color={metric.color} />
        <Text style={styles.metricLabel}>{metric.label}</Text>
      </View>
      {companies.map((co, idx) => {
        const val = values[idx];
        const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
        return (
          <View key={co.company_id} style={styles.barRow}>
            <Text style={styles.barLabel} numberOfLines={1}>
              {co.ticker || co.display_name}
            </Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: metric.color }]} />
            </View>
            <Text style={styles.barValue}>
              {formatMetricValue(val, metric.format)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function formatMetricValue(n: number, format: MetricFormat): string {
  if (format === 'pct') {
    return n != null && n !== 0 ? (n * 100).toFixed(1) + '%' : '-';
  }
  const prefix = format === 'money' ? '$' : '';
  if (n >= 1e12) return prefix + (n / 1e12).toFixed(1) + 'T';
  if (n >= 1e9) return prefix + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return prefix + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return prefix + (n / 1e3).toFixed(0) + 'K';
  if (n === 0) return '-';
  return prefix + n.toLocaleString();
}

const dropdownStyles = StyleSheet.create({
  container: { flex: 1 },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: UI_COLORS.SECONDARY_BG, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
  },
  buttonText: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, flex: 1 },
  placeholder: { color: UI_COLORS.TEXT_MUTED },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modal: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 14, padding: 16, width: '100%', maxWidth: 400,
    maxHeight: '70%', borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
  },
  modalTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 12 },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT,
  },
  optionSelected: { backgroundColor: '#3B82F6' + '12' },
  optionText: { fontSize: 13, color: UI_COLORS.TEXT_PRIMARY },
  optionTextSelected: { fontWeight: '700', color: ACCENT },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  selectorCard: {
    backgroundColor: UI_COLORS.CARD_BG, margin: 16, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  selectorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vsText: { fontSize: 12, fontWeight: '800', color: UI_COLORS.TEXT_MUTED },
  resultsSection: { paddingHorizontal: 16, paddingBottom: 16 },
  entityHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  entityHeader: { flex: 1, alignItems: 'center' },
  entityName: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  entitySub: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, textTransform: 'capitalize', marginTop: 2 },
  vsCircle: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: UI_COLORS.SECONDARY_BG,
    alignItems: 'center', justifyContent: 'center', marginHorizontal: 8,
  },
  vsCircleText: { fontSize: 10, fontWeight: '800', color: UI_COLORS.TEXT_MUTED },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
  },
  metricHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  metricLabel: { fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  barRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 8 },
  barLabel: { width: 48, fontSize: 11, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  barTrack: {
    flex: 1, height: 18, backgroundColor: UI_COLORS.SECONDARY_BG, borderRadius: 4, overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4, minWidth: 2 },
  barValue: { width: 60, fontSize: 11, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, textAlign: 'right' },
});
