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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation } from '@react-navigation/native';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { LedgerEntry, PersonProfile, PersonFinance, PersonPerformance } from '../api/types';
import {
  LoadingSpinner, EmptyState, StatCard, TierBadge, PartyBadge,
  ChamberBadge, TierProgressBar, ScoreBar,
} from '../components/ui';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ─── Expandable Activity Card ─────────────────────────────── */
function ExpandableClaim({ entry, onBillPress }: { entry: LedgerEntry; onBillPress?: (billId: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const hasEvidence = entry.evidence && Object.keys(entry.evidence).length > 0;
  const hasDetails = entry.why?.length > 0 || entry.source_url || hasEvidence
    || entry.relevance || entry.progress || entry.timing;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={toggle}
      style={styles.claimCard}
    >
      {/* Collapsed header — always visible */}
      <View style={styles.claimHeader}>
        <Text style={styles.claimText} numberOfLines={expanded ? undefined : 3}>
          {entry.normalized_text ? entry.normalized_text.charAt(0).toUpperCase() + entry.normalized_text.slice(1) : ''}
        </Text>
        <View style={styles.claimHeaderRight}>
          <TierBadge tier={entry.tier} />
          {hasDetails && (
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={UI_COLORS.TEXT_MUTED}
              style={{ marginTop: 4 }}
            />
          )}
        </View>
      </View>

      {/* Meta row — always visible */}
      <View style={styles.claimMeta}>
        {entry.claim_date && (
          <Text style={styles.metaText}>{new Date(entry.claim_date).toLocaleDateString()}</Text>
        )}
        {entry.policy_area && (
          <View style={styles.metaTag}>
            <Text style={styles.metaTagText}>{entry.policy_area}</Text>
          </View>
        )}
        {entry.matched_bill_id && (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              onBillPress?.(entry.matched_bill_id!);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={styles.metaBill}>{entry.matched_bill_id}</Text>
          </TouchableOpacity>
        )}
        {!expanded && hasDetails && (
          <Text style={styles.tapHint}>Tap for details</Text>
        )}
      </View>

      {entry.score !== null && <ScoreBar score={entry.score} />}

      {/* Expanded detail section */}
      {expanded && hasDetails && (
        <View style={styles.expandedSection}>
          {/* Scoring rationale */}
          {entry.why && entry.why.length > 0 && (
            <View style={styles.detailBlock}>
              <View style={styles.detailLabelRow}>
                <Ionicons name="document-text-outline" size={14} color={UI_COLORS.ACCENT} />
                <Text style={styles.detailLabel}>Scoring Rationale</Text>
              </View>
              {entry.why.map((reason, idx) => (
                <Text key={idx} style={styles.detailBullet}>• {reason}</Text>
              ))}
            </View>
          )}

          {/* Relevance / Progress / Timing */}
          {(entry.relevance || entry.progress || entry.timing) && (
            <View style={styles.detailBlock}>
              <View style={styles.detailLabelRow}>
                <Ionicons name="analytics-outline" size={14} color={UI_COLORS.ACCENT} />
                <Text style={styles.detailLabel}>Assessment</Text>
              </View>
              <View style={styles.assessmentGrid}>
                {entry.relevance && (
                  <View style={styles.assessmentItem}>
                    <Text style={styles.assessmentKey}>Relevance</Text>
                    <Text style={styles.assessmentValue}>{entry.relevance}</Text>
                  </View>
                )}
                {entry.progress && (
                  <View style={styles.assessmentItem}>
                    <Text style={styles.assessmentKey}>Progress</Text>
                    <Text style={styles.assessmentValue}>{entry.progress}</Text>
                  </View>
                )}
                {entry.timing && (
                  <View style={styles.assessmentItem}>
                    <Text style={styles.assessmentKey}>Timing</Text>
                    <Text style={styles.assessmentValue}>{entry.timing}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Evidence summary */}
          {hasEvidence && (
            <View style={styles.detailBlock}>
              <View style={styles.detailLabelRow}>
                <Ionicons name="search-outline" size={14} color={UI_COLORS.ACCENT} />
                <Text style={styles.detailLabel}>Evidence</Text>
              </View>
              {Object.entries(entry.evidence!).slice(0, 5).map(([key, val]) => (
                <View key={key} style={styles.evidenceRow}>
                  <Text style={styles.evidenceKey}>{key.replace(/_/g, ' ')}:</Text>
                  <Text style={styles.evidenceValue} numberOfLines={2}>
                    {typeof val === 'string' ? val : JSON.stringify(val)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Source link */}
          {entry.source_url && (
            <TouchableOpacity
              style={styles.sourceLink}
              onPress={() => Linking.openURL(entry.source_url)}
            >
              <Ionicons name="link-outline" size={14} color={UI_COLORS.ACCENT} />
              <Text style={styles.sourceLinkText}>View Source</Text>
              <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

type Tab = 'overview' | 'claims' | 'finance';

export default function PersonScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const person_id: string = route.params?.person_id;

  const [tab, setTab] = useState<Tab>('overview');
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [perf, setPerf] = useState<PersonPerformance | null>(null);
  const [finance, setFinance] = useState<PersonFinance | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  useEffect(() => {
    if (!person_id) return;
    setLoading(true);
    Promise.all([
      apiClient.getLedgerForPerson(person_id, { limit: 100 }),
      apiClient.getPersonPerformance(person_id).catch(() => null),
      apiClient.getPersonProfile(person_id).catch(() => null),
    ])
      .then(([ledgerRes, perfRes, profileRes]) => {
        setEntries(ledgerRes.entries || []);
        setTotal(ledgerRes.total || 0);
        if (perfRes) setPerf(perfRes);
        if (profileRes) setProfile(profileRes);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load data');
        setLoading(false);
      });
  }, [person_id]);

  // Lazy-load finance
  useEffect(() => {
    if (tab !== 'finance' || !person_id || finance) return;
    setFinanceLoading(true);
    apiClient.getPersonFinance(person_id)
      .then(setFinance)
      .catch(() => {})
      .finally(() => setFinanceLoading(false));
  }, [tab, person_id, finance]);

  const displayName = profile?.display_name || person_id?.replace(/_/g, ' ') || '';

  const filteredEntries = tierFilter === 'all'
    ? entries
    : entries.filter((e) => e.tier === tierFilter);

  const tierSegments = perf ? [
    { label: 'Strong', value: perf.by_tier.strong || 0, color: '#10B981' },
    { label: 'Moderate', value: perf.by_tier.moderate || 0, color: '#D4A017' },
    { label: 'Weak', value: perf.by_tier.weak || 0, color: '#E67E22' },
    { label: 'None', value: perf.by_tier.none || 0, color: '#9CA3AF' },
  ] : [];

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
    { key: 'claims', label: `Activity (${total})` },
    { key: 'finance', label: 'Finance' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
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
          {perf && (
            <View style={styles.statsGrid}>
              <View style={styles.statsRow}>
                <View style={styles.statsHalf}>
                  <StatCard label="Bills Tracked" value={perf.total_claims} accent="green" subtitle="Legislative actions" />
                </View>
                <View style={styles.statsHalf}>
                  <StatCard label="Matched" value={perf.total_scored} accent="emerald" subtitle="Linked to legislation" />
                </View>
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statsHalf}>
                  <StatCard
                    label="Match Rate"
                    value={perf.total_claims > 0 ? `${Math.round((perf.total_scored / perf.total_claims) * 100)}%` : '0%'}
                    accent="gold"
                    subtitle="Bills with evidence"
                  />
                </View>
                <TouchableOpacity style={styles.statsHalf} onPress={() => setCategoriesOpen(!categoriesOpen)}>
                  <StatCard label="Policy Areas" value={Object.keys(perf.by_category).length} accent="slate" subtitle="Tap to view" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Categories expansion */}
          {categoriesOpen && perf && Object.keys(perf.by_category).length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Policy Areas</Text>
              <Text style={styles.summaryText}>Policy areas this member has introduced or cosponsored legislation in:</Text>
              {Object.entries(perf.by_category)
                .sort(([, a], [, b]) => b - a)
                .map(([category, count]) => (
                  <View key={category} style={styles.factRow}>
                    <Text style={styles.factLabel}>{category}:</Text>
                    <Text style={styles.factValue}>{count} bill{count !== 1 ? 's' : ''}</Text>
                  </View>
                ))}
            </View>
          )}

          {/* Legislative summary replaces old accountability breakdown */}
          {perf && perf.total_claims > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Legislative Summary</Text>
              <Text style={styles.summaryText}>
                {perf.total_claims} legislative actions tracked across{' '}
                {Object.keys(perf.by_category).length} policy areas.
                {perf.total_scored > 0
                  ? ` ${perf.total_scored} matched to specific legislation (${Math.round((perf.total_scored / perf.total_claims) * 100)}% match rate).`
                  : ' Activity data is still being processed.'}
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

      {tab === 'claims' && (
        <View style={styles.tabContent}>
          {/* Tier filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tierFilterScroll}>
            <View style={styles.tierFilterRow}>
              {['all', 'strong', 'moderate', 'weak', 'none'].map((val) => (
                <TouchableOpacity
                  key={val}
                  style={[styles.filterBtn, tierFilter === val && styles.filterBtnActive]}
                  onPress={() => setTierFilter(val)}
                >
                  <Text style={[styles.filterBtnText, tierFilter === val && styles.filterBtnTextActive]}>
                    {val.charAt(0).toUpperCase() + val.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Hint */}
          <Text style={styles.claimsHint}>
            <Ionicons name="hand-left-outline" size={12} color={UI_COLORS.TEXT_MUTED} />
            {'  Tap any entry to see evidence & scoring details'}
          </Text>

          {filteredEntries.length === 0 ? (
            <EmptyState
              title="No activity"
              message={tierFilter !== 'all' ? 'No entries match this tier filter.' : 'No activity found for this person.'}
            />
          ) : (
            filteredEntries.map((entry) => (
              <ExpandableClaim
                key={entry.claim_id}
                entry={entry}
                onBillPress={(billId) => navigation.navigate('BillDetail', { bill_id: billId })}
              />
            ))
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
  tierFilterScroll: {
    marginBottom: 4,
  },
  tierFilterRow: {
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
  claimCard: {
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
  claimHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  claimText: {
    flex: 1,
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 13,
    lineHeight: 18,
  },
  claimMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  metaText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
  },
  metaTag: {
    backgroundColor: UI_COLORS.ACCENT_LIGHT,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  metaTagText: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 10,
  },
  metaBill: {
    color: UI_COLORS.ACCENT,
    fontSize: 11,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  tapHint: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 10,
    fontStyle: 'italic',
    marginLeft: 'auto',
  },
  claimsHint: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  claimHeaderRight: {
    alignItems: 'center',
    gap: 2,
  },
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
  detailBullet: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 17,
    paddingLeft: 8,
  },
  assessmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  assessmentItem: {
    backgroundColor: UI_COLORS.ACCENT_LIGHT,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  assessmentKey: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  assessmentValue: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  evidenceRow: {
    flexDirection: 'row',
    gap: 6,
    paddingLeft: 8,
    paddingVertical: 2,
  },
  evidenceKey: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
    minWidth: 70,
  },
  evidenceValue: {
    flex: 1,
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 11,
    lineHeight: 16,
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
