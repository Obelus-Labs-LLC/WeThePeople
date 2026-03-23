import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Modal, FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { DefenseCompany, DefenseComparisonItem } from '../api/types';
import { LoadingSpinner, EmptyState } from '../components/ui';

const ACCENT = '#DC2626';

type MetricFormat = 'number' | 'money' | 'pct';

type Metric = {
  key: keyof DefenseComparisonItem;
  label: string;
  format: MetricFormat;
  icon: string;
  color: string;
};

const METRICS: Metric[] = [
  { key: 'lobbying_total', label: 'Lobbying', format: 'money', icon: 'document-text', color: '#F59E0B' },
  { key: 'total_contract_value', label: 'Contracts', format: 'money', icon: 'briefcase', color: '#10B981' },
  { key: 'enforcement_count', label: 'Enforcement', format: 'number', icon: 'shield', color: '#EF4444' },
  { key: 'total_penalties', label: 'Penalties', format: 'money', icon: 'alert-circle', color: '#EF4444' },
  { key: 'market_cap', label: 'Market Cap', format: 'money', icon: 'trending-up', color: '#3B82F6' },
];

function fmtValue(v: number | null | undefined, format: MetricFormat): string {
  if (v == null) return '--';
  if (format === 'money') {
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${v.toLocaleString()}`;
  }
  if (format === 'pct') return `${(v * 100).toFixed(1)}%`;
  return v.toLocaleString();
}

export default function DefenseCompareScreen() {
  const [allCompanies, setAllCompanies] = useState<DefenseCompany[]>([]);
  const [selected, setSelected] = useState<DefenseCompany[]>([]);
  const [comparison, setComparison] = useState<DefenseComparisonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  useEffect(() => {
    apiClient.getDefenseCompanies({ limit: 200 })
      .then(r => setAllCompanies(r.companies || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const addCompany = (c: DefenseCompany) => {
    if (selected.length < 5 && !selected.find(s => s.company_id === c.company_id)) {
      setSelected([...selected, c]);
    }
    setPickerVisible(false);
  };

  const removeCompany = (id: string) => {
    setSelected(selected.filter(s => s.company_id !== id));
    setComparison([]);
  };

  const compare = async () => {
    if (selected.length < 2) return;
    setComparing(true);
    try {
      const res = await apiClient.getDefenseComparison(selected.map(s => s.company_id));
      setComparison(res.companies || []);
    } catch { }
    finally { setComparing(false); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Compare Defense Companies</Text>
      <Text style={styles.subtitle}>Select 2-5 companies to compare</Text>

      {/* Selected pills */}
      <View style={styles.pillRow}>
        {selected.map(c => (
          <TouchableOpacity key={c.company_id} style={styles.pill} onPress={() => removeCompany(c.company_id)}>
            <Text style={styles.pillText}>{c.display_name}</Text>
            <Ionicons name="close-circle" size={16} color={ACCENT} />
          </TouchableOpacity>
        ))}
        {selected.length < 5 && (
          <TouchableOpacity style={styles.addPill} onPress={() => setPickerVisible(true)}>
            <Ionicons name="add" size={16} color={UI_COLORS.TEXT_MUTED} />
            <Text style={styles.addText}>Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {selected.length >= 2 && (
        <TouchableOpacity style={styles.compareBtn} onPress={compare}>
          <Ionicons name="git-compare" size={18} color="#fff" />
          <Text style={styles.compareBtnText}>Compare ({selected.length})</Text>
        </TouchableOpacity>
      )}

      {comparing && <LoadingSpinner message="Comparing..." />}

      {comparison.length >= 2 && (
        <View style={styles.results}>
          {METRICS.map(m => (
            <View key={m.key} style={styles.metricSection}>
              <Text style={styles.metricLabel}>{m.label}</Text>
              {comparison.map(c => (
                <View key={c.company_id} style={styles.metricRow}>
                  <Text style={styles.metricName} numberOfLines={1}>{c.display_name}</Text>
                  <Text style={[styles.metricValue, { color: m.color }]}>{fmtValue((c as any)[m.key], m.format)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Company picker modal */}
      <Modal visible={pickerVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Company</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)}>
                <Ionicons name="close" size={24} color={UI_COLORS.TEXT_PRIMARY} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={allCompanies.filter(c => !selected.find(s => s.company_id === c.company_id))}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.pickerItem} onPress={() => addCompany(item)}>
                  <Text style={styles.pickerName}>{item.display_name}</Text>
                  {item.ticker && <Text style={styles.pickerTicker}>{item.ticker}</Text>}
                </TouchableOpacity>
              )}
              keyExtractor={item => item.company_id}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 4 },
  subtitle: { fontSize: 14, color: UI_COLORS.TEXT_MUTED, marginBottom: 16 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ACCENT + '15', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: ACCENT + '30' },
  pillText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  addPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: UI_COLORS.BORDER, borderStyle: 'dashed' },
  addText: { fontSize: 13, color: UI_COLORS.TEXT_MUTED },
  compareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 14, marginBottom: 20 },
  compareBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  results: { gap: 16 },
  metricSection: { backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: UI_COLORS.BORDER },
  metricLabel: { fontSize: 12, fontWeight: '700', color: UI_COLORS.TEXT_MUTED, textTransform: 'uppercase', marginBottom: 8 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER + '50' },
  metricName: { fontSize: 13, color: UI_COLORS.TEXT_PRIMARY, flex: 1 },
  metricValue: { fontSize: 14, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: UI_COLORS.SECONDARY_BG, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER },
  modalTitle: { fontSize: 18, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  pickerItem: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER },
  pickerName: { fontSize: 15, color: UI_COLORS.TEXT_PRIMARY },
  pickerTicker: { fontSize: 13, color: UI_COLORS.TEXT_MUTED },
});
