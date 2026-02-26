import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  RefreshControl,
  Modal,
  FlatList,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { DashboardStats, Person, RecentAction } from '../api/types';
import { LoadingSpinner, StatCard, TierProgressBar, PartyBadge, ChamberBadge, EmptyState, TierBadge } from '../components/ui';

// ── Expandable Activity Row ──
function ExpandableActivity({ action, isLast }: { action: RecentAction; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => setExpanded(!expanded)}
      style={[styles.activityRow, !isLast && styles.activityBorder]}
    >
      <View style={styles.activityContent}>
        <View style={styles.activityHeader}>
          <Text style={styles.activityTitle} numberOfLines={expanded ? undefined : 1}>{action.title}</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={UI_COLORS.TEXT_MUTED}
          />
        </View>
        {!expanded && action.summary && (
          <Text style={styles.activitySummary} numberOfLines={1}>{action.summary}</Text>
        )}
        {expanded && (
          <View style={styles.expandedContent}>
            {action.summary && (
              <Text style={styles.expandedSummary}>{action.summary}</Text>
            )}
            <View style={styles.expandedMeta}>
              <View style={styles.metaRow}>
                <Ionicons name="person-outline" size={12} color={UI_COLORS.TEXT_MUTED} />
                <Text style={styles.metaLabel}>{action.person_id.replace(/_/g, ' ')}</Text>
              </View>
              {action.bill_type && action.bill_number && (
                <View style={styles.metaRow}>
                  <Ionicons name="document-text-outline" size={12} color={UI_COLORS.TEXT_MUTED} />
                  <Text style={styles.metaLabel}>{action.bill_type.toUpperCase()} {action.bill_number}</Text>
                </View>
              )}
              {action.date && (
                <View style={styles.metaRow}>
                  <Ionicons name="calendar-outline" size={12} color={UI_COLORS.TEXT_MUTED} />
                  <Text style={styles.metaLabel}>{new Date(action.date).toLocaleDateString()}</Text>
                </View>
              )}
            </View>
          </View>
        )}
        {!expanded && (
          <Text style={styles.activityMeta}>
            {action.person_id.replace(/_/g, ' ')}
            {action.bill_type && action.bill_number && ` \u00B7 ${action.bill_type.toUpperCase()} ${action.bill_number}`}
          </Text>
        )}
      </View>
      {!expanded && action.date && (
        <Text style={styles.activityDate}>
          {new Date(action.date).toLocaleDateString()}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function PoliticsDashboardScreen() {
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [actions, setActions] = useState<RecentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state for tappable stats
  const [statModal, setStatModal] = useState<'claims' | 'match' | null>(null);

  const loadData = async () => {
    try {
      const [statsRes, peopleRes, actionsRes] = await Promise.all([
        apiClient.getDashboardStats(),
        apiClient.getPeople({ has_ledger: true, limit: 6 }),
        apiClient.getRecentActions(8),
      ]);
      setStats(statsRes);
      setPeople(peopleRes.people || []);
      setActions(actionsRes || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard');
    }
  };

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (loading) return <LoadingSpinner message="Loading dashboard..." />;

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => { setLoading(true); loadData().finally(() => setLoading(false)); }}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tierSegments = stats ? [
    { label: 'Strong', value: stats.by_tier.strong || 0, color: '#10B981' },
    { label: 'Moderate', value: stats.by_tier.moderate || 0, color: '#D4A017' },
    { label: 'Weak', value: stats.by_tier.weak || 0, color: '#E67E22' },
    { label: 'None', value: stats.by_tier.none || 0, color: '#9CA3AF' },
  ] : [];

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>
            Tracking what politicians do — not just what they say
          </Text>
          <Text style={styles.heroSubtitle}>
            We track legislative actions, votes, and bills to show you
            what your representatives are actually doing in office.
          </Text>
        </View>

        {/* Stats grid — tappable */}
        {stats && (
          <View style={styles.statsGrid}>
            <View style={styles.statsRow}>
              <View style={styles.statsHalf}>
                <StatCard label="People Tracked" value={stats.total_people} accent="green" />
              </View>
              <TouchableOpacity style={styles.statsHalf} onPress={() => setStatModal('claims')}>
                <StatCard label="Activity Entries" value={stats.total_claims} accent="gold" subtitle="Tap to view" />
              </TouchableOpacity>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statsHalf}>
                <StatCard label="Actions Monitored" value={stats.total_actions.toLocaleString()} accent="emerald" />
              </View>
              <TouchableOpacity style={styles.statsHalf} onPress={() => setStatModal('match')}>
                <StatCard label="Match Rate" value={`${stats.match_rate}%`} accent="amber" subtitle="Tap for breakdown" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Tier distribution */}
        {stats && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Accountability Tier Distribution</Text>
            <TierProgressBar segments={tierSegments} />
          </View>
        )}

        {/* Featured members */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Featured Members</Text>
          <TouchableOpacity onPress={() => navigation.navigate('PeopleDirectory')}>
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        </View>

        {people.length === 0 ? (
          <EmptyState title="No members with ledger data" message="Members will appear once activity is processed." />
        ) : (
          people.map((person) => (
            <TouchableOpacity
              key={person.person_id}
              style={styles.memberCard}
              onPress={() => navigation.navigate('PersonDetail', { person_id: person.person_id })}
            >
              <View style={styles.memberRow}>
                {person.photo_url ? (
                  <Image source={{ uri: person.photo_url }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>{person.display_name.charAt(0)}</Text>
                  </View>
                )}
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{person.display_name}</Text>
                  <Text style={styles.memberState}>{person.state}</Text>
                  <View style={styles.badgeRow}>
                    <PartyBadge party={person.party} />
                    <ChamberBadge chamber={person.chamber} />
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={UI_COLORS.TEXT_MUTED} />
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* Recent activity — expandable */}
        {actions.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 12 }]}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <Text style={styles.tapHint}>Tap to expand</Text>
            </View>
            <View style={styles.card}>
              {actions.map((action, i) => (
                <ExpandableActivity
                  key={action.id}
                  action={action}
                  isLast={i === actions.length - 1}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Activity Modal */}
      <Modal visible={statModal === 'claims'} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Activity Entries</Text>
            <TouchableOpacity onPress={() => setStatModal(null)}>
              <Ionicons name="close" size={24} color={UI_COLORS.TEXT_PRIMARY} />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalSubtitle}>
            {stats?.total_claims || 0} total entries tracked across {stats?.total_people || 0} members
          </Text>
          <View style={styles.modalStats}>
            <View style={styles.modalStatRow}>
              <Text style={styles.modalStatLabel}>Total Entries</Text>
              <Text style={styles.modalStatValue}>{stats?.total_claims || 0}</Text>
            </View>
            <View style={styles.modalStatRow}>
              <Text style={styles.modalStatLabel}>With Evidence Match</Text>
              <Text style={[styles.modalStatValue, { color: '#10B981' }]}>
                {Math.round((stats?.total_claims || 0) * (stats?.match_rate || 0) / 100)}
              </Text>
            </View>
            <View style={styles.modalStatRow}>
              <Text style={styles.modalStatLabel}>Unmatched</Text>
              <Text style={[styles.modalStatValue, { color: '#E67E22' }]}>
                {(stats?.total_claims || 0) - Math.round((stats?.total_claims || 0) * (stats?.match_rate || 0) / 100)}
              </Text>
            </View>
          </View>
          <Text style={styles.modalHint}>
            Tap a member from Featured Members to see their individual activity.
          </Text>
        </View>
      </Modal>

      {/* Match Rate Modal */}
      <Modal visible={statModal === 'match'} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Match Rate Breakdown</Text>
            <TouchableOpacity onPress={() => setStatModal(null)}>
              <Ionicons name="close" size={24} color={UI_COLORS.TEXT_PRIMARY} />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalSubtitle}>
            How well does activity match against legislative actions?
          </Text>
          {stats && (
            <View style={styles.modalStats}>
              <View style={styles.modalStatRow}>
                <Text style={styles.modalStatLabel}>Match Rate</Text>
                <Text style={[styles.modalStatValue, { color: UI_COLORS.ACCENT }]}>{stats.match_rate}%</Text>
              </View>
              <View style={styles.modalStatRow}>
                <Text style={styles.modalStatLabel}>Bills Tracked</Text>
                <Text style={styles.modalStatValue}>{stats.total_bills.toLocaleString()}</Text>
              </View>
              <View style={styles.modalStatRow}>
                <Text style={styles.modalStatLabel}>Actions Monitored</Text>
                <Text style={styles.modalStatValue}>{stats.total_actions.toLocaleString()}</Text>
              </View>
            </View>
          )}
          {stats && (
            <View style={styles.modalTierSection}>
              <Text style={styles.modalSectionTitle}>By Accountability Tier</Text>
              <TierProgressBar segments={tierSegments} />
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.SECONDARY_BG,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  hero: {
    borderRadius: 16,
    backgroundColor: UI_COLORS.HERO_BG,
    padding: 20,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
  },
  heroTitle: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroSubtitle: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
  },
  statsGrid: {
    gap: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statsHalf: {
    flex: 1,
  },
  card: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTitle: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: -4,
  },
  sectionTitle: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '700',
  },
  viewAll: {
    color: UI_COLORS.ACCENT,
    fontSize: 13,
    fontWeight: '600',
  },
  tapHint: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    fontStyle: 'italic',
  },
  memberCard: {
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
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: UI_COLORS.ACCENT_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: UI_COLORS.ACCENT,
    fontSize: 16,
    fontWeight: '700',
  },
  memberInfo: {
    flex: 1,
    gap: 2,
  },
  memberName: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '600',
  },
  memberState: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  // Activity rows — expandable
  activityRow: {
    paddingVertical: 10,
  },
  activityBorder: {
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.BORDER,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    flex: 1,
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 13,
    fontWeight: '500',
  },
  activitySummary: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    marginTop: 2,
  },
  activityMeta: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    marginTop: 4,
    textTransform: 'capitalize',
  },
  activityDate: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  expandedContent: {
    marginTop: 8,
    padding: 12,
    backgroundColor: UI_COLORS.SECONDARY_BG,
    borderRadius: 8,
  },
  expandedSummary: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  expandedMeta: {
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaLabel: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  // Modals
  modalContainer: {
    flex: 1,
    backgroundColor: UI_COLORS.PRIMARY_BG,
    padding: 20,
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 20,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  modalStats: {
    gap: 1,
    marginBottom: 24,
  },
  modalStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG,
    padding: 16,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    borderRadius: 0,
  },
  modalStatLabel: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 14,
  },
  modalStatValue: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  modalHint: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingTop: 12,
  },
  modalTierSection: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
  },
  modalSectionTitle: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  // Error
  errorContainer: {
    flex: 1,
    backgroundColor: UI_COLORS.PRIMARY_BG,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: UI_COLORS.ACCENT,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
