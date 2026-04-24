import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { apiClient } from '../api/client';
const ACCENT = '#F59E0B';
const log = (msg: string, err: unknown) => console.warn(`[BadgesScreen] ${msg}:`, err);

interface Badge {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon?: string | null;
  category: string;
  threshold: number;
  level?: number | null;
}

// Rough tier-color mapping by badge.level (1 = bronze, 2 = silver, 3 = gold...).
const LEVEL_COLORS: Record<number, string> = {
  1: '#B45309',
  2: '#71717A',
  3: '#D97706',
  4: '#6D28D9',
};

function levelColor(level?: number | null): string {
  if (!level) return '#71717A';
  return LEVEL_COLORS[level] || '#D97706';
}

export default function BadgesScreen() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await apiClient.getBadges();
      setBadges((res.items as Badge[]) || []);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load badges');
      log('load', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  const categories = useMemo(() => {
    const set = new Set(badges.map((b) => b.category).filter(Boolean));
    return Array.from(set).sort();
  }, [badges]);

  const filtered = useMemo(() => {
    if (!categoryFilter) return badges;
    return badges.filter((b) => b.category === categoryFilter);
  }, [badges, categoryFilter]);

  if (loading) return <LoadingSpinner message="Loading badges..." />;
  if (error) return <EmptyState title="Error" message={error} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      <LinearGradient
        colors={['#F59E0B', '#D97706', '#92400E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="trophy" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Civic Badges</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Earn recognition for contributing annotations, promises, proposals, and votes.
          </Text>
        </View>
      </LinearGradient>

      {categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          <TouchableOpacity
            style={[styles.filterChip, !categoryFilter && styles.filterChipActive]}
            onPress={() => setCategoryFilter(null)}
          >
            <Text style={[styles.filterText, !categoryFilter && styles.filterTextActive]}>All</Text>
          </TouchableOpacity>
          {categories.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.filterChip, categoryFilter === c && styles.filterChipActive]}
              onPress={() => setCategoryFilter(c)}
            >
              <Text style={[styles.filterText, categoryFilter === c && styles.filterTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <Text style={styles.countText}>
        {filtered.length} badge{filtered.length === 1 ? '' : 's'}
      </Text>

      <View style={styles.grid}>
        {filtered.map((b) => {
          const c = levelColor(b.level);
          return (
            <View key={b.id} style={[styles.card, { borderColor: c + '30' }]}>
              <View style={[styles.badgeIcon, { backgroundColor: c + '18' }]}>
                <Ionicons name="ribbon" size={28} color={c} />
              </View>
              <Text style={styles.badgeName} numberOfLines={2}>{b.name}</Text>
              <Text style={styles.badgeDesc} numberOfLines={3}>{b.description}</Text>
              <View style={styles.badgeMeta}>
                <Text style={[styles.tierLabel, { color: c }]}>
                  {b.level ? `Tier ${b.level}` : 'Standard'}
                </Text>
                {b.threshold > 0 && (
                  <Text style={styles.threshold}>{b.threshold} required</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {filtered.length === 0 && (
        <EmptyState title="No badges in this category" />
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Log in on the web to track which badges you have earned.</Text>
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
  filterRow: { marginTop: 12, marginBottom: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: UI_COLORS.BORDER, backgroundColor: UI_COLORS.CARD_BG },
  filterChipActive: { backgroundColor: ACCENT + '18', borderColor: ACCENT + '50' },
  filterText: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY, textTransform: 'capitalize' },
  filterTextActive: { color: ACCENT },
  countText: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, paddingHorizontal: 16, marginBottom: 8, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  card: { width: '48%' as any, flexGrow: 1, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, borderWidth: 1 },
  badgeIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  badgeName: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 4 },
  badgeDesc: { fontSize: 11, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 15, minHeight: 30 },
  badgeMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  tierLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  threshold: { fontSize: 10, color: UI_COLORS.TEXT_MUTED },
  footer: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16 },
  footerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, textAlign: 'center' },
});
