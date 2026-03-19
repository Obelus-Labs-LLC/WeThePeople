import React, { useState, useEffect } from 'react';
import Constants from 'expo-constants';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { DataFreshnessResponse } from '../api/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

function SourceRow({ icon, color, label, detail, coming, last }: { icon: string; color: string; label: string; detail: string; coming?: boolean; last?: boolean }) {
  return (
    <View style={[settingsStyles.sourceRow, !last && settingsStyles.sourceRowBorder]}>
      <View style={[settingsStyles.sourceIcon, { backgroundColor: color + '12' }]}>
        <Ionicons name={icon as any} size={14} color={color} />
      </View>
      <View style={settingsStyles.sourceInfo}>
        <View style={settingsStyles.sourceLabelRow}>
          <Text style={settingsStyles.sourceLabel}>{label}</Text>
          {coming && (
            <View style={settingsStyles.comingSoonBadge}>
              <Text style={settingsStyles.comingSoonText}>Coming Soon</Text>
            </View>
          )}
        </View>
        <Text style={settingsStyles.sourceDetail}>{detail}</Text>
      </View>
    </View>
  );
}

type SectorKey = 'politics' | 'finance' | 'health' | 'tech' | 'environment' | 'other';

const DATA_SOURCES: { sector: SectorKey; title: string; color: string; icon: string; sources: { icon: string; label: string; detail: string; coming?: boolean }[] }[] = [
  {
    sector: 'politics',
    title: 'Politics',
    color: '#1B7A3D',
    icon: 'flag',
    sources: [
      { icon: 'document-text', label: 'Congress.gov API', detail: 'Bills, votes, member profiles, committee data' },
      { icon: 'cash', label: 'FEC', detail: 'Campaign finance, donor records, PAC filings' },
      { icon: 'megaphone', label: 'OpenSecrets / Senate LDA', detail: 'Lobbying disclosures, revolving door data' },
      { icon: 'analytics', label: 'GovTrack.us', detail: 'Bill tracking, legislator analysis, vote records' },
      { icon: 'newspaper', label: 'ProPublica Congress API', detail: 'Vote roll calls, floor actions, statements' },
      { icon: 'business', label: 'White House Briefings', detail: 'Executive orders, presidential actions' },
    ],
  },
  {
    sector: 'finance',
    title: 'Finance',
    color: '#D4A017',
    icon: 'trending-up',
    sources: [
      { icon: 'document', label: 'SEC EDGAR', detail: '10-K, 10-Q, 8-K filings, insider transactions' },
      { icon: 'shield-checkmark', label: 'FDIC BankFind', detail: 'Bank financials, capital ratios, asset reports' },
      { icon: 'alert-circle', label: 'CFPB', detail: 'Consumer complaints, enforcement actions' },
      { icon: 'stats-chart', label: 'Federal Reserve (FRED)', detail: 'Interest rates, GDP, employment, CPI' },
      { icon: 'wallet', label: 'Treasury Department', detail: 'Fiscal data, national debt, spending' },
      { icon: 'bar-chart', label: 'Alpha Vantage', detail: 'Stock quotes, fundamentals, market data' },
    ],
  },
  {
    sector: 'health',
    title: 'Health',
    color: '#DC2626',
    icon: 'heart',
    sources: [
      { icon: 'medkit', label: 'FDA openFDA', detail: 'Drug adverse events, device recalls, inspections' },
      { icon: 'flask', label: 'ClinicalTrials.gov', detail: 'Active trials, phases, enrollment, results' },
      { icon: 'card', label: 'CMS Open Payments', detail: 'Industry payments to physicians' },
      { icon: 'pulse', label: 'CDC WONDER', detail: 'Mortality, disease surveillance, health statistics', coming: true },
      { icon: 'school', label: 'NIH RePORTER', detail: 'Federal research grants, project data', coming: true },
    ],
  },
  {
    sector: 'tech',
    title: 'Technology',
    color: '#2563EB',
    icon: 'hardware-chip',
    sources: [
      { icon: 'bulb', label: 'USPTO PatentsView', detail: 'Patents, inventors, assignees, classifications' },
      { icon: 'cash', label: 'USASpending.gov', detail: 'Federal contracts, grants, subawards' },
      { icon: 'megaphone', label: 'Senate LDA', detail: 'Tech lobbying disclosures, expenditures' },
      { icon: 'warning', label: 'FTC', detail: 'Antitrust enforcement, consent decrees, fines' },
      { icon: 'radio', label: 'FCC', detail: 'Spectrum auctions, telecom regulations', coming: true },
    ],
  },
  {
    sector: 'environment',
    title: 'Environment & Energy',
    color: '#10B981',
    icon: 'leaf',
    sources: [
      { icon: 'globe', label: 'EPA Envirofacts', detail: 'Emissions, violations, Superfund sites', coming: true },
      { icon: 'flame', label: 'EIA (Energy)', detail: 'Production, consumption, prices, forecasts', coming: true },
      { icon: 'construct', label: 'OSHA', detail: 'Workplace safety violations, inspections', coming: true },
    ],
  },
  {
    sector: 'other',
    title: 'Agriculture & Defense',
    color: '#64748B',
    icon: 'layers',
    sources: [
      { icon: 'nutrition', label: 'USDA NASS', detail: 'Crop reports, livestock data, farm economics', coming: true },
      { icon: 'shield', label: 'DOD / DSCA', detail: 'Defense contracts, arms sales, base closures', coming: true },
      { icon: 'people', label: 'BLS', detail: 'Employment, wages, CPI, productivity', coming: true },
      { icon: 'map', label: 'Census Bureau', detail: 'Demographics, economic indicators, trade', coming: true },
    ],
  },
];

