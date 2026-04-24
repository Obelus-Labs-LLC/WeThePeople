import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { apiClient } from '../api/client';
const ACCENT = '#7C3AED';
const log = (msg: string, err: unknown) => console.warn(`[InfluenceTimelineScreen] ${msg}:`, err);

// Timeline of influence events for a single entity (politician or company).
// Uses /influence/network and filters the edges list into chronological
// events. Route params: entity_type, entity_id, entity_name.

interface TimelineEvent {
  date: string;      // YYYY-MM-DD
  title: string;
  description: string;
  category: 'donation' | 'lobbying' | 'trade' | 'legislation' | 'contract';
  amount?: number;
  entity_name?: string;
}

const CATEGORY_CONFIG: Record<TimelineEvent['category'], { color: string; icon: string; label: string }> = {
  donation:   { color: '#10B981', icon: 'cash',     label: 'Donation' },
  lobbying:   { color: '#F59E0B', icon: 'megaphone', label: 'Lobbying' },
  trade:      { color: '#3B82F6', icon: 'trending-up', label: 'Trade' },
  legislation:{ color: '#7C3AED', icon: 'document-text', label: 'Bill' },
  contract:   { color: '#DC2626', icon: 'briefcase', label: 'Contract' },
};

function fmtDollar(n?: number): string {
  if (!n) return '';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtDate(s: string): string {
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }); }
  catch { return s; }
}

type CategoryFilter = 'all' | TimelineEvent['category'];

