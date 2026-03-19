import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { RecentAction } from '../api/types';
import { LoadingSpinner, EmptyState } from '../components/ui';

const PAGE_SIZE = 25;

export default function ActivityFeedScreen() {
  const navigation = useNavigation<any>();
  const [actions, setActions] = useState<RecentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const loadData = useCallback(async (append = false) => {
    setError(null);
    try {
      const limit = append ? (actions.length + PAGE_SIZE) : PAGE_SIZE;
      const data = await apiClient.getRecentActions(limit);
      if (append) {
        setActions(data);
        if (data.length <= actions.length) setHasMore(false);
      } else {
        setActions(data);
        setHasMore(data.length >= PAGE_SIZE);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load activity');
    }
  }, [actions.length]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    setHasMore(true);
    await loadData(false);
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await loadData(true);
    setLoadingMore(false);
  };

  if (loading) return <LoadingSpinner message="Loading activity feed..." />;

  const renderAction = ({ item }: { item: RecentAction }) => {
    const isExpanded = expandedId === item.id;
    const billLabel = item.bill_type && item.bill_number
      ? `${item.bill_type.toUpperCase()} ${item.bill_number}`
      : null;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.cardRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="document-text-outline" size={18} color={UI_COLORS.ACCENT} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.actionTitle} numberOfLines={isExpanded ? undefined : 2}>
              {item.title}
            </Text>
            <View style={styles.metaRow}>
              {item.person_id && (
                <TouchableOpacity
                  style={styles.personTag}
                  onPress={() => navigation.navigate('PersonDetail', { person_id: item.person_id })}
                >
                  <Ionicons name="person-outline" size={10} color={UI_COLORS.ACCENT} />
                  <Text style={styles.personText}>
                    {item.person_id.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              )}
              {item.date && (
                <Text style={styles.dateText}>
                  {new Date(item.date).toLocaleDateString()}
                </Text>
              )}
            </View>

            {billLabel && (
              <View style={styles.billBadge}>
                <Text style={styles.billBadgeText}>{billLabel}</Text>
              </View>
            )}

            {isExpanded && item.summary && (
              <Text style={styles.expandedSummary}>{item.summary}</Text>
            )}
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={UI_COLORS.TEXT_MUTED}
          />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.countRow}>
        <Ionicons name="pulse-outline" size={14} color={UI_COLORS.ACCENT} />
        <Text style={styles.countText}>{actions.length} recent actions</Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : actions.length === 0 ? (
        <EmptyState title="No activity yet" message="Legislative actions will appear here." />
      ) : (
        <FlatList
          data={actions}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderAction}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={UI_COLORS.ACCENT} />
              </View>
            ) : null
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
    paddingHorizontal: 16,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    marginBottom: 10,
  },
  countText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
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
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: UI_COLORS.ACCENT_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: UI_COLORS.TEXT_PRIMARY,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  personTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: UI_COLORS.ACCENT_LIGHT,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  personText: {
    fontSize: 11,
    color: UI_COLORS.ACCENT,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  dateText: {
    fontSize: 11,
    color: UI_COLORS.TEXT_MUTED,
  },
  billBadge: {
    alignSelf: 'flex-start',
    backgroundColor: UI_COLORS.SECONDARY_BG,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 2,
  },
  billBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: UI_COLORS.TEXT_MUTED,
    letterSpacing: 0.3,
  },
  expandedSummary: {
    fontSize: 13,
    color: UI_COLORS.TEXT_SECONDARY,
    lineHeight: 19,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.BORDER_LIGHT,
  },
  errorBox: {
    padding: 24,
    alignItems: 'center',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
