import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';

export default function DataFreshness({ style }: { style?: object }) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    apiClient.getDataFreshness().then((data) => {
      const dates: string[] = [];
      const parts: string[] = [];
      for (const [key, val] of Object.entries(data)) {
        if (val && typeof val === 'object' && 'last_updated' in val) {
          const v = val as { last_updated: string; record_count: number };
          if (v.last_updated) dates.push(v.last_updated);
          if (v.record_count > 0) {
            const fmt = v.record_count >= 1000 ? `${(v.record_count / 1000).toFixed(1)}K` : String(v.record_count);
            parts.push(`${fmt} ${key}`);
          }
        }
      }
      const latest = dates.sort().reverse()[0];
      if (latest) {
        const d = new Date(latest);
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        setLabel(`Data as of ${dateStr}${parts.length ? ' · ' + parts.join(' · ') : ''}`);
      }
    }).catch(() => {});
  }, []);

  if (!label) return null;

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  text: {
    fontSize: 11,
    color: UI_COLORS.TEXT_MUTED,
    fontFamily: 'monospace',
  },
});