const TOTAL_SOURCES = DATA_SOURCES.reduce((sum, s) => sum + s.sources.length, 0);

interface SettingsScreenProps {
  navigation?: any;
}

export default function SettingsScreen({ navigation }: SettingsScreenProps) {
  const [expanded, setExpanded] = useState<Set<SectorKey>>(new Set(['politics']));
  const [freshness, setFreshness] = useState<DataFreshnessResponse | null>(null);
  const [freshnessLoading, setFreshnessLoading] = useState(true);

  useEffect(() => {
    apiClient.getDataFreshness()
      .then(setFreshness)
      .catch(() => {})
      .finally(() => setFreshnessLoading(false));
  }, []);

  const toggle = (key: SectorKey) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
          <InfoRow icon="code-slash" label="Version" value={Constants.expoConfig?.version || (Constants as any).manifest?.version || '1.0.0'} />
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

      {/* Quick Links */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.accentBar, { backgroundColor: UI_COLORS.ACCENT }]} />
          <Text style={styles.sectionTitle}>Quick Links</Text>
        </View>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => navigation?.navigate?.('Methodology')}
          activeOpacity={0.7}
        >
          <View style={[styles.linkIcon, { backgroundColor: UI_COLORS.GOLD + '12' }]}>
            <Ionicons name="flask-outline" size={18} color={UI_COLORS.GOLD} />
          </View>
          <View style={styles.linkInfo}>
            <Text style={styles.linkTitle}>Methodology</Text>
            <Text style={styles.linkSubtitle}>Data sources and known limitations</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.linkRow, { marginTop: 6 }]}
          onPress={() => navigation?.navigate?.('About')}
          activeOpacity={0.7}
        >
          <View style={[styles.linkIcon, { backgroundColor: UI_COLORS.ACCENT + '12' }]}>
            <Ionicons name="information-circle-outline" size={18} color={UI_COLORS.ACCENT} />
          </View>
          <View style={styles.linkInfo}>
            <Text style={styles.linkTitle}>About</Text>
            <Text style={styles.linkSubtitle}>Mission, team, and links</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
        </TouchableOpacity>
      </View>

      {/* Data Freshness */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.accentBar, { backgroundColor: UI_COLORS.SUCCESS }]} />
          <Text style={styles.sectionTitle}>Data Freshness</Text>
        </View>
        <View style={styles.card}>
          {freshnessLoading ? (
            <ActivityIndicator size="small" color={UI_COLORS.ACCENT} />
          ) : freshness ? (
            Object.entries(freshness).map(([key, item], i, arr) => (
              <View key={key} style={[settingsStyles.infoRow, i < arr.length - 1 && settingsStyles.infoRowBorder]}>
                <View style={settingsStyles.infoRowLeft}>
                  <Ionicons name="sync-outline" size={14} color={UI_COLORS.TEXT_MUTED} />
                  <Text style={settingsStyles.infoLabel}>{key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={settingsStyles.infoValue}>
                    {item.last_updated ? new Date(item.last_updated).toLocaleDateString() : 'N/A'}
                  </Text>
                  <Text style={{ fontSize: 10, color: UI_COLORS.TEXT_MUTED }}>{item.record_count.toLocaleString()} records</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={{ color: UI_COLORS.TEXT_MUTED, fontSize: 13 }}>Unable to load freshness data</Text>
          )}
        </View>
      </View>

      {/* Data Sources — Collapsible by Sector */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.accentBar, { backgroundColor: UI_COLORS.GOLD }]} />
          <Text style={styles.sectionTitle}>Data Sources</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{TOTAL_SOURCES}</Text>
          </View>
        </View>

        {DATA_SOURCES.map((group) => {
          const isExpanded = expanded.has(group.sector);
          return (
            <View key={group.sector} style={styles.sourceGroup}>
              <TouchableOpacity
                style={styles.sourceGroupHeader}
                onPress={() => toggle(group.sector)}
                activeOpacity={0.7}
              >
                <View style={[styles.sourceGroupIcon, { backgroundColor: group.color + '12' }]}>
                  <Ionicons name={group.icon as any} size={16} color={group.color} />
                </View>
                <Text style={styles.sourceGroupTitle}>{group.title}</Text>
                <Text style={styles.sourceGroupCount}>{group.sources.length}</Text>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={UI_COLORS.TEXT_MUTED}
                />
              </TouchableOpacity>
              {isExpanded && (
                <View style={styles.sourceGroupBody}>
                  {group.sources.map((src, i) => (
                    <SourceRow
                      key={src.label}
                      icon={src.icon}
                      color={group.color}
                      label={src.label}
                      detail={src.detail}
                      coming={src.coming}
                      last={i === group.sources.length - 1}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}
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
  sourceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  comingSoonBadge: {
    backgroundColor: '#F59E0B15',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#F59E0B25',
  },
  comingSoonText: {
    color: '#F59E0B',
    fontSize: 9,
    fontWeight: '700',
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
  countBadge: {
    backgroundColor: UI_COLORS.GOLD + '18',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.GOLD + '30',
  },
  countBadgeText: {
    color: UI_COLORS.GOLD,
    fontSize: 12,
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
  sourceGroup: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    marginBottom: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  sourceGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  sourceGroupIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceGroupTitle: {
    flex: 1,
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '600',
  },
  sourceGroupCount: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 12,
    fontWeight: '600',
    marginRight: 4,
  },
  sourceGroupBody: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.BORDER,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  linkIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkInfo: { flex: 1 },
  linkTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: UI_COLORS.TEXT_PRIMARY,
  },
  linkSubtitle: {
    fontSize: 12,
    color: UI_COLORS.TEXT_SECONDARY,
    marginTop: 1,
  },
});
