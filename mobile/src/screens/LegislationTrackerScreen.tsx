import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

const API_BASE = 'https://api.wethepeopleforus.com';
const ACCENT = '#4338CA';

interface Bill {
  id?: string;
  title: string;
  bill_type?: string;
  bill_number?: number | string;
  policy_area?: string;
  latest_action_text?: string;
  latest_action_date?: string;
  status_bucket?: string;
  sponsor_name?: string;
}

interface SearchResponse {
  results?: Bill[];
  bills?: Bill[];
}

const STATUS_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  introduced:    { color: '#6B7280', bg: '#6B728015', border: '#6B728030' },
  in_committee:  { color: '#7C3AED', bg: '#7C3AED15', border: '#7C3AED30' },
  passed_house:  { color: '#2563EB', bg: '#2563EB15', border: '#2563EB30' },
  passed_senate: { color: '#0891B2', bg: '#0891B215', border: '#0891B230' },
  passed_both:   { color: '#059669', bg: '#05966915', border: '#05966930' },
  signed:        { color: '#10B981', bg: '#10B98115', border: '#10B98130' },
  vetoed:        { color: '#DC2626', bg: '#DC262615', border: '#DC262630' },
  enacted:       { color: '#10B981', bg: '#10B98115', border: '#10B98130' },
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

function formatStatus(status: string): string {
  if (!status) return '';
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function LegislationTrackerScreen() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const doSearch = useCallback(async (query?: string) => {
    const q = (query ?? searchQuery).trim();
    if (!q) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}&type=bill`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SearchResponse = await res.json();
      setBills(data.results || data.bills || []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to search bills');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery]);

  const onRefresh = () => {
    if (!searchQuery.trim()) return;
    setRefreshing(true);
    doSearch();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      {/* Hero */}
      <LinearGradient
        colors={['#4338CA', '#3730A3']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="document-text" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Legislation Tracker</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Search bills and track their progress through Congress
          </Text>
          {hasSearched && (
            <View style={styles.heroStatRow}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{bills.length}</Text>
                <Text style={styles.heroStatLabel}>Results</Text>
              </View>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* Search Bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={UI_COLORS.TEXT_MUTED} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search bills by keyword..."
            placeholderTextColor={UI_COLORS.TEXT_MUTED}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => doSearch()}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setBills([]); setHasSearched(false); }}>
              <Ionicons name="close-circle" size={18} color={UI_COLORS.TEXT_MUTED} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={() => doSearch()} activeOpacity={0.8}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Results */}
      {loading ? (
        <LoadingSpinner message="Searching bills..." />
      ) : error ? (
        <EmptyState title="Error" message={error} />
      ) : (
        <View style={styles.section}>
          {hasSearched && (
            <View style={[styles.sectionTitleRow, { marginBottom: 12 }]}>
              <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
              <Text style={styles.sectionTitle}>Bills</Text>
            </View>
          )}

          {hasSearched && bills.length === 0 ? (
            <EmptyState title="No Bills Found" message="Try a different search term." />
          ) : (
            bills.map((bill, idx) => {
              const statusKey = (bill.status_bucket || '').toLowerCase().replace(/\s+/g, '_');
              const statusStyle = STATUS_COLORS[statusKey] || STATUS_COLORS.introduced;
              const billLabel = bill.bill_type && bill.bill_number
                ? `${bill.bill_type.toUpperCase()}. ${bill.bill_number}`
                : null;

              return (
                <View key={bill.id || `${bill.bill_type}-${bill.bill_number}-${idx}`} style={styles.card}>
                  {/* Bill number + status */}
                  <View style={styles.cardTopRow}>
                    {billLabel && (
                      <View style={[styles.badge, { backgroundColor: ACCENT + '15', borderColor: ACCENT + '30' }]}>
                        <Text style={[styles.badgeText, { color: ACCENT }]}>{billLabel}</Text>
                      </View>
                    )}
                    {bill.status_bucket && (
                      <View style={[styles.badge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
                        <Text style={[styles.badgeText, { color: statusStyle.color }]}>
                          {formatStatus(bill.status_bucket)}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Title */}
                  <Text style={styles.cardTitle} numberOfLines={3}>{bill.title}</Text>

                  {/* Policy area badge */}
                  {bill.policy_area ? (
                    <View style={[styles.badge, { backgroundColor: '#6B728015', borderColor: '#6B728030', marginBottom: 8 }]}>
                      <Text style={[styles.badgeText, { color: '#6B7280' }]}>{bill.policy_area}</Text>
                    </View>
                  ) : null}

                  {/* Latest action */}
                  {bill.latest_action_text ? (
                    <View style={styles.actionRow}>
                      <Ionicons name="arrow-forward-circle-outline" size={14} color={UI_COLORS.TEXT_SECONDARY} />
                      <Text style={styles.actionText} numberOfLines={2}>{bill.latest_action_text}</Text>
                    </View>
                  ) : null}

                  {/* Date */}
                  {bill.latest_action_date ? (
                    <View style={styles.bottomRow}>
                      <Text style={styles.dateText}>
                        <Ionicons name="calendar-outline" size={11} color={UI_COLORS.TEXT_MUTED} />
                        {'  '}{formatDate(bill.latest_action_date)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Data: Congress.gov / WeThePeople API</Text>
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
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, marginTop: 12,
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, paddingHorizontal: 12,
    height: 42, borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  searchInput: {
    flex: 1, fontSize: 14, color: UI_COLORS.TEXT_PRIMARY, paddingVertical: 0,
  },
  searchBtn: {
    backgroundColor: ACCENT, borderRadius: 10, paddingHorizontal: 16, height: 42,
    justifyContent: 'center', alignItems: 'center',
  },
  searchBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  section: { paddingHorizontal: 16, marginTop: 12, marginBottom: 16 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accentBar: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  cardTopRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 8, lineHeight: 21 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 8 },
  actionText: { flex: 1, fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 17 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
});
