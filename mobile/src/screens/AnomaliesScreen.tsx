import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

const API_BASE = 'https://api.wethepeopleforus.com';
const ACCENT = '#DC2626';

interface Anomaly {
  id: string;
  pattern_type: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  score: number;
  title: string;
  description: string;
  detected_at: string;
}

interface AnomaliesResponse {
  anomalies: Anomaly[];
}

const PATTERN_COLORS: Record<string, string> = {
  trade_near_vote: '#DC2626',
  lobbying_spike: '#EA580C',
  enforcement_gap: '#7C3AED',
  revolving_door: '#4B5563',
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

function formatPatternType(pt: string): string {
  if (!pt) return '';
  return pt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getScoreStyle(score: number): { color: string; bg: string; border: string } {
  if (score >= 8) return { color: '#DC2626', bg: '#DC262615', border: '#DC262630' };
  if (score >= 6) return { color: '#EA580C', bg: '#EA580C15', border: '#EA580C30' };
  return { color: '#6B7280', bg: '#6B728015', border: '#6B728030' };
}

export default function AnomaliesScreen() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/anomalies?limit=30`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AnomaliesResponse = await res.json();
      setAnomalies(data.anomalies || []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load anomalies');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  if (loading) return <LoadingSpinner message="Loading anomalies..." />;
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
        colors={['#DC2626', '#EA580C', '#C2410C']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="warning" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Anomaly Detection</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Suspicious patterns detected in government data
          </Text>
          <View style={styles.heroStatRow}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{anomalies.length}</Text>
              <Text style={styles.heroStatLabel}>Anomalies</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>
                {anomalies.filter(a => a.score >= 8).length}
              </Text>
              <Text style={styles.heroStatLabel}>Critical</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Anomaly Cards */}
      <View style={styles.section}>
        <View style={[styles.sectionTitleRow, { marginBottom: 12 }]}>
          <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
          <Text style={styles.sectionTitle}>Detected Anomalies</Text>
        </View>

        {anomalies.length === 0 ? (
          <EmptyState title="No Anomalies" message="No anomalies detected." />
        ) : (
          anomalies.map((anomaly) => {
            const scoreStyle = getScoreStyle(anomaly.score);
            const patternColor = PATTERN_COLORS[anomaly.pattern_type] || '#6B7280';
            const isExpanded = expandedId === anomaly.id;

            return (
              <TouchableOpacity
                key={anomaly.id}
                style={styles.card}
                activeOpacity={0.8}
                onPress={() => setExpandedId(isExpanded ? null : anomaly.id)}
              >
                {/* Top row: title + score */}
                <View style={styles.topRow}>
                  <Text style={styles.anomalyTitle} numberOfLines={isExpanded ? undefined : 2}>
                    {anomaly.title}
                  </Text>
                  <View style={[styles.scoreBadge, { backgroundColor: scoreStyle.bg, borderColor: scoreStyle.border }]}>
                    <Text style={[styles.scoreText, { color: scoreStyle.color }]}>
                      {anomaly.score}
                    </Text>
                  </View>
                </View>

                {/* Entity name */}
                {anomaly.entity_name ? (
                  <Text style={styles.entityName}>{anomaly.entity_name}</Text>
                ) : null}

                {/* Description */}
                {isExpanded && anomaly.description ? (
                  <Text style={styles.description}>{anomaly.description}</Text>
                ) : null}

                {/* Badges row */}
                <View style={styles.badgesRow}>
                  {/* Pattern type badge */}
                  {anomaly.pattern_type ? (
                    <View style={[styles.badge, { backgroundColor: patternColor + '15', borderColor: patternColor + '30' }]}>
                      <Text style={[styles.badgeText, { color: patternColor }]}>
                        {formatPatternType(anomaly.pattern_type)}
                      </Text>
                    </View>
                  ) : null}

                  {/* Entity type badge */}
                  {anomaly.entity_type ? (
                    <View style={[styles.badge, { backgroundColor: '#6B728015', borderColor: '#6B728030' }]}>
                      <Text style={[styles.badgeText, { color: '#6B7280' }]}>
                        {formatPatternType(anomaly.entity_type)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Date row */}
                <View style={styles.bottomRow}>
                  <Text style={styles.dateText}>
                    <Ionicons name="calendar-outline" size={11} color={UI_COLORS.TEXT_MUTED} />
                    {'  '}{formatDate(anomaly.detected_at)}
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
        <Text style={styles.footerText}>Data: WeThePeople Anomaly Detection Engine</Text>
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
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 10 },
  anomalyTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, flex: 1, lineHeight: 21 },
  scoreBadge: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  scoreText: { fontSize: 16, fontWeight: '800' },
  entityName: { fontSize: 13, fontWeight: '600', color: ACCENT, marginBottom: 8 },
  description: { fontSize: 13, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 19, marginBottom: 10 },
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
