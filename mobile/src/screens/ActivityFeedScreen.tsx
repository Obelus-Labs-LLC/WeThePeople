import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { apiClient } from '../api/client';
const ACCENT = '#475569';

interface Activity {
  id: string | number;
  person_id?: string | null;
  person_name?: string | null;
  title: string;
  summary?: string | null;
  date: string;
  metadata_json?: string;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 1) {
      const mins = Math.floor(diffMs / (1000 * 60));
      return `${mins}m ago`;
    }
    if (diffHours < 24) {
      return `${Math.floor(diffHours)}h ago`;
    }
    if (diffHours < 48) {
      return 'Yesterday';
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatFullDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function ActivityFeedScreen() {
  const navigation = useNavigation<any>();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const raw = await apiClient.getRecentActivity({ limit: 30 });
      const list: Activity[] = Array.isArray(raw)
        ? (raw as any[])
        : ((raw as any).activity || (raw as any).actions || (raw as any).results || []);
      list.sort((a, b) => {
        const da = new Date(a.date || 0).getTime();
        const db = new Date(b.date || 0).getTime();
        return db - da;
      });
      setActivities(list);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load activity');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  if (loading) return <LoadingSpinner message="Loading activity feed..." />;
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
        colors={['#475569', '#334155']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="newspaper" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Latest Activity</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Recent actions and updates from Congress
          </Text>
          <View style={styles.heroStatRow}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{activities.length}</Text>
              <Text style={styles.heroStatLabel}>Actions</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Activity Cards */}
      <View style={styles.section}>
        <View style={[styles.sectionTitleRow, { marginBottom: 12 }]}>
          <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
          <Text style={styles.sectionTitle}>Recent Actions</Text>
        </View>

        {activities.length === 0 ? (
          <EmptyState title="No Activity" message="No recent actions found." />
        ) : (
          activities.map((activity, idx) => (
            <View key={activity.id || `activity-${idx}`} style={styles.card}>
              {/* Title */}
              <Text style={styles.cardTitle} numberOfLines={2}>{activity.title}</Text>

              {/* Summary */}
              {activity.summary ? (
                <Text style={styles.cardSummary} numberOfLines={2}>
                  {activity.summary}
                </Text>
              ) : null}

              {/* Bottom row: date + person link */}
              <View style={styles.bottomRow}>
                <View style={styles.dateWrap}>
                  <Ionicons name="time-outline" size={12} color={UI_COLORS.TEXT_MUTED} />
                  <Text style={styles.dateText}>{formatDate(activity.date)}</Text>
                  <Text style={styles.fullDateText}>{formatFullDate(activity.date)}</Text>
                </View>

                {activity.person_id ? (
                  <TouchableOpacity
                    style={styles.personLink}
                    activeOpacity={0.7}
                    onPress={() => {
                      navigation.navigate('PersonDetail', { person_id: activity.person_id });
                    }}
                  >
                    <Ionicons name="person-outline" size={12} color="#2563EB" />
                    <Text style={styles.personLinkText} numberOfLines={1}>
                      {activity.person_name || activity.person_id}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Data: Congressional Activity Feed / WeThePeople API</Text>
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
  cardTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 6, lineHeight: 21 },
  cardSummary: { fontSize: 13, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 19, marginBottom: 10 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateText: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_MUTED },
  fullDateText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginLeft: 4 },
  personLink: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    backgroundColor: '#2563EB10', borderWidth: 1, borderColor: '#2563EB25',
  },
  personLinkText: { fontSize: 11, fontWeight: '600', color: '#2563EB' },
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
});
