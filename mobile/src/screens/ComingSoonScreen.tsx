import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';

const DEFAULT_GRADIENT_START = '#6B7280';
const DEFAULT_GRADIENT_END = '#374151';
const DEFAULT_ICON = '⏳';

export default function ComingSoonScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const rawSector = route.params?.sector;

  // Defensive: ComingSoon may be navigated to without params. Never let
  // LinearGradient receive undefined/null colors — it throws a native error.
  const sector = {
    name: (typeof rawSector?.name === 'string' && rawSector.name) || 'This Sector',
    icon: (typeof rawSector?.icon === 'string' && rawSector.icon) || DEFAULT_ICON,
    gradientStart:
      (typeof rawSector?.gradientStart === 'string' && rawSector.gradientStart) ||
      DEFAULT_GRADIENT_START,
    gradientEnd:
      (typeof rawSector?.gradientEnd === 'string' && rawSector.gradientEnd) ||
      DEFAULT_GRADIENT_END,
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[sector.gradientStart, sector.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.iconCircle}
      >
        <Text style={styles.icon}>{sector.icon}</Text>
      </LinearGradient>
      <Text style={styles.title}>{sector.name}</Text>
      <Text style={styles.heading}>Coming Soon</Text>
      <Text style={styles.message}>
        We're building accountability tools for {sector.name.toLowerCase()}. Check back soon.
      </Text>
      <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
        <Text style={styles.buttonText}>Back to Home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.PRIMARY_BG,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  icon: {
    fontSize: 42,
  },
  title: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  heading: {
    color: UI_COLORS.ACCENT,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  message: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
    maxWidth: 280,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: UI_COLORS.ACCENT,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
