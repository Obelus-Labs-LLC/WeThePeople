import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { LoadingSpinner, EmptyState } from '../components/ui';
import SectionHeader from '../components/SectionHeader';

interface MacroIndicator {
  name: string;
  value: string | number | null;
  date: string | null;
  series_id?: string;
  unit?: string;
  category?: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  growth: 'trending-up-outline',
  employment: 'people-outline',
  inflation: 'cash-outline',
  rates: 'stats-chart-outline',
  housing: 'home-outline',
  trade: 'globe-outline',
};

const CATEGORY_COLORS: Record<string, string> = {
  growth: '#10B981',
  employment: '#2563EB',
  inflation: '#DC2626',
  rates: '#8B5CF6',
  housing: '#F59E0B',
  trade: '#64748B',
};

function formatValue(val: string | number | null, unit?: string): string {
  if (val == null) return '—';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return String(val);
  if (unit === 'percent' || unit === '%') return `${num.toFixed(1)}%`;
  if (Math.abs(num) >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(2);
}

export default function MacroIndicatorsScreen() {
  const [indicators, setIndicators] = useState<MacroIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    const res = await apiClient.getMacroIndicators();
    // The API may return an array or an object with an indicators key
    if (Array.isArray(res)) {
      setIndicators(res);
    } else if (res?.indicators) {
      setIndicators(res.indicators);
    } else {
      // Try to convert object keys into indicator cards
      const items: MacroIndicator[] = Object.entries(res || {}).map(([key, val]: [string, any]) => ({
        name: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        value: val?.value ?? val?.latest_value ?? val,
        date: val?.date ?? val?.observation_date ?? null,
        unit: val?.unit ?? undefined,
        category: val?.category ?? 'growth',
      }));
      setIndicators(items);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadData()
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await loadData(); } catch {}
    setRefreshing(false);
  };

  if (loading) return <LoadingSpinner message="Loading macro indicators..." />;

  if (error) {
    return (
      <View style={styles.container}>
        <EmptyState title="Error loading data" message={error} onRetry={() => {
          setError(null);
          setLoading(true);
          loadData().catch((e) => setError(e.message)).finally(() => setLoading(false));
        }} />
      </View>
    );
  }

  if (indicators.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState title="No indicators available" message="Macro economic data has not been synced yet." />
      </View>
    );
  }

  // Group by category
  const grouped = indicators.reduce<Record<string, MacroIndicator[]>>((acc, ind) => {
    const cat = ind.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ind);
    return acc;
  }, {});

  const categories = Object.keys(grouped);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
    >
      <Text style={styles.subtitle}>Key economic indicators tracked by the Federal Reserve</Text>

      {categories.length > 0 ? (
        categories.map((cat) => (
          <View key={cat} style={styles.section}>
            <SectionHeader
              title={cat.charAt(0).toUpperCase() + cat.slice(1)}
              accent={CATEGORY_COLORS[cat] || UI_COLORS.ACCENT}
            />
            <View style={styles.grid}>
              {grouped[cat].map((ind, idx) => {
                const color = CATEGORY_COLORS[cat] || UI_COLORS.ACCENT;
                const icon = CATEGORY_ICONS[cat] || 'analytics-outline';
                return (
                  <View key={idx} style={styles.indicatorCard}>
                    <View style={styles.indicatorHeader}>
                      <View style={[styles.iconWrap, { backgroundColor: color + '15' }]}>
                        <Ionicons name={icon as any} size={16} color={color} />
                      </View>
                      <Text style={styles.indicatorName} numberOfLines={2}>{ind.name}</Text>
                    </View>
                    <Text style={[styles.indicatorValue, { color }]}>
                      {formatValue(ind.value, ind.unit)}
                    </Text>
                    {ind.date && (
                      <Text style={styles.indicatorDate}>{ind.date}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))
      ) : (
        // Flat list if no categories
        <View style={styles.grid}>
          {indicators.map((ind, idx) => (
            <View key={idx} style={styles.indicatorCard}>
              <Text style={styles.indicatorName} numberOfLines={2}>{ind.name}</Text>
              <Text style={[styles.indicatorValue, { color: UI_COLORS.ACCENT }]}>
                {formatValue(ind.value, ind.unit)}
              </Text>
              {ind.date && <Text style={styles.indicatorDate}>{ind.date}</Text>}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { padding: 16, paddingBottom: 32 },
  subtitle: { color: UI_COLORS.TEXT_MUTED, fontSize: 13, marginBottom: 16 },
  section: { marginBottom: 20 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: 16,
  },
  indicatorCard: {
    width: '47%' as any,
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  indicatorHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  iconWrap: {
    width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center',
  },
  indicatorName: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 12, fontWeight: '600', flex: 1 },
  indicatorValue: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  indicatorDate: { color: UI_COLORS.TEXT_MUTED, fontSize: 10, marginTop: 2 },
});
