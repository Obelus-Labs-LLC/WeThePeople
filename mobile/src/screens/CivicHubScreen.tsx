import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { apiClient } from '../api/client';
const ACCENT = '#2563EB';
const log = (msg: string, err: unknown) => console.warn(`[CivicHubScreen] ${msg}:`, err);

interface PromiseItem {
  id: number;
  title: string;
  person_name?: string;
  status?: string;
  category?: string;
  created_at?: string;
}

interface ProposalItem {
  id: number;
  title: string;
  category?: string;
  sector?: string;
  created_at?: string;
}

interface BadgeItem {
  id: number;
  name: string;
  category: string;
}

const STATUS_COLORS: Record<string, string> = {
  fulfilled: '#10B981',
  in_progress: '#F59E0B',
  partially_fulfilled: '#CA8A04',
  pending: '#6B7280',
  broken: '#DC2626',
  retired: '#78716C',
};

function statusColor(s?: string): string {
  if (!s) return '#6B7280';
  return STATUS_COLORS[s] || '#6B7280';
}

export default function CivicHubScreen() {
  const navigation = useNavigation<any>();
  const [promises, setPromises] = useState<PromiseItem[]>([]);
  const [proposals, setProposals] = useState<ProposalItem[]>([]);
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [p, pr, b] = await Promise.all([
        apiClient.getPromises({ limit: 5 }),
        apiClient.getProposals({ limit: 5 }),
        apiClient.getBadges(),
      ]);
      setPromises((p.items as PromiseItem[]) || []);
      setProposals((pr.items as ProposalItem[]) || []);
      setBadges((b.items as BadgeItem[]) || []);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load civic data');
      log('load', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <LoadingSpinner message="Loading civic hub..." />;
  if (error) return <EmptyState title="Error" message={error} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      <LinearGradient
        colors={['#2563EB', '#1D4ED8', '#1E3A8A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="people" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Civic Hub</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Track political promises, contribute proposals, earn civic badges.
          </Text>
        </View>
      </LinearGradient>

      {/* Promises */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
            <Text style={styles.sectionTitle}>Recent Promises</Text>
          </View>
          <Text style={styles.sectionCount}>{promises.length}</Text>
        </View>
        {promises.length === 0 ? (
          <Text style={styles.emptyInline}>No promises tracked yet.</Text>
        ) : (
          promises.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.card}
              onPress={() => navigation.navigate('PromiseDetail', { promise_id: p.id })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={2}>{p.title}</Text>
                {p.person_name && <Text style={styles.cardMeta}>{p.person_name}</Text>}
                <View style={styles.cardFooter}>
                  {p.status && (
                    <View style={[styles.statusBadge, { backgroundColor: statusColor(p.status) + '20' }]}>
                      <Text style={[styles.statusText, { color: statusColor(p.status) }]}>
                        {p.status.replace(/_/g, ' ')}
                      </Text>
                    </View>
                  )}
                  {p.category && <Text style={styles.categoryText}>{p.category}</Text>}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Proposals */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.accentBar, { backgroundColor: '#8B5CF6' }]} />
            <Text style={styles.sectionTitle}>Citizen Proposals</Text>
          </View>
          <Text style={styles.sectionCount}>{proposals.length}</Text>
        </View>
        {proposals.length === 0 ? (
          <Text style={styles.emptyInline}>No proposals yet.</Text>
        ) : (
          proposals.map((pr) => (
            <View key={pr.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={2}>{pr.title}</Text>
                <View style={styles.cardFooter}>
                  {pr.category && <Text style={styles.categoryText}>{pr.category}</Text>}
                  {pr.sector && <Text style={styles.categoryText}>{pr.sector}</Text>}
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Badges preview */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.accentBar, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.sectionTitle}>Badges</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Badges')}>
            <Text style={[styles.seeAll, { color: '#F59E0B' }]}>See all {'\u2192'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.badgeRow}>
          {badges.slice(0, 6).map((b) => (
            <View key={b.id} style={styles.badgeChip}>
              <Ionicons name="ribbon" size={14} color="#F59E0B" />
              <Text style={styles.badgeChipText} numberOfLines={1}>{b.name}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Creating promises, proposals, and annotations requires signing in on the web.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { paddingBottom: 24 },
  hero: { borderRadius: 16, padding: 20, marginHorizontal: 16, marginTop: 12, overflow: 'hidden', position: 'relative' },
  heroOrb: { position: 'absolute', top: -60, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroInner: { position: 'relative' },
  heroIconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19 },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accentBar: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  sectionCount: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_MUTED },
  seeAll: { fontSize: 13, fontWeight: '600' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  cardTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  cardMeta: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, marginTop: 3 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  categoryText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, textTransform: 'capitalize' },
  emptyInline: { fontSize: 13, color: UI_COLORS.TEXT_MUTED, fontStyle: 'italic', paddingVertical: 12 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badgeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F59E0B15', borderColor: '#F59E0B30', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  badgeChipText: { fontSize: 12, fontWeight: '600', color: '#F59E0B', maxWidth: 140 },
  footer: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16, marginTop: 8 },
  footerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, textAlign: 'center' },
});
