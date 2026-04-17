import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { apiClient } from '../api/client';
const ACCENT = '#D97706';

interface Committee {
  id?: number;
  thomas_id: string;
  name: string;
  chamber: string;
  committee_type?: string | null;
  url?: string | null;
  phone?: string | null;
  jurisdiction?: string | null;
  parent_thomas_id?: string | null;
  member_count?: number;
  subcommittees?: Committee[];
}

export default function CommitteesScreen() {
  const navigation = useNavigation<any>();
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const data = await apiClient.getCommittees();
      const list: Committee[] = (data?.committees as any) || [];
      setCommittees(list);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load committees');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  if (loading) return <LoadingSpinner message="Loading committees..." />;
  if (error) {
    return (
      <View style={styles.errorWrap}>
        <EmptyState title="Error" message={error} />
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => {
            setLoading(true);
            setError('');
            loadData();
          }}
        >
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const senateCommittees = committees.filter(c =>
    (c.chamber || '').toLowerCase().includes('senate')
  );
  const houseCommittees = committees.filter(c =>
    (c.chamber || '').toLowerCase().includes('house')
  );
  const otherCommittees = committees.filter(c => {
    const ch = (c.chamber || '').toLowerCase();
    return !ch.includes('senate') && !ch.includes('house');
  });

  const renderCard = (committee: Committee) => {
    const isSenate = (committee.chamber || '').toLowerCase().includes('senate');
    const chamberColor = isSenate ? '#2563EB' : '#059669';

    return (
      <TouchableOpacity
        key={committee.thomas_id || committee.name}
        style={styles.card}
        activeOpacity={0.8}
        onPress={() =>
          navigation.navigate('CommitteeDetail', {
            committee_id: committee.thomas_id,
            committee_name: committee.name,
          })
        }
      >
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle} numberOfLines={2}>{committee.name}</Text>
          <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
        </View>

        <View style={styles.badgesRow}>
          {/* Chamber badge */}
          <View style={[styles.badge, { backgroundColor: chamberColor + '15', borderColor: chamberColor + '30' }]}>
            <Ionicons
              name={isSenate ? 'shield' : 'business'}
              size={12}
              color={chamberColor}
            />
            <Text style={[styles.badgeText, { color: chamberColor }]}>
              {isSenate ? 'Senate' : 'House'}
            </Text>
          </View>

          {/* Member count badge */}
          {committee.member_count != null && (
            <View style={[styles.badge, { backgroundColor: '#6B728015', borderColor: '#6B728030' }]}>
              <Ionicons name="people-outline" size={12} color="#6B7280" />
              <Text style={[styles.badgeText, { color: '#6B7280' }]}>
                {committee.member_count} members
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSection = (title: string, items: Committee[]) => {
    if (items.length === 0) return null;
    return (
      <View style={styles.section} key={title}>
        <View style={[styles.sectionTitleRow, { marginBottom: 12 }]}>
          <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
          <Text style={styles.sectionTitle}>{title}</Text>
          <View style={[styles.countBadge]}>
            <Text style={styles.countText}>{items.length}</Text>
          </View>
        </View>
        {items.map(renderCard)}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      {/* Hero */}
      <LinearGradient
        colors={['#D97706', '#B45309']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="people" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Congressional Committees</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Senate and House committees shaping legislation
          </Text>
          <View style={styles.heroStatRow}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{committees.length}</Text>
              <Text style={styles.heroStatLabel}>Committees</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{senateCommittees.length}</Text>
              <Text style={styles.heroStatLabel}>Senate</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{houseCommittees.length}</Text>
              <Text style={styles.heroStatLabel}>House</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {renderSection('Senate Committees', senateCommittees)}
      {renderSection('House Committees', houseCommittees)}
      {renderSection('Joint / Other Committees', otherCommittees)}

      {committees.length === 0 && (
        <EmptyState title="No Committees" message="No committee data found." />
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Data: Congress.gov / WeThePeople API</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { paddingBottom: 24 },
  hero: {
    borderRadius: 16, padding: 20, marginHorizontal: 16, marginTop: 12,
    overflow: 'hidden', position: 'relative',
  },
  heroOrb: {
    position: 'absolute', top: -60, right: -40, width: 180, height: 180,
    borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroInner: { position: 'relative' },
  heroIconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  heroStatRow: { flexDirection: 'row', gap: 24 },
  heroStat: {},
  heroStatValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  heroStatLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
  section: { paddingHorizontal: 16, marginTop: 12, marginBottom: 16 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accentBar: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  countBadge: {
    backgroundColor: ACCENT + '20', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
  },
  countText: { fontSize: 12, fontWeight: '700', color: ACCENT },
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginBottom: 8,
  },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 21 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  errorWrap: {
    flex: 1, backgroundColor: UI_COLORS.PRIMARY_BG, justifyContent: 'center',
    alignItems: 'center', gap: 16, padding: 32,
  },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: ACCENT, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
  },
  retryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
