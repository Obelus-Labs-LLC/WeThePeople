import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { UI_COLORS } from '../constants/colors';

interface SectionHeaderProps {
  title: string;
  accent?: string;
  onViewAll?: () => void;
  viewAllLabel?: string;
}

export default function SectionHeader({ title, accent, onViewAll, viewAllLabel = 'View all' }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.accentBar, { backgroundColor: accent || UI_COLORS.ACCENT }]} />
      <Text style={styles.title}>{title}</Text>
      {onViewAll && (
        <TouchableOpacity onPress={onViewAll}>
          <Text style={styles.viewAll}>{viewAllLabel} →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  accentBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
    marginRight: 10,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: UI_COLORS.TEXT_PRIMARY,
  },
  viewAll: {
    fontSize: 13,
    color: UI_COLORS.ACCENT,
    fontWeight: '600',
  },
});
