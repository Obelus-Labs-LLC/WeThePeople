import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';
import { apiClient } from '../api/client';

const ACCENT = '#DC2626';

interface Loop {
  company_name?: string;
  politician_name?: string;
  committee_name?: string;
  bill_id?: string;
  bill_title?: string;
  donation_amount?: number;
  lobbying_spend?: number;
  year?: number | string;
}

function fmt$(n?: number | null): string {
  if (!n) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function ClosedLoopScreen() {
  const [loops, setLoops] = useState<Loop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const data: any = await apiClient.getClosedLoops({ limit: 50, min_donation: 1000 });
      // Defensive shape coercion. Previous code did
      //   data.loops || data.items || ...
      // which crashed with "Cannot read properties of null" if the
      // response was null (e.g. backend returned 204 unexpectedly).
      let raw: any[] = [];
      if (Array.isArray(data)) {
        raw = data;
      } else if (data && typeof data === 'object') {
        raw = data.loops || data.items || data.results || [];
      }
      setLoops((raw as Loop[]) || []);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load closed loops');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <LoadingSpinner message="Looking for closed loops..." />;
  if (error) return <EmptyState title="Error" message={error} />;

  const renderRow = ({ item: l, index }: { item: Loop; index: number }) => (
    <View style={styles.card}>
      <View style={styles.loopHead}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepText}>LOOP #{index + 1}</Text>
        </View>
        {l.year != null && <Text style={styles.year}>{l.year}</Text>}
      </View>

      <LoopStep
        icon="business" color="#F59E0B" label="COMPANY LOBBIED"
        value={l.company_name || 'Unknown'}
        sub={l.lobbying_spend != null ? `${fmt$(l.lobbying_spend)} lobbying spend` : undefined}
      />
      <View style={styles.arrow}><Ionicons name="arrow-down" size={14} color={UI_COLORS.TEXT_MUTED} /></View>

      <LoopStep
        icon="document-text" color="#7C3AED" label="ON BILL"
        value={l.bill_title || l.bill_id || 'Unknown'}
        sub={l.bill_id && l.bill_title ? l.bill_id : undefined}
      />
      <View style={styles.arrow}><Ionicons name="arrow-down" size={14} color={UI_COLORS.TEXT_MUTED} /></View>

      {l.committee_name && (
        <>
          <LoopStep
            icon="people" color="#2563EB" label="REFERRED TO COMMITTEE"
            value={l.committee_name}
          />
          <View style={styles.arrow}><Ionicons name="arrow-down" size={14} color={UI_COLORS.TEXT_MUTED} /></View>
        </>
      )}

      <LoopStep
        icon="person" color="#10B981" label="POLITICIAN ON COMMITTEE"
        value={l.politician_name || 'Unknown'}
        sub={l.donation_amount != null ? `Received ${fmt$(l.donation_amount)} from the company` : undefined}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={[ACCENT, '#B91C1C', '#7F1D1D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Ionicons name="git-compare" size={22} color="#FFFFFF" />
        <Text style={styles.heroTitle}>Closed Loops</Text>
        <Text style={styles.heroSubtitle}>
          Patterns where a company lobbied on a bill, the bill went to a committee, and members of that committee received donations from the lobbying company.
        </Text>
      </LinearGradient>

      <FlatList
        data={loops}
        renderItem={renderRow}
        keyExtractor={(l, i) => `loop-${i}`}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        ListEmptyComponent={<EmptyState title="No closed loops found" message="The detection engine hasn't found qualifying patterns yet, or wtp-core's detector is still running." />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      />
    </View>
  );
}

function LoopStep({ icon, color, label, value, sub }: { icon: any; color: string; label: string; value: string; sub?: string }) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.stepLabel, { color }]}>{label}</Text>
        <Text style={styles.stepValue} numberOfLines={2}>{value}</Text>
        {sub && <Text style={styles.stepSub}>{sub}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  hero: { padding: 20, paddingTop: 28, gap: 6 },
  heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginTop: 6 },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 12, lineHeight: 17 },
  card: { backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  loopHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  stepBadge: { backgroundColor: ACCENT + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  stepText: { fontSize: 10, fontWeight: '800', color: ACCENT, letterSpacing: 0.5 },
  year: { fontSize: 12, fontWeight: '700', color: UI_COLORS.TEXT_MUTED },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  stepValue: { fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  stepSub: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 3 },
  arrow: { marginLeft: 14, paddingVertical: 2 },
});
