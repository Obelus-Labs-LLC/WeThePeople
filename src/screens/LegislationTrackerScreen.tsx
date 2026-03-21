import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { RecentAction } from '../api/types';
import { LoadingSpinner, EmptyState } from '../components/ui';
import SearchBar from '../components/SearchBar';
import PillTabBar from '../components/PillTabBar';

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'introduced', label: 'Introduced' },
  { key: 'committee', label: 'Committee' },
  { key: 'floor', label: 'Floor' },
  { key: 'other_chamber', label: 'Other Chamber' },
  { key: 'president', label: 'President' },
  { key: 'law', label: 'Law' },
];

const STATUS_COLORS: Record<string, string> = {
  introduced: '#6B7280',
  committee: '#3B82F6',
  in_committee: '#3B82F6',
  floor: '#8B5CF6',
  passed_house: '#8B5CF6',
  passed_senate: '#8B5CF6',
  other_chamber: '#F59E0B',
  passed_both: '#10B981',
  president: '#F59E0B',
  sent_to_president: '#F59E0B',
  law: '#059669',
  became_law: '#059669',
};

export default function LegislationTrackerScreen() {
  const navigation = useNavigation<any>();
  const [actions, setActions] = useState<RecentAction[]>([]);
  const [filtered, setFiltered] = useState<RecentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const data = await apiClient.getRecentActions(200);
      setActions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load legislation');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  // Client-side filtering
  useEffect(() => {
    let result = actions;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.title?.toLowerCase().includes(q) ||
          a.summary?.toLowerCase().includes(q) ||
          a.person_id?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter((a) => {
        const title = (a.title || '').toLowerCase();
        const summary = (a.summary || '').toLowerCase();
        const combined = title + ' ' + summary;
        switch (statusFilter) {
          case 'introduced':
            return combined.includes('introduced');
          case 'committee':
            return combined.includes('committee');
          case 'floor':
            return combined.includes('floor') || combined.includes('passed');
          case 'other_chamber':
            return combined.includes('other chamber') || combined.includes('referred');
          case 'president':
            return combined.includes('president') || combined.includes('signed');
          case 'law':
            return combined.includes('law') || combined.includes('enacted');
          default:
            return true;
        }
      });
    }
    setFiltered(result);
  }, [actions, search, statusFilter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (loading) return <LoadingSpinner message="Loading legislation..." />;

  const renderBill = ({ item }: { item: RecentAction }) => {
    const billLabel = item.bill_type && item.bill_number
      ? `${item.bill_type.toUpperCase()} ${item.bill_number}`
      : null;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          if (item.bill_type && item.bill_number) {
            const billId = `${item.bill_congress || 118}-${item.bill_type}-${item.bill_number}`;
            navigation.navigate('BillDetail', { bill_id: billId });
          }
        }}
      >
        <View style={styles.cardHeader}>
          {billLabel && (
            <Text style={styles.billId}>{billLabel}</Text>
          )}
          <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS['introduced'] || '#6B7280') + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS['introduced'] || '#6B7280' }]} />
            <Text style={[styles.statusText, { color: STATUS_COLORS['introduced'] || '#6B7280' }]}>
              Action
            </Text>
          </View>
        </View>

        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>

        {item.summary && (
          <Text style={styles.summary} numberOfLines={1}>{item.summary}</Text>
        )}

        <View style={styles.metaRow}>
          {item.person_id && (
            <View style={styles.metaTag}>
              <Ionicons name="person-outline" size={11} color={UI_COLORS.ACCENT} />
              <Text style={styles.metaText}>{item.person_id.replace(/_/g, ' ')}</Text>
            </View>
          )}
          {item.date && (
            <View style={styles.metaTag}>
              <Ionicons name="calendar-outline" size={11} color={UI_COLORS.TEXT_MUTED} />
              <Text style={styles.metaText}>
                {new Date(item.date).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search bills by title or keyword..."
        />
      </View>

      <PillTabBar
        tabs={STATUS_FILTERS}
        activeTab={statusFilter}
        onTabChange={setStatusFilter}
      />

      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {filtered.length === 0 ? 'No results' : `${filtered.length} actions`}
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState title="No bills found" message="Try adjusting your search or filters." />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderBill}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.SECONDARY_BG,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  countText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  billId: {
    fontSize: 12,
    fontWeight: '800',
    color: UI_COLORS.TEXT_MUTED,
    letterSpacing: 0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: UI_COLORS.TEXT_PRIMARY,
    lineHeight: 20,
    marginBottom: 4,
  },
  summary: {
    fontSize: 12,
    color: UI_COLORS.TEXT_SECONDARY,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: UI_COLORS.SECONDARY_BG,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metaText: {
    fontSize: 11,
    color: UI_COLORS.TEXT_SECONDARY,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  errorBox: {
    padding: 24,
    alignItems: 'center',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
});
