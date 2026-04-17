import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { UI_COLORS } from '../constants/colors';

export interface BarChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

interface SimpleBarChartProps {
  data: BarChartDataPoint[];
  title: string;
}

/** Format large numbers as abbreviated strings: $1.2M, $45K, etc. */
function formatAbbrev(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  if (value > 0) return `$${value}`;
  return '$0';
}

export default function SimpleBarChart({ data, title }: SimpleBarChartProps) {
  if (!data || data.length === 0) return null;

  // Bars fill the chartCard width via flex: 1 — the container's layout
  // handles sizing responsively, so we don't need Dimensions or a hook here.
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <View style={[styles.accentBar, { backgroundColor: UI_COLORS.GOLD }]} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.chartCard}>
        {data.map((item, index) => {
          const barFraction = item.value / maxValue;
          const barColor = item.color || UI_COLORS.GOLD;

          return (
            <View key={index} style={styles.barRow}>
              <Text style={styles.barLabel} numberOfLines={1}>
                {item.label}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${Math.max(barFraction * 100, 2)}%`,
                      backgroundColor: barColor,
                    },
                  ]}
                />
              </View>
              <Text style={styles.barValue}>{formatAbbrev(item.value)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  accentBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
  },
  title: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '700',
  },
  chartCard: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
    gap: 12,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    width: 90,
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '500',
  },
  barTrack: {
    flex: 1,
    height: 22,
    backgroundColor: UI_COLORS.BORDER_LIGHT,
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
  barValue: {
    width: 58,
    textAlign: 'right',
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
