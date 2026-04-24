import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Linking,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { apiClient } from '../api/client';
const ACCENT = '#2563EB';
const log = (msg: string, err: unknown) => console.warn(`[VoteDetailScreen] ${msg}:`, err);

const RESULT_COLORS: Record<string, string> = {
  Passed: '#10B981',
  Agreed: '#10B981',
  Failed: '#DC2626',
  Rejected: '#DC2626',
};

function resultColor(r?: string): string {
  if (!r) return '#6B7280';
  return RESULT_COLORS[r] || '#6B7280';
}

function fmtDate(s?: string | null): string {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return s; }
}

export default function VoteDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const voteId: number | string = route.params?.vote_id;
  const [vote, setVote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (voteId == null) {
      setError('Missing vote ID');
      setLoading(false);
      return;
    }
    try {
      const data = await apiClient.getVoteDetail(voteId);
      setVote(data);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load vote');
      log('load', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [voteId]);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <LoadingSpinner message="Loading vote..." />;
  if (error || !vote) return <EmptyState title="Error" message={error || 'Vote not found'} />;

  const yea = vote.yea_count || 0;
  const nay = vote.nay_count || 0;
  const notVoting = vote.not_voting_count || 0;
  const present = vote.present_count || 0;
  const total = yea + nay + notVoting + present;
  const yeaPct = total > 0 ? Math.round((yea / total) * 100) : 0;
  const nayPct = total > 0 ? Math.round((nay / total) * 100) : 0;
  const result = vote.result || '';
  const rColor = resultColor(result);

  const billId = vote.related_bill_congress && vote.related_bill_type && vote.related_bill_number
    ? `${vote.related_bill_type.toLowerCase()}${vote.related_bill_number}-${vote.related_bill_congress}`
    : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={[styles.iconWrap, { backgroundColor: rColor + '15' }]}>
            <Ionicons name="checkmark-circle" size={22} color={rColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rollMeta}>
              {(vote.chamber || '').toUpperCase()} {'\u00B7'} Roll Call {vote.roll_number}
              {vote.congress ? ` \u00B7 ${vote.congress}th Congress` : ''}
            </Text>
            <Text style={styles.title} numberOfLines={3}>{vote.question || 'Vote'}</Text>
            {vote.vote_date && <Text style={styles.dateText}>{fmtDate(vote.vote_date)}</Text>}
          </View>
        </View>

        {result && (
          <View style={[styles.resultBadge, { backgroundColor: rColor + '20' }]}>
            <Text style={[styles.resultText, { color: rColor }]}>{result.toUpperCase()}</Text>
          </View>
        )}
      </View>

      {/* Tally visualization */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
          <Text style={styles.sectionTitle}>Tally</Text>
        </View>

        <View style={styles.barWrap}>
          {yea > 0 && <View style={[styles.barSeg, { flex: yea, backgroundColor: '#10B981' }]} />}
          {nay > 0 && <View style={[styles.barSeg, { flex: nay, backgroundColor: '#DC2626' }]} />}
          {present > 0 && <View style={[styles.barSeg, { flex: present, backgroundColor: '#F59E0B' }]} />}
          {notVoting > 0 && <View style={[styles.barSeg, { flex: notVoting, backgroundColor: '#6B7280' }]} />}
        </View>

        <View style={styles.tallyGrid}>
          <View style={styles.tallyCell}>
            <View style={[styles.tallyDot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.tallyLabel}>Yea</Text>
            <Text style={[styles.tallyValue, { color: '#10B981' }]}>{yea}</Text>
            <Text style={styles.tallyPct}>{yeaPct}%</Text>
          </View>
          <View style={styles.tallyCell}>
            <View style={[styles.tallyDot, { backgroundColor: '#DC2626' }]} />
            <Text style={styles.tallyLabel}>Nay</Text>
            <Text style={[styles.tallyValue, { color: '#DC2626' }]}>{nay}</Text>
            <Text style={styles.tallyPct}>{nayPct}%</Text>
          </View>
          {present > 0 && (
            <View style={styles.tallyCell}>
              <View style={[styles.tallyDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={styles.tallyLabel}>Present</Text>
              <Text style={[styles.tallyValue, { color: '#F59E0B' }]}>{present}</Text>
            </View>
          )}
          <View style={styles.tallyCell}>
            <View style={[styles.tallyDot, { backgroundColor: '#6B7280' }]} />
            <Text style={styles.tallyLabel}>Not Voting</Text>
            <Text style={[styles.tallyValue, { color: '#6B7280' }]}>{notVoting}</Text>
          </View>
        </View>
      </View>

      {billId && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.accentBar, { backgroundColor: '#8B5CF6' }]} />
            <Text style={styles.sectionTitle}>Related Bill</Text>
          </View>
          <TouchableOpacity
            style={styles.billCard}
            onPress={() => navigation.navigate('BillDetail', { bill_id: billId })}
          >
            <Ionicons name="document-text" size={16} color="#8B5CF6" />
            <Text style={styles.billText}>
              {vote.related_bill_type} {vote.related_bill_number} ({vote.related_bill_congress}th Congress)
            </Text>
            <Ionicons name="chevron-forward" size={14} color={UI_COLORS.TEXT_MUTED} />
          </TouchableOpacity>
        </View>
      )}

      {vote.ai_summary && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.accentBar, { backgroundColor: '#6366F1' }]} />
            <Text style={styles.sectionTitle}>Summary</Text>
          </View>
          <Text style={styles.body}>{vote.ai_summary}</Text>
        </View>
      )}

      {vote.source_url && (
        <TouchableOpacity
          style={styles.sourceButton}
          onPress={() => Linking.openURL(vote.source_url).catch((e) => log('open source', e))}
        >
          <Ionicons name="open-outline" size={16} color={ACCENT} />
          <Text style={[styles.sourceText, { color: ACCENT }]}>View on Congress.gov</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { paddingBottom: 24 },
  header: { padding: 16, backgroundColor: UI_COLORS.CARD_BG, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  rollMeta: { fontSize: 11, fontWeight: '700', color: UI_COLORS.TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 22, marginTop: 4 },
  dateText: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, marginTop: 4 },
  resultBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 12 },
  resultText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  accentBar: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  barWrap: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: UI_COLORS.BORDER, marginBottom: 14 },
  barSeg: { height: '100%' },
  tallyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tallyCell: { width: '48%' as any, flexGrow: 1, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT, flexDirection: 'row', alignItems: 'center', gap: 8 },
  tallyDot: { width: 10, height: 10, borderRadius: 5 },
  tallyLabel: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY, flex: 1 },
  tallyValue: { fontSize: 15, fontWeight: '800' },
  tallyPct: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginLeft: 4 },
  body: { fontSize: 14, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 21 },
  billCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  billText: { flex: 1, fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  sourceButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20, marginHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: ACCENT + '40', backgroundColor: ACCENT + '08' },
  sourceText: { fontSize: 13, fontWeight: '700' },
});
