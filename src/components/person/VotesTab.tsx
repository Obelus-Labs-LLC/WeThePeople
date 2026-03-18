import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../../constants/colors';
import { EmptyState, SkeletonList } from '../ui';
import { FilterPillGroup } from '../FilterPillGroup';
import type { PersonVotesResponse } from '../../api/types';

type PositionFilter = 'all' | 'Yea' | 'Nay' | 'Not Voting';

const POSITION_COLORS: Record<string, string> = {
  Yea: '#10B981',
  Aye: '#10B981',
  Nay: '#DC2626',
  No: '#DC2626',
  'Not Voting': '#9CA3AF',
  Present: '#D4A017',
};

interface VotesTabProps {
  votes: PersonVotesResponse | null;
  loading: boolean;
  onBillPress: (billId: string) => void;
}

export function VotesTab({ votes, loading, onBillPress }: VotesTabProps) {
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');

  if (loading) return <SkeletonList count={5} />;
  if (!votes || votes.total === 0) {
    return <EmptyState title="No voting records" message="Roll call vote data is not yet available for this member." />;
  }

  const filterOptions = [
    { key: 'all' as PositionFilter, label: `All (${votes.total})` },
    { key: 'Yea' as PositionFilter, label: 'Yea' },
    { key: 'Nay' as PositionFilter, label: 'Nay' },
    { key: 'Not Voting' as PositionFilter, label: 'Not Voting' },
  ];

  const filteredVotes = positionFilter === 'all'
    ? votes.votes
    : votes.votes.filter((v) => v.position === positionFilter);

  return (
    <View style={styles.tabContent}>
      {/* Position summary */}
      {votes.position_summary && Object.keys(votes.position_summary).length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Position Summary</Text>
          {Object.entries(votes.position_summary)
            .sort(([, a], [, b]) => b - a)
            .map(([pos, count]) => (
              <View key={pos} style={styles.factRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: POSITION_COLORS[pos] || '#6B7280' }} />
                  <Text style={styles.factLabel}>{pos}</Text>
                </View>
                <Text style={styles.factValue}>{count}</Text>
              </View>
            ))}
        </View>
      )}

      {/* Position filter */}
      <FilterPillGroup options={filterOptions} selected={positionFilter} onSelect={setPositionFilter} scrollable />

      {/* Vote list */}
      <FlatList
        data={filteredVotes}
        keyExtractor={(item) => String(item.vote_id)}
        scrollEnabled={false}
        renderItem={({ item: vote }) => {
          const posColor = POSITION_COLORS[vote.position || ''] || '#6B7280';
          const billLabel = vote.related_bill_type && vote.related_bill_number
            ? `${vote.related_bill_type.toUpperCase()} ${vote.related_bill_number}`
            : null;
          const voteUrl = vote.congress && vote.chamber && vote.roll_number
            ? vote.chamber.toLowerCase() === 'senate'
              ? `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${vote.congress}1/vote_${vote.congress}_1_${String(vote.roll_number).padStart(5, '0')}.htm`
              : `https://clerk.house.gov/Votes/${vote.vote_date ? new Date(vote.vote_date).getFullYear() : ''}${vote.roll_number}`
            : null;
          return (
            <TouchableOpacity
              style={styles.voteCard}
              onPress={() => voteUrl && Linking.openURL(voteUrl)}
              disabled={!voteUrl}
            >
              <View style={styles.voteHeader}>
                <View style={[styles.positionBadge, { backgroundColor: posColor + '18' }]}>
                  <Text style={[styles.positionBadgeText, { color: posColor }]}>
                    {vote.position || 'Unknown'}
                  </Text>
                </View>
                <Text style={styles.voteResult}>{vote.result || ''}</Text>
              </View>
              <Text style={styles.voteQuestion} numberOfLines={2}>
                {vote.question || 'Roll call vote'}
              </Text>
              {vote.bill_title && (
                <Text style={styles.billTitle} numberOfLines={2}>{vote.bill_title}</Text>
              )}
              {vote.bill_summary && (
                <Text style={styles.billSummary} numberOfLines={3}>{vote.bill_summary}</Text>
              )}
              <View style={styles.voteMeta}>
                {vote.chamber && <Text style={styles.voteMetaText}>{vote.chamber}</Text>}
                {vote.vote_date && (
                  <Text style={styles.voteMetaText}>{new Date(vote.vote_date).toLocaleDateString()}</Text>
                )}
                {billLabel && (
                  <TouchableOpacity
                    onPress={() => {
                      const billId = `${vote.related_bill_congress}-${vote.related_bill_type}-${vote.related_bill_number}`;
                      onBillPress(billId);
                    }}
                  >
                    <Text style={styles.billIdLink}>{billLabel}</Text>
                  </TouchableOpacity>
                )}
                {voteUrl && (
                  <View style={styles.sourceLink}>
                    <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
                    <Text style={styles.sourceLinkText}>
                      {vote.chamber?.toLowerCase() === 'senate' ? 'Senate.gov' : 'House Clerk'}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabContent: { gap: 12, paddingHorizontal: 16 },
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 15, fontWeight: '700', marginBottom: 12 },
  factRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  factLabel: { color: UI_COLORS.TEXT_MUTED, fontSize: 12, textTransform: 'capitalize' },
  factValue: { flex: 1, color: UI_COLORS.TEXT_PRIMARY, fontSize: 12 },
  voteCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  voteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  positionBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  positionBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  voteResult: { color: UI_COLORS.TEXT_MUTED, fontSize: 11, fontWeight: '500' },
  voteQuestion: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  billTitle: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 4 },
  billSummary: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 12, lineHeight: 17, marginTop: 3 },
  voteMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  voteMetaText: { color: UI_COLORS.TEXT_MUTED, fontSize: 11 },
  billIdLink: { color: UI_COLORS.ACCENT, fontSize: 11, fontWeight: '600', textDecorationLine: 'underline' },
  sourceLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sourceLinkText: { fontSize: 11, fontWeight: '600', color: UI_COLORS.ACCENT },
});
