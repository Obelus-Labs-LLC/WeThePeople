import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';
import { apiClient } from '../api/client';

const ACCENT = '#059669';

// Mobile version of DataStoryPage. The web version renders a multi-section
// narrative. Mobile keeps it as a compact "state-of-the-data" view: overall
// stats + the top 5 lobbyists + top 5 contractors, framed as a simple story.

function fmt$(n?: number | null): string {
  if (!n) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtN(n?: number | null): string {
  if (n == null) return '\u2014';
  return Number(n).toLocaleString();
}

export default function DataStoryScreen() {
  const [stats, setStats] = useState<any>(null);
  const [topLob, setTopLob] = useState<any[]>([]);
  const [topCon, setTopCon] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [s, lob, con] = await Promise.all([
        apiClient.getInfluenceStats(),
        apiClient.getTopLobbying({ limit: 5 }),
        apiClient.getTopContracts({ limit: 5 }),
      ]);
      setStats(s);
      setTopLob(Array.isArray(lob) ? lob : (lob as any).companies || []);
      setTopCon(Array.isArray(con) ? con : (con as any).companies || []);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load data story');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <LoadingSpinner message="Compiling the story..." />;
  if (error) return <EmptyState title="Error" message={error} />;

  const totalLobby = stats?.total_lobbying_spend || 0;
  const totalContract = stats?.total_contract_value || 0;
  const totalEnforce = stats?.total_penalties || 0;
  const companies = stats?.total_companies || stats?.total_entities || 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      <LinearGradient colors={[ACCENT, '#047857', '#065F46']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Ionicons name="book" size={24} color="#FFFFFF" />
        <Text style={styles.heroTitle}>State of the Data</Text>
        <Text style={styles.heroSubtitle}>
          Everything WeThePeople currently knows, summarised in a single read.
        </Text>
      </LinearGradient>

      <View style={styles.section}>
        <Text style={styles.chapter}>Chapter 1 \u00B7 The scale</Text>
        <Text style={styles.body}>
          We track <Text style={styles.em}>{fmtN(companies)}</Text> companies and institutions across 11 sectors. They have collectively spent <Text style={styles.em}>{fmt$(totalLobby)}</Text> on federal lobbying and received <Text style={styles.em}>{fmt$(totalContract)}</Text> in government contracts that we can verify.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.chapter}>Chapter 2 \u00B7 Top lobbyists</Text>
        <Text style={styles.body}>
          The five highest-spending lobbyists right now:
        </Text>
        {topLob.map((row, i) => (
          <View key={`l-${i}`} style={styles.row}>
            <Text style={styles.rank}>#{i + 1}</Text>
            <Text style={styles.rowName}>{row.display_name || row.entity_name || 'Unknown'}</Text>
            <Text style={[styles.rowVal, { color: '#F59E0B' }]}>{fmt$(row.total_spend || row.total_lobbying_spend)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.chapter}>Chapter 3 \u00B7 Top contractors</Text>
        <Text style={styles.body}>
          And the five biggest recipients of federal contract dollars:
        </Text>
        {topCon.map((row, i) => (
          <View key={`c-${i}`} style={styles.row}>
            <Text style={styles.rank}>#{i + 1}</Text>
            <Text style={styles.rowName}>{row.display_name || row.entity_name || 'Unknown'}</Text>
            <Text style={[styles.rowVal, { color: '#10B981' }]}>{fmt$(row.total_value || row.total_contract_value)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.chapter}>Chapter 4 \u00B7 Accountability</Text>
        <Text style={styles.body}>
          Regulators have imposed <Text style={styles.em}>{fmt$(totalEnforce)}</Text> in penalties against the tracked companies. That is the number worth watching alongside lobbying spend \u2014 when it stays small while lobbying grows, it deserves scrutiny.
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          All numbers pulled live from the WeThePeople API. Swipe down to refresh.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  hero: { padding: 22, paddingTop: 28, gap: 6 },
  heroTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 6 },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19 },
  section: { paddingHorizontal: 20, marginTop: 24 },
  chapter: { fontSize: 11, fontWeight: '800', color: ACCENT, letterSpacing: 0.8, marginBottom: 8, textTransform: 'uppercase' },
  body: { fontSize: 15, lineHeight: 23, color: UI_COLORS.TEXT_PRIMARY },
  em: { fontWeight: '800', color: ACCENT },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT, marginTop: 8 },
  rank: { width: 28, fontSize: 12, fontWeight: '800', color: UI_COLORS.TEXT_MUTED },
  rowName: { flex: 1, fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginRight: 8 },
  rowVal: { fontSize: 13, fontWeight: '800' },
  footer: { padding: 24, alignItems: 'center' },
  footerText: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, textAlign: 'center' },
});
