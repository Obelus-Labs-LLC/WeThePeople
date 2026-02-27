import React from 'react';
import Constants from 'expo-constants';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';

function InfoRow({ icon, label, value, last }: { icon: string; label: string; value: string; last?: boolean }) {
  return (
    <View style={[settingsStyles.infoRow, !last && settingsStyles.infoRowBorder]}>
      <View style={settingsStyles.infoRowLeft}>
        <Ionicons name={icon as any} size={16} color={UI_COLORS.TEXT_MUTED} />
        <Text style={settingsStyles.infoLabel}>{label}</Text>
      </View>
      <Text style={settingsStyles.infoValue}>{value}</Text>
    </View>
  );
}

function SourceRow({ icon, color, label, detail, last }: { icon: string; color: string; label: string; detail: string; last?: boolean }) {
  return (
    <View style={[settingsStyles.sourceRow, !last && settingsStyles.sourceRowBorder]}>
      <View style={[settingsStyles.sourceIcon, { backgroundColor: color + '12' }]}>
        <Ionicons name={icon as any} size={14} color={color} />
      </View>
      <View style={settingsStyles.sourceInfo}>
        <Text style={settingsStyles.sourceLabel}>{label}</Text>
        <Text style={settingsStyles.sourceDetail}>{detail}</Text>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
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
            <Ionicons name="settings-sharp" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Settings</Text>
          </View>
          <Text style={styles.heroSubtitle}>App info and data sources</Text>
        </View>
      </LinearGradient>

      {/* App Info */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.accentBar, { backgroundColor: UI_COLORS.ACCENT }]} />
          <Text style={styles.sectionTitle}>App Info</Text>
        </View>
        <View style={styles.card}>
          <InfoRow icon="code-slash" label="Version" value="1.0.0" />
          <InfoRow icon="server" label="API Server" value={(Constants.expoConfig?.extra?.apiUrl || 'localhost').replace(/^https?:\/\//, '').replace(/:\d+$/, '')} />
          <InfoRow icon="business" label="Developer" value="Obelus Labs LLC" last />
        </View>
      </View>

      {/* About */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.accentBar, { backgroundColor: UI_COLORS.ACCENT }]} />
          <Text style={styles.sectionTitle}>About</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.aboutTitle}>We The People</Text>
          <Text style={styles.aboutText}>
            A public accountability platform that tracks what the powerful actually do.
            We monitor legislative actions, votes, bills, financial filings, health data,
            and technology oversight — all in one place.
          </Text>
          <Text style={[styles.aboutText, { marginTop: 8 }]}>
            Built for transparency across politics, finance, health, and technology sectors.
            Every claim is verified against real data sources.
          </Text>
        </View>
      </View>

      {/* Data Sources */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.accentBar, { backgroundColor: UI_COLORS.GOLD }]} />
          <Text style={styles.sectionTitle}>Data Sources</Text>
        </View>
        <View style={styles.card}>
          <SourceRow icon="flag" color="#1B7A3D" label="Congress.gov API" detail="Bills, votes, members" />
          <SourceRow icon="trending-up" color="#D4A017" label="SEC EDGAR" detail="Financial filings" />
          <SourceRow icon="shield-checkmark" color="#D4A017" label="FDIC BankFind" detail="Bank financials" />
          <SourceRow icon="alert-circle" color="#D4A017" label="CFPB" detail="Consumer complaints" />
          <SourceRow icon="heart" color="#DC2626" label="FDA openFDA" detail="Recalls, adverse events" />
          <SourceRow icon="flask" color="#DC2626" label="ClinicalTrials.gov" detail="Clinical trials" />
          <SourceRow icon="hardware-chip" color="#2563EB" label="USPTO PatentsView" detail="Patents" />
          <SourceRow icon="cash" color="#2563EB" label="USASpending.gov" detail="Government contracts" last />
        </View>
      </View>

      {/* Legal */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.accentBar, { backgroundColor: UI_COLORS.TEXT_MUTED }]} />
          <Text style={styles.sectionTitle}>Legal</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.legalText}>
            This app provides publicly available government data for informational purposes.
            All data is sourced from official government APIs and public records.
          </Text>
          <Text style={styles.legalCopy}>© 2025 Obelus Labs LLC. All rights reserved.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const settingsStyles = StyleSheet.create({
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.BORDER,
  },
  infoRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 14,
  },
  infoValue: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: '500',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  sourceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.BORDER,
  },
  sourceIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceInfo: {
    flex: 1,
  },
  sourceLabel: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 13,
    fontWeight: '600',
  },
  sourceDetail: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    marginTop: 1,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.SECONDARY_BG,
  },
  content: {
    paddingBottom: 32,
  },
  hero: {
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  heroOrb: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroInner: {
    position: 'relative',
  },
  heroIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    lineHeight: 19,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  accentBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
  },
  sectionTitle: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '700',
  },
  card: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  aboutTitle: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  aboutText: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 21,
  },
  legalText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 13,
    lineHeight: 19,
  },
  legalCopy: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 12,
    marginTop: 10,
    fontWeight: '500',
  },
});
