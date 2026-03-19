import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Modal, FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS, SECTOR_GRADIENTS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { Company, HealthComparisonItem } from '../api/types';
import { LoadingSpinner, EmptyState } from '../components/ui';

const ACCENT = SECTOR_GRADIENTS.health[0];
const MAX_ENTITIES = 5;

type MetricFormat = 'number' | 'money';

type Metric = {
  key: keyof HealthComparisonItem;
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
      { key: 'enforcement_count', label: 'Enforcement Actions', format: 'number', icon: 'alert-circle-outline', color: '#DC2626' },
      { key: 'total_penalties', label: 'Total Penalties', format: 'money', icon: 'shield-outline', color: '#DC2626' },
    ],
  },
  {
    title: 'Safety & Compliance',
    icon: 'medkit-outline',
    color: '#F43F5E',
    metrics: [
      { key: 'adverse_event_count', label: 'Adverse Events', format: 'number', icon: 'warning-outline', color: '#F43F5E' },
      { key: 'recall_count', label: 'Recalls', format: 'number', icon: 'alert-outline', color: '#EA580C' },
    ],
  },
  {
    title: 'Research & Payments',
    icon: 'flask-outline',
    color: '#8B5CF6',
    metrics: [
      { key: 'trial_count', label: 'Clinical Trials', format: 'number', icon: 'flask-outline', color: '#8B5CF6' },
      { key: 'payment_count', label: 'CMS Payments', format: 'number', icon: 'cash-outline', color: '#10B981' },
    ],
  },
];

