import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { Company, FDAAdverseEvent, FDARecall } from '../api/types';
import { LoadingSpinner, EmptyState } from '../components/ui';
import SearchBar from '../components/SearchBar';
import SectionHeader from '../components/SectionHeader';

interface DrugResult {
  company: Company;
  adverseEvents: FDAAdverseEvent[];
  adverseTotal: number;
  recalls: FDARecall[];
  recallTotal: number;
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  'Class I': '#DC2626',
  'Class II': '#F59E0B',
  'Class III': '#10B981',
};

export default function DrugLookupScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DrugResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      // Search for matching health companies
      const companiesRes = await apiClient.getCompanies({ q: q.trim(), limit: 10 });
      const companies = companiesRes.companies || [];

      if (companies.length === 0) {
        setResults([]);
        setLoading(false);
        return;
      }

      // Fetch adverse events and recalls for each matching company
      const fetches = companies.slice(0, 5).map(async (company) => {
        const [aeRes, recallRes] = await Promise.all([
          apiClient.getCompanyAdverseEvents(company.company_id, { limit: 5 }).catch(() => ({ total: 0, adverse_events: [] } as any)),
          apiClient.getCompanyRecalls(company.company_id, { limit: 5 }).catch(() => ({ total: 0, recalls: [] } as any)),
        ]);
        return {
          company,
          adverseEvents: aeRes.adverse_events || [],
          adverseTotal: aeRes.total || 0,
          recalls: recallRes.recalls || [],
          recallTotal: recallRes.total || 0,
        };
      });

      const drugResults = await Promise.all(fetches);
      // Sort by total events (most relevant first)
      drugResults.sort((a, b) => (b.adverseTotal + b.recallTotal) - (a.adverseTotal + a.recallTotal));
      setResults(drugResults);
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = async () => {
    if (!query.trim()) return;
    setRefreshing(true);
    try { await doSearch(query); } catch {}
    setRefreshing(false);
  };

  const renderResult = ({ item }: { item: DrugResult }) => (
    <View style={styles.resultCard}>
      {/* Company header */}
      <View style={styles.companyHeader}>
        <View style={styles.companyIcon}>
          <Ionicons name="medkit-outline" size={18} color="#E11D48" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.companyName}>{item.company.display_name}</Text>
          {item.company.ticker && (
            <Text style={styles.companyTicker}>{item.company.ticker}</Text>
          )}
        </View>
      </View>

      {/* Adverse Events */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="warning-outline" size={14} color="#DC2626" />
          <Text style={styles.sectionTitle}>Adverse Events</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{item.adverseTotal.toLocaleString()}</Text>
          </View>
        </View>
        {item.adverseEvents.length > 0 ? (
          item.adverseEvents.map((ae) => (
            <View key={ae.id} style={styles.eventRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventDrug} numberOfLines={1}>{ae.drug_name || 'Unknown drug'}</Text>
                <Text style={styles.eventReaction} numberOfLines={1}>{ae.reaction || '—'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.eventDate}>{ae.receive_date || '—'}</Text>
                {ae.outcome && (
                  <Text style={[styles.eventOutcome, ae.serious === 1 && { color: '#DC2626' }]} numberOfLines={1}>
                    {ae.outcome}
                  </Text>
                )}
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.noneText}>No adverse events on record</Text>
        )}
      </View>

      {/* Recalls */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="alert-circle-outline" size={14} color="#F59E0B" />
          <Text style={styles.sectionTitle}>Recalls</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{item.recallTotal.toLocaleString()}</Text>
          </View>
        </View>
        {item.recalls.length > 0 ? (
          item.recalls.map((recall) => {
            const classColor = CLASSIFICATION_COLORS[recall.classification || ''] || '#6B7280';
            return (
              <View key={recall.id} style={styles.eventRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventDrug} numberOfLines={2}>
                    {recall.product_description || 'Unknown product'}
                  </Text>
                  {recall.reason_for_recall && (
                    <Text style={styles.eventReaction} numberOfLines={1}>{recall.reason_for_recall}</Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {recall.classification && (
                    <View style={[styles.classBadge, { backgroundColor: classColor + '15', borderColor: classColor + '30' }]}>
                      <Text style={[styles.classText, { color: classColor }]}>{recall.classification}</Text>
                    </View>
                  )}
                  <Text style={styles.eventDate}>{recall.recall_initiation_date || '—'}</Text>
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.noneText}>No recalls on record</Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <SearchBar
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          doSearch(text);
        }}
        placeholder="Search by drug or company name..."
        debounceMs={500}
      />

      {loading ? (
        <LoadingSpinner message="Searching..." />
      ) : error ? (
        <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
      ) : !searched ? (
        <View style={styles.promptContainer}>
          <Ionicons name="search-outline" size={48} color={UI_COLORS.BORDER} />
          <Text style={styles.promptTitle}>Drug Lookup</Text>
          <Text style={styles.promptText}>
            Search for a drug name or pharmaceutical company to see adverse events and recalls.
          </Text>
        </View>
      ) : results.length === 0 ? (
        <EmptyState title="No results found" message="Try a different drug or company name." />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(r) => r.company.company_id}
          renderItem={renderResult}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG, paddingHorizontal: 16, paddingTop: 12 },
  listContent: { paddingTop: 12, paddingBottom: 24 },
  resultCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  companyHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  companyIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#FEE2E215',
    justifyContent: 'center', alignItems: 'center',
  },
  companyName: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 16, fontWeight: '700' },
  companyTicker: { color: UI_COLORS.TEXT_MUTED, fontSize: 12, fontWeight: '600' },
  section: { marginTop: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sectionTitle: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 13, fontWeight: '700', flex: 1 },
  countBadge: {
    backgroundColor: UI_COLORS.ACCENT + '15', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  countText: { color: UI_COLORS.ACCENT, fontSize: 11, fontWeight: '700' },
  eventRow: {
    flexDirection: 'row', gap: 10, paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: UI_COLORS.BORDER_LIGHT,
  },
  eventDrug: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 13, fontWeight: '600' },
  eventReaction: { color: UI_COLORS.TEXT_MUTED, fontSize: 11, marginTop: 1 },
  eventDate: { color: UI_COLORS.TEXT_MUTED, fontSize: 10 },
  eventOutcome: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 10, marginTop: 1 },
  classBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, marginBottom: 2 },
  classText: { fontSize: 9, fontWeight: '700' },
  noneText: { color: UI_COLORS.TEXT_MUTED, fontSize: 12, fontStyle: 'italic', paddingVertical: 4 },
  promptContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 },
  promptTitle: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 18, fontWeight: '700', marginTop: 16 },
  promptText: { color: UI_COLORS.TEXT_MUTED, fontSize: 13, textAlign: 'center', marginTop: 8, maxWidth: 260 },
  errorBox: { padding: 24, alignItems: 'center' },
  errorText: { color: '#DC2626', fontSize: 14 },
});
