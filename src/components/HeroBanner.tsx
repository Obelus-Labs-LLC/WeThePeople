import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface HeroBannerProps {
  colors: [string, string];
  icon: string;
  title: string;
  subtitle: string;
}

export default function HeroBanner({ colors, icon, title, subtitle }: HeroBannerProps) {
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
      <View style={styles.content}>
        <Ionicons name={icon as any} size={28} color="rgba(255,255,255,0.9)" />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    paddingHorizontal: 24,
    paddingVertical: 32,
    paddingTop: 48,
  },
  content: {
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 20,
  },
});
