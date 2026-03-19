import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { DashboardStats, Person, RecentAction } from '../api/types';
import { LoadingSpinner, StatCard, EmptyState, PartyBadge, ChamberBadge } from '../components/ui';
import HeroBanner from '../components/HeroBanner';
import NavCard from '../components/NavCard';
import SectionHeader from '../components/SectionHeader';
import DataFreshness from '../components/DataFreshness';

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

  const loadData = async () => {
    try {
      const [statsRes, peopleRes, actionsRes] = await Promise.all([
        apiClient.getDashboardStats(),
        apiClient.getPeople({ limit: 6 }),
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
    >
      {/* Hero Banner */}
      <HeroBanner
        colors={['#1B7A3D', '#0F5831']}
        icon="people"
        title="Follow the Money in Politics"
        subtitle="Track every bill, vote, trade, and donation across all 535+ members of Congress."
      />

      {/* Stats Grid */}
      {stats && (
        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <View style={styles.statsHalf}>
              <StatCard label="Members Tracked" value={stats.total_people} accent="green" />
            </View>
            <View style={styles.statsHalf}>
              <StatCard label="Bills Tracked" value={stats.total_bills} accent="blue" />
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statsHalf}>
              <StatCard label="Votes Monitored" value={stats.total_actions.toLocaleString()} accent="gold" />
            </View>
            <View style={styles.statsHalf}>
              <StatCard label="Match Rate" value={`${stats.match_rate}%`} accent="emerald" />
            </View>
          </View>
        </View>
      )}

      {/* Data Freshness */}
      <DataFreshness />

      {/* Nav Cards */}
      <SectionHeader title="Explore" accent={UI_COLORS.ACCENT} />
      <View style={styles.navGrid}>
        <NavCard icon="people" title="People Directory" subtitle="All tracked members" onPress={() => navigation.navigate('PeopleDirectory')} accent={UI_COLORS.ACCENT} />
        <NavCard icon="document-text" title="Legislation Tracker" subtitle="Bills & resolutions" onPress={() => navigation.navigate('LegislationTracker')} accent="#2563EB" />
        <NavCard icon="trending-up" title="Congressional Trades" subtitle="Stock trades by members" onPress={() => navigation.navigate('CongressionalTrades')} accent="#C5960C" />
        <NavCard icon="search" title="Find Your Rep" subtitle="Look up by state" onPress={() => navigation.navigate('FindYourRep')} accent="#10B981" />
        <NavCard icon="map" title="State Explorer" subtitle="State-level data" onPress={() => navigation.navigate('StateExplorer')} accent="#8B5CF6" />
        <NavCard icon="git-compare" title="Compare Members" subtitle="Side-by-side analysis" onPress={() => navigation.navigate('PoliticsCompare')} accent="#DC2626" />
        <NavCard icon="list" title="Activity Feed" subtitle="Latest legislative actions" onPress={() => navigation.navigate('ActivityFeed')} accent="#475569" />
      </View>

      {/* Featured Members */}
      <SectionHeader
        title="Featured Members"
        accent={UI_COLORS.ACCENT}
        onViewAll={() => navigation.navigate('PeopleDirectory')}
      />

      {people.length === 0 ? (
        <EmptyState title="No members with data" message="Members will appear once activity is processed." />
      ) : (
        <View style={styles.featuredList}>
          {people.map((person) => (
            <TouchableOpacity
              key={person.person_id}
              style={styles.memberCard}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('PersonDetail', { person_id: person.person_id })}
            >
              {person.photo_url ? (
                <Image source={{ uri: person.photo_url }} style={styles.memberAvatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>{person.display_name.charAt(0)}</Text>
                </View>
              )}
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{person.display_name}</Text>
                <View style={styles.badgeRow}>
                  <PartyBadge party={person.party} />
                  <ChamberBadge chamber={person.chamber} />
                  <Text style={styles.memberState}>{person.state}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={UI_COLORS.TEXT_MUTED} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Recent Activity */}
      {actions.length > 0 && (
        <>
          <SectionHeader title="Recent Activity" accent={UI_COLORS.GOLD} />
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

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Data from Congress.gov, OpenStates, Quiver Quantitative, and FEC
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.SECONDARY_BG,
  },
  content: {
    paddingBottom: 32,
  },
  statsGrid: {
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statsHalf: {
    flex: 1,
  },
  navGrid: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  featuredList: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: UI_COLORS.ACCENT_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: UI_COLORS.ACCENT,
    fontSize: 16,
    fontWeight: '700',
  },
  memberInfo: {
    flex: 1,
    gap: 4,
  },
  memberName: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '600',
  },
  memberState: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    fontWeight: '500',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  card: {
    marginHorizontal: 16,
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
    marginBottom: 16,
  },
  // Activity rows
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
  footer: {
    marginTop: 16,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  footerText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    textAlign: 'center',
  },
});
