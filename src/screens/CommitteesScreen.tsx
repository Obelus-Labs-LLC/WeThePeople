import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { UI_COLORS, PARTY_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';

interface CommitteeMember {
  bioguide_id: string;
  person_id: string | null;
  member_name: string | null;
  display_name?: string;
  member_party?: string;
  state?: string;
  role: string;
}

interface Committee {
  thomas_id: string;
  name: string;
  chamber: string;
  committee_type: string | null;
  member_count: number;
  url: string | null;
  subcommittees?: Committee[];
}

const CHAMBER_FILTERS = ['All', 'House', 'Senate', 'Joint'] as const;

function chamberColor(chamber: string): string {
  const c = chamber.toLowerCase();
  if (c.includes('senate') || c === 'upper') return '#8B5CF6';
  if (c.includes('joint')) return '#F59E0B';
  return '#2563EB';
}

function partyColor(party: string | null | undefined): string {
  if (!party) return UI_COLORS.TEXT_MUTED;
  return PARTY_COLORS[party.charAt(0)] || UI_COLORS.TEXT_MUTED;
}

export default function CommitteesScreen() {
  const navigation = useNavigation<any>();
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [chamberFilter, setChamberFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, CommitteeMember[]>>({});
  const [loadingMembers, setLoadingMembers] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiClient.getCommittees()
      .then((data) => {
        setCommittees(data.committees || []);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = async (committee: Committee) => {
    if (expandedId === committee.thomas_id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(committee.thomas_id);

    if (!members[committee.thomas_id]) {
      setLoadingMembers(committee.thomas_id);
      try {
        const data = await apiClient.getCommitteeMembers(committee.thomas_id);
        setMembers((prev) => ({ ...prev, [committee.thomas_id]: data.members || [] }));
      } catch {}
      setLoadingMembers(null);
    }
  };

  const filtered = committees.filter((c) => {
    if (chamberFilter !== 'All') {
      const ch = c.chamber.toLowerCase();
      if (chamberFilter === 'House' && !ch.includes('house') && ch !== 'lower') return false;
      if (chamberFilter === 'Senate' && !ch.includes('senate') && ch !== 'upper') return false;
      if (chamberFilter === 'Joint' && !ch.includes('joint')) return false;
    }
    if (search) {
      if (!c.name.toLowerCase().includes(search.toLowerCase())) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={UI_COLORS.ACCENT} />
      </View>
    );
  }

  if (error || committees.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="people-outline" size={48} color={UI_COLORS.TEXT_MUTED} />
        <Text style={styles.emptyTitle}>Committee data unavailable</Text>
        <Text style={styles.emptySubtitle}>Check back soon.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={UI_COLORS.TEXT_MUTED} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search committees..."
          placeholderTextColor={UI_COLORS.TEXT_MUTED}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Chamber filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {CHAMBER_FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setChamberFilter(f)}
            style={[styles.filterChip, chamberFilter === f && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, chamberFilter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Count */}
      <Text style={styles.countText}>{filtered.length} committee{filtered.length !== 1 ? 's' : ''}</Text>

      {/* Committee list */}
      {filtered.map((committee) => (
        <View key={committee.thomas_id} style={styles.committeeCard}>
          <TouchableOpacity
            style={styles.committeeHeader}
            onPress={() => toggleExpand(committee)}
            activeOpacity={0.7}
          >
            <View style={[styles.chamberIcon, { backgroundColor: chamberColor(committee.chamber) + '20' }]}>
              <Text style={[styles.chamberIconText, { color: chamberColor(committee.chamber) }]}>
                {committee.chamber === 'senate' ? 'S' : committee.chamber === 'joint' ? 'J' : 'H'}
              </Text>
            </View>
            <View style={styles.committeeInfo}>
              <Text style={styles.committeeName} numberOfLines={2}>{committee.name}</Text>
              <View style={styles.metaRow}>
                <View style={[styles.chamberBadge, { backgroundColor: chamberColor(committee.chamber) + '20' }]}>
                  <Text style={[styles.chamberBadgeText, { color: chamberColor(committee.chamber) }]}>
                    {committee.chamber.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.memberCount}>{committee.member_count} members</Text>
                {committee.subcommittees && committee.subcommittees.length > 0 && (
                  <Text style={styles.memberCount}>{committee.subcommittees.length} subs</Text>
                )}
              </View>
            </View>
            <Ionicons
              name={expandedId === committee.thomas_id ? 'chevron-down' : 'chevron-forward'}
              size={18}
              color={UI_COLORS.TEXT_MUTED}
            />
          </TouchableOpacity>

          {/* Expanded members */}
          {expandedId === committee.thomas_id && (
            <View style={styles.membersSection}>
              {loadingMembers === committee.thomas_id ? (
                <ActivityIndicator size="small" color={UI_COLORS.ACCENT} style={{ padding: 16 }} />
              ) : members[committee.thomas_id] && members[committee.thomas_id].length > 0 ? (
                members[committee.thomas_id].map((member, i) => {
                  const name = member.display_name || member.member_name || 'Unknown';
                  const party = member.member_party;
                  const roleLabel = member.role?.replace(/_/g, ' ');
                  const isLeadership = member.role && member.role !== 'member';

                  return (
                    <TouchableOpacity
                      key={member.bioguide_id || i}
                      style={styles.memberRow}
                      disabled={!member.person_id}
                      onPress={() => {
                        if (member.person_id) {
                          navigation.navigate('PersonDetail', { person_id: member.person_id });
                        }
                      }}
                    >
                      <View style={[styles.memberAvatar, { backgroundColor: partyColor(party) + '20' }]}>
                        <Text style={[styles.memberAvatarText, { color: partyColor(party) }]}>
                          {name.charAt(0)}
                        </Text>
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName} numberOfLines={1}>{name}</Text>
                        <View style={styles.memberMeta}>
                          {party && (
                            <Text style={[styles.memberParty, { color: partyColor(party) }]}>{party}</Text>
                          )}
                          {member.state && (
                            <Text style={styles.memberState}>{member.state}</Text>
                          )}
                          {isLeadership && (
                            <View style={styles.roleBadge}>
                              <Text style={styles.roleBadgeText}>{roleLabel}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {member.person_id && (
                        <Ionicons name="chevron-forward" size={14} color={UI_COLORS.TEXT_MUTED} />
                      )}
                    </TouchableOpacity>
                  );
                })
              ) : (
                <Text style={styles.noMembers}>Member data not available.</Text>
              )}
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: UI_COLORS.SECONDARY_BG },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: UI_COLORS.TEXT_MUTED, marginTop: 4 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, borderWidth: 1, borderColor: UI_COLORS.BORDER,
    paddingHorizontal: 12, marginBottom: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: UI_COLORS.TEXT_PRIMARY },
  filterRow: { marginBottom: 12, flexGrow: 0 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: UI_COLORS.CARD_BG, borderWidth: 1, borderColor: UI_COLORS.BORDER, marginRight: 8,
  },
  filterChipActive: { backgroundColor: UI_COLORS.ACCENT_LIGHT, borderColor: UI_COLORS.ACCENT },
  filterText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_MUTED },
  filterTextActive: { color: UI_COLORS.ACCENT },
  countText: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, marginBottom: 10 },
  committeeCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 14, borderWidth: 1, borderColor: UI_COLORS.BORDER,
    marginBottom: 8, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  committeeHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  chamberIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  chamberIconText: { fontSize: 16, fontWeight: '800' },
  committeeInfo: { flex: 1, gap: 4 },
  committeeName: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chamberBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  chamberBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  memberCount: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  membersSection: { borderTopWidth: 1, borderTopColor: UI_COLORS.BORDER, paddingHorizontal: 14, paddingVertical: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  memberAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  memberAvatarText: { fontSize: 13, fontWeight: '700' },
  memberInfo: { flex: 1, gap: 2 },
  memberName: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  memberMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberParty: { fontSize: 10, fontWeight: '800' },
  memberState: { fontSize: 10, color: UI_COLORS.TEXT_MUTED },
  roleBadge: { backgroundColor: UI_COLORS.ACCENT_LIGHT, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  roleBadgeText: { fontSize: 9, fontWeight: '700', color: UI_COLORS.ACCENT, textTransform: 'capitalize' },
  noMembers: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, textAlign: 'center', padding: 16 },
});
