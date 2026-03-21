import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { LoadingSpinner, EmptyState } from '../components/ui';

export default function PressToolsScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const res = await apiClient.getPressReleases({ limit: 50 });
      setItems(res?.items || res?.releases || (Array.isArray(res) ? res : []));
    } catch (e: any) {
      console.error('Press releases load failed:', e);
      setError(e.message || 'Failed to load press releases');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) return <LoadingSpinner message="Loading press releases..." />;

  const renderItem = ({ item }: { item: any }) => {
    const date = item.date || item.published_date || item.created_at;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          if (item.url || item.link) Linking.openURL(item.url || item.link);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Ionicons name="newspaper" size={16} color={UI_COLORS.ACCENT} />
          {item.source && <Text style={styles.source}>{item.source}</Text>}
          {date && (
            <Text style={styles.date}>
              {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          )}
        </View>
        <Text style={styles.title} numberOfLines={2}>{item.title || item.headline}</Text>
        {item.summary && <Text style={styles.summary} numberOfLines={3}>{item.summary}</Text>}
        {(item.url || item.link) && (
          <View style={styles.linkRow}>
            <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
            <Text style={styles.linkText}>Read more</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Hero */}
      <LinearGradient
        colors={['#1B7A3D', '#15693A', '#0F5831']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="newspaper" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Press & News</Text>
          </View>
          <Text style={styles.heroSubtitle}>Latest press releases and government news</Text>
        </View>
      </LinearGradient>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, idx) => item.id?.toString() || `press-${idx}`}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
          ListEmptyComponent={<EmptyState title="No press releases" message="Press release data is not available yet." />}
        />
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
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  source: { fontSize: 11, fontWeight: '600', color: UI_COLORS.ACCENT },
  date: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginLeft: 'auto' },
  title: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 20 },
  summary: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 17, marginTop: 4 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  linkText: { fontSize: 12, fontWeight: '600', color: UI_COLORS.ACCENT },
  errorBox: { padding: 24, alignItems: 'center' },
  errorText: { color: '#DC2626', fontSize: 14 },
});
