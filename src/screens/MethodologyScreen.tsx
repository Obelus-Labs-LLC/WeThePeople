import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';

const DATA_SOURCES = [
  { source: 'Senate LDA', data: 'Lobbying records', frequency: 'Updated daily', icon: 'megaphone', color: '#1B7A3D' },
  { source: 'USASpending.gov', data: 'Government contracts', frequency: 'Updated weekly', icon: 'cash', color: '#2563EB' },
  { source: 'Federal Register', data: 'Enforcement actions', frequency: 'Updated daily', icon: 'shield-checkmark', color: '#DC2626' },
  { source: 'Congress.gov', data: 'Bills, votes', frequency: 'Updated daily', icon: 'document-text', color: '#8B5CF6' },
  { source: 'OpenFDA', data: 'Drug adverse events, recalls', frequency: 'Updated monthly', icon: 'medkit', color: '#F43F5E' },
  { source: 'ClinicalTrials.gov', data: 'Clinical trials', frequency: 'Updated weekly', icon: 'flask', color: '#10B981' },
  { source: 'SEC EDGAR', data: 'Financial filings', frequency: 'Updated daily', icon: 'document', color: '#F59E0B' },
  { source: 'USPTO', data: 'Patents', frequency: 'Updated weekly', icon: 'bulb', color: '#EA580C' },
  { source: 'EPA GHGRP', data: 'Emissions data', frequency: 'Updated annually', icon: 'leaf', color: '#475569' },
];

const LIMITATIONS = [
  'Senate vote data is not yet available from the Congress.gov API v3.',
  'Congressional trades limited to 1,000 most recent via Quiver free tier.',
  'Some enforcement actions may have incomplete penalty data.',
  'Lobbying data begins from 2020; historical data before that is not included.',
  'State-level data coverage varies; not all 50 states are fully synced yet.',
  'Company matching to lobbying/contract records uses name matching, which may miss some connections.',
];

export default function MethodologyScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero */}
      <LinearGradient
        colors={['#1B7A3D', '#15693A', '#0F5831']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="flask" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Methodology</Text>
          </View>
          <Text style={styles.heroSubtitle}>How we collect, process, and present public data</Text>
        </View>
      </LinearGradient>

      {/* About Our Data */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.accentBar, { backgroundColor: UI_COLORS.ACCENT }]} />
          <Text style={styles.sectionTitle}>About Our Data</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.bodyText}>
            WeThePeople aggregates publicly available government data from official APIs and public records.
            Our goal is to make it easy to follow the flow of money between corporations and politicians
            across all sectors of the economy.
          </Text>
          <Text style={[styles.bodyText, { marginTop: 8 }]}>
            Every data point is sourced from an official government database or regulated disclosure.
            We do not generate or estimate any figures. Where data may be incomplete, we note the limitations.
          </Text>
        </View>
      </View>

      {/* Data Sources */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.accentBar, { backgroundColor: UI_COLORS.GOLD }]} />
          <Text style={styles.sectionTitle}>Data Sources</Text>
        </View>
        {DATA_SOURCES.map((ds, i) => (
          <View key={ds.source} style={[styles.sourceRow, i < DATA_SOURCES.length - 1 && styles.sourceRowBorder]}>
            <View style={[styles.sourceIcon, { backgroundColor: ds.color + '12' }]}>
              <Ionicons name={ds.icon as any} size={16} color={ds.color} />
            </View>
            <View style={styles.sourceInfo}>
              <Text style={styles.sourceName}>{ds.source}</Text>
              <Text style={styles.sourceData}>{ds.data}</Text>
            </View>
            <View style={styles.freqBadge}>
              <Text style={styles.freqText}>{ds.frequency}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Known Limitations */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.accentBar, { backgroundColor: UI_COLORS.WARNING }]} />
          <Text style={styles.sectionTitle}>Known Limitations</Text>
        </View>
        <View style={styles.card}>
          {LIMITATIONS.map((lim, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bullet}>{'  \u2022  '}</Text>
              <Text style={styles.bulletText}>{lim}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Disclaimer */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.accentBar, { backgroundColor: UI_COLORS.TEXT_MUTED }]} />
          <Text style={styles.sectionTitle}>Disclaimer</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.legalText}>
            This app provides publicly available government data for informational purposes only.
            It is not intended as legal, financial, or political advice. All data is sourced from
            official government APIs and public records. We make no guarantees about completeness
            or accuracy. Always verify information with original sources.
          </Text>
        </View>
      </View>

      {/* GitHub Link */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.githubButton}
          onPress={() => Linking.openURL('https://github.com/Obelus-Labs-LLC/WeThePeople')}
          activeOpacity={0.7}
        >
          <Ionicons name="logo-github" size={20} color="#FFFFFF" />
          <Text style={styles.githubText}>View on GitHub</Text>
          <Ionicons name="open-outline" size={16} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  content: { paddingBottom: 32 },
  hero: {
    borderRadius: 16, padding: 20, marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    overflow: 'hidden', position: 'relative',
  },
  heroOrb: {
    position: 'absolute', top: -60, right: -40, width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroInner: { position: 'relative' },
  heroIconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19 },
  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  accentBar: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 16, fontWeight: '700' },
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  bodyText: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 14, lineHeight: 21 },
  sourceRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG,
    padding: 12, borderWidth: 1, borderColor: UI_COLORS.BORDER, borderRadius: 10, marginBottom: 6, gap: 10,
  },
  sourceRowBorder: {},
  sourceIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sourceInfo: { flex: 1 },
  sourceName: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  sourceData: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 1 },
  freqBadge: {
    backgroundColor: UI_COLORS.ACCENT + '12', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  freqText: { fontSize: 10, fontWeight: '600', color: UI_COLORS.ACCENT },
  bulletRow: { flexDirection: 'row', marginBottom: 6 },
  bullet: { color: UI_COLORS.TEXT_MUTED, fontSize: 14 },
  bulletText: { flex: 1, color: UI_COLORS.TEXT_SECONDARY, fontSize: 13, lineHeight: 19 },
  legalText: { color: UI_COLORS.TEXT_MUTED, fontSize: 13, lineHeight: 19 },
  githubButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#24292E', borderRadius: 10, padding: 14,
  },
  githubText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
