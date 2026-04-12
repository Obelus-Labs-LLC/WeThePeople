import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { UI_COLORS, PARTY_COLORS } from '../constants/colors';
import { EmptyState, PartyBadge, ChamberBadge } from '../components/ui';

import { API_BASE } from '../api/client';
const ACCENT = '#10B981';

interface Representative {
  id: string;
  name: string;
  role: string;
  party: string;
  chamber: string;
  photo_url?: string;
  recent_trades?: number;
  top_donors?: string;
  [key: string]: any;
}

interface RepResponse {
  zip: string;
  state: string;
  representatives: Representative[];
}

export default function ZipLookupScreen() {
  const navigation = useNavigation<any>();
  const [zip, setZip] = useState('');
  const [result, setResult] = useState<RepResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    const cleaned = zip.trim();
    if (!/^\d{5}$/.test(cleaned)) {
      setError('Please enter a valid 5-digit ZIP code.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    setSearched(true);
    try {
      const res = await fetch(`${API_BASE}/representatives?zip=${cleaned}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RepResponse = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'Failed to look up representatives');
    } finally {
      setLoading(false);
    }
  }, [zip]);

  const partyColor = (party: string) => {
    const letter = party?.charAt(0).toUpperCase() || '?';
    return PARTY_COLORS[letter] || PARTY_COLORS[party] || '#6B7280';
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Hero */}
      <LinearGradient
        colors={['#10B981', '#059669', '#047857']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="location" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Find Your Reps</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Enter your ZIP code to see your congressional representatives, their trades, and top donors.
          </Text>
        </View>
      </LinearGradient>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchRow}>
          <View style={styles.inputWrap}>
            <Ionicons name="search" size={18} color={UI_COLORS.TEXT_MUTED} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.input}
              placeholder="Enter ZIP code"
              placeholderTextColor={UI_COLORS.TEXT_MUTED}
              value={zip}
              onChangeText={setZip}
              keyboardType="number-pad"
              maxLength={5}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
          </View>
          <TouchableOpacity
            style={[styles.searchBtn, loading && { opacity: 0.6 }]}
            onPress={handleSearch}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.searchBtnText}>Search</Text>
            )}
          </TouchableOpacity>
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      {/* Results */}
      {result && (
        <View style={styles.section}>
          <View style={[styles.sectionTitleRow, { marginBottom: 12 }]}>
            <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
            <Text style={styles.sectionTitle}>
              Representatives for {result.zip}
              {result.state ? `, ${result.state}` : ''}
            </Text>
          </View>

          {result.representatives.length === 0 ? (
            <EmptyState title="No Representatives" message="No representatives found for this ZIP code." />
          ) : (
            result.representatives.map((rep, idx) => (
              <TouchableOpacity
                key={rep.id || `rep-${idx}`}
                style={styles.repCard}
                activeOpacity={0.8}
                onPress={() => {
                  if (rep.id) {
                    navigation.navigate('PersonDetail', { person_id: rep.id });
                  }
                }}
              >
                {/* Color stripe on left */}
                <View style={[styles.repStripe, { backgroundColor: partyColor(rep.party) }]} />

                <View style={styles.repContent}>
                  {/* Name + badges */}
                  <View style={styles.repHeader}>
                    <Text style={styles.repName} numberOfLines={1}>{rep.name}</Text>
                    <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
                  </View>

                  <View style={styles.badgeRow}>
                    <PartyBadge party={rep.party} />
                    {rep.chamber && <ChamberBadge chamber={rep.chamber} />}
                  </View>

                  {rep.role && (
                    <Text style={styles.roleText}>{rep.role}</Text>
                  )}

                  {/* Stats row */}
                  <View style={styles.repStats}>
                    {rep.recent_trades != null && (
                      <View style={styles.repStatItem}>
                        <Ionicons name="trending-up" size={13} color={UI_COLORS.TEXT_MUTED} />
                        <Text style={styles.repStatText}>
                          {rep.recent_trades} recent trade{rep.recent_trades !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    )}
                    {rep.top_donors && (
                      <View style={styles.repStatItem}>
                        <Ionicons name="cash-outline" size={13} color={UI_COLORS.TEXT_MUTED} />
                        <Text style={styles.repStatText} numberOfLines={1}>
                          Top: {rep.top_donors}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      {/* Empty pre-search state */}
      {!searched && !loading && (
        <View style={styles.preSearchWrap}>
          <Ionicons name="map-outline" size={48} color={UI_COLORS.BORDER} />
          <Text style={styles.preSearchTitle}>Look Up Your Representatives</Text>
          <Text style={styles.preSearchSub}>Enter a 5-digit ZIP code above to get started.</Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Data: Google Civic Information API &middot; Congress.gov</Text>
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
  // Search
  searchSection: { paddingHorizontal: 16, marginTop: 16, marginBottom: 8 },
  searchRow: { flexDirection: 'row', gap: 10 },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12,
    paddingHorizontal: 14, borderWidth: 1, borderColor: UI_COLORS.BORDER,
    height: 48,
  },
  input: {
    flex: 1, fontSize: 16, color: UI_COLORS.TEXT_PRIMARY, fontWeight: '600',
  },
  searchBtn: {
    backgroundColor: ACCENT, borderRadius: 12, paddingHorizontal: 20,
    justifyContent: 'center', alignItems: 'center', height: 48,
  },
  searchBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  errorText: { color: '#DC2626', fontSize: 12, fontWeight: '600', marginTop: 8 },
  // Results section
  section: { paddingHorizontal: 16, marginTop: 12, marginBottom: 16 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accentBar: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  // Rep card
  repCard: {
    flexDirection: 'row', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12,
    marginBottom: 8, borderWidth: 1, borderColor: UI_COLORS.BORDER, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  repStripe: { width: 4 },
  repContent: { flex: 1, padding: 14 },
  repHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  repName: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, flex: 1, marginRight: 8 },
  badgeRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  roleText: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, marginBottom: 6 },
  repStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 4 },
  repStatItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  repStatText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  // Pre-search
  preSearchWrap: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  preSearchTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginTop: 16 },
  preSearchSub: { fontSize: 13, color: UI_COLORS.TEXT_MUTED, textAlign: 'center', marginTop: 6 },
  // Footer
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
});
