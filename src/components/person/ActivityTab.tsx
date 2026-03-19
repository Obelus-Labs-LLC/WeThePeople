import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../../constants/colors';
import { EmptyState } from '../ui';
import { FilterPillGroup } from '../FilterPillGroup';
import type { ActivityEntry, ActivityResponse } from '../../api/types';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const STATUS_COLORS: Record<string, string> = {
  introduced: '#6B7280',
  in_committee: '#D97706',
  passed_house: '#2563EB',
  passed_senate: '#2563EB',
  resolving_differences: '#7C3AED',
  to_president: '#8B5CF6',
  became_law: '#059669',
};

function statusLabel(status: string | null): string {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function isSponsored(role: string): boolean {
  return role === 'sponsored' || role === 'sponsor';
}

/* ─── Expandable Bill Card ─────────────────────────────────── */
function BillCard({ entry, onBillPress }: { entry: ActivityEntry; onBillPress?: (billId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const sponsored = isSponsored(entry.role);
  const handledRef = useRef(false);

  const toggle = () => {
    if (handledRef.current) {
      handledRef.current = false;
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={toggle} style={styles.billCard}>
      <View style={styles.billHeader}>
        <View style={[styles.roleBadge, sponsored ? styles.roleSponsor : styles.roleCosponsor]}>
          <Text style={[styles.roleBadgeText, sponsored ? styles.roleSponsorText : styles.roleCosponsorText]}>
            {sponsored ? 'Sponsored' : 'Cosponsored'}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={UI_COLORS.TEXT_MUTED} />
      </View>

      <Text style={styles.billTitle} numberOfLines={expanded ? undefined : 2}>{entry.title}</Text>

      <View style={styles.billMeta}>
        {entry.bill_id && (
          <TouchableOpacity
            onPress={() => { handledRef.current = true; onBillPress?.(entry.bill_id); }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={styles.billIdLink}>{entry.bill_id}</Text>
          </TouchableOpacity>
        )}
        {entry.policy_area && (
          <View style={styles.policyTag}>
            <Text style={styles.policyTagText}>{entry.policy_area}</Text>
          </View>
        )}
        {entry.status && (
          <View style={[styles.statusTag, { backgroundColor: (STATUS_COLORS[entry.status] || '#6B7280') + '18' }]}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[entry.status] || '#6B7280' }]} />
            <Text style={[styles.statusTagText, { color: STATUS_COLORS[entry.status] || '#6B7280' }]}>
              {statusLabel(entry.status)}
            </Text>
          </View>
        )}
      </View>

      {expanded && (
        <View style={styles.expandedSection}>
          {entry.latest_action && (
            <View style={styles.detailBlock}>
              <View style={styles.detailLabelRow}>
                <Ionicons name="time-outline" size={14} color={UI_COLORS.ACCENT} />
                <Text style={styles.detailLabel}>Latest Action</Text>
              </View>
              <Text style={styles.detailText}>{entry.latest_action}</Text>
              {entry.latest_action_date && (
                <Text style={styles.detailDate}>{new Date(entry.latest_action_date).toLocaleDateString()}</Text>
              )}
            </View>
          )}
          {entry.summary && (
            <View style={styles.detailBlock}>
              <View style={styles.detailLabelRow}>
                <Ionicons name="document-text-outline" size={14} color={UI_COLORS.ACCENT} />
                <Text style={styles.detailLabel}>Summary</Text>
              </View>
              <Text style={styles.detailText}>{entry.summary}</Text>
            </View>
          )}
          {entry.congress_url && (
            <TouchableOpacity style={styles.sourceLink} onPress={() => Linking.openURL(entry.congress_url!)}>
              <Ionicons name="globe-outline" size={14} color={UI_COLORS.ACCENT} />
              <Text style={styles.sourceLinkText}>View on Congress.gov</Text>
              <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

type RoleFilter = 'all' | 'sponsored' | 'cosponsored';

interface ActivityTabProps {
  activity: ActivityResponse | null;
  onBillPress: (billId: string) => void;
}

export function ActivityTab({ activity, onBillPress }: ActivityTabProps) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  const entries = activity?.entries || [];
  const total = activity?.total || 0;
  const sponsoredCount = activity?.sponsored_count || 0;
  const cosponsoredCount = activity?.cosponsored_count || 0;

  const filteredEntries = roleFilter === 'all'
    ? entries
    : roleFilter === 'sponsored'
      ? entries.filter((e) => isSponsored(e.role))
      : entries.filter((e) => !isSponsored(e.role));

  const roleOptions = [
    { key: 'all' as RoleFilter, label: `All (${total})` },
    { key: 'sponsored' as RoleFilter, label: `Sponsored (${sponsoredCount})` },
    { key: 'cosponsored' as RoleFilter, label: `Cosponsored (${cosponsoredCount})` },
  ];

  return (
    <View style={styles.tabContent}>
      <FilterPillGroup options={roleOptions} selected={roleFilter} onSelect={setRoleFilter} scrollable />

      <Text style={styles.activityHint}>
        <Ionicons name="hand-left-outline" size={12} color={UI_COLORS.TEXT_MUTED} />
        {'  Tap any bill to see details & Congress.gov link'}
      </Text>

      {filteredEntries.length === 0 ? (
        <EmptyState
          title="No activity"
          message={roleFilter !== 'all' ? 'No bills match this filter.' : 'No legislative activity found. Data may still be syncing.'}
        />
      ) : (
        filteredEntries.map((entry, idx) => (
          <BillCard
            key={`${entry.bill_id}-${entry.role}-${idx}`}
            entry={entry}
            onBillPress={onBillPress}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabContent: { gap: 12, paddingHorizontal: 16 },
  activityHint: { color: UI_COLORS.TEXT_MUTED, fontSize: 12, textAlign: 'center', marginBottom: 4 },
  // ── Bill card ──
  billCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  billHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  roleSponsor: { backgroundColor: '#DCFCE7' },
  roleCosponsor: { backgroundColor: '#DBEAFE' },
  roleBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  roleSponsorText: { color: '#15803D' },
  roleCosponsorText: { color: '#1D4ED8' },
  billTitle: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  billMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  billIdLink: { color: UI_COLORS.ACCENT, fontSize: 11, fontWeight: '600', textDecorationLine: 'underline' },
  policyTag: { backgroundColor: UI_COLORS.ACCENT_LIGHT, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  policyTagText: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 10 },
  statusTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTagText: { fontSize: 10, fontWeight: '600' },
  // ── Expanded ──
  expandedSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: UI_COLORS.BORDER_LIGHT, gap: 12 },
  detailBlock: { gap: 4 },
  detailLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  detailLabel: { color: UI_COLORS.ACCENT, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailText: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 12, lineHeight: 17, paddingLeft: 8 },
  detailDate: { color: UI_COLORS.TEXT_MUTED, fontSize: 11, paddingLeft: 8, marginTop: 2 },
  sourceLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: UI_COLORS.ACCENT_LIGHT, paddingHorizontal: 12,
    paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start',
  },
  sourceLinkText: { color: UI_COLORS.ACCENT, fontSize: 12, fontWeight: '600' },
});