function MultiDropdownPicker({
  label,
  selectedValues,
  options,
  onToggle,
  maxSelections,
}: {
  label: string;
  selectedValues: string[];
  options: { value: string; label: string }[];
  onToggle: (value: string) => void;
  maxSelections: number;
}) {
  const [visible, setVisible] = useState(false);
  const selectedCount = selectedValues.length;
  const summaryText = selectedCount === 0
    ? label
    : `${selectedCount} selected`;

  return (
    <View style={dropdownStyles.container}>
      <TouchableOpacity style={dropdownStyles.button} onPress={() => setVisible(true)}>
        <Text style={[dropdownStyles.buttonText, selectedCount === 0 && dropdownStyles.placeholder]} numberOfLines={1}>
          {summaryText}
        </Text>
        <Ionicons name="chevron-down" size={16} color={UI_COLORS.TEXT_MUTED} />
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={dropdownStyles.overlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={dropdownStyles.modal}>
            <View style={dropdownStyles.modalHeader}>
              <Text style={dropdownStyles.modalTitle}>{label}</Text>
              <Text style={dropdownStyles.modalSubtitle}>{selectedCount}/{maxSelections} selected</Text>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => {
                const isSelected = selectedValues.includes(item.value);
                const isDisabled = !isSelected && selectedCount >= maxSelections;
                return (
                  <TouchableOpacity
                    style={[dropdownStyles.option, isSelected && dropdownStyles.optionSelected, isDisabled && dropdownStyles.optionDisabled]}
                    onPress={() => { if (!isDisabled) onToggle(item.value); }}
                    disabled={isDisabled}
                  >
                    <Text style={[dropdownStyles.optionText, isSelected && dropdownStyles.optionTextSelected, isDisabled && dropdownStyles.optionTextDisabled]}>
                      {item.label}
                    </Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={18} color={ACCENT} />}
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity style={dropdownStyles.doneButton} onPress={() => setVisible(false)}>
              <Text style={dropdownStyles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default function HealthCompareScreen() {
  const navigation = useNavigation<any>();
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<HealthComparisonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    apiClient.getCompanies({ limit: 200 })
      .then((res) => {
        const list = res.companies || [];
        setAllCompanies(list);
        // Default: select first 3
        const initial = list.slice(0, Math.min(3, list.length)).map((c) => c.company_id);
        setSelectedIds(initial);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedIds.length >= 2) {
      setComparing(true);
      apiClient.getHealthComparison(selectedIds)
        .then((res) => setComparison(res.companies || []))
        .catch(() => {})
        .finally(() => setComparing(false));
    } else {
      setComparison([]);
    }
  }, [selectedIds]);

  const toggleCompany = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < MAX_ENTITIES
        ? [...prev, id]
        : prev
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    apiClient.getCompanies({ limit: 200 })
      .then((res) => setAllCompanies(res.companies || []))
      .catch(() => {})
      .finally(() => setRefreshing(false));
  };

  const options = allCompanies.map((c) => ({
    value: c.company_id,
    label: c.ticker ? `${c.ticker} - ${c.display_name}` : c.display_name,
  }));

  if (loading) return <LoadingSpinner message="Loading health companies..." />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <View style={styles.selectorCard}>
        <View style={styles.cardHeader}>
          <Ionicons name="git-compare-outline" size={16} color={ACCENT} />
          <Text style={styles.cardTitle}>Compare Health Companies</Text>
        </View>
        <MultiDropdownPicker
          label="Select companies to compare"
          selectedValues={selectedIds}
          options={options}
          onToggle={toggleCompany}
          maxSelections={MAX_ENTITIES}
        />
        {/* Selected chips */}
        {selectedIds.length > 0 && (
          <View style={styles.chipRow}>
            {selectedIds.map((id) => {
              const co = allCompanies.find((c) => c.company_id === id);
              return (
                <TouchableOpacity key={id} style={styles.chip} onPress={() => toggleCompany(id)}>
                  <Text style={styles.chipText} numberOfLines={1}>{co?.ticker || co?.display_name || id}</Text>
                  <Ionicons name="close-circle" size={14} color={ACCENT} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <Text style={styles.selectorHint}>
          {selectedIds.length} selected (min 2, max {MAX_ENTITIES})
        </Text>
      </View>

      {comparing && <LoadingSpinner message="Comparing..." />}

      {!comparing && comparison.length >= 2 && (
        <View style={styles.resultsSection}>
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
                  onCompanyPress={(id) => navigation.navigate('HealthCompanyDetail', { company_id: id })}
                />
              ))}
            </View>
          ))}
        </View>
      )}

      {!comparing && selectedIds.length < 2 && (
        <EmptyState title="Select at least 2 companies" message="Use the dropdown above to pick up to 5 health companies to compare" />
      )}
    </ScrollView>
  );
}

function ComparisonRow({
  metric,
  companies,
  onCompanyPress,
}: {
  metric: Metric;
  companies: HealthComparisonItem[];
  onCompanyPress: (id: string) => void;
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
          <TouchableOpacity
            key={co.company_id}
            style={styles.barRow}
            onPress={() => onCompanyPress(co.company_id)}
          >
            <Text style={styles.barLabel} numberOfLines={1}>
              {co.ticker || co.display_name}
            </Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: metric.color }]} />
            </View>
            <Text style={styles.barValue}>
              {formatMetricValue(val, metric.format)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function formatMetricValue(n: number, format: MetricFormat): string {
  const prefix = format === 'money' ? '$' : '';
  if (n >= 1e12) return prefix + (n / 1e12).toFixed(1) + 'T';
  if (n >= 1e9) return prefix + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return prefix + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return prefix + (n / 1e3).toFixed(0) + 'K';
  if (n === 0) return '-';
  return prefix + n.toLocaleString();
}

const dropdownStyles = StyleSheet.create({
  container: { marginBottom: 8 },
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
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  modalSubtitle: { fontSize: 12, color: UI_COLORS.TEXT_MUTED },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT,
  },
  optionSelected: { backgroundColor: ACCENT + '12' },
  optionDisabled: { opacity: 0.4 },
  optionText: { fontSize: 13, color: UI_COLORS.TEXT_PRIMARY, flex: 1 },
  optionTextSelected: { fontWeight: '700', color: ACCENT },
  optionTextDisabled: { color: UI_COLORS.TEXT_MUTED },
  doneButton: {
    marginTop: 12, backgroundColor: ACCENT, borderRadius: 8, paddingVertical: 10, alignItems: 'center',
  },
  doneButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  selectorCard: {
    backgroundColor: UI_COLORS.CARD_BG, margin: 16, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: ACCENT + '12', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: ACCENT + '25',
  },
  chipText: { fontSize: 11, fontWeight: '600', color: ACCENT, maxWidth: 100 },
  selectorHint: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 8, textAlign: 'center' },
  resultsSection: { paddingHorizontal: 16, paddingBottom: 16 },
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
