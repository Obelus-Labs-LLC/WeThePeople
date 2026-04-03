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
import { LinearGradient } from 'expo-linear-gradient';
import { LoadingSpinner, StatCard, PartyBadge, ChamberBadge, EmptyState } from '../components/ui';
import SimpleBarChart from '../components/SimpleBarChart';
import type { BarChartDataPoint } from '../components/SimpleBarChart';

// ── Activity type color coding ──
const ACTIVITY_TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  hr: { bg: '#2563EB18', text: '#2563EB', label: 'House Bill' },
  hres: { bg: '#2563EB18', text: '#2563EB', label: 'House Res' },
  hconres: { bg: '#2563EB18', text: '#2563EB', label: 'House Con Res' },
  hjres: { bg: '#2563EB18', text: '#2563EB', label: 'House Jnt Res' },
  s: { bg: '#7C3AED18', text: '#7C3AED', label: 'Senate Bill' },
  sres: { bg: '#7C3AED18', text: '#7C3AED', label: 'Senate Res' },
  sconres: { bg: '#7C3AED18', text: '#7C3AED', label: 'Senate Con Res' },
  sjres: { bg: '#7C3AED18', text: '#7C3AED', label: 'Senate Jnt Res' },
};

// ── Expandable Activity Row ──
function ExpandableActivity({ action, isLast, onBillPress, onPersonPress }: {
  action: RecentAction;
  isLast: boolean;
  onBillPress?: (billId: string) => void;
  onPersonPress?: (personId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const billId = action.bill_type && action.bill_number
    ? `${action.bill_type}${action.bill_number}`
    : null;

  const typeInfo = action.bill_type
    ? ACTIVITY_TYPE_COLORS[action.bill_type.toLowerCase()] || { bg: '#C5960C18', text: '#C5960C', label: action.bill_type.toUpperCase() }
    : null;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => setExpanded(!expanded)}
      style={[styles.activityRow, !isLast && styles.activityBorder]}
    >
      <View style={styles.activityContent}>
        <View style={styles.activityHeader}>
          {typeInfo && (
            <View style={[styles.typeBadge, { backgroundColor: typeInfo.bg }]}>
              <Text style={[styles.typeBadgeText, { color: typeInfo.text }]}>{typeInfo.label}</Text>
            </View>
          )}
          <Text style={styles.activityTitle} numberOfLines={expanded ? undefined : 1}>
            {action.title ? action.title.charAt(0).toUpperCase() + action.title.slice(1) : ''}
          </Text>
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
              <TouchableOpacity
                style={styles.metaRow}
                onPress={() => onPersonPress?.(action.person_id)}
              >
                <Ionicons name="person-outline" size={12} color={UI_COLORS.ACCENT} />
                <Text style={[styles.metaLabel, { color: UI_COLORS.ACCENT }]}>
                  {action.person_id.replace(/_/g, ' ')}
                </Text>
              </TouchableOpacity>
              {billId && (
                <TouchableOpacity
                  style={styles.metaRow}
                  onPress={() => onBillPress?.(billId)}
                >
                  <Ionicons name="document-text-outline" size={12} color={UI_COLORS.ACCENT} />
                  <Text style={[styles.metaLabel, { color: UI_COLORS.ACCENT, textDecorationLine: 'underline' }]}>
                    {action.bill_type!.toUpperCase()} {action.bill_number}
                  </Text>
                </TouchableOpacity>
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
  const [lobbyingData, setLobbyingData] = useState<BarChartDataPoint[]>([]);

  const loadData = async () => {
    try {
      const [statsRes, peopleRes, actionsRes, lobbyingRes] = await Promise.all([
        apiClient.getDashboardStats(),
        apiClient.getPeople({ has_ledger: true, limit: 6 }),
        apiClient.getRecentActions(8),
        fetch('https://api.wethepeopleforus.com/influence/top-lobbying?limit=5')
          .then(r => r.ok ? r.json() : [])
          .catch(() => []),
      ]);
      setStats(statsRes);
      setPeople(peopleRes.people || []);
      setActions(actionsRes || []);
      setLobbyingData(
        (lobbyingRes as any[]).map((d: any) => ({
          label: d.display_name?.length > 14 ? d.display_name.slice(0, 13) + '...' : d.display_name || '',
          value: d.total_lobbying || 0,
        }))
      );
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
        {/* Gradient Hero Banner */}
        <LinearGradient
          colors={['#1B7A3D', '#15693A', '#0F5831']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroOrb} />
          <View style={styles.heroInner}>
            <View style={styles.heroIconRow}>
              <Ionicons name="stats-chart" size={22} color="#C5960C" />
              <Text style={styles.heroTitle}>Congressional Tracker</Text>
            </View>
            <Text style={styles.heroSubtitle}>
              Every bill introduced, cosponsored, and voted on — tracked across all 535+ members of the 119th Congress.
            </Text>
          </View>
        </LinearGradient>

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

        {/* Top Lobbying Spenders chart */}
        {lobbyingData.length > 0 && (
          <SimpleBarChart data={lobbyingData} title="Top Lobbying Spenders" />
        )}

        {/* Featured members */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.accentBar, { backgroundColor: UI_COLORS.ACCENT }]} />
            <Text style={styles.sectionTitle}>Featured Members</Text>
          </View>
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
              activeOpacity={0.85}
              onPress={() => navigation.navigate('PersonDetail', { person_id: person.person_id })}
            >
              {/* Photo + gradient overlay */}
              {person.photo_url ? (
                <View style={styles.memberPhotoContainer}>
                  <Image source={{ uri: person.photo_url }} style={styles.memberPhoto} />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.6)']}
                    style={styles.memberPhotoOverlay}
                  >
                    <Text style={styles.memberNameOverlay}>{person.display_name}</Text>
                    <View style={styles.badgeRow}>
                      <PartyBadge party={person.party} />
                      <ChamberBadge chamber={person.chamber} />
                      <Text style={styles.memberStateOverlay}>{person.state}</Text>
                    </View>
                  </LinearGradient>
                </View>
              ) : (
                <View style={styles.memberRow}>
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>{person.display_name.charAt(0)}</Text>
                  </View>
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
              )}
            </TouchableOpacity>
          ))
        )}

        {/* Recent activity — expandable */}
        {actions.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 12 }]}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.accentBar, { backgroundColor: UI_COLORS.GOLD }]} />
                <Text style={styles.sectionTitle}>Recent Activity</Text>
              </View>
              <Text style={styles.tapHint}>Tap to expand</Text>
            </View>
            <View style={styles.card}>
              {actions.map((action, i) => (
                <ExpandableActivity
                  key={action.id}
                  action={action}
                  isLast={i === actions.length - 1}
                  onBillPress={(billId) => navigation.navigate('BillDetail', { bill_id: billId })}
                  onPersonPress={(personId) => navigation.navigate('PersonDetail', { person_id: personId })}
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
            <Text style={styles.modalTitle}>How We Track Bills</Text>
            <TouchableOpacity onPress={() => setStatModal(null)}>
              <Ionicons name="close" size={24} color={UI_COLORS.TEXT_PRIMARY} />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalSubtitle}>
            Our data comes directly from the Congress.gov API — the official public record of all legislative activity.
          </Text>
          {stats && (
            <View style={styles.modalStats}>
              <View style={styles.modalStatRow}>
                <Text style={styles.modalStatLabel}>Match Rate</Text>
                <Text style={[styles.modalStatValue, { color: UI_COLORS.ACCENT }]}>{stats.match_rate}%</Text>
              </View>
              <View style={styles.modalStatRow}>
                <Text style={styles.modalStatLabel}>Bills in Database</Text>
                <Text style={styles.modalStatValue}>{stats.total_bills.toLocaleString()}</Text>
              </View>
              <View style={styles.modalStatRow}>
                <Text style={styles.modalStatLabel}>Actions Monitored</Text>
                <Text style={styles.modalStatValue}>{stats.total_actions.toLocaleString()}</Text>
              </View>
            </View>
          )}
          <View style={styles.modalTierSection}>
            <Text style={styles.modalSectionTitle}>Methodology</Text>
            <Text style={styles.modalMethodText}>
              {'1. We pull every bill a member sponsors or cosponsors from Congress.gov.\n\n'}
              {'2. Each bill is enriched with CRS summaries, full text URLs, and policy area classification.\n\n'}
              {'3. Match Rate = the percentage of tracked legislative actions that are linked to a specific bill in our database.\n\n'}
              {'4. All data is public record — no editorials, no spin.'}
            </Text>
          </View>
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
    padding: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  heroOrb: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroInner: {
    position: 'relative',
  },
  heroIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
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
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accentBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
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
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  memberPhotoContainer: {
    height: 160,
    position: 'relative',
  },
  memberPhoto: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  memberPhotoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 40,
    justifyContent: 'flex-end',
  },
  memberNameOverlay: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  memberStateOverlay: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '500',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
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
    flexWrap: 'wrap',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
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
  modalMethodText: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 20,
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
