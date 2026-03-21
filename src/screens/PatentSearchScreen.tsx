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

export default function PatentSearchScreen() {
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
      const res = await apiClient.searchPatents({ q: text, limit: 50 });
      setResults(res?.patents || res?.items || (Array.isArray(res) ? res : []));
      setTotal(res?.total || res?.patents?.length || 0);
    } catch (e) {
      console.error('Patent search failed:', e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const renderPatent = ({ item }: { item: any }) => {
    const date = item.date || item.grant_date || item.filing_date;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          if (item.url) Linking.openURL(item.url);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.patentBadge}>
            <Ionicons name="bulb" size={12} color="#8B5CF6" />
            <Text style={styles.patentId}>{item.patent_number || item.id || 'Patent'}</Text>
          </View>
          {date && (
            <Text style={styles.date}>
              {new Date(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </Text>
          )}
        </View>
        <Text style={styles.title} numberOfLines={2}>{item.title || item.patent_title}</Text>
        {item.assignee && (
          <Text style={styles.assignee}>{item.assignee}</Text>
        )}
        {item.abstract && (
          <Text style={styles.abstract} numberOfLines={3}>{item.abstract}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Hero */}
      <LinearGradient
        colors={['#8B5CF6', '#7C3AED', '#6D28D9']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="bulb" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Patent Search</Text>
          </View>
          <Text style={styles.heroSubtitle}>Search patents by keyword, company, or technology</Text>
        </View>
      </LinearGradient>

      {/* Search */}
      <View style={styles.searchContainer}>
        <SearchBar
          value={query}
          onChangeText={handleSearch}
          placeholder="Search patents..."
          debounceMs={500}
        />
      </View>

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Searching patents...</Text>
        </View>
      )}

      {!loading && hasSearched && (
        <Text style={styles.countText}>{total} results</Text>
      )}

      {!loading && hasSearched && (
        <FlatList
          data={results}
          keyExtractor={(item, idx) => item.patent_number || item.id?.toString() || `patent-${idx}`}
          renderItem={renderPatent}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={<EmptyState title="No patents found" message="Try a different search term." />}
        />
      )}

      {!hasSearched && !loading && (
        <View style={styles.emptyHint}>
          <Ionicons name="search" size={40} color={UI_COLORS.BORDER} />
          <Text style={styles.emptyHintText}>Search for patents by keyword, company name, or technology area</Text>
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
  patentBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#8B5CF615', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  patentId: { fontSize: 11, fontWeight: '700', color: '#8B5CF6' },
  date: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  title: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 19 },
  assignee: { fontSize: 12, fontWeight: '600', color: UI_COLORS.ACCENT, marginTop: 4 },
  abstract: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 17, marginTop: 4 },
  emptyHint: { alignItems: 'center', justifyContent: 'center', padding: 48, gap: 12 },
  emptyHintText: { color: UI_COLORS.TEXT_MUTED, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
