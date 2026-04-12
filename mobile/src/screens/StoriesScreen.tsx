import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { API_BASE } from '../api/client';
const ACCENT = '#059669';

interface Story {
  id: string;
  title: string;
  slug: string;
  summary: string;
  category: string;
  sector: string;
  published_at: string;
  verification_tier: string;
}

interface StoriesResponse {
  stories: Story[];
}

const CATEGORY_COLORS: Record<string, string> = {
  contract_windfall: '#DC2626',
  revolving_door: '#7C3AED',
  bipartisan_buying: '#2563EB',
  stock_act_violation: '#EA580C',
  trade_timing: '#0891B2',
  enforcement_immunity: '#4B5563',
  penalty_contract_ratio: '#B91C1C',
  committee_stock_trade: '#6D28D9',
  regulatory_capture: '#0D9488',
  foreign_lobbying: '#1D4ED8',
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatCategory(cat: string): string {
  if (!cat) return '';
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getVerificationStyle(tier: string): { color: string; bg: string; border: string; label: string } {
  const t = (tier || '').toLowerCase();
  if (t === 'verified' || t === 'high') {
    return { color: '#059669', bg: '#05966915', border: '#05966930', label: 'Verified' };
  }
  if (t === 'partial' || t === 'medium') {
    return { color: '#D97706', bg: '#D9770615', border: '#D9770630', label: 'Partial' };
  }
  return { color: '#6B7280', bg: '#6B728015', border: '#6B728030', label: 'Unverified' };
}

export default function StoriesScreen() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/stories/latest?limit=20`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: StoriesResponse = await res.json();
      setStories(data.stories || []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load stories');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  if (loading) return <LoadingSpinner message="Loading stories..." />;
  if (error) return <EmptyState title="Error" message={error} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      {/* Hero */}
      <LinearGradient
        colors={['#059669', '#047857', '#065F46']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="newspaper" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Investigation Stories</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            AI-generated investigative stories uncovering patterns in government data
          </Text>
          <View style={styles.heroStatRow}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{stories.length}</Text>
              <Text style={styles.heroStatLabel}>Stories</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Story Cards */}
      <View style={styles.section}>
        <View style={[styles.sectionTitleRow, { marginBottom: 12 }]}>
          <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
          <Text style={styles.sectionTitle}>Latest Stories</Text>
        </View>

        {stories.length === 0 ? (
          <EmptyState title="No Stories" message="No investigation stories found." />
        ) : (
          stories.map((story) => {
            const catColor = CATEGORY_COLORS[story.category] || '#6B7280';
            const verification = getVerificationStyle(story.verification_tier);
            const isExpanded = expandedId === story.id;

            return (
              <TouchableOpacity
                key={story.id}
                style={styles.card}
                activeOpacity={0.8}
                onPress={() => setExpandedId(isExpanded ? null : story.id)}
              >
                {/* Title */}
                <Text style={styles.storyTitle}>{story.title}</Text>

                {/* Summary */}
                <Text
                  style={styles.storySummary}
                  numberOfLines={isExpanded ? undefined : 2}
                >
                  {story.summary}
                </Text>

                {/* Badges row */}
                <View style={styles.badgesRow}>
                  {/* Category badge */}
                  {story.category ? (
                    <View style={[styles.badge, { backgroundColor: catColor + '15', borderColor: catColor + '30' }]}>
                      <Text style={[styles.badgeText, { color: catColor }]}>
                        {formatCategory(story.category)}
                      </Text>
                    </View>
                  ) : null}

                  {/* Sector badge */}
                  {story.sector ? (
                    <View style={[styles.badge, { backgroundColor: '#6B728015', borderColor: '#6B728030' }]}>
                      <Text style={[styles.badgeText, { color: '#6B7280' }]}>
                        {formatCategory(story.sector)}
                      </Text>
                    </View>
                  ) : null}

                  {/* Verification badge */}
                  <View style={[styles.badge, { backgroundColor: verification.bg, borderColor: verification.border }]}>
                    <Ionicons
                      name={verification.label === 'Verified' ? 'checkmark-circle' : verification.label === 'Partial' ? 'alert-circle' : 'help-circle'}
                      size={12}
                      color={verification.color}
                    />
                    <Text style={[styles.badgeText, { color: verification.color }]}>
                      {verification.label}
                    </Text>
                  </View>
                </View>

                {/* Date row */}
                <View style={styles.bottomRow}>
                  <Text style={styles.dateText}>
                    <Ionicons name="calendar-outline" size={11} color={UI_COLORS.TEXT_MUTED} />
                    {'  '}{formatDate(story.published_at)}
                  </Text>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={UI_COLORS.TEXT_MUTED}
                  />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Data: WeThePeople AI Investigation Engine</Text>
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
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  storyTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 6, lineHeight: 21 },
  storySummary: { fontSize: 13, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 19, marginBottom: 10 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
});
