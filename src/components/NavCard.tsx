import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';

interface NavCardProps {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  accent?: string;
}

export default function NavCard({ icon, title, subtitle, onPress, accent }: NavCardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.accentBar, { backgroundColor: accent || UI_COLORS.ACCENT }]} />
      <Ionicons name={icon as any} size={22} color={accent || UI_COLORS.ACCENT} style={styles.icon} />
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={UI_COLORS.TEXT_MUTED} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  accentBar: {
    width: 3,
    height: 28,
    borderRadius: 2,
    marginRight: 12,
  },
  icon: { marginRight: 12 },
  textContainer: { flex: 1 },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: UI_COLORS.TEXT_PRIMARY,
  },
  subtitle: {
    fontSize: 12,
    color: UI_COLORS.TEXT_SECONDARY,
    marginTop: 2,
  },
});
