import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { Person } from '../api/types';
import { LoadingSpinner, PartyBadge, ChamberBadge, EmptyState } from '../components/ui';

type PartyFilter = 'all' | 'D' | 'R' | 'I';
type ChamberFilter = 'all' | 'house' | 'senate';

const PARTY_OPTIONS: { key: PartyFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'D', label: 'Dem' },
  { key: 'R', label: 'Rep' },
  { key: 'I', label: 'Ind' },
];

const CHAMBER_OPTIONS: { key: ChamberFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'house', label: 'House' },
  { key: 'senate', label: 'Senate' },
];

const PAGE_SIZE = 50;

export default function PeopleScreen() {
  const navigation = useNavigation<any>();
  const [people, setPeople] = useState<Person[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [partyFilter, setPartyFilter] = useState<PartyFilter>('all');
  const [chamberFilter, setChamberFilter] = useState<ChamberFilter>('all');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1); // Reset to page 1 on new search
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset to page 1 on filter change
  useEffect(() => {
    setPage(1);
  }, [partyFilter, chamberFilter]);

  // Fetch data from API with server-side pagination + filters
  const fetchPage = useCallback(async (pageNum: number) => {
    const isFirstLoad = pageNum === 1 && people.length === 0;
    if (isFirstLoad) setLoading(true);
    else setPageLoading(true);
    setError(null);

    try {
      const res = await apiClient.getPeople({
        limit: PAGE_SIZE,
        offset: (pageNum - 1) * PAGE_SIZE,
        q: searchDebounced || undefined,
        party: partyFilter !== 'all' ? partyFilter : undefined,
        chamber: chamberFilter !== 'all' ? chamberFilter : undefined,
      });
      setPeople(res.people || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load people');
    } finally {
      setLoading(false);
      setPageLoading(false);
    }
  }, [searchDebounced, partyFilter, chamberFilter]);

  useEffect(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startItem = (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, total);

  const goToPage = (p: number) => {
    if (p < 1 || p > totalPages || p === page) return;
    setPage(p);
  };

  // Generate page numbers to display (max 5 around current)
  const getPageNumbers = (): number[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: number[] = [1];
    let start = Math.max(2, page - 1);
    let end = Math.min(totalPages - 1, page + 1);
    if (page <= 3) { start = 2; end = 5; }
    if (page >= totalPages - 2) { start = totalPages - 4; end = totalPages - 1; }
    if (start > 2) pages.push(-1); // ellipsis marker
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push(-2); // ellipsis marker
    pages.push(totalPages);
    return pages;
  };

  if (loading) return <LoadingSpinner message="Loading directory..." />;

  const renderPerson = ({ item: person }: { item: Person }) => (
    <TouchableOpacity
      style={styles.personCard}
      onPress={() => navigation.navigate('PersonDetail', { person_id: person.person_id })}
    >
      <View style={styles.personRow}>
        {person.photo_url ? (
          <Image source={{ uri: person.photo_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{person.display_name.charAt(0)}</Text>
          </View>
        )}
        <View style={styles.personInfo}>
          <Text style={styles.personName}>{person.display_name}</Text>
          <Text style={styles.personState}>{person.state}</Text>
          <View style={styles.badgeRow}>
            <PartyBadge party={person.party} />
            <ChamberBadge chamber={person.chamber} />
            {person.is_active && (
              <Text style={styles.activeLabel}>Active</Text>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={UI_COLORS.TEXT_MUTED} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <Ionicons name="search" size={16} color={UI_COLORS.TEXT_MUTED} />
          <TextInput
            style={styles.searchText}
            placeholder="Search by name or state..."
            placeholderTextColor={UI_COLORS.TEXT_MUTED}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={UI_COLORS.TEXT_MUTED} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        <View style={styles.filterGroup}>
          {PARTY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.filterBtn, partyFilter === opt.key && styles.filterBtnActive]}
              onPress={() => setPartyFilter(opt.key)}
            >
              <Text style={[styles.filterBtnText, partyFilter === opt.key && styles.filterBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.filterGroup}>
          {CHAMBER_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.filterBtn, chamberFilter === opt.key && styles.filterBtnActive]}
              onPress={() => setChamberFilter(opt.key)}
            >
              <Text style={[styles.filterBtnText, chamberFilter === opt.key && styles.filterBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Count + page info */}
      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {total === 0 ? 'No results' : `${startItem}–${endItem} of ${total}`}
        </Text>
        {pageLoading && <ActivityIndicator size="small" color={UI_COLORS.ACCENT} />}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : people.length === 0 ? (
        <EmptyState title="No members found" message="Try adjusting your search or filters." />
      ) : (
        <FlatList
          data={people}
          keyExtractor={(p) => p.person_id}
          renderItem={renderPerson}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={() => (
            totalPages > 1 ? (
              <View style={styles.paginationBar}>
                {/* Previous */}
                <TouchableOpacity
                  style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}
                  onPress={() => goToPage(page - 1)}
                  disabled={page === 1}
                >
                  <Ionicons name="chevron-back" size={16} color={page === 1 ? UI_COLORS.BORDER : UI_COLORS.TEXT_PRIMARY} />
                </TouchableOpacity>

                {/* Page numbers */}
                {getPageNumbers().map((p, idx) =>
                  p < 0 ? (
                    <Text key={`ellipsis-${idx}`} style={styles.pageEllipsis}>...</Text>
                  ) : (
                    <TouchableOpacity
                      key={p}
                      style={[styles.pageBtn, p === page && styles.pageBtnActive]}
                      onPress={() => goToPage(p)}
                    >
                      <Text style={[styles.pageBtnText, p === page && styles.pageBtnTextActive]}>
                        {p}
                      </Text>
                    </TouchableOpacity>
                  )
                )}

                {/* Next */}
                <TouchableOpacity
                  style={[styles.pageBtn, page === totalPages && styles.pageBtnDisabled]}
                  onPress={() => goToPage(page + 1)}
                  disabled={page === totalPages}
                >
                  <Ionicons name="chevron-forward" size={16} color={page === totalPages ? UI_COLORS.BORDER : UI_COLORS.TEXT_PRIMARY} />
                </TouchableOpacity>
              </View>
            ) : null
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.SECONDARY_BG,
    paddingHorizontal: 16,
  },
  searchRow: {
    marginTop: 12,
    marginBottom: 10,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
  },
  searchText: {
    flex: 1,
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 14,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  filterGroup: {
    flexDirection: 'row',
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    padding: 2,
  },
  filterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  filterBtnActive: {
    backgroundColor: UI_COLORS.ACCENT,
  },
  filterBtnText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    fontWeight: '600',
  },
  filterBtnTextActive: {
    color: '#FFFFFF',
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  countText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 12,
  },
  listContent: {
    paddingBottom: 24,
  },
  personCard: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: UI_COLORS.ACCENT_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: UI_COLORS.ACCENT,
    fontSize: 16,
    fontWeight: '700',
  },
  personInfo: {
    flex: 1,
    gap: 2,
  },
  personName: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '600',
  },
  personState: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  activeLabel: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 'auto',
  },
  // ── Pagination ──
  paginationBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 16,
    marginTop: 8,
  },
  pageBtn: {
    minWidth: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
  },
  pageBtnActive: {
    backgroundColor: UI_COLORS.ACCENT,
    borderColor: UI_COLORS.ACCENT,
    shadowColor: UI_COLORS.ACCENT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageBtnText: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 13,
    fontWeight: '600',
  },
  pageBtnTextActive: {
    color: '#FFFFFF',
  },
  pageEllipsis: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 14,
    paddingHorizontal: 4,
  },
  errorBox: {
    padding: 24,
    alignItems: 'center',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
});
