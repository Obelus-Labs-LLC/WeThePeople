import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS, PARTY_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';
import { apiClient } from '../api/client';

const ACCENT = '#0EA5E9';

interface Legislator {
  person_id: string;
  display_name: string;
  party?: string;
  chamber?: string;
  district?: string | null;
  photo_url?: string;
}

interface BillItem {
  bill_id: string;
  title: string;
  status_bucket?: string;
  introduced_date?: string;
}

function fmtDate(s?: string): string {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return s; }
}

export default function StateDashboardScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const stateCode: string = (route.params?.state_code || route.params?.code || '').toUpperCase();

  const [dashboard, setDashboard] = useState<any>(null);
  const [legislators, setLegislators] = useState<Legislator[]>([]);
  const [bills, setBills] = useState<BillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!stateCode) {
      setError('Missing state code');
      setLoading(false);
      return;
    }
    try {
      const [dash, legs, bs] = await Promise.all([
        apiClient.getStateDetail(stateCode),
        apiClient.getStateLegislators(stateCode, { limit: 30 }).catch(() => null),
        apiClient.getStateBills(stateCode, { limit: 20 }).catch(() => null),
      ]);
      setDashboard(dash);
      setLegislators(((legs as any)?.legislators || (legs as any)?.items || []) as Legislator[]);
      setBills(((bs as any)?.bills || (bs as any)?.items || []) as BillItem[]);
      navigation.setOptions({ title: (dash as any)?.state_name || stateCode });
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load state dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [stateCode]);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <LoadingSpinner message={`Loading ${stateCode}...`} />;
  if (error || !dashboard) return <EmptyState title="Error" message={error || 'State not found'} />;

  const stateName = (dashboard as any).state_name || stateCode;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      <LinearGradient colors={[ACCENT, '#0369A1', '#075985']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.stateTag}>
          <Text style={styles.stateCodeText}>{stateCode}</Text>
        </View>
        <Text style={styles.heroTitle}>{stateName}</Text>
        {dashboard.population && (
          <Text style={styles.heroMeta}>
            Population {Number(dashboard.population).toLocaleString()}{dashboard.district_count ? ` \u00B7 ${dashboard.district_count} congressional districts` : ''}
          </Text>
        )}
      </LinearGradient>

      <View style={styles.section}>
        <View style={styles.titleRow}>
          <View style={[styles.bar, { backgroundColor: ACCENT }]} />
          <Text style={styles.sectionTitle}>Federal delegation</Text>
          <Text style={styles.sectionCount}>{legislators.length}</Text>
        </View>
        {legislators.length === 0 ? (
          <Text style={styles.emptyInline}>No legislator data available.</Text>
        ) : legislators.map((leg) => {
          const partyColor = leg.party ? (PARTY_COLORS as any)[leg.party.charAt(0).toUpperCase()] || UI_COLORS.TEXT_SECONDARY : UI_COLORS.TEXT_SECONDARY;
          return (
            <TouchableOpacity
              key={leg.person_id}
              style={styles.row}
              onPress={() => navigation.navigate('PersonDetail', { person_id: leg.person_id })}
            >
              <View style={[styles.avatar, { backgroundColor: partyColor + '20' }]}>
                <Text style={[styles.avatarText, { color: partyColor }]}>
                  {(leg.display_name || '?').charAt(0)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{leg.display_name}</Text>
                <Text style={styles.rowMeta}>
                  {leg.party}{leg.chamber ? ` \u00B7 ${leg.chamber}` : ''}{leg.district ? ` \u00B7 District ${leg.district}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={UI_COLORS.TEXT_MUTED} />
            </TouchableOpacity>
          );
        })}
      </View>

      {bills.length > 0 && (
        <View style={styles.section}>
          <View style={styles.titleRow}>
            <View style={[styles.bar, { backgroundColor: '#8B5CF6' }]} />
            <Text style={styles.sectionTitle}>Recent bills from this state</Text>
            <Text style={styles.sectionCount}>{bills.length}</Text>
          </View>
          {bills.map((b) => (
            <TouchableOpacity
              key={b.bill_id}
              style={styles.billRow}
              onPress={() => navigation.navigate('BillDetail', { bill_id: b.bill_id })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.billTitle} numberOfLines={2}>{b.title || b.bill_id}</Text>
                <Text style={styles.billMeta}>
                  {b.bill_id.toUpperCase()}{b.status_bucket ? ` \u00B7 ${b.status_bucket.replace(/_/g, ' ')}` : ''}{b.introduced_date ? ` \u00B7 ${fmtDate(b.introduced_date)}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={UI_COLORS.TEXT_MUTED} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  hero: { padding: 22, paddingTop: 32, gap: 6 },
  stateTag: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 6 },
  stateCodeText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  heroMeta: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  section: { paddingHorizontal: 16, marginTop: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  bar: { width: 4, height: 18, borderRadius: 2 },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  sectionCount: { fontSize: 12, fontWeight: '700', color: UI_COLORS.TEXT_MUTED },
  emptyInline: { fontSize: 13, color: UI_COLORS.TEXT_MUTED, fontStyle: 'italic' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarText: { fontSize: 15, fontWeight: '800' },
  rowName: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  rowMeta: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2, textTransform: 'capitalize' },
  billRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  billTitle: { fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  billMeta: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 3 },
});
