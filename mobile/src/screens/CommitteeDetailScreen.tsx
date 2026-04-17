import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState, PartyBadge } from '../components/ui';
import { apiClient } from '../api/client';
import type { CommitteeDetail, CommitteeMember } from '../api/types';

const ACCENT = '#D97706';

export default function CommitteeDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const committeeId: string = route.params?.committee_id;
  const initialName: string | undefined = route.params?.committee_name;

  const [committee, setCommittee] = useState<CommitteeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!committeeId) {
      setError('No committee id provided');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    apiClient
      .getCommitteeDetail(committeeId)
      .then((res) => {
        setCommittee(res);
        navigation.setOptions({ title: (res.name || initialName || 'Committee').slice(0, 40) });
      })
      .catch((err) => setError(err?.message || 'Failed to load committee'))
      .finally(() => setLoading(false));
  }, [committeeId, navigation, initialName]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingSpinner message="Loading committee..." />;
  if (error || !committee) {
    return (
      <View style={styles.errorWrap}>
        <EmptyState title="Error" message={error || 'Committee not found'} />
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const chamberLabel = (committee.chamber || '').toLowerCase().includes('senate')
    ? 'Senate'
    : (committee.chamber || '').toLowerCase().includes('house')
      ? 'House'
      : committee.chamber || 'Joint';

  const leadership = (committee.members || []).filter(
    (m) => m.role === 'chair' || m.role === 'ranking_member' || m.role === 'vice_chair'
  );
  const rankAndFile = (committee.members || []).filter(
    (m) => !['chair', 'ranking_member', 'vice_chair'].includes(m.role || '')
  );

  const renderMember = (m: CommitteeMember) => {
    const name = m.display_name || m.member_name || m.bioguide_id;
    const role = (m.role || 'member').replace(/_/g, ' ');
    const stateParty = [m.member_party || m.party, m.state].filter(Boolean).join('-');
    const Row = (
      <View style={styles.memberRow}>
        <View style={styles.memberMain}>
          <Text style={styles.memberName} numberOfLines={1}>{name}</Text>
          <Text style={styles.memberRole}>
            {role.charAt(0).toUpperCase() + role.slice(1)}
            {stateParty ? ` · ${stateParty}` : ''}
          </Text>
        </View>
        {(m.member_party || m.party) && (
          <PartyBadge party={m.member_party || m.party || ''} />
        )}
        {m.person_id && (
          <Ionicons name="chevron-forward" size={14} color={UI_COLORS.TEXT_MUTED} />
        )}
      </View>
    );
    return m.person_id ? (
      <TouchableOpacity
        key={`${m.bioguide_id || m.person_id}-${m.role}`}
        onPress={() => navigation.navigate('PersonDetail', { person_id: m.person_id })}
        activeOpacity={0.7}
      >
        {Row}
      </TouchableOpacity>
    ) : (
      <View key={`${m.bioguide_id || name}-${m.role}`}>{Row}</View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.chamberRow}>
          <View style={styles.chamberBadge}>
            <Text style={styles.chamberBadgeText}>{chamberLabel}</Text>
          </View>
          {committee.committee_type && (
            <Text style={styles.metaText}>{committee.committee_type}</Text>
          )}
        </View>
        <Text style={styles.title}>{committee.name}</Text>
        {committee.jurisdiction && (
          <Text style={styles.jurisdiction}>{committee.jurisdiction}</Text>
        )}
        <View style={styles.linksRow}>
          {committee.url && (
            <TouchableOpacity
              style={styles.linkPill}
              onPress={() => Linking.openURL(committee.url!)}
            >
              <Ionicons name="globe-outline" size={13} color={ACCENT} />
              <Text style={styles.linkPillText}>Official site</Text>
            </TouchableOpacity>
          )}
          {committee.phone && (
            <TouchableOpacity
              style={styles.linkPill}
              onPress={() => Linking.openURL(`tel:${committee.phone}`)}
            >
              <Ionicons name="call-outline" size={13} color={ACCENT} />
              <Text style={styles.linkPillText}>{committee.phone}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {leadership.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Leadership</Text>
          {leadership.map(renderMember)}
        </View>
      )}

      {rankAndFile.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Members <Text style={styles.countBadge}>({rankAndFile.length})</Text>
          </Text>
          {rankAndFile.map(renderMember)}
        </View>
      )}

      {committee.subcommittees && committee.subcommittees.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Subcommittees</Text>
          {committee.subcommittees.map((s) => (
            <TouchableOpacity
              key={s.thomas_id}
              style={styles.subRow}
              onPress={() =>
                navigation.push('CommitteeDetail', {
                  committee_id: s.thomas_id,
                  committee_name: s.name,
                })
              }
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.subName}>{s.name}</Text>
                {s.member_count != null && (
                  <Text style={styles.subMeta}>{s.member_count} members</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: UI_COLORS.BORDER, marginBottom: 12,
  },
  chamberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  chamberBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    backgroundColor: '#D9770620', borderWidth: 1, borderColor: '#D9770640',
  },
  chamberBadgeText: { fontSize: 11, fontWeight: '700', color: ACCENT },
  metaText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, fontWeight: '600' },
  title: {
    fontSize: 18, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY,
    lineHeight: 24, marginBottom: 8,
  },
  jurisdiction: {
    fontSize: 13, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 19, marginBottom: 10,
  },
  linksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  linkPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: UI_COLORS.ACCENT_LIGHT,
  },
  linkPillText: { color: ACCENT, fontSize: 12, fontWeight: '600' },
  sectionTitle: {
    fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 10,
  },
  countBadge: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, fontWeight: '600' },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER,
  },
  memberMain: { flex: 1, marginRight: 8 },
  memberName: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  memberRole: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2, textTransform: 'capitalize' },
  subRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER,
  },
  subName: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  subMeta: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2 },
  errorWrap: {
    flex: 1, backgroundColor: UI_COLORS.PRIMARY_BG, justifyContent: 'center',
    alignItems: 'center', gap: 16, padding: 32,
  },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: ACCENT, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
  },
  retryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
