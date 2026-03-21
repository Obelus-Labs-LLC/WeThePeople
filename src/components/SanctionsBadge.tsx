import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SanctionsBadgeProps {
  status: string | null | undefined;
  compact?: boolean;
}

const STATUS_CONFIG: Record<string, { bg: string; border: string; text: string; icon: string; label: string }> = {
  SANCTIONED: {
    bg: '#DC262615',
    border: '#DC262630',
    text: '#DC2626',
    icon: 'alert-circle',
    label: 'Sanctioned',
  },
  PEP: {
    bg: '#F59E0B15',
    border: '#F59E0B30',
    text: '#F59E0B',
    icon: 'shield',
    label: 'Politically Exposed',
  },
  WATCHLIST: {
    bg: '#EA580C15',
    border: '#EA580C30',
    text: '#EA580C',
    icon: 'eye',
    label: 'Watchlist',
  },
};

export default function SanctionsBadge({ status, compact = false }: SanctionsBadgeProps) {
  if (!status) return null;

  const config = STATUS_CONFIG[status];
  if (!config) return null;

  if (compact) {
    return (
      <View style={[styles.compactBadge, { backgroundColor: config.bg, borderColor: config.border }]}>
        <Ionicons name={config.icon as any} size={10} color={config.text} />
        <Text style={[styles.compactText, { color: config.text }]}>{config.label}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.badge, { backgroundColor: config.bg, borderColor: config.border }]}>
      <Ionicons name={config.icon as any} size={14} color={config.text} />
      <View style={styles.badgeContent}>
        <Text style={[styles.badgeLabel, { color: config.text }]}>{config.label}</Text>
        <Text style={[styles.badgeDetail, { color: config.text + 'AA' }]}>
          {status === 'SANCTIONED' ? 'OFAC/EU/UN sanctions list' :
           status === 'PEP' ? 'Politically exposed person' :
           'On monitoring watchlist'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 10,
  },
  badgeContent: {
    flex: 1,
  },
  badgeLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  badgeDetail: {
    fontSize: 11,
    marginTop: 1,
  },
  compactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  compactText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
