import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS, TIER_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { LoadingSpinner, EmptyState } from '../components/ui';

interface VerifyEntityScreenProps {
  route?: any;
  navigation?: any;
}

function tierLabel(tier: string | null): string {
  if (tier === 'strong') return 'Strong';
  if (tier === 'moderate') return 'Moderate';
  if (tier === 'weak') return 'Weak';
  return 'Unverified';
}

export default function VerifyEntityScreen({ route, navigation }: VerifyEntityScreenProps) {
  const { entityType, entityId, entityName } = route?.params || {};
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const fetchData = useCallback(async () => {
    if (!entityType || !entityId) return;
    try {
      const res = await apiClient.getEntityVerifications(entityType, entityId, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setData(res);
    } catch (e) {
      console.error('Failed to load entity verifications:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [entityType, entityId, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) return <LoadingSpinner message="Loading verifications..." />;

  if (!data) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="shield-checkmark-outline" size={48} color={UI_COLORS.TEXT_MUTED} />
        <Text style={styles.errorTitle}>No Data Found</Text>
      </View>
    );
  }

  const tierSummary = data.tier_summary || {};

  const renderItem = ({ item }: { item: any }) => {
    const tier = item.evaluation?.tier || 'none';
    const color = TIER_COLORS[tier] || TIER_COLORS.none;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation?.navigate('VerifyResult', { id: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.tierBadge, { backgroundColor: color + '20' }]}>
            <View style={[styles.tierDot, { backgroundColor: color }]} />
            <Text style={[styles.tierText, { color }]}>{tierLabel(tier)}</Text>
          </View>
          {item.evaluation?.score != null && (
            <Text style={styles.score}>{Math.round(item.evaluation.score * 100)}%</Text>
          )}
        </View>
        <Text style={styles.claimText} numberOfLines={3}>{item.text}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={data.items || []}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.entityName}>{entityName || entityId}</Text>
            <Text style={styles.entityType}>{entityType}</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.totalText}>{data.total} claims</Text>
              {['strong', 'moderate', 'weak', 'none'].map((tier) => {
                const count = tierSummary[tier] || 0;
                if (count === 0) return null;
                const color = TIER_COLORS[tier] || TIER_COLORS.none;
                return (
                  <View key={tier} style={[styles.summaryBadge, { backgroundColor: color + '15' }]}>
                    <Text style={[styles.summaryBadgeText, { color }]}>
                      {tierLabel(tier)}: {count}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="shield-checkmark-outline"
            title="No Verifications"
            subtitle="No claims verified for this entity yet"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.PRIMARY_BG,
  },
  list: {
    paddingBottom: 32,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: UI_COLORS.PRIMARY_BG,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: UI_COLORS.TEXT_PRIMARY,
  },
  header: {
    padding: 16,
    gap: 4,
  },
  entityName: {
    fontSize: 20,
    fontWeight: '800',
    color: UI_COLORS.TEXT_PRIMARY,
  },
  entityType: {
    fontSize: 10,
    fontWeight: '700',
    color: UI_COLORS.ACCENT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  totalText: {
    fontSize: 13,
    color: UI_COLORS.TEXT_MUTED,
    marginRight: 4,
  },
  summaryBadge: {
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  summaryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER_LIGHT,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tierDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tierText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  score: {
    fontSize: 12,
    fontWeight: '600',
    color: UI_COLORS.TEXT_MUTED,
    fontVariant: ['tabular-nums'],
  },
  claimText: {
    fontSize: 13,
    color: UI_COLORS.TEXT_PRIMARY,
    lineHeight: 19,
  },
});
