import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { UI_COLORS } from '../constants/colors';

export interface FilterOption<T extends string = string> {
  key: T;
  label: string;
}

interface FilterPillGroupProps<T extends string = string> {
  options: FilterOption<T>[];
  selected: T;
  onSelect: (key: T) => void;
  /** Wrap in horizontal ScrollView (default: false) */
  scrollable?: boolean;
}

/**
 * Reusable filter pill group used across list & detail screens.
 *
 * Segmented-control variant (non-scrollable):
 *   <FilterPillGroup options={PARTY_OPTIONS} selected={party} onSelect={setParty} />
 *
 * Horizontal-scroll variant:
 *   <FilterPillGroup options={opts} selected={sel} onSelect={setSel} scrollable />
 */
export function FilterPillGroup<T extends string>({
  options,
  selected,
  onSelect,
  scrollable = false,
}: FilterPillGroupProps<T>) {
  const pills = (
    <View style={styles.row}>
      {options.map((opt) => {
        const active = selected === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => onSelect(opt.key)}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
      >
        {pills}
      </ScrollView>
    );
  }

  return pills;
}

const styles = StyleSheet.create({
  scroll: {
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: UI_COLORS.CARD_BG,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
  },
  pillActive: {
    backgroundColor: UI_COLORS.ACCENT,
    borderColor: UI_COLORS.ACCENT,
    shadowColor: UI_COLORS.ACCENT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  pillText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 12,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
});
