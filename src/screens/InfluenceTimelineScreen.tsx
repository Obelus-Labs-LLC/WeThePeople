import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { EmptyState } from '../components/ui';
import SearchBar from '../components/SearchBar';
import type { GlobalSearchResponse, InfluenceNetworkResponse, InfluenceNetworkEdge } from '../api/types';

const CATEGORY_COLORS: Record<string, string> = {
  donation: '#10B981',
  lobbying: '#2563EB',
  trade: '#F59E0B',
  bill: '#8B5CF6',
  contract: '#DC2626',
};

const CATEGORY_ICONS: Record<string, string> = {
  donation: 'cash',
  lobbying: 'megaphone',
  trade: 'swap-horizontal',
  bill: 'document-text',
  contract: 'briefcase',
};

function fmtDollar(val: number | null | undefined): string {
  if (val == null) return '';
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

interface TimelineEvent {
  id: string;
  type: string;
  date: string;
  description: string;
  amount?: number;
  source: string;
  target: string;
}

export default function InfluenceTimelineScreen() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GlobalSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<{ type: string; id: string; name: string } | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(Object.keys(CATEGORY_COLORS)));

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text);
    if (text.length < 2) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const res = await apiClient.globalSearch(text);
      setSearchResults(res);
    } catch (e) {
      console.error('Search failed:', e);
    } finally {
      setSearching(false);
    }
  }, []);

  const selectEntity = useCallback(async (type: string, id: string, name: string) => {
    setSelectedEntity({ type, id, name });
    setSearchResults(null);
    setQuery(name);
    setLoadingEvents(true);
    try {
      const res = await apiClient.getInfluenceNetwork(type, id, 1, 50);
      // Convert edges to timeline events
      const timelineEvents: TimelineEvent[] = res.edges.map((edge: InfluenceNetworkEdge, idx: number) => {
        const sourceNode = res.nodes.find((n: any) => n.id === edge.source);
        const targetNode = res.nodes.find((n: any) => n.id === edge.target);
        return {
          id: `evt-${idx}`,
          type: edge.type,
          date: edge.date || edge.year?.toString() || '',
          description: edge.label || `${edge.type} connection`,
          amount: edge.amount,
          source: sourceNode?.label || edge.source,
          target: targetNode?.label || edge.target,
        };
      }).sort((a: TimelineEvent, b: TimelineEvent) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
      setEvents(timelineEvents);
    } catch (e) {
      console.error('Timeline load failed:', e);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  const toggleFilter = (type: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const filteredEvents = events.filter(e => activeFilters.has(e.type));

  const renderEvent = ({ item, index }: { item: TimelineEvent; index: number }) => {
    const color = CATEGORY_COLORS[item.type] || '#6B7280';
    const icon = CATEGORY_ICONS[item.type] || 'time';

    return (
      <View style={styles.eventRow}>
        {/* Timeline line + dot */}
        <View style={styles.timelineColumn}>
          {index > 0 && <View style={[styles.timelineLine, { backgroundColor: UI_COLORS.BORDER }]} />}
          <View style={[styles.timelineDot, { backgroundColor: color }]}>
            <Ionicons name={icon as any} size={10} color="#FFFFFF" />
          </View>
          {index < filteredEvents.length - 1 && <View style={[styles.timelineLineBottom, { backgroundColor: UI_COLORS.BORDER }]} />}
        </View>

        {/* Event card */}
        <View style={styles.eventCard}>
          <View style={styles.eventHeader}>
            <View style={[styles.typeBadge, { backgroundColor: color + '15', borderColor: color + '30' }]}>
              <Text style={[styles.typeBadgeText, { color }]}>{item.type}</Text>
            </View>
            {item.date ? (
              <Text style={styles.eventDate}>
                {new Date(item.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
          <Text style={styles.eventDesc}>{item.source} → {item.target}</Text>
          {item.description && item.description !== `${item.type} connection` && (
            <Text style={styles.eventSubDesc}>{item.description}</Text>
          )}
          {item.amount != null && item.amount > 0 && (
            <Text style={[styles.eventAmount, { color }]}>{fmtDollar(item.amount)}</Text>
          )}
        </View>
      </View>
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
            <Ionicons name="time" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Influence Timeline</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Chronological view of connections for any entity
          </Text>
        </View>
      </LinearGradient>

      {/* Search */}
      <View style={styles.searchContainer}>
        <SearchBar
          value={query}
          onChangeText={handleSearch}
          placeholder="Search politician or company..."
          debounceMs={300}
        />
      </View>

      {/* Search Dropdown */}
      {searchResults && !selectedEntity && (
        <View style={styles.searchDropdown}>
          {searchResults.politicians?.slice(0, 5).map(p => (
            <TouchableOpacity
              key={p.person_id}
              style={styles.searchItem}
              onPress={() => selectEntity('politician', p.person_id, p.display_name)}
            >
              <Ionicons name="person" size={16} color={UI_COLORS.ACCENT} />
              <Text style={styles.searchItemText}>{p.display_name}</Text>
            </TouchableOpacity>
          ))}
          {searchResults.companies?.slice(0, 5).map(c => (
            <TouchableOpacity
              key={c.id}
              style={styles.searchItem}
              onPress={() => selectEntity(c.entity_type || 'company', c.id, c.display_name)}
            >
              <Ionicons name="business" size={16} color="#8B5CF6" />
              <Text style={styles.searchItemText}>{c.display_name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loadingEvents && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={UI_COLORS.ACCENT} />
          <Text style={styles.loadingText}>Loading timeline...</Text>
        </View>
      )}

      {/* Category Filters */}
      {selectedEntity && !loadingEvents && (
        <View style={styles.filterRow}>
          {Object.entries(CATEGORY_COLORS).map(([type, color]) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.filterPill,
                activeFilters.has(type)
                  ? { backgroundColor: color + '18', borderColor: color + '40' }
                  : { backgroundColor: UI_COLORS.CARD_BG, borderColor: UI_COLORS.BORDER },
              ]}
              onPress={() => toggleFilter(type)}
            >
              <Ionicons name={CATEGORY_ICONS[type] as any} size={10} color={activeFilters.has(type) ? color : UI_COLORS.TEXT_MUTED} />
              <Text style={[styles.filterText, { color: activeFilters.has(type) ? color : UI_COLORS.TEXT_MUTED }]}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {selectedEntity && !loadingEvents && (
        <Text style={styles.countText}>{filteredEvents.length} events</Text>
      )}

      {selectedEntity && !loadingEvents && (
        <FlatList
          data={filteredEvents}
          keyExtractor={item => item.id}
          renderItem={renderEvent}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState title="No events" message="No timeline events found for this entity." />}
        />
      )}

      {!selectedEntity && !searchResults && !loadingEvents && (
        <View style={styles.emptyHint}>
          <Ionicons name="search" size={40} color={UI_COLORS.BORDER} />
          <Text style={styles.emptyHintText}>Search for a politician or company to view their influence timeline</Text>
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
  searchDropdown: {
    marginHorizontal: 16, marginTop: 4, backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12, borderWidth: 1, borderColor: UI_COLORS.BORDER, padding: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  searchItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 6 },
  searchItemText: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 6, marginTop: 12 },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1,
  },
  filterText: { fontSize: 11, fontWeight: '600' },
  countText: { paddingHorizontal: 16, marginTop: 10, marginBottom: 4, fontSize: 12, color: UI_COLORS.TEXT_MUTED, fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  eventRow: { flexDirection: 'row', marginBottom: 0 },
  timelineColumn: { width: 32, alignItems: 'center', position: 'relative' },
  timelineLine: { width: 2, flex: 1, position: 'absolute', top: 0, bottom: '50%' },
  timelineLineBottom: { width: 2, flex: 1, position: 'absolute', top: '50%', bottom: 0 },
  timelineDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  eventCard: {
    flex: 1, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, marginLeft: 8, marginBottom: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  eventHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  typeBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  eventDate: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  eventDesc: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  eventSubDesc: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2 },
  eventAmount: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  loadingBox: { alignItems: 'center', padding: 32 },
  loadingText: { marginTop: 10, color: UI_COLORS.TEXT_MUTED, fontSize: 13 },
  emptyHint: { alignItems: 'center', justifyContent: 'center', padding: 48, gap: 12 },
  emptyHintText: { color: UI_COLORS.TEXT_MUTED, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
