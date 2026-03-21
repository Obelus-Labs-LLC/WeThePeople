import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, Linking, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation } from '@react-navigation/native';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { ActivityResponse, PersonProfile, PersonFinance, PersonVotesResponse, CongressionalTradesResponse } from '../api/types';
import { LoadingSpinner, PartyBadge, ChamberBadge } from '../components/ui';
import SanctionsBadge from '../components/SanctionsBadge';
import { OverviewTab, ActivityTab, VotesTab, FinanceTab, TradesTab, DonorsTab } from '../components/person';

type Tab = 'overview' | 'activity' | 'votes' | 'finance' | 'trades' | 'donors';

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
  const [votes, setVotes] = useState<PersonVotesResponse | null>(null);
  const [votesLoading, setVotesLoading] = useState(false);
  const [trades, setTrades] = useState<any[] | null>(null);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [donors, setDonors] = useState<any[] | null>(null);
  const [donorsLoading, setDonorsLoading] = useState(false);

  const [committees, setCommittees] = useState<any[]>([]);

  const loadCoreData = async () => {
    const [activityRes, profileRes, committeesRes] = await Promise.all([
      apiClient.getPersonActivity(person_id, { limit: 200 }).catch(() => null),
      apiClient.getPersonProfile(person_id).catch(() => null),
      apiClient.getPersonCommittees(person_id).catch(() => null),
    ]);
    setActivity(activityRes);
    if (profileRes) setProfile(profileRes);
    setCommittees(committeesRes?.committees || []);
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
      setFinance(null);
      setVotes(null);
      setTrades(null);
      setDonors(null);
    } catch {}
    setRefreshing(false);
  };

  // Lazy-load finance
  useEffect(() => {
    let cancelled = false;
    if (tab !== 'finance' || !person_id || finance) return;
    setFinanceLoading(true);
    apiClient.getPersonFinance(person_id)
      .then((res) => { if (!cancelled) setFinance(res); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFinanceLoading(false); });
    return () => { cancelled = true; };
  }, [tab, person_id, finance]);

  // Lazy-load votes
  useEffect(() => {
    let cancelled = false;
    if (tab !== 'votes' || !person_id || votes) return;
    setVotesLoading(true);
    apiClient.getPersonVotes(person_id, { limit: 100 })
      .then((res) => { if (!cancelled) setVotes(res); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setVotesLoading(false); });
    return () => { cancelled = true; };
  }, [tab, person_id, votes]);

  // Lazy-load trades
  useEffect(() => {
    let cancelled = false;
    if (tab !== 'trades' || !person_id || trades) return;
    setTradesLoading(true);
    apiClient.getPersonTrades(person_id)
      .then((res) => { if (!cancelled) setTrades(res.trades || []); })
      .catch(() => { if (!cancelled) setTrades([]); })
      .finally(() => { if (!cancelled) setTradesLoading(false); });
    return () => { cancelled = true; };
  }, [tab, person_id, trades]);

  // Lazy-load donors
  useEffect(() => {
    let cancelled = false;
    if (tab !== 'donors' || !person_id || donors) return;
    setDonorsLoading(true);
    apiClient.getPersonIndustryDonors(person_id)
      .then((res) => { if (!cancelled) setDonors(res.donors || res || []); })
      .catch(() => { if (!cancelled) setDonors([]); })
      .finally(() => { if (!cancelled) setDonorsLoading(false); });
    return () => { cancelled = true; };
  }, [tab, person_id, donors]);

  const displayName = activity?.display_name || profile?.display_name || person_id?.replace(/_/g, ' ') || '';

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
    { key: 'activity', label: 'Activity' },
    { key: 'votes', label: 'Votes' },
    { key: 'finance', label: 'Finance' },
    { key: 'trades', label: 'Trades' },
    { key: 'donors', label: 'Donors' },
  ];

  const handleBillPress = (billId: string) =>
    navigation.navigate('BillDetail', { bill_id: billId });

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

      {/* Sanctions Badge */}
      {profile?.sanctions_status && (
        <SanctionsBadge status={profile.sanctions_status} />
      )}

      {/* Pill Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillTabBarScroll} contentContainerStyle={styles.pillTabBar}>
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
      </ScrollView>

      {/* Tab content — delegated to extracted components */}
      {tab === 'overview' && <OverviewTab activity={activity} profile={profile} committees={committees} />}
      {tab === 'activity' && <ActivityTab activity={activity} onBillPress={handleBillPress} />}
      {tab === 'votes' && <VotesTab votes={votes} loading={votesLoading} onBillPress={handleBillPress} />}
      {tab === 'finance' && <FinanceTab finance={finance} loading={financeLoading} />}
      {tab === 'trades' && <TradesTab trades={trades} loading={tradesLoading} />}
      {tab === 'donors' && <DonorsTab donors={donors} loading={donorsLoading} />}

      {/* Campaign contribution + Capitol Trades links */}
      {profile?.infobox?.party && (
        <View style={{ paddingHorizontal: 16, marginTop: 12, gap: 8 }}>
          <TouchableOpacity
            style={styles.externalLinkBtn}
            onPress={() => {
              const party = profile?.infobox?.party?.charAt(0).toUpperCase();
              const url = party === 'D' ? 'https://www.actblue.com/' : party === 'R' ? 'https://www.winred.com/' : null;
              if (url) Linking.openURL(url);
            }}
          >
            <Text style={styles.externalLinkText}>
              Contribute via {profile?.infobox?.party?.charAt(0).toUpperCase() === 'D' ? 'ActBlue' : 'WinRed'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.externalLinkBtn}
            onPress={() => Linking.openURL('https://www.capitoltrades.com/')}
          >
            <Text style={styles.externalLinkText}>View on Capitol Trades</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { paddingBottom: 32 },
  // ── Gradient banner ──
  profileBanner: { height: 100, position: 'relative', overflow: 'hidden' },
  bannerOrb: {
    position: 'absolute', top: -50, right: -30,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  // ── Profile card ──
  profileCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 16, padding: 16,
    marginTop: -32, marginHorizontal: 16, marginBottom: 12,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 10, elevation: 4,
  },
  profileRow: { flexDirection: 'row', gap: 14 },
  profilePhoto: { width: 72, height: 72, borderRadius: 16, borderWidth: 2, borderColor: '#FFFFFF' },
  profilePhotoPlaceholder: {
    width: 72, height: 72, borderRadius: 16,
    backgroundColor: UI_COLORS.ACCENT_LIGHT, justifyContent: 'center',
    alignItems: 'center', borderWidth: 2, borderColor: '#FFFFFF',
  },
  profilePhotoText: { color: UI_COLORS.ACCENT, fontSize: 24, fontWeight: '700' },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 20, fontWeight: '800' },
  profileBadges: { flexDirection: 'row', gap: 6, marginVertical: 4 },
  profileSummary: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 12, lineHeight: 17 },
  wikiLink: { color: UI_COLORS.ACCENT, fontSize: 12, fontWeight: '600', marginTop: 4 },
  // ── Pill Tabs ──
  pillTabBarScroll: { marginHorizontal: 16, marginBottom: 14 },
  pillTabBar: {
    flexDirection: 'row',
    backgroundColor: UI_COLORS.CARD_BG_ELEVATED, borderRadius: 12, padding: 4, gap: 4,
  },
  pillTab: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  pillTabActive: {
    backgroundColor: UI_COLORS.ACCENT,
    shadowColor: UI_COLORS.ACCENT, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },
  pillTabText: { color: UI_COLORS.TEXT_MUTED, fontSize: 13, fontWeight: '600' },
  pillTabTextActive: { color: '#FFFFFF' },
  // ── External Links ──
  externalLinkBtn: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: UI_COLORS.BORDER, alignItems: 'center',
  },
  externalLinkText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.ACCENT },
  // ── Error ──
  errorContainer: {
    flex: 1, backgroundColor: UI_COLORS.PRIMARY_BG,
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  errorText: { color: '#DC2626', fontSize: 14 },
});
