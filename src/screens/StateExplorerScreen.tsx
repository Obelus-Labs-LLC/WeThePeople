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
import type { StateListEntry } from '../api/types';
import { LoadingSpinner, EmptyState, StatCard } from '../components/ui';
import SearchBar from '../components/SearchBar';

export default function StateExplorerScreen() {
  const navigation = useNavigation<any>();
  const [states, setStates] = useState<StateListEntry[]>([]);
  const [filtered, setFiltered] = useState<StateListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const res = await apiClient.getStates();
      setStates(res.states || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load states');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(states);
    } else {
      const q = search.toLowerCase();
      setFiltered(
        states.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.code.toLowerCase().includes(q)
        )
      );
    }
  }, [states, search]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const totalLegislators = states.reduce((sum, s) => sum + (s.legislator_count || 0), 0);
  const totalBills = states.reduce((sum, s) => sum + (s.bill_count || 0), 0);
  const statesWithData = states.filter((s) => s.legislator_count > 0 || s.bill_count > 0).length;

  if (loading) return <LoadingSpinner message="Loading states..." />;

  const renderState = ({ item }: { item: StateListEntry }) => (
    <TouchableOpacity
      style={styles.stateCard}
      onPress={() => navigation.navigate('StateDashboard', { state_code: item.code })}
    >
      <View style={styles.stateRow}>
        <View style={styles.codeWrap}>
          <Text style={styles.codeText}>{item.code}</Text>
        </View>
        <View style={styles.stateInfo}>
          <Text style={styles.stateName}>{item.name}</Text>
          <View style={styles.statsMini}>
            <View style={styles.miniStat}>
              <Ionicons name="people-outline" size={12} color={UI_COLORS.TEXT_MUTED} />
              <Text style={styles.miniStatText}>{item.legislator_count} legislators</Text>
            </View>
            <View style={styles.miniStat}>
              <Ionicons name="document-text-outline" size={12} color={UI_COLORS.TEXT_MUTED} />
              <Text style={styles.miniStatText}>{item.bill_count} bills</Text>
            </View>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={UI_COLORS.TEXT_MUTED} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Summary stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <StatCard label="States" value={statesWithData} accent="blue" subtitle="with data" />
        </View>
        <View style={styles.statItem}>
          <StatCard label="Legislators" value={totalLegislators} accent="green" />
        </View>
        <View style={styles.statItem}>
          <StatCard label="Bills" value={totalBills} accent="amber" />
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search states..."
        />
      </View>

      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {filtered.length === 0 ? 'No states found' : `${filtered.length} states`}
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState title="No states found" message="Try adjusting your search." />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.code}
          renderItem={renderState}
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
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  statItem: {
    flex: 1,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
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
  stateCard: {
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
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  codeWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: UI_COLORS.ACCENT_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeText: {
    fontSize: 18,
    fontWeight: '800',
    color: UI_COLORS.ACCENT,
    letterSpacing: 1,
  },
  stateInfo: {
    flex: 1,
    gap: 4,
  },
  stateName: {
    fontSize: 15,
    fontWeight: '700',
    color: UI_COLORS.TEXT_PRIMARY,
  },
  statsMini: {
    flexDirection: 'row',
    gap: 14,
  },
  miniStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniStatText: {
    fontSize: 11,
    color: UI_COLORS.TEXT_MUTED,
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
