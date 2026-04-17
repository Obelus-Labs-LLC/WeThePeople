import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Linking,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { BillDetail } from '../api/types';
import { LoadingSpinner } from '../components/ui';

const STATUS_COLORS: Record<string, string> = {
  introduced: '#6B7280',
  in_committee: '#3B82F6',
  passed_house: '#8B5CF6',
  passed_senate: '#8B5CF6',
  passed_both: '#10B981',
  sent_to_president: '#F59E0B',
  became_law: '#059669',
  vetoed: '#DC2626',
  failed: '#9CA3AF',
};

export default function BillScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const billId: string = route.params?.bill_id;

  const [bill, setBill] = useState<BillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!billId) return;
    setLoading(true);
    apiClient.getBillDetail(billId)
      .then((res) => {
        setBill(res);
        navigation.setOptions({ title: res.title?.slice(0, 40) || billId.toUpperCase() });
      })
      .catch((err) => setError(err.message || 'Failed to load bill'))
      .finally(() => setLoading(false));
  }, [billId, navigation]);

  if (loading) return <LoadingSpinner message="Loading bill..." />;
  if (error || !bill) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={40} color="#DC2626" />
        <Text style={styles.errorText}>{error || 'Bill not found'}</Text>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[bill.status_bucket || ''] || '#6B7280';
  const statusLabel = (bill.status_bucket || 'unknown').replace(/_/g, ' ');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header card */}
      <View style={styles.card}>
        <View style={styles.billIdRow}>
          <Text style={styles.billIdText}>{bill.bill_id.toUpperCase()}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        <Text style={styles.titleText}>{bill.title || 'Untitled Bill'}</Text>

        <View style={styles.metaRow}>
          {bill.policy_area && (
            <View style={styles.metaTag}>
              <Ionicons name="pricetag-outline" size={11} color={UI_COLORS.ACCENT} />
              <Text style={styles.metaTagText}>{bill.policy_area}</Text>
            </View>
          )}
          {bill.introduced_date && (
            <View style={styles.metaTag}>
              <Ionicons name="calendar-outline" size={11} color={UI_COLORS.TEXT_MUTED} />
              <Text style={styles.metaTagText}>
                Introduced {new Date(bill.introduced_date).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>

        {bill.sponsors && bill.sponsors.length > 0 && (
          <View style={styles.sponsorList}>
            {bill.sponsors.slice(0, 6).map((s, i) => {
              const label = s.role === 'sponsor' ? 'Sponsor' : 'Cosponsor';
              const trailing = [s.party, s.state].filter(Boolean).join('-');
              const content = (
                <View style={styles.sponsorLink}>
                  <Ionicons name="person-outline" size={13} color={UI_COLORS.ACCENT} />
                  <Text style={styles.sponsorText} numberOfLines={1}>
                    {label}: {s.display_name}
                    {trailing ? ` (${trailing})` : ''}
                  </Text>
                  {s.person_id && (
                    <Ionicons name="chevron-forward" size={12} color={UI_COLORS.ACCENT} />
                  )}
                </View>
              );
              return s.person_id ? (
                <TouchableOpacity
                  key={`${s.bioguide_id}-${i}`}
                  onPress={() => navigation.navigate('PersonDetail', { person_id: s.person_id })}
                >
                  {content}
                </TouchableOpacity>
              ) : (
                <View key={`${s.bioguide_id}-${i}`}>{content}</View>
              );
            })}
            {bill.sponsors.length > 6 && (
              <Text style={styles.moreSponsorsText}>+{bill.sponsors.length - 6} more cosponsors</Text>
            )}
          </View>
        )}
      </View>

      {/* Summary card */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Ionicons name="document-text-outline" size={16} color={UI_COLORS.ACCENT} />
          <Text style={styles.sectionTitle}>Summary</Text>
          {bill.is_enriched && (
            <View style={styles.enrichedBadge}>
              <Ionicons name="checkmark-circle" size={12} color="#10B981" />
              <Text style={styles.enrichedText}>Enriched</Text>
            </View>
          )}
        </View>

        {bill.summary_text ? (
          <>
            <Text style={styles.summaryText}>{bill.summary_text}</Text>
            {bill.summary_date && (
              <Text style={styles.summaryDate}>
                Summary updated: {bill.summary_date.slice(0, 10)}
              </Text>
            )}
          </>
        ) : (
          <View style={styles.noSummary}>
            <Ionicons name="hourglass-outline" size={20} color={UI_COLORS.TEXT_MUTED} />
            <Text style={styles.noSummaryText}>
              Summary not yet available. CRS summaries are added as bills progress through Congress.
            </Text>
          </View>
        )}
      </View>

      {/* Latest action */}
      {(bill.latest_action_text || bill.latest_action_date) && (
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="time-outline" size={16} color={UI_COLORS.ACCENT} />
            <Text style={styles.sectionTitle}>Latest Action</Text>
          </View>
          {bill.latest_action_date && (
            <Text style={styles.latestDate}>
              {new Date(bill.latest_action_date).toLocaleDateString()}
            </Text>
          )}
          {bill.latest_action_text && (
            <Text style={styles.latestText}>{bill.latest_action_text}</Text>
          )}
        </View>
      )}

      {/* Full text link (or fall back to congress.gov) */}
      {(bill.full_text_url || bill.congress_url) && (
        <TouchableOpacity
          style={styles.fullTextBtn}
          onPress={() => Linking.openURL((bill.full_text_url || bill.congress_url)!)}
        >
          <Ionicons name="reader-outline" size={18} color="#fff" />
          <Text style={styles.fullTextBtnText}>Read Full Text</Text>
          <Ionicons name="open-outline" size={14} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Timeline (first 5 actions) */}
      {bill.timeline && bill.timeline.length > 0 && (
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="list-outline" size={16} color={UI_COLORS.ACCENT} />
            <Text style={styles.sectionTitle}>Timeline</Text>
          </View>
          {bill.timeline.slice(0, 5).map((a, i) => (
            <View key={i} style={styles.timelineRow}>
              {a.action_date && (
                <Text style={styles.timelineDate}>
                  {new Date(a.action_date).toLocaleDateString()}
                </Text>
              )}
              {a.action_text && (
                <Text style={styles.timelineText} numberOfLines={3}>{a.action_text}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Source links */}
      {bill.source_urls && bill.source_urls.length > 0 && (
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="link-outline" size={16} color={UI_COLORS.ACCENT} />
            <Text style={styles.sectionTitle}>Sources</Text>
          </View>
          {bill.source_urls.map((url, i) => (
            <TouchableOpacity key={i} onPress={() => Linking.openURL(url)} style={styles.sourceRow}>
              <Text style={styles.sourceUrl} numberOfLines={1}>{url}</Text>
              <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  content: { padding: 16, paddingBottom: 40 },

  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: UI_COLORS.BORDER, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },

  billIdRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  billIdText: {
    fontSize: 14, fontWeight: '800', color: UI_COLORS.TEXT_MUTED,
    letterSpacing: 0.5,
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  titleText: {
    fontSize: 17, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY,
    lineHeight: 23, marginBottom: 10,
  },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  metaTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: UI_COLORS.SECONDARY_BG, paddingHorizontal: 8,
    paddingVertical: 4, borderRadius: 6,
  },
  metaTagText: { fontSize: 11, color: UI_COLORS.TEXT_SECONDARY, fontWeight: '600' },

  sponsorList: { gap: 6 },
  sponsorLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: UI_COLORS.ACCENT_LIGHT, paddingHorizontal: 12,
    paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start',
  },
  sponsorText: {
    color: UI_COLORS.ACCENT, fontSize: 12, fontWeight: '600',
  },
  moreSponsorsText: {
    fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2,
  },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, flex: 1 },

  enrichedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#10B98115', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 10,
  },
  enrichedText: { fontSize: 10, fontWeight: '600', color: '#10B981' },

  summaryText: {
    fontSize: 14, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 21,
  },
  summaryDate: {
    fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 8, fontStyle: 'italic',
  },

  noSummary: {
    alignItems: 'center', gap: 8, paddingVertical: 16,
  },
  noSummaryText: {
    fontSize: 13, color: UI_COLORS.TEXT_MUTED, textAlign: 'center', lineHeight: 19,
  },

  latestDate: {
    fontSize: 13, color: UI_COLORS.TEXT_SECONDARY, fontWeight: '600',
  },
  latestText: {
    fontSize: 13, color: UI_COLORS.TEXT_SECONDARY, marginTop: 4, lineHeight: 19,
  },
  timelineRow: {
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER,
  },
  timelineDate: {
    fontSize: 11, color: UI_COLORS.TEXT_MUTED, fontWeight: '700', marginBottom: 3,
  },
  timelineText: {
    fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 17,
  },

  fullTextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: UI_COLORS.ACCENT, borderRadius: 12,
    paddingVertical: 14, marginBottom: 12,
  },
  fullTextBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  sourceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6,
  },
  sourceUrl: {
    flex: 1, fontSize: 12, color: UI_COLORS.ACCENT,
  },

  errorContainer: {
    flex: 1, backgroundColor: UI_COLORS.PRIMARY_BG, justifyContent: 'center',
    alignItems: 'center', gap: 12, padding: 32,
  },
  errorText: { color: '#DC2626', fontSize: 14 },
});
