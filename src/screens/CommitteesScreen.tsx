import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';

const PREVIEW_COMMITTEES = [
  {
    name: 'Appropriations',
    icon: 'cash-outline' as const,
    description: 'Controls federal spending and budget allocations across all agencies.',
  },
  {
    name: 'Armed Services',
    icon: 'shield-outline' as const,
    description: 'Oversees defense policy, military operations, and the Department of Defense.',
  },
  {
    name: 'Judiciary',
    icon: 'briefcase-outline' as const,
    description: 'Handles federal courts, immigration policy, and constitutional amendments.',
  },
];

const COMING_SOON_FEATURES = [
  'Full committee membership rosters',
  'Subcommittee breakdowns',
  'Committee hearing schedules',
  'Bills assigned to each committee',
  'Member seniority rankings',
];

export default function CommitteesScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.headerCard}>
        <Ionicons name="people-outline" size={40} color={UI_COLORS.ACCENT} />
        <Text style={styles.headerTitle}>Congressional Committees</Text>
        <Text style={styles.headerSubtitle}>
          Committee data is coming soon. We're building comprehensive tracking of all
          House and Senate committees.
        </Text>
      </View>

      {/* Preview cards */}
      <Text style={styles.sectionLabel}>PREVIEW</Text>
      {PREVIEW_COMMITTEES.map((committee) => (
        <View key={committee.name} style={styles.previewCard}>
          <View style={styles.previewIcon}>
            <Ionicons name={committee.icon} size={22} color={UI_COLORS.ACCENT} />
          </View>
          <View style={styles.previewInfo}>
            <Text style={styles.previewName}>{committee.name}</Text>
            <Text style={styles.previewDesc}>{committee.description}</Text>
          </View>
        </View>
      ))}

      {/* What's coming */}
      <View style={styles.comingCard}>
        <View style={styles.comingHeader}>
          <Ionicons name="rocket-outline" size={18} color={UI_COLORS.GOLD} />
          <Text style={styles.comingTitle}>What's Coming</Text>
        </View>
        {COMING_SOON_FEATURES.map((feature, i) => (
          <View key={i} style={styles.featureRow}>
            <Ionicons name="checkmark-circle-outline" size={16} color={UI_COLORS.SUCCESS} />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.SECONDARY_BG,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  headerCard: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: UI_COLORS.TEXT_PRIMARY,
    marginTop: 12,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 13,
    color: UI_COLORS.TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 19,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: UI_COLORS.TEXT_MUTED,
    letterSpacing: 1,
    marginBottom: 10,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    marginBottom: 8,
    opacity: 0.5,
    gap: 12,
  },
  previewIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: UI_COLORS.ACCENT_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewInfo: {
    flex: 1,
    gap: 2,
  },
  previewName: {
    fontSize: 15,
    fontWeight: '700',
    color: UI_COLORS.TEXT_PRIMARY,
  },
  previewDesc: {
    fontSize: 12,
    color: UI_COLORS.TEXT_MUTED,
    lineHeight: 17,
  },
  comingCard: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  comingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  comingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: UI_COLORS.TEXT_PRIMARY,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  featureText: {
    fontSize: 13,
    color: UI_COLORS.TEXT_SECONDARY,
    flex: 1,
  },
});
