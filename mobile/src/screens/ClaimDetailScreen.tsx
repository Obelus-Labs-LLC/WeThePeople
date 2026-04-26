import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Linking, TouchableOpacity,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { apiClient } from '../api/client';
import { openExternalUrl } from '../utils/openExternal';
const ACCENT = '#6366F1';
const log = (msg: string, err: unknown) => console.warn(`[ClaimDetailScreen] ${msg}:`, err);

const TIER_COLORS: Record<string, string> = {
  SUPPORTED: '#10B981',
  PARTIAL: '#F59E0B',
  CONTRADICTED: '#DC2626',
  UNKNOWN: '#6B7280',
  PENDING: '#6B7280',
};

function tierColor(t?: string): string {
  if (!t) return '#6B7280';
  return TIER_COLORS[t.toUpperCase()] || '#6B7280';
}

function fmtDate(s?: string | null): string {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return s; }
}

export default function ClaimDetailScreen() {
  const route = useRoute<any>();
  const claimId: string | number = route.params?.claim_id;
  const [claim, setClaim] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (claimId == null) {
      setError('Missing claim ID');
      setLoading(false);
      return;
    }
    try {
      const data = await apiClient.getClaim(claimId);
      setClaim(data);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load claim');
      log('load', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [claimId]);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <LoadingSpinner message="Loading claim..." />;
  if (error || !claim) return <EmptyState title="Error" message={error || 'Claim not found'} />;

  const tier = claim.tier || claim.evaluation_tier || claim.status || '';
  const tColor = tierColor(tier);
  const evidence: any[] = claim.evidence || claim.matches || [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={[styles.iconWrap, { backgroundColor: tColor + '15' }]}>
            <Ionicons name="search" size={22} color={tColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>CLAIM</Text>
            <Text style={styles.claimText}>{claim.text || claim.claim_text || ''}</Text>
          </View>
        </View>

        <View style={styles.badges}>
          {tier && (
            <View style={[styles.tierBadge, { backgroundColor: tColor + '20' }]}>
              <Text style={[styles.tierText, { color: tColor }]}>{String(tier).toUpperCase()}</Text>
            </View>
          )}
          {claim.category && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{claim.category}</Text>
            </View>
          )}
          {claim.intent && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{claim.intent}</Text>
            </View>
          )}
        </View>

        <View style={styles.metaRow}>
          {claim.person_name && (
            <Text style={styles.metaText}>
              <Ionicons name="person-circle" size={13} color={UI_COLORS.TEXT_MUTED} /> {claim.person_name}
            </Text>
          )}
          {claim.claim_date && (
            <Text style={styles.metaText}>
              <Ionicons name="calendar" size={13} color={UI_COLORS.TEXT_MUTED} /> {fmtDate(claim.claim_date)}
            </Text>
          )}
        </View>
      </View>

      {typeof claim.score === 'number' && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.accentBar, { backgroundColor: tColor }]} />
            <Text style={styles.sectionTitle}>Evidence Score</Text>
          </View>
          <View style={styles.scoreCard}>
            <Text style={[styles.scoreValue, { color: tColor }]}>{claim.score}/100</Text>
            {typeof claim.confidence === 'number' && (
              <Text style={styles.scoreMeta}>
                Confidence: {(claim.confidence * 100).toFixed(0)}%
              </Text>
            )}
          </View>
        </View>
      )}

      {claim.source_url && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.accentBar, { backgroundColor: '#10B981' }]} />
            <Text style={styles.sectionTitle}>Source</Text>
          </View>
          <TouchableOpacity
            style={styles.linkCard}
            onPress={() => openExternalUrl(claim.source_url, 'source')}
          >
            <Ionicons name="link" size={16} color="#10B981" />
            <Text style={styles.linkText} numberOfLines={2}>{claim.source_url}</Text>
            <Ionicons name="open-outline" size={14} color={UI_COLORS.TEXT_MUTED} />
          </TouchableOpacity>
        </View>
      )}

      {evidence.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.accentBar, { backgroundColor: '#8B5CF6' }]} />
            <Text style={styles.sectionTitle}>Evidence ({evidence.length})</Text>
          </View>
          {evidence.map((e: any, i: number) => (
            <View key={e.id ?? i} style={styles.evidenceCard}>
              {e.source && <Text style={styles.evSource}>{e.source}</Text>}
              <Text style={styles.evTitle} numberOfLines={2}>{e.title || e.label || 'Evidence'}</Text>
              {e.snippet && <Text style={styles.evSnippet} numberOfLines={4}>{e.snippet}</Text>}
              {e.source_url && (
                <TouchableOpacity
                  style={styles.evLink}
                  onPress={() => openExternalUrl(e.source_url, 'evidence link')}
                >
                  <Ionicons name="open-outline" size={12} color={ACCENT} />
                  <Text style={styles.evLinkText}>View source</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      {claim.degraded && (
        <View style={[styles.section, styles.degradedBanner]}>
          <Ionicons name="warning" size={14} color="#F59E0B" />
          <Text style={styles.degradedText}>
            Some evidence sources failed to load. Verification may be incomplete.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { paddingBottom: 24 },
  header: { padding: 16, backgroundColor: UI_COLORS.CARD_BG, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: '700', color: UI_COLORS.TEXT_MUTED, letterSpacing: 0.5, marginBottom: 4 },
  claimText: { fontSize: 15, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 22 },
  badges: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  tierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tierText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: UI_COLORS.SECONDARY_BG, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  categoryText: { fontSize: 11, color: UI_COLORS.TEXT_SECONDARY, textTransform: 'capitalize' },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 12, flexWrap: 'wrap' },
  metaText: { fontSize: 12, color: UI_COLORS.TEXT_MUTED },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  accentBar: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  scoreCard: { backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT, alignItems: 'center' },
  scoreValue: { fontSize: 28, fontWeight: '800' },
  scoreMeta: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, marginTop: 4 },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  linkText: { flex: 1, fontSize: 12, color: '#10B981' },
  evidenceCard: { backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  evSource: { fontSize: 10, fontWeight: '700', color: '#8B5CF6', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  evTitle: { fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  evSnippet: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, marginTop: 6, lineHeight: 17 },
  evLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  evLinkText: { fontSize: 11, fontWeight: '600', color: ACCENT },
  degradedBanner: { backgroundColor: '#F59E0B15', borderWidth: 1, borderColor: '#F59E0B40', borderRadius: 10, marginHorizontal: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  degradedText: { flex: 1, fontSize: 12, color: '#92400E' },
});
