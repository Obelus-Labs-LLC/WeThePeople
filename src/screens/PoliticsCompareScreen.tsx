import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { Person, PoliticsComparisonItem } from '../api/types';
import { LoadingSpinner, EmptyState, PartyBadge } from '../components/ui';

type Metric = {
  key: keyof PoliticsComparisonItem | string;
  label: string;
  format: 'number';
  icon: string;
  color: string;
};

const METRICS: Metric[] = [
  { key: 'total_actions', label: 'Legislative Actions', format: 'number', icon: 'reader-outline', color: '#2563EB' },
  { key: 'total_claims', label: 'Total Claims', format: 'number', icon: 'chatbox-outline', color: '#F59E0B' },
  { key: 'total_scored', label: 'Scored Claims', format: 'number', icon: 'checkmark-circle-outline', color: '#10B981' },
];

const PARTY_COLORS: Record<string, string> = {
  Democrat: '#2563EB',
  Republican: '#DC2626',
  Independent: '#F59E0B',
};

export default function PoliticsCompareScreen() {
  const navigation = useNavigation<any>();
  const [allPeople, setAllPeople] = useState<Person[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<PoliticsComparisonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    apiClient.getPeople({ limit: 50, active_only: true })
      .then((res) => {
        setAllPeople(res.people || []);
        const top5 = (res.people || []).slice(0, 5).map((p) => p.person_id);
        setSelectedIds(top5);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedIds.length >= 2) {
      setComparing(true);
      apiClient.getPoliticsComparison(selectedIds)
        .then((res) => setComparison(res.people || []))
        .catch(() => {})
        .finally(() => setComparing(false));
    } else {
      setComparison([]);
    }
  }, [selectedIds]);

  const togglePerson = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 10
        ? [...prev, id]
        : prev
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    apiClient.getPeople({ limit: 50, active_only: true })
      .then((res) => setAllPeople(res.people || []))
      .catch(() => {})
      .finally(() => setRefreshing(false));
  };

  if (loading) return <LoadingSpinner message="Loading members..." />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <View style={styles.selectorCard}>
        <View style={styles.cardHeader}>
          <Ionicons name="git-compare-outline" size={16} color={UI_COLORS.ACCENT} />
          <Text style={styles.cardTitle}>Select Members to Compare</Text>
        </View>
        <View style={styles.chipGrid}>
          {allPeople.map((p) => {
            const selected = selectedIds.includes(p.person_id);
            const partyColor = PARTY_COLORS[p.party] || '#6B7280';
            return (
              <TouchableOpacity
                key={p.person_id}
                style={[styles.chip, selected && { backgroundColor: partyColor, borderColor: partyColor }]}
                onPress={() => togglePerson(p.person_id)}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
                  {p.display_name.split(' ').pop()} ({p.party?.charAt(0)})
                </Text>
                {selected && <Ionicons name="checkmark" size={12} color="#fff" />}
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.selectorHint}>
          {selectedIds.length} selected (min 2, max 10)
        </Text>
      </View>

      {comparing && <LoadingSpinner message="Comparing..." />}

      {!comparing && comparison.length >= 2 && (
        <View style={styles.resultsSection}>
          {METRICS.map((metric) => (
            <MetricRow
              key={metric.key}
              metric={metric}
              people={comparison}
              onPress={(id) => navigation.navigate('PersonDetail', { person_id: id })}
            />
          ))}

          {/* Tier breakdown */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Ionicons name="ribbon-outline" size={14} color="#8B5CF6" />
              <Text style={styles.metricLabel}>Accountability Tier Breakdown</Text>
            </View>
            {comparison.map((p) => {
              const tiers = p.by_tier || {};
              return (
                <TouchableOpacity
                  key={p.person_id}
                  style={styles.tierRow}
                  onPress={() => navigation.navigate('PersonDetail', { person_id: p.person_id })}
                >
                  <Text style={styles.tierName} numberOfLines={1}>
                    {p.display_name.split(' ').pop()} ({p.party?.charAt(0)})
                  </Text>
                  <View style={styles.tierBars}>
                    {Object.keys(tiers).length > 0 ? (
                      Object.entries(tiers).sort(([a], [b]) => a.localeCompare(b)).map(([tier, count]) => (
                        <View key={tier} style={styles.tierChip}>
                          <Text style={styles.tierChipText}>{tier}: {count ?? 0}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.noDataText}>No tier data</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {!comparing && selectedIds.length < 2 && (
        <EmptyState title="Select at least 2 members" message="Tap member chips above to compare" />
      )}
    </ScrollView>
  );
}

function MetricRow({
  metric,
  people,
  onPress,
}: {
  metric: Metric;
  people: PoliticsComparisonItem[];
  onPress: (id: string) => void;
}) {
  const values = people.map((p) => {
    const val = (p as any)[metric.key];
    return typeof val === 'number' ? val : 0;
  });
  const maxVal = Math.max(...values, 1);

  return (
    <View style={styles.metricCard}>
      <View style={styles.metricHeader}>
        <Ionicons name={metric.icon as any} size={14} color={metric.color} />
        <Text style={styles.metricLabel}>{metric.label}</Text>
      </View>
      {people.map((p, idx) => {
        const val = values[idx];
        const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
        const partyColor = PARTY_COLORS[p.party || ''] || '#6B7280';
        return (
          <TouchableOpacity
            key={p.person_id}
            style={styles.barRow}
            onPress={() => onPress(p.person_id)}
          >
            <Text style={styles.barLabel} numberOfLines={1}>
              {p.display_name.split(' ').pop()}
            </Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: partyColor }]} />
            </View>
            <Text style={styles.barValue}>{val}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  selectorCard: {
    backgroundColor: UI_COLORS.CARD_BG, margin: 16, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
    backgroundColor: UI_COLORS.SECONDARY_BG, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  chipText: { fontSize: 11, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  chipTextSelected: { color: '#fff' },
  selectorHint: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 10, textAlign: 'center' },
  resultsSection: { paddingHorizontal: 16, paddingBottom: 16 },
  metricCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
  },
  metricHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  metricLabel: { fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  barRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 8 },
  barLabel: { width: 56, fontSize: 11, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  barTrack: {
    flex: 1, height: 18, backgroundColor: UI_COLORS.SECONDARY_BG, borderRadius: 4, overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4, minWidth: 2 },
  barValue: { width: 40, fontSize: 11, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, textAlign: 'right' },
  tierRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT },
  tierName: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 4 },
  tierBars: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tierChip: {
    backgroundColor: '#8B5CF6' + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  tierChipText: { fontSize: 10, fontWeight: '600', color: '#8B5CF6' },
  noDataText: { fontSize: 10, color: UI_COLORS.TEXT_MUTED, fontStyle: 'italic' },
});
