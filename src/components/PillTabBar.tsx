import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { UI_COLORS } from '../constants/colors';

interface Tab {
  key: string;
  label: string;
}

interface PillTabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  accentColor?: string;
}

export default function PillTabBar({ tabs, activeTab, onTabChange, accentColor }: PillTabBarProps) {
  const accent = accentColor || UI_COLORS.ACCENT;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onTabChange(tab.key)}
            style={[
              styles.pill,
              active && { backgroundColor: accent, borderColor: accent },
            ]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: UI_COLORS.TEXT_SECONDARY,
  },
  labelActive: {
    color: '#FFFFFF',
  },
});
