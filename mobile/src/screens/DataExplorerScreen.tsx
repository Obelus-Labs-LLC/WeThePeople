import React from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';

const ACCENT = '#6366F1';

// Mobile-appropriate version of DataExplorerPage. The web version is a big
// dashboard; on mobile we present it as a navigation hub that links into all
// the other data surfaces we already built.

interface Tile {
  title: string;
  desc: string;
  icon: string;
  color: string;
  screen: string;
  params?: any;
}

const TILES: Tile[] = [
  { title: 'Influence Explorer', desc: 'Top lobbyists, contractors, and overall stats', icon: 'pulse', color: '#7C3AED', screen: 'InfluenceExplorer' },
  { title: 'Influence Network', desc: 'Force-directed graph of who connects to whom', icon: 'git-network', color: '#7C3AED', screen: 'InfluenceNetwork' },
  { title: 'Money Flow', desc: 'Company \u2192 politician donation graph', icon: 'cash', color: '#3B82F6', screen: 'MoneyFlow' },
  { title: 'Closed Loops', desc: 'Lobby \u2192 bill \u2192 committee \u2192 donation', icon: 'git-compare', color: '#DC2626', screen: 'ClosedLoop' },
  { title: 'Spend by State', desc: 'Geographic breakdown of lobbying & contracts', icon: 'map', color: '#CA8A04', screen: 'InfluenceMap' },
  { title: 'Stories', desc: 'Auto-generated data stories', icon: 'newspaper', color: '#059669', screen: 'Stories' },
  { title: 'Anomalies', desc: 'Suspicious patterns detected by the engine', icon: 'warning', color: '#EF4444', screen: 'Anomalies' },
  { title: 'Congressional Trades', desc: 'Stock trades by members of Congress', icon: 'trending-up', color: '#3B82F6', screen: 'CongressionalTrades' },
  { title: 'Lobbying Breakdown', desc: 'What tech companies lobby about', icon: 'megaphone', color: '#F59E0B', screen: 'LobbyingBreakdown' },
  { title: 'Contract Timeline', desc: 'Tech contracts by year', icon: 'calendar', color: '#10B981', screen: 'ContractTimeline' },
  { title: 'Enforcement Tracker', desc: 'Tech-sector penalties and cases', icon: 'shield-checkmark', color: '#DC2626', screen: 'EnforcementTracker' },
  { title: 'Legislation Tracker', desc: 'Live bill status across Congress', icon: 'document-text', color: '#8B5CF6', screen: 'LegislationTracker' },
  { title: 'State Explorer', desc: 'Per-state dashboards', icon: 'globe', color: '#0EA5E9', screen: 'StateExplorer' },
  { title: 'Ask WTP', desc: 'Natural-language data assistant', icon: 'chatbubble-ellipses', color: '#7C3AED', screen: 'ChatAgent' },
];

export default function DataExplorerScreen() {
  const navigation = useNavigation<any>();
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <LinearGradient colors={[ACCENT, '#4F46E5', '#3730A3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Ionicons name="compass" size={24} color="#FFFFFF" />
        <Text style={styles.heroTitle}>Data Explorer</Text>
        <Text style={styles.heroSubtitle}>
          Every tool we have for poking at the data, in one place.
        </Text>
      </LinearGradient>

      <View style={styles.grid}>
        {TILES.map((t) => (
          <TouchableOpacity
            key={t.screen}
            style={styles.tile}
            activeOpacity={0.85}
            onPress={() => navigation.navigate(t.screen, t.params)}
          >
            <View style={[styles.iconWrap, { backgroundColor: t.color + '18' }]}>
              <Ionicons name={t.icon as any} size={22} color={t.color} />
            </View>
            <Text style={styles.tileTitle}>{t.title}</Text>
            <Text style={styles.tileDesc} numberOfLines={2}>{t.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  hero: { padding: 22, paddingTop: 28, gap: 6 },
  heroTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 6 },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 16 },
  tile: { width: '48%' as any, flexGrow: 1, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT, gap: 6 },
  iconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  tileTitle: { fontSize: 14, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY },
  tileDesc: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, lineHeight: 15 },
});
