import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  StyleSheet,
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

export default function PeopleScreen() {
  const navigation = useNavigation<any>();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [partyFilter, setPartyFilter] = useState<PartyFilter>('all');
  const [chamberFilter, setChamberFilter] = useState<ChamberFilter>('all');

  useEffect(() => {
    setLoading(true);
    apiClient
      .getPeople({ limit: 200 })
      .then((res) => {
        setPeople(res.people || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load people');
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    let result = people;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) => p.display_name.toLowerCase().includes(q) || p.state.toLowerCase().includes(q)
      );
    }
    if (partyFilter !== 'all') {
      result = result.filter((p) => p.party.startsWith(partyFilter));
    }
    if (chamberFilter !== 'all') {
      result = result.filter((p) =>
        chamberFilter === 'house'
          ? p.chamber.toLowerCase().includes('house') || p.chamber.toLowerCase() === 'lower'
          : p.chamber.toLowerCase().includes('senate') || p.chamber.toLowerCase() === 'upper'
      );
    }
    return result;
  }, [people, search, partyFilter, chamberFilter]);

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

      <Text style={styles.countText}>
        Showing {filtered.length} of {people.length}
      </Text>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState title="No members found" message="Try adjusting your search or filters." />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.person_id}
          renderItem={renderPerson}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          showsVerticalScrollIndicator={false}
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
  countText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 12,
    marginBottom: 8,
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
  errorBox: {
    padding: 24,
    alignItems: 'center',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
});
