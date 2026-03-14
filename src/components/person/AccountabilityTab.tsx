import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../../constants/colors';
import { EmptyState, SkeletonList } from '../ui';
import { FilterPillGroup, FilterOption } from '../FilterPillGroup';
import type { LedgerEntry, LedgerPersonResponse } from '../../api/types';

const TIER_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  strong: { color: '#10B981', icon: 'shield-checkmark', label: 'Strong' },
  moderate: { color: '#F59E0B', icon: 'shield-half', label: 'Moderate' },
  weak: { color: '#F97316', icon: 'shield-outline', label: 'Weak' },
  none: { color: '#EF4444', icon: 'close-circle-outline', label: 'None' },
};

const TIER_FILTERS: FilterOption[] = [
  { key: 'all', label: 'All' },
  { key: 'strong', label: 'Strong' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'weak', label: 'Weak' },
  { key: 'none', label: 'None' },
];

interface AccountabilityTabProps {
  ledger: LedgerPersonResponse | null;
  loading: boolean;
}

export function AccountabilityTab({ ledger, loading }: AccountabilityTabProps) {
  const [tierFilter, setTierFilter] = useState<string>('all');

  if (loading) return <SkeletonList count={4} />;
  if (!ledger || ledger.entries.length === 0) {
    return <EmptyState title="No claims scored" message="No accountability data available yet." />;
  }

  const entries = ledger.entries;
  const filtered = tierFilter === 'all'
    ? entries
    : entries.filter((e) => e.tier === tierFilter);

  // Tier summary counts
  const tierCounts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.tier] = (acc[e.tier] || 0) + 1;
    return acc;
  }, {});

  return (
    <View style={styles.container}>
      {/* Tier summary */}
      <View style={styles.summaryRow}>
        {Object.entries(TIER_CONFIG).map(([tier, cfg]) => {
          const count = tierCounts[tier] || 0;
          return (
            <TouchableOpacity
              key={tier}
              style={styles.summaryItem}
              onPress={() => setTierFilter(tier === tierFilter ? 'all' : tier)}
            >
              <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
              <Text style={[styles.summaryCount, { color: cfg.color }]}>{count}</Text>
              <Text style={styles.summaryLabel}>{cfg.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Filter pills */}
      <View style={{ marginBottom: 10 }}>
        <FilterPillGroup options={TIER_FILTERS} selected={tierFilter} onSelect={setTierFilter} />
      </View>

      <Text style={styles.resultCount}>{filtered.length} claims</Text>

      {/* Claims list */}
      {filtered.map((entry) => (
        <ClaimCard key={entry.id} entry={entry} />
      ))}
    </View>
  );
}

function ClaimCard({ entry }: { entry: LedgerEntry }) {
  const [expanded, setExpanded] = useState(false);
  const tierCfg = TIER_CONFIG[entry.tier] || TIER_CONFIG.none;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        <View style={[styles.tierBadge, { backgroundColor: tierCfg.color + '15' }]}>
          <Ionicons name={tierCfg.icon as any} size={12} color={tierCfg.color} />
          <Text style={[styles.tierText, { color: tierCfg.color }]}>{tierCfg.label}</Text>
        </View>
        {entry.policy_area && (
          <View style={styles.policyBadge}>
            <Text style={styles.policyText}>{entry.policy_area}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {entry.score != null && (
          <Text style={styles.scoreText}>{entry.score.toFixed(1)}</Text>
        )}
      </View>

      <Text style={styles.claimText} numberOfLines={expanded ? undefined : 3}>
        {entry.normalized_text}
      </Text>

      <View style={styles.cardMeta}>
        {entry.claim_date && (
          <Text style={styles.metaText}>{entry.claim_date}</Text>
        )}
        {entry.intent_type && (
          <Text style={styles.metaText}>{entry.intent_type.replace(/_/g, ' ')}</Text>
        )}
        {entry.matched_bill_id && (
          <Text style={[styles.metaText, { color: UI_COLORS.ACCENT }]}>
            {entry.matched_bill_id}
          </Text>
        )}
      </View>

      {expanded && entry.why && entry.why.length > 0 && (
        <View style={styles.whySection}>
          <Text style={styles.whyTitle}>Why this rating:</Text>
          {entry.why.map((reason, idx) => (
            <View key={idx} style={styles.whyRow}>
              <Text style={styles.whyBullet}>-</Text>
              <Text style={styles.whyText}>{reason}</Text>
            </View>
          ))}
        </View>
      )}

      {expanded && entry.source_url && (
        <TouchableOpacity
          style={styles.sourceRow}
          onPress={() => Linking.openURL(entry.source_url)}
        >
          <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
          <Text style={styles.sourceText}>View source</Text>
        </TouchableOpacity>
      )}

      <View style={styles.expandHint}>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={UI_COLORS.TEXT_MUTED}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 8 },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
  },
  summaryItem: { alignItems: 'center', gap: 2 },
  summaryCount: { fontSize: 18, fontWeight: '800' },
  summaryLabel: { fontSize: 10, fontWeight: '600', color: UI_COLORS.TEXT_MUTED },
  resultCount: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, marginBottom: 8 },
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  tierBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  tierText: { fontSize: 11, fontWeight: '700' },
  policyBadge: {
    backgroundColor: UI_COLORS.SECONDARY_BG, paddingHorizontal: 8,
    paddingVertical: 3, borderRadius: 6,
  },
  policyText: { fontSize: 10, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  scoreText: { fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  claimText: { fontSize: 13, color: UI_COLORS.TEXT_PRIMARY, lineHeight: 19 },
  cardMeta: { flexDirection: 'row', gap: 12, marginTop: 8 },
  metaText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  whySection: {
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: UI_COLORS.BORDER_LIGHT,
  },
  whyTitle: { fontSize: 11, fontWeight: '700', color: UI_COLORS.TEXT_SECONDARY, marginBottom: 4 },
  whyRow: { flexDirection: 'row', gap: 6, marginBottom: 2 },
  whyBullet: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  whyText: { fontSize: 11, color: UI_COLORS.TEXT_SECONDARY, flex: 1 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  sourceText: { fontSize: 11, fontWeight: '600', color: UI_COLORS.ACCENT },
  expandHint: { alignItems: 'center', marginTop: 4 },
});
