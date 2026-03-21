import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS, PARTY_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { LoadingSpinner, EmptyState } from '../components/ui';

export default function VoteDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const voteId: string = route.params?.vote_id;

  const [vote, setVote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positionFilter, setPositionFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const res = await apiClient.getVoteDetail(voteId);
      setVote(res);
    } catch (e: any) {
      console.error('Vote detail load failed:', e);
      setError(e.message || 'Failed to load vote details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [voteId]);

  useEffect(() => { if (voteId) fetchData(); }, [fetchData, voteId]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) return <LoadingSpinner message="Loading vote details..." />;

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!vote) return <EmptyState title="Vote not found" message="This vote could not be loaded." />;

  // Parse vote data
  const question = vote.question || vote.description || 'Unknown vote';
  const result = vote.result || 'Unknown';
  const date = vote.date || vote.vote_date;
  const chamber = vote.chamber || 'Unknown';
  const yeas = vote.yea_count || vote.yeas || 0;
  const nays = vote.nay_count || vote.nays || 0;
  const present = vote.present_count || vote.present || 0;
  const notVoting = vote.not_voting_count || vote.not_voting || 0;
  const memberVotes = vote.member_votes || vote.votes || [];
  const aiSummary = vote.ai_summary;

  const POSITIONS = [
    { key: 'all', label: 'All' },
    { key: 'Yea', label: 'Yea' },
    { key: 'Nay', label: 'Nay' },
    { key: 'Not Voting', label: 'Not Voting' },
  ];

  const filteredVotes = positionFilter === 'all'
    ? memberVotes
    : memberVotes.filter((v: any) => v.position === positionFilter || v.vote_position === positionFilter);

  const getPositionColor = (pos: string) => {
    const p = (pos || '').toLowerCase();
    if (p === 'yea' || p === 'yes' || p === 'aye') return '#10B981';
    if (p === 'nay' || p === 'no') return '#DC2626';
    return '#6B7280';
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
    >
      {/* Hero */}
      <LinearGradient
        colors={['#2563EB', '#1D4ED8', '#1E40AF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="hand-left" size={22} color="#FFFFFF" />
            <Text style={styles.heroLabel}>{chamber}</Text>
          </View>
          <Text style={styles.heroTitle} numberOfLines={3}>{question}</Text>
          {date && (
            <Text style={styles.heroDate}>{new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
          )}
        </View>
      </LinearGradient>

      {/* Result */}
      <View style={styles.resultCard}>
        <Text style={styles.resultLabel}>Result</Text>
        <Text style={[
          styles.resultValue,
          { color: result.toLowerCase().includes('pass') || result.toLowerCase().includes('agree') ? '#10B981' : '#DC2626' },
        ]}>
          {result}
        </Text>
      </View>

      {/* AI Summary */}
      {aiSummary && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Ionicons name="sparkles" size={14} color={UI_COLORS.ACCENT} />
            <Text style={styles.summaryLabel}>AI Summary</Text>
          </View>
          <Text style={styles.summaryText}>{aiSummary}</Text>
        </View>
      )}

      {/* Tally */}
      <View style={styles.tallyRow}>
        <View style={[styles.tallyItem, { borderLeftColor: '#10B981' }]}>
          <Text style={[styles.tallyCount, { color: '#10B981' }]}>{yeas}</Text>
          <Text style={styles.tallyLabel}>Yea</Text>
        </View>
        <View style={[styles.tallyItem, { borderLeftColor: '#DC2626' }]}>
          <Text style={[styles.tallyCount, { color: '#DC2626' }]}>{nays}</Text>
          <Text style={styles.tallyLabel}>Nay</Text>
        </View>
        <View style={[styles.tallyItem, { borderLeftColor: '#6B7280' }]}>
          <Text style={[styles.tallyCount, { color: '#6B7280' }]}>{present}</Text>
          <Text style={styles.tallyLabel}>Present</Text>
        </View>
        <View style={[styles.tallyItem, { borderLeftColor: '#9CA3AF' }]}>
          <Text style={[styles.tallyCount, { color: '#9CA3AF' }]}>{notVoting}</Text>
          <Text style={styles.tallyLabel}>NV</Text>
        </View>
      </View>

      {/* Position Filter */}
      {memberVotes.length > 0 && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
            {POSITIONS.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[
                  styles.filterPill,
                  positionFilter === p.key
                    ? { backgroundColor: UI_COLORS.ACCENT + '18', borderColor: UI_COLORS.ACCENT + '40' }
                    : { backgroundColor: UI_COLORS.CARD_BG, borderColor: UI_COLORS.BORDER },
                ]}
                onPress={() => setPositionFilter(p.key)}
              >
                <Text style={[
                  styles.filterText,
                  { color: positionFilter === p.key ? UI_COLORS.ACCENT : UI_COLORS.TEXT_MUTED },
                ]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.countText}>{filteredVotes.length} votes</Text>

          {filteredVotes.map((mv: any, idx: number) => {
            const pos = mv.position || mv.vote_position || '';
            const posColor = getPositionColor(pos);
            const partyColor = PARTY_COLORS[mv.party?.charAt(0)] || '#6B7280';
            return (
              <TouchableOpacity
                key={`${mv.person_id || idx}`}
                style={styles.memberCard}
                onPress={() => {
                  if (mv.person_id) navigation.navigate('PersonDetail', { person_id: mv.person_id });
                }}
              >
                <View style={styles.memberLeft}>
                  <Text style={styles.memberName}>{mv.display_name || mv.member_name || 'Unknown'}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                    <View style={[styles.badge, { backgroundColor: partyColor + '12', borderColor: partyColor + '25' }]}>
                      <Text style={[styles.badgeText, { color: partyColor }]}>{mv.party || '?'}</Text>
                    </View>
                    {mv.state && <Text style={styles.memberState}>{mv.state}</Text>}
                  </View>
                </View>
                <View style={[styles.positionBadge, { backgroundColor: posColor + '15' }]}>
                  <Text style={[styles.positionText, { color: posColor }]}>{pos}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  content: { paddingBottom: 32 },
  hero: {
    borderRadius: 16, padding: 20, marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    overflow: 'hidden', position: 'relative',
  },
  heroOrb: {
    position: 'absolute', top: -60, right: -40, width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroInner: { position: 'relative' },
  heroIconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  heroLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  heroTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', lineHeight: 24 },
  heroDate: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 6 },
  resultCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 14, marginHorizontal: 16, marginTop: 12,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  resultLabel: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_MUTED },
  resultValue: { fontSize: 16, fontWeight: '800' },
  summaryCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 14, marginHorizontal: 16, marginTop: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  summaryLabel: { fontSize: 12, fontWeight: '700', color: UI_COLORS.ACCENT },
  summaryText: { fontSize: 13, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 19 },
  tallyRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginTop: 12 },
  tallyItem: {
    flex: 1, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: UI_COLORS.BORDER, borderLeftWidth: 3, alignItems: 'center',
  },
  tallyCount: { fontSize: 20, fontWeight: '800' },
  tallyLabel: { fontSize: 10, fontWeight: '600', color: UI_COLORS.TEXT_MUTED, marginTop: 2 },
  filterScroll: { marginTop: 16 },
  filterRow: { paddingHorizontal: 16, gap: 6 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, borderWidth: 1 },
  filterText: { fontSize: 12, fontWeight: '600' },
  countText: { paddingHorizontal: 16, marginTop: 10, marginBottom: 8, fontSize: 12, color: UI_COLORS.TEXT_MUTED, fontWeight: '600' },
  memberCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, marginHorizontal: 16, marginBottom: 6,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  memberLeft: { flex: 1 },
  memberName: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  memberState: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  positionBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  positionText: { fontSize: 12, fontWeight: '700' },
  errorContainer: { flex: 1, backgroundColor: UI_COLORS.PRIMARY_BG, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: { color: '#DC2626', fontSize: 14 },
});