export default function InfluenceTimelineScreen() {
  const route = useRoute<any>();
  const entityType: string = route.params?.entity_type || 'person';
  const entityId: string = route.params?.entity_id || '';
  const entityName: string = route.params?.entity_name || entityId;

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<CategoryFilter>('all');

  const load = async () => {
    if (!entityId) {
      setError('Missing entity ID');
      setLoading(false);
      return;
    }
    try {
      const data = await apiClient.getInfluenceNetwork({
        entity_type: entityType,
        entity_id: entityId,
        depth: 1,
        limit: 100,
      });

      const out: TimelineEvent[] = [];
      for (const edge of data.edges || []) {
        const y = edge.year;
        if (!y) continue;
        if (edge.type === 'donation') {
          out.push({
            date: `${y}-01-01`,
            title: `PAC Donation${edge.label ? `: ${edge.label}` : ''}`,
            description: `${edge.source_name || '?'} ${'\u2192'} ${edge.target_name || '?'}`,
            category: 'donation',
            amount: edge.amount,
            entity_name: edge.source_name || edge.target_name,
          });
        } else if (edge.type === 'lobbying') {
          out.push({
            date: `${y}-06-01`,
            title: `Lobbying${edge.label ? `: ${edge.label}` : ''}`,
            description: `${edge.source_name || '?'} lobbied ${edge.target_name || ''}`,
            category: 'lobbying',
            amount: edge.amount,
            entity_name: edge.source_name,
          });
        } else if (edge.type === 'trade') {
          out.push({
            date: `${y}-03-01`,
            title: `Stock Trade${edge.label ? `: ${edge.label}` : ''}`,
            description: `${edge.source_name || '?'} traded securities`,
            category: 'trade',
            amount: edge.amount,
            entity_name: edge.source_name,
          });
        } else if (edge.type === 'legislation') {
          out.push({
            date: `${y}-01-01`,
            title: `Bill${edge.label ? `: ${edge.label}` : ''}`,
            description: `${edge.source_name || '?'} sponsored legislation`,
            category: 'legislation',
            entity_name: edge.source_name,
          });
        } else if (edge.type === 'contract') {
          out.push({
            date: `${y}-06-01`,
            title: `Government Contract${edge.label ? `: ${edge.label}` : ''}`,
            description: `${edge.source_name || '?'} ${'\u2192'} ${edge.target_name || '?'}`,
            category: 'contract',
            amount: edge.amount,
            entity_name: edge.target_name || edge.source_name,
          });
        }
      }

      out.sort((a, b) => b.date.localeCompare(a.date));
      setEvents(out);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load timeline');
      log('load', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [entityType, entityId]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => e.category === filter);
  }, [events, filter]);

  const totals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const e of events) out[e.category] = (out[e.category] || 0) + 1;
    return out;
  }, [events]);

  if (loading) return <LoadingSpinner message={`Building timeline for ${entityName}...`} />;
  if (error) return <EmptyState title="Error" message={error} />;

  const renderRow = ({ item: e }: { item: TimelineEvent }) => {
    const cfg = CATEGORY_CONFIG[e.category];
    return (
      <View style={styles.row}>
        <View style={styles.spine}>
          <View style={[styles.dot, { backgroundColor: cfg.color }]} />
          <View style={styles.spineLine} />
        </View>
        <View style={[styles.card, { borderLeftColor: cfg.color, borderLeftWidth: 3 }]}>
          <View style={styles.cardHead}>
            <View style={[styles.typeBadge, { backgroundColor: cfg.color + '18' }]}>
              <Ionicons name={cfg.icon as any} size={11} color={cfg.color} />
              <Text style={[styles.typeText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            <Text style={styles.dateText}>{fmtDate(e.date)}</Text>
          </View>
          <Text style={styles.title} numberOfLines={2}>{e.title}</Text>
          <Text style={styles.desc} numberOfLines={2}>{e.description}</Text>
          {e.amount != null && e.amount > 0 && (
            <Text style={[styles.amount, { color: cfg.color }]}>{fmtDollar(e.amount)}</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#7C3AED', '#6D28D9', '#4C1D95']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroRow}>
          <Ionicons name="git-network" size={22} color="#FFFFFF" />
          <Text style={styles.heroTitle}>Influence Timeline</Text>
        </View>
        <Text style={styles.heroSubtitle} numberOfLines={2}>{entityName}</Text>
        <Text style={styles.heroMeta}>
          {events.length} event{events.length === 1 ? '' : 's'} across donations, lobbying, trades, bills, contracts
        </Text>
      </LinearGradient>

      <ScrollFilterRow
        filter={filter}
        totals={totals}
        onSelect={setFilter}
      />

      <FlatList
        data={filtered}
        renderItem={renderRow}
        keyExtractor={(e, i) => `${e.date}-${e.category}-${i}`}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        ListEmptyComponent={<EmptyState title="No events at this filter" />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      />
    </View>
  );
}

interface FilterRowProps {
  filter: CategoryFilter;
  totals: Record<string, number>;
  onSelect: (f: CategoryFilter) => void;
}

function ScrollFilterRow({ filter, totals, onSelect }: FilterRowProps) {
  const categories: CategoryFilter[] = ['all', 'donation', 'lobbying', 'trade', 'legislation', 'contract'];
  return (
    <View style={styles.filterRow}>
      {categories.map((c) => {
        const active = filter === c;
        const count = c === 'all' ? Object.values(totals).reduce((s, n) => s + n, 0) : (totals[c] || 0);
        const color = c === 'all' ? ACCENT : CATEGORY_CONFIG[c as Exclude<CategoryFilter, 'all'>].color;
        return (
          <TouchableOpacity
            key={c}
            style={[styles.filterChip, active && { backgroundColor: color + '20', borderColor: color + '50' }]}
            onPress={() => onSelect(c)}
          >
            <Text style={[styles.filterText, active && { color }]}>
              {c} {count > 0 && <Text style={styles.filterCount}>{count}</Text>}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  hero: { padding: 18, margin: 16, borderRadius: 16, overflow: 'hidden' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  heroSubtitle: { color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  heroMeta: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, marginBottom: 4 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: UI_COLORS.BORDER, backgroundColor: UI_COLORS.CARD_BG },
  filterText: { fontSize: 11, fontWeight: '700', color: UI_COLORS.TEXT_SECONDARY, textTransform: 'capitalize' },
  filterCount: { fontWeight: '800' },
  row: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  spine: { width: 12, alignItems: 'center', paddingTop: 14 },
  dot: { width: 10, height: 10, borderRadius: 5, zIndex: 2 },
  spineLine: { position: 'absolute', top: 22, bottom: -10, width: 2, backgroundColor: UI_COLORS.BORDER_LIGHT },
  card: { flex: 1, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  dateText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, fontWeight: '600' },
  title: { fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 18 },
  desc: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, marginTop: 4, lineHeight: 16 },
  amount: { fontSize: 14, fontWeight: '800', marginTop: 6 },
});
