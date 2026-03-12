import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, Linking, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation } from '@react-navigation/native';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { ActivityResponse, PersonProfile, PersonFinance, PersonVotesResponse } from '../api/types';
import { LoadingSpinner, PartyBadge, ChamberBadge } from '../components/ui';
import { OverviewTab, ActivityTab, VotesTab, FinanceTab } from '../components/person';

type Tab = 'overview' | 'activity' | 'votes' | 'finance';

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
    { key: 'activity', label: `Activity (${activity?.total || 0})` },
    { key: 'votes', label: `Votes${votes ? ` (${votes.total})` : ''}` },
    { key: 'finance', label: 'Finance' },
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

      {/* Tab content — delegated to extracted components */}
      {tab === 'overview' && <OverviewTab activity={activity} profile={profile} />}
      {tab === 'activity' && <ActivityTab activity={activity} onBillPress={handleBillPress} />}
      {tab === 'votes' && <VotesTab votes={votes} loading={votesLoading} onBillPress={handleBillPress} />}
      {tab === 'finance' && <FinanceTab finance={finance} loading={financeLoading} />}
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
  pillTabBar: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 14,
    backgroundColor: UI_COLORS.CARD_BG_ELEVATED, borderRadius: 12, padding: 4, gap: 4,
  },
  pillTab: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  pillTabActive: {
    backgroundColor: UI_COLORS.ACCENT,
    shadowColor: UI_COLORS.ACCENT, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },
  pillTabText: { color: UI_COLORS.TEXT_MUTED, fontSize: 13, fontWeight: '600' },
  pillTabTextActive: { color: '#FFFFFF' },
  // ── Error ──
  errorContainer: {
    flex: 1, backgroundColor: UI_COLORS.PRIMARY_BG,
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  errorText: { color: '#DC2626', fontSize: 14 },
});
