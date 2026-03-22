import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS, PARTY_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { EmptyState } from '../components/ui';
import SearchBar from '../components/SearchBar';
import type {
  GlobalSearchResponse,
  InfluenceNetworkResponse,
  InfluenceNetworkNode,
  InfluenceNetworkEdge,
} from '../api/types';

const EDGE_TYPE_COLORS: Record<string, string> = {
  donation: '#10B981',
  lobbying: '#2563EB',
  trade: '#F59E0B',
  bill: '#8B5CF6',
  contract: '#DC2626',
};

const EDGE_TYPE_ICONS: Record<string, string> = {
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

interface InfluenceNetworkScreenProps {
  navigation?: any;
}

export default function InfluenceNetworkScreen({ navigation }: InfluenceNetworkScreenProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GlobalSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<{ type: string; id: string; name: string } | null>(null);
  const [network, setNetwork] = useState<InfluenceNetworkResponse | null>(null);
  const [loadingNetwork, setLoadingNetwork] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(['donation', 'lobbying', 'trade', 'bill', 'contract']));

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
    setLoadingNetwork(true);
    try {
      const res = await apiClient.getInfluenceNetwork(type, id, 1, 30);
      setNetwork(res);
    } catch (e) {
      console.error('Network load failed:', e);
    } finally {
      setLoadingNetwork(false);
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

  // Build connection cards from edges
  const connections = network ? network.edges.filter(e => activeFilters.has(e.type)).map(edge => {
    const targetNode = network.nodes.find(n => n.id === edge.target);
    const sourceNode = network.nodes.find(n => n.id === edge.source);
    const otherNode = sourceNode?.id === selectedEntity?.id ? targetNode : sourceNode;
    return { edge, node: otherNode };
  }).filter(c => c.node) : [];

  const renderSearchResult = ({ item, type }: { item: any; type: string }) => {
    if (type === 'politician') {
      const partyColor = PARTY_COLORS[item.party?.charAt(0)] || '#6B7280';
      return (
        <TouchableOpacity
          style={styles.searchResultCard}
          onPress={() => selectEntity('politician', item.person_id, item.display_name)}
          activeOpacity={0.7}
        >
          <Ionicons name="person" size={20} color={UI_COLORS.ACCENT} />
          <View style={styles.searchResultInfo}>
            <Text style={styles.searchResultName}>{item.display_name}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <View style={[styles.badge, { backgroundColor: partyColor + '12', borderColor: partyColor + '25' }]}>
                <Text style={[styles.badgeText, { color: partyColor }]}>{item.party}</Text>
              </View>
              <Text style={styles.searchResultDetail}>{item.state} - {item.chamber}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
        </TouchableOpacity>
      );
    }
    // Company
    const sectorColors: Record<string, string> = { finance: '#10B981', health: '#F43F5E', tech: '#8B5CF6', energy: '#475569' };
    const sColor = sectorColors[item.sector] || '#6B7280';
    return (
      <TouchableOpacity
        style={styles.searchResultCard}
        onPress={() => selectEntity(item.entity_type || 'company', item.id, item.display_name)}
        activeOpacity={0.7}
      >
        <Ionicons name="business" size={20} color={sColor} />
        <View style={styles.searchResultInfo}>
          <Text style={styles.searchResultName}>{item.display_name}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {item.ticker && <Text style={styles.searchResultDetail}>{item.ticker}</Text>}
            <View style={[styles.badge, { backgroundColor: sColor + '12', borderColor: sColor + '25' }]}>
              <Text style={[styles.badgeText, { color: sColor }]}>{item.sector}</Text>
            </View>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
      </TouchableOpacity>
    );
  };

  const renderConnection = ({ item }: { item: { edge: InfluenceNetworkEdge; node: InfluenceNetworkNode | undefined } }) => {
    const { edge, node } = item;
    if (!node) return null;
    const edgeColor = EDGE_TYPE_COLORS[edge.type] || '#6B7280';
    const edgeIcon = EDGE_TYPE_ICONS[edge.type] || 'link';

    return (
      <TouchableOpacity style={styles.connectionCard} activeOpacity={0.7}>
        <View style={styles.connectionLeft}>
          <Ionicons name={node.type === 'politician' ? 'person' : 'business'} size={20} color={edgeColor} />
          <View style={styles.connectionInfo}>
            <Text style={styles.connectionName}>{node.label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <View style={[styles.edgeTypeBadge, { backgroundColor: edgeColor + '15', borderColor: edgeColor + '30' }]}>
                <Ionicons name={edgeIcon as any} size={10} color={edgeColor} />
                <Text style={[styles.edgeTypeText, { color: edgeColor }]}>{edge.type}</Text>
              </View>
              {edge.amount != null && edge.amount > 0 && (
                <Text style={[styles.connectionAmount, { color: edgeColor }]}>{fmtDollar(edge.amount)}</Text>
              )}
            </View>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
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
            <Ionicons name="git-network" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Influence Network</Text>
          </View>
          <Text style={styles.heroSubtitle}>Explore connections between politicians and companies</Text>
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

      {/* Search Results Dropdown */}
      {searchResults && !selectedEntity && (
        <View style={styles.searchDropdown}>
          {searchResults.politicians.length > 0 && (
            <>
              <Text style={styles.dropdownHeader}>Politicians</Text>
              {searchResults.politicians.map(p => (
                <View key={p.person_id}>{renderSearchResult({ item: p, type: 'politician' })}</View>
              ))}
            </>
          )}
          {searchResults.companies.length > 0 && (
            <>
              <Text style={styles.dropdownHeader}>Companies</Text>
              {searchResults.companies.map(c => (
                <View key={c.id}>{renderSearchResult({ item: c, type: 'company' })}</View>
              ))}
            </>
          )}
          {searchResults.politicians.length === 0 && searchResults.companies.length === 0 && (
            <Text style={styles.noResults}>No results found</Text>
          )}
        </View>
      )}

      {/* Loading */}
      {loadingNetwork && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={UI_COLORS.ACCENT} />
          <Text style={styles.loadingText}>Loading network...</Text>
        </View>
      )}

      {/* Edge Type Filters + Connection List */}
      {network && !loadingNetwork && (
        <FlatList
          data={connections}
          keyExtractor={(item, idx) => `${item.edge.source}-${item.edge.target}-${item.edge.type}-${idx}`}
          renderItem={renderConnection}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              <View style={styles.filterRow}>
                {Object.entries(EDGE_TYPE_COLORS).map(([type, color]) => (
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
                    <Ionicons name={EDGE_TYPE_ICONS[type] as any} size={12} color={activeFilters.has(type) ? color : UI_COLORS.TEXT_MUTED} />
                    <Text style={[styles.filterText, { color: activeFilters.has(type) ? color : UI_COLORS.TEXT_MUTED }]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.resultsCount}>{connections.length} connections</Text>
            </>
          }
          ListEmptyComponent={<EmptyState title="No connections" message="Try selecting different filter types." />}
          style={{ flex: 1 }}
        />
      )}

      {/* Empty state when nothing selected */}
      {!selectedEntity && !searchResults && !loadingNetwork && (
        <View style={styles.emptyHint}>
          <Ionicons name="search" size={40} color={UI_COLORS.BORDER} />
          <Text style={styles.emptyHintText}>Search for a politician or company to explore their influence network</Text>
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
  dropdownHeader: {
    fontSize: 11, fontWeight: '700', color: UI_COLORS.TEXT_MUTED, textTransform: 'uppercase',
    letterSpacing: 0.5, paddingHorizontal: 8, paddingVertical: 6,
  },
  searchResultCard: {
    flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, gap: 10,
  },
  searchResultInfo: { flex: 1 },
  searchResultName: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  searchResultDetail: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  badge: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: '600' },
  noResults: { padding: 16, textAlign: 'center', color: UI_COLORS.TEXT_MUTED, fontSize: 13 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 6, marginTop: 12 },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1,
  },
  filterText: { fontSize: 11, fontWeight: '600' },
  resultsCount: { paddingHorizontal: 16, marginTop: 10, fontSize: 12, color: UI_COLORS.TEXT_MUTED, fontWeight: '600' },
  listContent: { paddingBottom: 32 },
  connectionCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, marginHorizontal: 16, marginTop: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  connectionLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  connectionInfo: { flex: 1 },
  connectionName: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  edgeTypeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1,
  },
  edgeTypeText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  connectionAmount: { fontSize: 13, fontWeight: '700' },
  loadingContainer: { alignItems: 'center', padding: 32 },
  loadingText: { marginTop: 10, color: UI_COLORS.TEXT_MUTED, fontSize: 13 },
  emptyHint: { alignItems: 'center', justifyContent: 'center', padding: 48, gap: 12 },
  emptyHintText: { color: UI_COLORS.TEXT_MUTED, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
