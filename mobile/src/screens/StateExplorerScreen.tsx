import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS, PARTY_COLORS } from '../constants/colors';
import { EmptyState } from '../components/ui';

import { apiClient } from '../api/client';
const ACCENT = '#1E40AF';

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
] as const;

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

interface StateDetail {
  state_code: string;
  total_legislators: number;
  recent_bills: number;
  party_breakdown: Record<string, number>;
  legislators?: Array<{ name: string; party: string; chamber: string; role?: string }>;
  bills?: Array<{ bill_id: string; title: string; status?: string }>;
}

export default function StateExplorerScreen() {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [detail, setDetail] = useState<StateDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStatePress = useCallback(async (code: string) => {
    if (selectedState === code && detail) {
      setSelectedState(null);
      setDetail(null);
      return;
    }
    setSelectedState(code);
    setDetail(null);
    setLoading(true);
    setError('');
    try {
      // The api StateDetail and the local StateDetail are different
      // shapes (the screen needs derived fields like state_code,
      // total_legislators, recent_bills, party_breakdown that the API
      // doesn't return directly). Cast through `unknown` to defuse the
      // TS2352 about non-overlapping types, then validate at runtime so
      // a shape change doesn't crash silently.
      const raw = (await apiClient.getStateDetail(code)) as unknown;
      if (!raw || typeof raw !== 'object') {
        throw new Error('Unexpected response shape from /states/{code}');
      }
      setDetail(raw as StateDetail);
    } catch (e: any) {
      setError(e.message || 'Failed to load state data');
    } finally {
      setLoading(false);
    }
  }, [selectedState, detail]);

  const partyColor = (party: string) => {
    const letter = party?.charAt(0).toUpperCase() || '?';
    return PARTY_COLORS[letter] || PARTY_COLORS[party] || '#6B7280';
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <LinearGradient
        colors={['#1E40AF', '#1D4ED8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="map" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>State Explorer</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Browse all 50 states to see legislators, recent bills, and party breakdowns.
          </Text>
        </View>
      </LinearGradient>

      {/* State Grid */}
      <View style={styles.gridSection}>
        <View style={styles.grid}>
          {STATES.map((code) => {
            const isSelected = selectedState === code;
            return (
              <TouchableOpacity
                key={code}
                style={[styles.stateCard, isSelected && styles.stateCardSelected]}
                activeOpacity={0.7}
                onPress={() => handleStatePress(code)}
              >
                <Text style={[styles.stateAbbr, isSelected && styles.stateAbbrSelected]}>
                  {code}
                </Text>
                <Text style={[styles.stateName, isSelected && styles.stateNameSelected]} numberOfLines={1}>
                  {STATE_NAMES[code]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Detail Section */}
      {selectedState && (
        <View style={styles.detailSection}>
          <View style={[styles.sectionTitleRow, { marginBottom: 12 }]}>
            <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
            <Text style={styles.sectionTitle}>
              {STATE_NAMES[selectedState]} ({selectedState})
            </Text>
          </View>

          {loading && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={ACCENT} />
              <Text style={styles.loadingText}>Loading state data...</Text>
            </View>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {detail && !loading && (
            <View>
              {/* Stats Row */}
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Ionicons name="people" size={18} color={ACCENT} />
                  <Text style={styles.statValue}>{detail.total_legislators ?? 0}</Text>
                  <Text style={styles.statLabel}>Legislators</Text>
                </View>
                <View style={styles.statBox}>
                  <Ionicons name="document-text" size={18} color="#10B981" />
                  <Text style={styles.statValue}>{detail.recent_bills ?? 0}</Text>
                  <Text style={styles.statLabel}>Recent Bills</Text>
                </View>
              </View>

              {/* Party Breakdown */}
              {detail.party_breakdown && Object.keys(detail.party_breakdown).length > 0 && (
                <View style={styles.partySection}>
                  <Text style={styles.subSectionTitle}>Party Breakdown</Text>
                  <View style={styles.partyRow}>
                    {Object.entries(detail.party_breakdown).map(([party, count]) => (
                      <View key={party} style={styles.partyChip}>
                        <View style={[styles.partyDot, { backgroundColor: partyColor(party) }]} />
                        <Text style={styles.partyChipText}>
                          {party}: {count}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Legislators List */}
              {detail.legislators && detail.legislators.length > 0 && (
                <View style={styles.listSection}>
                  <Text style={styles.subSectionTitle}>Legislators</Text>
                  {detail.legislators.map((leg, idx) => (
                    <View key={`leg-${idx}`} style={styles.listItem}>
                      <View style={[styles.listStripe, { backgroundColor: partyColor(leg.party) }]} />
                      <View style={styles.listContent}>
                        <Text style={styles.listName}>{leg.name}</Text>
                        <Text style={styles.listSub}>
                          {leg.party} · {leg.chamber}{leg.role ? ` · ${leg.role}` : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Bills List */}
              {detail.bills && detail.bills.length > 0 && (
                <View style={styles.listSection}>
                  <Text style={styles.subSectionTitle}>Recent Bills</Text>
                  {detail.bills.slice(0, 10).map((bill, idx) => (
                    <View key={`bill-${idx}`} style={styles.billItem}>
                      <View style={styles.billIdWrap}>
                        <Text style={styles.billId}>{bill.bill_id}</Text>
                      </View>
                      <Text style={styles.billTitle} numberOfLines={2}>{bill.title}</Text>
                      {bill.status && (
                        <Text style={styles.billStatus}>{bill.status}</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Empty fallback */}
              {(!detail.legislators || detail.legislators.length === 0) &&
               (!detail.bills || detail.bills.length === 0) &&
               detail.total_legislators === 0 && detail.recent_bills === 0 && (
                <EmptyState title="No Data Available" message={`No detailed data available for ${STATE_NAMES[selectedState]} yet.`} />
              )}
            </View>
          )}
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Data: Congress.gov · OpenStates</Text>
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
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19 },
  // Grid
  gridSection: { paddingHorizontal: 16, marginTop: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stateCard: {
    width: '48%' as any,
    flexBasis: '48%' as any,
    flexGrow: 0,
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  stateCardSelected: {
    borderColor: ACCENT,
    borderWidth: 2,
    backgroundColor: '#EFF6FF',
  },
  stateAbbr: {
    fontSize: 24, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 2,
  },
  stateAbbrSelected: { color: ACCENT },
  stateName: {
    fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, fontWeight: '500', textAlign: 'center',
  },
  stateNameSelected: { color: ACCENT },
  // Detail
  detailSection: {
    paddingHorizontal: 16, marginTop: 20, marginBottom: 8,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accentBar: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  loadingWrap: { alignItems: 'center', paddingVertical: 32 },
  loadingText: { marginTop: 12, color: UI_COLORS.TEXT_MUTED, fontSize: 14 },
  errorText: { color: '#DC2626', fontSize: 12, fontWeight: '600', marginTop: 8 },
  // Stats
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statBox: {
    flex: 1, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 16,
    alignItems: 'center', borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  statValue: { fontSize: 28, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY, marginTop: 6 },
  statLabel: { fontSize: 11, fontWeight: '600', color: UI_COLORS.TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  // Party
  partySection: { marginBottom: 16 },
  subSectionTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 10 },
  partyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  partyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  partyDot: { width: 8, height: 8, borderRadius: 4 },
  partyChipText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  // Legislators list
  listSection: { marginBottom: 16 },
  listItem: {
    flexDirection: 'row', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10,
    marginBottom: 6, borderWidth: 1, borderColor: UI_COLORS.BORDER, overflow: 'hidden',
  },
  listStripe: { width: 4 },
  listContent: { flex: 1, padding: 12 },
  listName: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  listSub: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, marginTop: 2 },
  // Bills list
  billItem: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  billIdWrap: {
    backgroundColor: '#EFF6FF', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
    alignSelf: 'flex-start', marginBottom: 6,
  },
  billId: { fontSize: 11, fontWeight: '700', color: ACCENT },
  billTitle: { fontSize: 13, fontWeight: '500', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 18 },
  billStatus: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 4 },
  // Footer
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
});
