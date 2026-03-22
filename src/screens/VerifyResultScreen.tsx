import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS, TIER_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { LoadingSpinner } from '../components/ui';

interface VerifyResultScreenProps {
  route?: any;
  navigation?: any;
}

function tierLabel(tier: string | null): string {
  if (tier === 'strong') return 'Strong';
  if (tier === 'moderate') return 'Moderate';
  if (tier === 'weak') return 'Weak';
  return 'Unverified';
}

const EVIDENCE_ICONS: Record<string, string> = {
  bill: 'document-text',
  vote: 'checkmark-circle',
  trade: 'trending-up',
  contract: 'briefcase',
  enforcement: 'shield',
  donation: 'cash',
};

export default function VerifyResultScreen({ route, navigation }: VerifyResultScreenProps) {
  const { id } = route?.params || {};
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiClient.getVerificationDetail(id)
      .then(setData)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSpinner message="Loading verification..." />;

  if (error || !data) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="shield-checkmark-outline" size={48} color={UI_COLORS.TEXT_MUTED} />
        <Text style={styles.errorTitle}>Verification Not Found</Text>
        <Text style={styles.errorText}>{error || 'This verification does not exist.'}</Text>
      </View>
    );
  }

  const tier = data.evaluation?.tier || 'none';
  const color = TIER_COLORS[tier] || TIER_COLORS.none;
  const evidence = data.evaluation?.evidence || [];
  const why = data.evaluation?.why || [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Tier badge + score */}
      <View style={styles.headerRow}>
        <View style={[styles.tierBadgeLg, { backgroundColor: color + '20' }]}>
          <View style={[styles.tierDotLg, { backgroundColor: color }]} />
          <Text style={[styles.tierTextLg, { color }]}>{tierLabel(tier)}</Text>
        </View>
        {data.evaluation?.score != null && (
          <View style={styles.scoreBox}>
            <Text style={styles.scoreValue}>{Math.round(data.evaluation.score * 100)}%</Text>
            <Text style={styles.scoreLabel}>Match</Text>
          </View>
        )}
      </View>

      {/* Claim text */}
      <View style={styles.quoteBox}>
        <View style={styles.quoteBorder} />
        <Text style={styles.claimText}>{data.text}</Text>
      </View>

      {/* Meta */}
      <View style={styles.metaRow}>
        {data.entity_name && (
          <View style={styles.metaItem}>
            <Ionicons name="person" size={12} color={UI_COLORS.TEXT_MUTED} />
            <Text style={styles.metaText}>{data.entity_name}</Text>
          </View>
        )}
        {data.category && (
          <View style={styles.metaItem}>
            <Ionicons name="pricetag" size={12} color={UI_COLORS.TEXT_MUTED} />
            <Text style={styles.metaText}>{data.category}</Text>
          </View>
        )}
        {data.source_url && (
          <TouchableOpacity
            style={styles.metaItem}
            onPress={() => Linking.openURL(data.source_url)}
          >
            <Ionicons name="open" size={12} color="#3B82F6" />
            <Text style={[styles.metaText, { color: '#3B82F6' }]}>Source</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Scores grid */}
      {data.evaluation && (
        <View style={styles.scoresGrid}>
          {[
            { label: 'Relevance', val: data.evaluation.relevance },
            { label: 'Progress', val: data.evaluation.progress },
            { label: 'Timing', val: data.evaluation.timing },
            { label: 'Overall', val: data.evaluation.score },
          ].map((m) => (
            <View key={m.label} style={styles.scoreCard}>
              <Text style={styles.scoreCardValue}>
                {m.val != null ? `${Math.round(m.val * 100)}%` : '-'}
              </Text>
              <Text style={styles.scoreCardLabel}>{m.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Analysis */}
      {why.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Analysis</Text>
          {why.map((reason: string, i: number) => (
            <Text key={i} style={styles.whyText}>{reason}</Text>
          ))}
        </View>
      )}

      {/* Evidence */}
      {evidence.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Evidence ({evidence.length})</Text>
          {evidence.map((ev: any, i: number) => {
            const iconName = (EVIDENCE_ICONS[ev.type] || 'document') as any;
            return (
              <View key={i} style={styles.evidenceCard}>
                <View style={styles.evidenceHeader}>
                  <Ionicons name={iconName} size={14} color="#10B981" />
                  <Text style={styles.evidenceType}>{ev.type}</Text>
                  {ev.match_score != null && (
                    <Text style={styles.evidenceScore}>{Math.round(ev.match_score * 100)}%</Text>
                  )}
                </View>
                {ev.title && <Text style={styles.evidenceTitle}>{ev.title}</Text>}
                {ev.description && (
                  <Text style={styles.evidenceDesc} numberOfLines={3}>{ev.description}</Text>
                )}
                <View style={styles.evidenceMeta}>
                  {ev.date && <Text style={styles.evidenceMetaText}>{ev.date}</Text>}
                  {ev.amount != null && (
                    <Text style={styles.evidenceMetaText}>${ev.amount.toLocaleString()}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.PRIMARY_BG,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: UI_COLORS.PRIMARY_BG,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: UI_COLORS.TEXT_PRIMARY,
  },
  errorText: {
    fontSize: 13,
    color: UI_COLORS.TEXT_MUTED,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  tierBadgeLg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tierDotLg: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tierTextLg: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scoreBox: {
    alignItems: 'flex-end',
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: '800',
    color: UI_COLORS.TEXT_PRIMARY,
    fontVariant: ['tabular-nums'],
  },
  scoreLabel: {
    fontSize: 10,
    color: UI_COLORS.TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quoteBox: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  quoteBorder: {
    width: 3,
    backgroundColor: '#10B981' + '60',
    borderRadius: 2,
    marginRight: 12,
  },
  claimText: {
    flex: 1,
    fontSize: 15,
    color: UI_COLORS.TEXT_PRIMARY,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: UI_COLORS.TEXT_MUTED,
  },
  scoresGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  scoreCard: {
    flex: 1,
    backgroundColor: UI_COLORS.CARD_BG_ELEVATED,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  scoreCardValue: {
    fontSize: 16,
    fontWeight: '800',
    color: UI_COLORS.TEXT_PRIMARY,
    fontVariant: ['tabular-nums'],
  },
  scoreCardLabel: {
    fontSize: 9,
    color: UI_COLORS.TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  whyText: {
    fontSize: 13,
    color: UI_COLORS.TEXT_SECONDARY,
    lineHeight: 19,
    marginBottom: 6,
  },
  evidenceCard: {
    backgroundColor: UI_COLORS.CARD_BG_ELEVATED,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  evidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  evidenceType: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  evidenceScore: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10B981',
    fontVariant: ['tabular-nums'],
  },
  evidenceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: UI_COLORS.TEXT_PRIMARY,
    marginBottom: 4,
  },
  evidenceDesc: {
    fontSize: 12,
    color: UI_COLORS.TEXT_SECONDARY,
    lineHeight: 17,
  },
  evidenceMeta: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  evidenceMetaText: {
    fontSize: 11,
    color: UI_COLORS.TEXT_MUTED,
    fontVariant: ['tabular-nums'],
  },
});
