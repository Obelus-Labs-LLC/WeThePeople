import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { UI_COLORS } from '../../constants/colors';
import { StatCard } from '../ui';
import type { ActivityResponse, PersonProfile } from '../../api/types';

interface OverviewTabProps {
  activity: ActivityResponse | null;
  profile: PersonProfile | null;
}

export function OverviewTab({ activity, profile }: OverviewTabProps) {
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const total = activity?.total || 0;
  const sponsoredCount = activity?.sponsored_count || 0;
  const cosponsoredCount = activity?.cosponsored_count || 0;
  const policyAreas = activity?.policy_areas || {};

  return (
    <View style={styles.tabContent}>
      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statsRow}>
          <View style={styles.statsHalf}>
            <StatCard label="Bills Sponsored" value={sponsoredCount} accent="green" subtitle="Primary author" />
          </View>
          <View style={styles.statsHalf}>
            <StatCard label="Bills Cosponsored" value={cosponsoredCount} accent="emerald" subtitle="Signed on as supporter" />
          </View>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statsHalf}>
            <StatCard label="Total Bills" value={total} accent="gold" subtitle="All legislative activity" />
          </View>
          <TouchableOpacity style={styles.statsHalf} onPress={() => setCategoriesOpen(!categoriesOpen)}>
            <StatCard label="Policy Areas" value={Object.keys(policyAreas).length} accent="slate" subtitle="Tap to view" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Policy areas expansion */}
      {categoriesOpen && Object.keys(policyAreas).length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Policy Areas</Text>
          <Text style={styles.summaryText}>Policy areas this member has introduced or cosponsored legislation in:</Text>
          {Object.entries(policyAreas)
            .sort(([, a], [, b]) => b - a)
            .map(([area, count]) => (
              <View key={area} style={styles.factRow}>
                <Text style={styles.factLabel}>{area}:</Text>
                <Text style={styles.factValue}>{count} bill{count !== 1 ? 's' : ''}</Text>
              </View>
            ))}
        </View>
      )}

      {/* Legislative summary */}
      {total > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Legislative Summary</Text>
          <Text style={styles.summaryText}>
            {sponsoredCount} bill{sponsoredCount !== 1 ? 's' : ''} sponsored and{' '}
            {cosponsoredCount.toLocaleString()} cosponsored across{' '}
            {Object.keys(policyAreas).length} policy areas.
            {' '}Data sourced directly from Congress.gov.
          </Text>
        </View>
      )}

      {total === 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Legislative Activity</Text>
          <Text style={styles.summaryText}>
            Legislative activity data is still being synced for this member. Check back soon.
          </Text>
        </View>
      )}

      {profile?.infobox && Object.keys(profile.infobox).length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick Facts</Text>
          {Object.entries(profile.infobox)
            .filter(([key, val]) => {
              const skip = ['name', 'image', 'image_size', 'caption', 'imagesize', 'alt'];
              if (skip.includes(key.toLowerCase())) return false;
              if (val === null || val === undefined || val === '' || val === 'null') return false;
              if (key === 'junior_senior' && (!val || val === 'null')) return false;
              return true;
            })
            .slice(0, 10)
            .map(([key, val]) => (
              <View key={key} style={styles.factRow}>
                <Text style={styles.factLabel}>{key.replace(/_/g, ' ')}:</Text>
                <Text style={styles.factValue} numberOfLines={1}>{val}</Text>
              </View>
            ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabContent: { gap: 12, paddingHorizontal: 16 },
  statsGrid: { gap: 8 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statsHalf: { flex: 1 },
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 15, fontWeight: '700', marginBottom: 12 },
  summaryText: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  factRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  factLabel: { color: UI_COLORS.TEXT_MUTED, fontSize: 12, textTransform: 'capitalize' },
  factValue: { flex: 1, color: UI_COLORS.TEXT_PRIMARY, fontSize: 12 },
});
