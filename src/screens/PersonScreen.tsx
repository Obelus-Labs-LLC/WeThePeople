import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Linking,
  LayoutAnimation,
  Platform,
  UIManager,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation } from '@react-navigation/native';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { ActivityEntry, ActivityResponse, PersonProfile, PersonFinance, PersonVotesResponse, PersonVoteEntry } from '../api/types';
import {
  LoadingSpinner, EmptyState, StatCard, PartyBadge,
  ChamberBadge, SkeletonList,
} from '../components/ui';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ─── Status badge color ──────────────────────────────────── */
const STATUS_COLORS: Record<string, string> = {
  introduced: '#6B7280',
  in_committee: '#D97706',
  passed_house: '#2563EB',
  passed_senate: '#2563EB',
  resolving_differences: '#7C3AED',
  to_president: '#8B5CF6',
  became_law: '#059669',
};

function statusLabel(status: string | null): string {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function isSponsored(role: string): boolean {
  return role === 'sponsored' || role === 'sponsor';
}

/* ─── Expandable Bill Card ─────────────────────────────────── */
function BillCard({ entry, onBillPress }: { entry: ActivityEntry; onBillPress?: (billId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const sponsored = isSponsored(entry.role);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={toggle} style={styles.billCard}>
      {/* Role badge + title */}
      <View style={styles.billHeader}>
        <View style={[styles.roleBadge, sponsored ? styles.roleSponsor : styles.roleCosponsor]}>
          <Text style={[styles.roleBadgeText, sponsored ? styles.roleSponsorText : styles.roleCosponsorText]}>
            {sponsored ? 'Sponsored' : 'Cosponsored'}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={UI_COLORS.TEXT_MUTED}
        />
      </View>

      <Text style={styles.billTitle} numberOfLines={expanded ? undefined : 2}>
        {entry.title}
      </Text>

      {/* Meta row */}
      <View style={styles.billMeta}>
        {entry.bill_id && (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              onBillPress?.(entry.bill_id);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={styles.billIdLink}>{entry.bill_id}</Text>
          </TouchableOpacity>
        )}
        {entry.policy_area && (
          <View style={styles.policyTag}>
            <Text style={styles.policyTagText}>{entry.policy_area}</Text>
          </View>
        )}
        {entry.status && (
          <View style={[styles.statusTag, { backgroundColor: (STATUS_COLORS[entry.status] || '#6B7280') + '18' }]}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[entry.status] || '#6B7280' }]} />
            <Text style={[styles.statusTagText, { color: STATUS_COLORS[entry.status] || '#6B7280' }]}>
              {statusLabel(entry.status)}
            </Text>
          </View>
        )}
      </View>

      {/* Expanded details */}
      {expanded && (
        <View style={styles.expandedSection}>
          {entry.latest_action && (
            <View style={styles.detailBlock}>
              <View style={styles.detailLabelRow}>
                <Ionicons name="time-outline" size={14} color={UI_COLORS.ACCENT} />
                <Text style={styles.detailLabel}>Latest Action</Text>
              </View>
              <Text style={styles.detailText}>{entry.latest_action}</Text>
              {entry.latest_action_date && (
                <Text style={styles.detailDate}>
                  {new Date(entry.latest_action_date).toLocaleDateString()}
                </Text>
              )}
            </View>
          )}

          {entry.summary && (
            <View style={styles.detailBlock}>
              <View style={styles.detailLabelRow}>
                <Ionicons name="document-text-outline" size={14} color={UI_COLORS.ACCENT} />
                <Text style={styles.detailLabel}>Summary</Text>
              </View>
              <Text style={styles.detailText}>{entry.summary}</Text>
            </View>
          )}

          {entry.congress_url && (
            <TouchableOpacity
              style={styles.sourceLink}
              onPress={() => Linking.openURL(entry.congress_url!)}
            >
              <Ionicons name="globe-outline" size={14} color={UI_COLORS.ACCENT} />
              <Text style={styles.sourceLinkText}>View on Congress.gov</Text>
              <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

type Tab = 'overview' | 'activity' | 'votes' | 'finance';
type RoleFilter = 'all' | 'sponsored' | 'cosponsored';
type PositionFilter = 'all' | 'Yea' | 'Nay' | 'Not Voting';

const POSITION_COLORS: Record<string, string> = {
  Yea: '#10B981',
  Aye: '#10B981',
  Nay: '#DC2626',
  No: '#DC2626',
  'Not Voting': '#9CA3AF',
  Present: '#D4A017',
};

export default function PersonScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const person_id: string = route.params?.person_id;

  const [tab, setTab] = useState<Tab>('overview');
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [finance, setFinance] = useState<PersonFinance | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  // Votes state
  const [votes, setVotes] = useState<PersonVotesResponse | null>(null);
  const [votesLoading, setVotesLoading] = useState(false);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');

  const loadCoreData = async () => {
    const [activityRes, profileRes] = await Promise.all([
      apiClient.getPersonActivity(person_id, { limit: 200 }),
      apiClient.getPersonProfile(person_id).catch(() => null),
    ]);
    setActivity(activityRes);
    if (profileRes) setProfile(profileRes);
  };

  useEffect(() => {
    if (!person_id) return;
    setLoading(true);
    loadCoreData()
      .catch((err) => setError(err.message || 'Failed to load data'))
      .finally(() => setLoading(false));
  }, [person_id]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadCoreData();
      // Reset lazy-loaded data so it refreshes on next tab switch
      setFinance(null);
      setVotes(null);
    } catch {}
    setRefreshing(false);
  };

  // Lazy-load finance
  useEffect(() => {
    if (tab !== 'finance' || !person_id || finance) return;
    setFinanceLoading(true);
    apiClient.getPersonFinance(person_id)
      .then(setFinance)
      .catch(() => {})
      .finally(() => setFinanceLoading(false));
  }, [tab, person_id, finance]);

  // Lazy-load votes
  useEffect(() => {
    if (tab !== 'votes' || !person_id || votes) return;
    setVotesLoading(true);
    apiClient.getPersonVotes(person_id, { limit: 100 })
      .then(setVotes)
      .catch(() => {})
      .finally(() => setVotesLoading(false));
  }, [tab, person_id, votes]);

  const displayName = activity?.display_name || profile?.display_name || person_id?.replace(/_/g, ' ') || '';
  const entries = activity?.entries || [];
  const total = activity?.total || 0;
  const sponsoredCount = activity?.sponsored_count || 0;
  const cosponsoredCount = activity?.cosponsored_count || 0;
  const policyAreas = activity?.policy_areas || {};

  const filteredEntries = roleFilter === 'all'
    ? entries
    : roleFilter === 'sponsored'
      ? entries.filter((e) => isSponsored(e.role))
      : entries.filter((e) => !isSponsored(e.role));

  if (loading) return <LoadingSpinner message="Loading profile..." />;
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'activity', label: `Activity (${total})` },
    { key: 'votes', label: `Votes${votes ? ` (${votes.total})` : ''}` },
    { key: 'finance', label: 'Finance' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
    >
      {/* Gradient banner */}
      <LinearGradient
        colors={['#1B7A3D', '#15693A', '#0F5831']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.profileBanner}
      >
        <View style={styles.bannerOrb} />
      </LinearGradient>

      {/* Overlapping profile card */}
      <View style={styles.profileCard}>
        <View style={styles.profileRow}>
          {profile?.thumbnail ? (
            <Image source={{ uri: profile.thumbnail }} style={styles.profilePhoto} />
          ) : (
            <View style={styles.profilePhotoPlaceholder}>
              <Text style={styles.profilePhotoText}>{displayName.charAt(0)}</Text>
            </View>
          )}
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{displayName}</Text>
            <View style={styles.profileBadges}>
              {profile?.infobox?.party && <PartyBadge party={profile.infobox.party} />}
              {profile?.infobox?.office && (
                <ChamberBadge chamber={profile.infobox.office.includes('Senate') ? 'senate' : 'house'} />
              )}
            </View>
            {profile?.summary ? (
              <Text style={styles.profileSummary} numberOfLines={3}>{profile.summary}</Text>
            ) : null}
            {profile?.url && (
              <TouchableOpacity onPress={() => Linking.openURL(profile.url!)}>
                <Text style={styles.wikiLink}>Wikipedia</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Pill Tabs */}
      <View style={styles.pillTabBar}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.pillTab, tab === t.key && styles.pillTabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.pillTabText, tab === t.key && styles.pillTabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      {tab === 'overview' && (
        <View style={styles.tabContent}>
          {/* Stats grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statsRow}>
              <View style={styles.statsHalf}>
                <StatCard label="Bills Sponsored" value={sponsoredCount} accent="green" subtitle="Primary author" />
              </View>
              <View style={styles.statsHalf}>
                <StatCard label="Bills Cosponsored" value={cosponsoredCount} accent="emerald" subtitle="Signed on as supporter" />
              </View>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statsHalf}>
                <StatCard label="Total Bills" value={total} accent="gold" subtitle="All legislative activity" />
              </View>
              <TouchableOpacity style={styles.statsHalf} onPress={() => setCategoriesOpen(!categoriesOpen)}>
                <StatCard label="Policy Areas" value={Object.keys(policyAreas).length} accent="slate" subtitle="Tap to view" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Policy areas expansion */}
          {categoriesOpen && Object.keys(policyAreas).length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Policy Areas</Text>
              <Text style={styles.summaryText}>Policy areas this member has introduced or cosponsored legislation in:</Text>
              {Object.entries(policyAreas)
                .sort(([, a], [, b]) => b - a)
                .map(([area, count]) => (
                  <View key={area} style={styles.factRow}>
                    <Text style={styles.factLabel}>{area}:</Text>
                    <Text style={styles.factValue}>{count} bill{count !== 1 ? 's' : ''}</Text>
                  </View>
                ))}
            </View>
          )}

          {/* Legislative summary */}
          {total > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Legislative Summary</Text>
              <Text style={styles.summaryText}>
                {sponsoredCount} bill{sponsoredCount !== 1 ? 's' : ''} sponsored and{' '}
                {cosponsoredCount.toLocaleString()} cosponsored across{' '}
                {Object.keys(policyAreas).length} policy areas.
                {' '}Data sourced directly from Congress.gov.
              </Text>
            </View>
          )}

          {total === 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Legislative Activity</Text>
              <Text style={styles.summaryText}>
                Legislative activity data is still being synced for this member. Check back soon.
              </Text>
            </View>
          )}

          {profile?.infobox && Object.keys(profile.infobox).length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Quick Facts</Text>
              {Object.entries(profile.infobox)
                .filter(([key, val]) => {
                  const skip = ['name', 'image', 'image_size', 'caption', 'imagesize', 'alt'];
                  if (skip.includes(key.toLowerCase())) return false;
                  if (val === null || val === undefined || val === '' || val === 'null') return false;
                  if (key === 'junior_senior' && (!val || val === 'null')) return false;
                  return true;
                })
                .slice(0, 10)
                .map(([key, val]) => (
                  <View key={key} style={styles.factRow}>
                    <Text style={styles.factLabel}>{key.replace(/_/g, ' ')}:</Text>
                    <Text style={styles.factValue} numberOfLines={1}>{val}</Text>
                  </View>
                ))}
            </View>
          )}
        </View>
      )}

      {tab === 'activity' && (
        <View style={styles.tabContent}>
          {/* Role filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <View style={styles.filterRow}>
              {[
                { key: 'all' as RoleFilter, label: `All (${total})` },
                { key: 'sponsored' as RoleFilter, label: `Sponsored (${sponsoredCount})` },
                { key: 'cosponsored' as RoleFilter, label: `Cosponsored (${cosponsoredCount})` },
              ].map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterBtn, roleFilter === f.key && styles.filterBtnActive]}
                  onPress={() => setRoleFilter(f.key)}
                >
                  <Text style={[styles.filterBtnText, roleFilter === f.key && styles.filterBtnTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Hint */}
          <Text style={styles.activityHint}>
            <Ionicons name="hand-left-outline" size={12} color={UI_COLORS.TEXT_MUTED} />
            {'  Tap any bill to see details & Congress.gov link'}
          </Text>

          {filteredEntries.length === 0 ? (
            <EmptyState
              title="No activity"
              message={roleFilter !== 'all' ? 'No bills match this filter.' : 'No legislative activity found. Data may still be syncing.'}
            />
          ) : (
            filteredEntries.map((entry, idx) => (
              <BillCard
                key={`${entry.bill_id}-${entry.role}-${idx}`}
                entry={entry}
                onBillPress={(billId) => navigation.navigate('BillDetail', { bill_id: billId })}
              />
            ))
          )}
        </View>
      )}

      {tab === 'votes' && (
        <View style={styles.tabContent}>
          {votesLoading ? (
            <SkeletonList count={5} />
          ) : !votes || votes.total === 0 ? (
            <EmptyState title="No voting records" message="Roll call vote data is not yet available for this member." />
          ) : (
            <>
              {/* Position summary */}
              {votes.position_summary && Object.keys(votes.position_summary).length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Position Summary</Text>
                  {Object.entries(votes.position_summary)
                    .sort(([, a], [, b]) => b - a)
                    .map(([pos, count]) => (
                      <View key={pos} style={styles.factRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: POSITION_COLORS[pos] || '#6B7280' }} />
                          <Text style={styles.factLabel}>{pos}</Text>
                        </View>
                        <Text style={styles.factValue}>{count}</Text>
                      </View>
                    ))}
                </View>
              )}

              {/* Position filter */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                <View style={styles.filterRow}>
                  {(['all', 'Yea', 'Nay', 'Not Voting'] as PositionFilter[]).map((f) => (
                    <TouchableOpacity
                      key={f}
                      style={[styles.filterBtn, positionFilter === f && styles.filterBtnActive]}
                      onPress={() => setPositionFilter(f)}
                    >
                      <Text style={[styles.filterBtnText, positionFilter === f && styles.filterBtnTextActive]}>
                        {f === 'all' ? `All (${votes.total})` : f}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Vote list */}
              {(positionFilter === 'all'
                ? votes.votes
                : votes.votes.filter((v) => v.position === positionFilter)
              ).map((vote) => {
                const posColor = POSITION_COLORS[vote.position || ''] || '#6B7280';
                const billLabel = vote.related_bill_type && vote.related_bill_number
                  ? `${vote.related_bill_type.toUpperCase()} ${vote.related_bill_number}`
                  : null;
                return (
                  <View key={vote.vote_id} style={styles.voteCard}>
                    <View style={styles.voteHeader}>
                      <View style={[styles.positionBadge, { backgroundColor: posColor + '18' }]}>
                        <Text style={[styles.positionBadgeText, { color: posColor }]}>
                          {vote.position || 'Unknown'}
                        </Text>
                      </View>
                      <Text style={styles.voteResult}>
                        {vote.result || ''}
                      </Text>
                    </View>
                    <Text style={styles.voteQuestion} numberOfLines={2}>
                      {vote.question || 'Roll call vote'}
                    </Text>
                    <View style={styles.voteMeta}>
                      {vote.chamber && (
                        <Text style={styles.voteMetaText}>{vote.chamber}</Text>
                      )}
                      {vote.vote_date && (
                        <Text style={styles.voteMetaText}>
                          {new Date(vote.vote_date).toLocaleDateString()}
                        </Text>
                      )}
                      {billLabel && (
                        <TouchableOpacity
                          onPress={() => {
                            const billId = `${vote.related_bill_congress}-${vote.related_bill_type}-${vote.related_bill_number}`;
                            navigation.navigate('BillDetail', { bill_id: billId });
                          }}
                        >
                          <Text style={styles.billIdLink}>{billLabel}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </View>
      )}

      {tab === 'finance' && (
        <View style={styles.tabContent}>
          {financeLoading ? (
            <LoadingSpinner message="Loading finance data..." />
          ) : !finance || !finance.totals ? (
            <EmptyState title="No finance data" message="FEC data is not available for this member." />
          ) : (
            <>
              <View style={styles.statsGrid}>
                <StatCard
                  label="Total Raised"
                  value={`$${((finance.totals.receipts || 0) / 1_000_000).toFixed(1)}M`}
                  accent="emerald"
                />
                <StatCard
                  label="Total Spent"
                  value={`$${((finance.totals.disbursements || 0) / 1_000_000).toFixed(1)}M`}
                  accent="amber"
                />
                <StatCard
                  label="Cash on Hand"
                  value={`$${((finance.totals.cash_on_hand || 0) / 1_000_000).toFixed(1)}M`}
                  accent="green"
                />
              </View>

              {finance.top_donors.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Top Donors</Text>
                  {/* Table header */}
                  <View style={styles.donorHeaderRow}>
                    <Text style={[styles.donorHeaderText, { flex: 1.2 }]}>Name</Text>
                    <Text style={[styles.donorHeaderText, { flex: 1 }]}>Employer</Text>
                    <Text style={[styles.donorHeaderText, { flex: 0.6, textAlign: 'right' }]}>Amount</Text>
                  </View>
                  {finance.top_donors.map((donor, i) => (
                    <View key={i} style={[styles.donorRow, i < finance.top_donors.length - 1 && styles.donorBorder]}>
                      <Text style={[styles.donorName, { flex: 1.2 }]} numberOfLines={1}>{donor.name || 'Unknown'}</Text>
                      <Text style={[styles.donorEmployer, { flex: 1 }]} numberOfLines={1}>{donor.employer || '—'}</Text>
                      <Text style={[styles.donorAmount, { flex: 0.6 }]}>${(donor.amount || 0).toLocaleString()}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.SECONDARY_BG,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  // ── Gradient banner ──
  profileBanner: {
    height: 100,
    position: 'relative',
    overflow: 'hidden',
  },
  bannerOrb: {
    position: 'absolute',
    top: -50,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  // ── Overlapping profile card ──
  profileCard: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginTop: -32,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  profileRow: {
    flexDirection: 'row',
    gap: 14,
  },
  profilePhoto: {
    width: 72,
    height: 72,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  profilePhotoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: UI_COLORS.ACCENT_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  profilePhotoText: {
    color: UI_COLORS.ACCENT,
    fontSize: 24,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 20,
    fontWeight: '800',
  },
  profileBadges: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 4,
  },
  profileSummary: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 17,
  },
  wikiLink: {
    color: UI_COLORS.ACCENT,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  // ── Pill Tabs ──
  pillTabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: UI_COLORS.CARD_BG_ELEVATED,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  pillTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  pillTabActive: {
    backgroundColor: UI_COLORS.ACCENT,
    shadowColor: UI_COLORS.ACCENT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  pillTabText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 13,
    fontWeight: '600',
  },
  pillTabTextActive: {
    color: '#FFFFFF',
  },
  tabContent: {
    gap: 12,
    paddingHorizontal: 16,
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
  summaryText: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  factRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  factLabel: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 12,
    textTransform: 'capitalize',
  },
  factValue: {
    flex: 1,
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 12,
  },
  // ── Activity filter ──
  filterScroll: {
    marginBottom: 4,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: UI_COLORS.CARD_BG,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
  },
  filterBtnActive: {
    backgroundColor: UI_COLORS.ACCENT,
    borderColor: UI_COLORS.ACCENT,
    shadowColor: UI_COLORS.ACCENT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  filterBtnText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 12,
    fontWeight: '600',
  },
  filterBtnTextActive: {
    color: '#FFFFFF',
  },
  activityHint: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  // ── Bill card ──
  billCard: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  billHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleSponsor: {
    backgroundColor: '#DCFCE7',
  },
  roleCosponsor: {
    backgroundColor: '#DBEAFE',
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  roleSponsorText: {
    color: '#15803D',
  },
  roleCosponsorText: {
    color: '#1D4ED8',
  },
  billTitle: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  billMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  billIdLink: {
    color: UI_COLORS.ACCENT,
    fontSize: 11,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  policyTag: {
    backgroundColor: UI_COLORS.ACCENT_LIGHT,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  policyTagText: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 10,
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  // ── Expanded section ──
  expandedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.BORDER_LIGHT,
    gap: 12,
  },
  detailBlock: {
    gap: 4,
  },
  detailLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  detailLabel: {
    color: UI_COLORS.ACCENT,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailText: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 17,
    paddingLeft: 8,
  },
  detailDate: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    paddingLeft: 8,
    marginTop: 2,
  },
  sourceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: UI_COLORS.ACCENT_LIGHT,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  sourceLinkText: {
    color: UI_COLORS.ACCENT,
    fontSize: 12,
    fontWeight: '600',
  },
  // ── Finance tab ──
  donorHeaderRow: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.BORDER,
  },
  donorHeaderText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    fontWeight: '600',
  },
  donorRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    alignItems: 'center',
  },
  donorBorder: {
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.BORDER,
  },
  donorName: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 12,
  },
  donorEmployer: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 12,
  },
  donorAmount: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  // ── Votes tab ──
  voteCard: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  voteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  positionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  positionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  voteResult: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    fontWeight: '500',
  },
  voteQuestion: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  voteMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  voteMetaText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
  },
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
  },
});
