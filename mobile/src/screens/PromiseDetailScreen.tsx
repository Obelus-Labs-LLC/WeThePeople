import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Linking, TouchableOpacity,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { apiClient } from '../api/client';
const ACCENT = '#2563EB';
const log = (msg: string, err: unknown) => console.warn(`[PromiseDetailScreen] ${msg}:`, err);

const STATUS_COLORS: Record<string, string> = {
  fulfilled: '#10B981',
  in_progress: '#F59E0B',
  partially_fulfilled: '#CA8A04',
  pending: '#6B7280',
  broken: '#DC2626',
  retired: '#78716C',
};

function fmtDate(s?: string | null): string {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return s; }
}

export default function PromiseDetailScreen() {
  const route = useRoute<any>();
  const promiseId: number | string = route.params?.promise_id;
  const [promise, setPromise] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (promiseId == null) {
      setError('Missing promise ID');
      setLoading(false);
      return;
    }
    try {
      const data = await apiClient.getPromise(promiseId);
      setPromise(data);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load promise');
      log('load', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [promiseId]);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <LoadingSpinner message="Loading promise..." />;
  if (error || !promise) return <EmptyState title="Error" message={error || 'Promise not found'} />;

  const statusColor = STATUS_COLORS[promise.status] || '#6B7280';
  const linkedBills: string[] = Array.isArray(promise.linked_bill_ids) ? promise.linked_bill_ids : [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      {/* Header block */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={[styles.iconWrap, { backgroundColor: statusColor + '15' }]}>
            <Ionicons name="flag" size={22} color={statusColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{promise.title || 'Untitled promise'}</Text>
            {promise.person_name && (
              <Text style={styles.personName}>
                {promise.person_name}{promise.promise_date ? ` \u00B7 ${fmtDate(promise.promise_date)}` : ''}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.badges}>
          {promise.status && (
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {String(promise.status).replace(/_/g, ' ')}
              </Text>
            </View>
          )}
          {promise.category && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{promise.category}</Text>
            </View>
          )}
        </View>
      </View>

      {promise.description && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
            <Text style={styles.sectionTitle}>Description</Text>
          </View>
          <Text style={styles.body}>{promise.description}</Text>
        </View>
      )}

      {promise.source_url && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.accentBar, { backgroundColor: '#10B981' }]} />
            <Text style={styles.sectionTitle}>Source</Text>
          </View>
          <TouchableOpacity
            style={styles.linkCard}
            onPress={() => Linking.openURL(promise.source_url).catch((e) => log('open source', e))}
          >
            <Ionicons name="link" size={16} color="#10B981" />
            <Text style={styles.linkText} numberOfLines={2}>{promise.source_url}</Text>
            <Ionicons name="open-outline" size={14} color={UI_COLORS.TEXT_MUTED} />
          </TouchableOpacity>
        </View>
      )}

      {linkedBills.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.accentBar, { backgroundColor: '#8B5CF6' }]} />
            <Text style={styles.sectionTitle}>Linked Bills ({linkedBills.length})</Text>
          </View>
          {linkedBills.map((bid) => (
            <View key={bid} style={styles.billChip}>
              <Ionicons name="document-text-outline" size={14} color="#8B5CF6" />
              <Text style={styles.billChipText}>{bid}</Text>
            </View>
          ))}
        </View>
      )}

      {Array.isArray(promise.milestones) && promise.milestones.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.accentBar, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.sectionTitle}>Milestones</Text>
          </View>
          {promise.milestones.map((m: any) => (
            <View key={m.id} style={styles.milestoneCard}>
              <Text style={styles.milestoneTitle}>{m.title}</Text>
              {m.description && <Text style={styles.milestoneDesc}>{m.description}</Text>}
              {m.due_date && <Text style={styles.milestoneDate}>Due {fmtDate(m.due_date)}</Text>}
            </View>
          ))}
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Created {fmtDate(promise.created_at)}{promise.wilson_score ? ` \u00B7 community score ${promise.wilson_score.toFixed(2)}` : ''}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { paddingBottom: 24 },
  header: { padding: 16, backgroundColor: UI_COLORS.CARD_BG, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY },
  personName: { fontSize: 13, color: UI_COLORS.TEXT_SECONDARY, marginTop: 4 },
  badges: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: UI_COLORS.SECONDARY_BG, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  categoryText: { fontSize: 11, color: UI_COLORS.TEXT_SECONDARY, textTransform: 'capitalize' },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  accentBar: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  body: { fontSize: 14, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 21 },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  linkText: { flex: 1, fontSize: 12, color: '#10B981' },
  billChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#8B5CF6' + '12', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginBottom: 6 },
  billChipText: { fontSize: 12, fontWeight: '600', color: '#8B5CF6' },
  milestoneCard: { backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  milestoneTitle: { fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  milestoneDesc: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, marginTop: 4, lineHeight: 17 },
  milestoneDate: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 6 },
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
});
