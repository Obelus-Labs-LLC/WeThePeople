import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS, PARTY_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { LoadingSpinner, EmptyState } from '../components/ui';
import type { GlobalSearchResponse, PoliticianSearchResult, CompanySearchResult } from '../api/types';

const SECTOR_COLORS: Record<string, string> = {
  finance: '#10B981', health: '#F43F5E', tech: '#8B5CF6', energy: '#475569',
};

interface GlobalSearchScreenProps {
  navigation?: any;
}

export default function GlobalSearchScreen({ navigation }: GlobalSearchScreenProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    // Auto-focus on mount
    const id = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(id);
  }, []);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    if (timer.current) clearTimeout(timer.current);
    if (text.length < 2) { setResults(null); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await apiClient.globalSearch(text);
        setResults(res);
      } catch (e) {
        console.error('Search failed:', e);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const handleClose = () => {
    navigation?.goBack?.();
  };

  const navigateToPolitician = (p: PoliticianSearchResult) => {
    handleClose();
    // Navigate to PersonDetail in Politics stack
    navigation?.navigate?.('PoliticsTab', {
      screen: 'PersonDetail',
      params: { personId: p.person_id },
    });
  };

  const navigateToCompany = (c: CompanySearchResult) => {
    handleClose();
    const sectorTabMap: Record<string, string> = {
      finance: 'FinanceTab',
      health: 'HealthTab',
      tech: 'TechTab',
      energy: 'EnergyTab',
    };
    const sectorScreenMap: Record<string, string> = {
      finance: 'InstitutionDetail',
      health: 'CompanyDetail',
      tech: 'TechCompanyDetail',
      energy: 'EnergyCompanyDetail',
    };
    const tab = sectorTabMap[c.sector] || 'FinanceTab';
    const screen = sectorScreenMap[c.sector] || 'CompanyDetail';
    navigation?.navigate?.(tab, {
      screen,
      params: { id: c.id },
    });
  };

  // Build flat list data
  type ListItem =
    | { type: 'header'; title: string }
    | { type: 'politician'; data: PoliticianSearchResult }
    | { type: 'company'; data: CompanySearchResult };

  const listData: ListItem[] = [];
  if (results) {
    if (results.politicians.length > 0) {
      listData.push({ type: 'header', title: 'Politicians' });
      results.politicians.forEach(p => listData.push({ type: 'politician', data: p }));
    }
    if (results.companies.length > 0) {
      listData.push({ type: 'header', title: 'Companies' });
      results.companies.forEach(c => listData.push({ type: 'company', data: c }));
    }
  }

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      return (
        <Text style={styles.sectionHeader}>{item.title}</Text>
      );
    }

    if (item.type === 'politician') {
      const p = item.data;
      const partyColor = PARTY_COLORS[p.party?.charAt(0)] || '#6B7280';
      const partyLabel = p.party?.charAt(0) === 'D' ? 'Dem' : p.party?.charAt(0) === 'R' ? 'Rep' : p.party;
      return (
        <TouchableOpacity style={styles.resultCard} onPress={() => navigateToPolitician(p)} activeOpacity={0.7}>
          {p.photo_url ? (
            <Image source={{ uri: p.photo_url }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Ionicons name="person" size={20} color={UI_COLORS.TEXT_MUTED} />
            </View>
          )}
          <View style={styles.resultInfo}>
            <Text style={styles.resultName}>{p.display_name}</Text>
            <View style={styles.resultMeta}>
              <View style={[styles.badge, { backgroundColor: partyColor + '12', borderColor: partyColor + '25' }]}>
                <Text style={[styles.badgeText, { color: partyColor }]}>{partyLabel}</Text>
              </View>
              <Text style={styles.resultDetail}>{p.state}</Text>
              <Text style={styles.resultDetail}>{p.chamber}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
        </TouchableOpacity>
      );
    }

    if (item.type === 'company') {
      const c = item.data;
      const sColor = SECTOR_COLORS[c.sector] || '#6B7280';
      return (
        <TouchableOpacity style={styles.resultCard} onPress={() => navigateToCompany(c)} activeOpacity={0.7}>
          <View style={[styles.companyIcon, { backgroundColor: sColor + '12' }]}>
            <Ionicons name="business" size={20} color={sColor} />
          </View>
          <View style={styles.resultInfo}>
            <Text style={styles.resultName}>{c.display_name}</Text>
            <View style={styles.resultMeta}>
              {c.ticker && <Text style={styles.tickerText}>{c.ticker}</Text>}
              <View style={[styles.badge, { backgroundColor: sColor + '12', borderColor: sColor + '25' }]}>
                <Text style={[styles.badgeText, { color: sColor }]}>{c.sector}</Text>
              </View>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
        </TouchableOpacity>
      );
    }

    return null;
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Search Header */}
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={UI_COLORS.TEXT_MUTED} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            value={query}
            onChangeText={handleSearch}
            placeholder="Search politicians, companies, or bills..."
            placeholderTextColor={UI_COLORS.TEXT_MUTED}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults(null); }}>
              <Ionicons name="close-circle" size={18} color={UI_COLORS.TEXT_MUTED} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={UI_COLORS.TEXT_PRIMARY} />
        </TouchableOpacity>
      </View>

      {/* Loading */}
      {loading && (
        <View style={styles.loadingContainer}>
          <LoadingSpinner message="Searching..." />
        </View>
      )}

      {/* Results */}
      {!loading && results && listData.length > 0 && (
        <FlatList
          data={listData}
          keyExtractor={(item, i) => {
            if (item.type === 'header') return `header-${item.title}`;
            if (item.type === 'politician') return `p-${item.data.person_id}`;
            if (item.type === 'company') return `c-${item.data.id}`;
            return `item-${i}`;
          }}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* No results */}
      {!loading && results && listData.length === 0 && (
        <EmptyState title="No results" message={`No results found for "${query}"`} />
      )}

      {/* Empty state */}
      {!loading && !results && (
        <View style={styles.emptyState}>
          <Ionicons name="search" size={48} color={UI_COLORS.BORDER} />
          <Text style={styles.emptyText}>Search for politicians, companies, or bills</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 10,
    backgroundColor: UI_COLORS.PRIMARY_BG, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER,
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.SECONDARY_BG,
    borderRadius: 10, paddingHorizontal: 12, height: 44, gap: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  searchInput: { flex: 1, fontSize: 14, color: UI_COLORS.TEXT_PRIMARY },
  closeButton: { padding: 4 },
  loadingContainer: { padding: 32 },
  listContent: { paddingBottom: 32 },
  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: UI_COLORS.TEXT_MUTED, textTransform: 'uppercase',
    letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6,
  },
  resultCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG,
    padding: 12, marginHorizontal: 16, marginTop: 6, borderRadius: 10,
    borderWidth: 1, borderColor: UI_COLORS.BORDER, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  photo: { width: 40, height: 40, borderRadius: 20 },
  photoPlaceholder: { backgroundColor: UI_COLORS.SECONDARY_BG, alignItems: 'center', justifyContent: 'center' },
  companyIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  resultInfo: { flex: 1 },
  resultName: { fontSize: 15, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  resultMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  resultDetail: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  tickerText: { fontSize: 11, fontWeight: '700', color: UI_COLORS.TEXT_SECONDARY },
  badge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: '600' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48, gap: 12 },
  emptyText: { color: UI_COLORS.TEXT_MUTED, fontSize: 14, textAlign: 'center' },
});
