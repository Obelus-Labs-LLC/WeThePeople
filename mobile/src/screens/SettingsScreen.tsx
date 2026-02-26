import React from 'react';
import Constants from 'expo-constants';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { UI_COLORS } from '../constants/colors';

export default function SettingsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Info</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Version</Text>
          <Text style={styles.value}>1.0.0</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>API Server</Text>
          <Text style={styles.value}>{(Constants.expoConfig?.extra?.apiUrl || 'localhost').replace(/^https?:\/\//, '').replace(/:\d+$/, '')}</Text>
        </View>
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <Text style={styles.label}>Developer</Text>
          <Text style={styles.value}>Obelus Labs</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.aboutText}>
          We The People tracks what the powerful actually do — legislative actions,
          votes, and bills. Built for transparency across politics, finance, health,
          and beyond.
        </Text>
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
    gap: 20,
  },
  section: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionTitle: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.BORDER,
  },
  label: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 14,
  },
  value: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: '500',
  },
  aboutText: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
  },
});
