import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Linking, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { EmptyState } from '../components/ui';
import SearchBar from '../components/SearchBar';

export default function FDAApprovalsScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text);
    if (text.length < 2) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const res = await apiClient.getFDAApprovals({ q: text, limit: 50 });
      setResults(res?.approvals || res?.items || (Array.isArray(res) ? res : []));
      setTotal(res?.total || res?.approvals?.length || 0);
    } catch (e) {
      console.error('FDA approvals search failed:', e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const renderApproval = ({ item }: { item: any }) => {
    const date = item.approval_date || item.date || item.action_date;
    const statusColor = (item.status || '').toLowerCase().includes('approved') ? '#10B981' : '#F59E0B';
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          if (item.url) Linking.openURL(item.url);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '15' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{item.status || 'Approved'}</Text>
          </View>
          {date && (
            <Text style={styles.date}>
              {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          )}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {item.brand_name || item.product_name || item.drug_name || item.title}
        </Text>
        {item.applicant && (
          <Text style={styles.applicant}>{item.applicant}</Text>
        )}
        {(item.active_ingredient || item.indication) && (
          <Text style={styles.detail} numberOfLines={2}>
            {item.active_ingredient || item.indication}
          </Text>
        )}
        {item.application_number && (
          <View style={styles.appNumRow}>
            <Text style={styles.appNumLabel}>NDA/BLA:</Text>
            <Text style={styles.appNum}>{item.application_number}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Hero */}
      <LinearGradient
        colors={['#F43F5E', '#BE185D', '#9F1239']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="shield-checkmark" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>FDA Approvals</Text>
          </View>
          <Text style={styles.heroSubtitle}>Search FDA drug approvals and regulatory actions</Text>
        </View>
      </LinearGradient>

      {/* Search */}
      <View style={styles.searchContainer}>
        <SearchBar
          value={query}
          onChangeText={handleSearch}
          placeholder="Search drug name or company..."
          debounceMs={500}
        />
      </View>

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#F43F5E" />
          <Text style={styles.loadingText}>Searching FDA approvals...</Text>
        </View>
      )}

      {!loading && hasSearched && (
        <Text style={styles.countText}>{total} results</Text>
      )}

      {!loading && hasSearched && (
        <FlatList
          data={results}
          keyExtractor={(item, idx) => item.id?.toString() || item.application_number || `fda-${idx}`}
          renderItem={renderApproval}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={<EmptyState title="No approvals found" message="Try a different search term." />}
        />
      )}

      {!hasSearched && !loading && (
        <View style={styles.emptyHint}>
          <Ionicons name="search" size={40} color={UI_COLORS.BORDER} />
          <Text style={styles.emptyHintText}>Search for FDA drug approvals by name, company, or active ingredient</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
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
  heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19 },
  searchContainer: { paddingHorizontal: 16, marginTop: 12 },
  loadingBox: { alignItems: 'center', padding: 32 },
  loadingText: { marginTop: 10, color: UI_COLORS.TEXT_MUTED, fontSize: 13 },
  countText: { paddingHorizontal: 16, marginTop: 10, marginBottom: 4, fontSize: 12, color: UI_COLORS.TEXT_MUTED, fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },
  date: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  title: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 20 },
  applicant: { fontSize: 12, fontWeight: '600', color: '#F43F5E', marginTop: 3 },
  detail: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 17, marginTop: 4 },
  appNumRow: { flexDirection: 'row', gap: 4, marginTop: 6 },
  appNumLabel: { fontSize: 10, fontWeight: '600', color: UI_COLORS.TEXT_MUTED },
  appNum: { fontSize: 10, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  emptyHint: { alignItems: 'center', justifyContent: 'center', padding: 48, gap: 12 },
  emptyHintText: { color: UI_COLORS.TEXT_MUTED, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
