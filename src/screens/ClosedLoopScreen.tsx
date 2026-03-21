import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, FlatList,
  StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { LoadingSpinner, EmptyState } from '../components/ui';

function fmtDollar(val: number | null | undefined): string {
  if (val == null) return '$0';
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

const CHAIN_STEPS = [
  { key: 'lobbying', label: 'Lobbying', icon: 'megaphone', color: '#2563EB' },
  { key: 'bill', label: 'Bill', icon: 'document-text', color: '#8B5CF6' },
  { key: 'committee', label: 'Committee', icon: 'people', color: '#C5960C' },
  { key: 'donation', label: 'Donation', icon: 'cash', color: '#10B981' },
];

export default function ClosedLoopScreen() {
  const [loops, setLoops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const res = await apiClient.getClosedLoops({ limit: 50 });
      setLoops(res?.loops || res?.items || (Array.isArray(res) ? res : []));
    } catch (e: any) {
      console.error('Closed loops load failed:', e);
      setError(e.message || 'Failed to load closed loop data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) return <LoadingSpinner message="Detecting influence loops..." />;

  const renderLoop = ({ item, index }: { item: any; index: number }) => {
    return (
      <View style={styles.loopCard}>
        <View style={styles.loopHeader}>
          <Text style={styles.loopTitle}>
            {item.company_name || item.entity_name || `Loop #${index + 1}`}
          </Text>
          {item.total_amount != null && (
            <Text style={styles.loopAmount}>{fmtDollar(item.total_amount)}</Text>
          )}
        </View>

        {/* Chain visualization */}
        <View style={styles.chainRow}>
          {CHAIN_STEPS.map((step, idx) => {
            const stepData = item[step.key] || item.steps?.[idx];
            const hasData = !!stepData;
            return (
              <View key={step.key} style={styles.chainStep}>
                <View style={[
                  styles.chainCircle,
                  { backgroundColor: hasData ? step.color + '18' : UI_COLORS.BORDER + '40' },
                ]}>
                  <Ionicons
                    name={step.icon as any}
                    size={14}
                    color={hasData ? step.color : UI_COLORS.TEXT_MUTED}
                  />
                </View>
                <Text style={[
                  styles.chainLabel,
                  { color: hasData ? step.color : UI_COLORS.TEXT_MUTED },
                ]}>
                  {step.label}
                </Text>
                {idx < CHAIN_STEPS.length - 1 && (
                  <View style={styles.chainArrow}>
                    <Ionicons name="arrow-forward" size={10} color={UI_COLORS.TEXT_MUTED} />
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Details */}
        <View style={styles.loopDetails}>
          {item.lobbying_topic && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Lobbying Topic</Text>
              <Text style={styles.detailValue}>{item.lobbying_topic}</Text>
            </View>
          )}
          {item.bill_number && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Related Bill</Text>
              <Text style={styles.detailValue}>{item.bill_number}</Text>
            </View>
          )}
          {item.committee_name && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Committee</Text>
              <Text style={styles.detailValue}>{item.committee_name}</Text>
            </View>
          )}
          {item.politician_name && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Politician</Text>
              <Text style={styles.detailValue}>{item.politician_name}</Text>
            </View>
          )}
          {item.donation_amount != null && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Donation</Text>
              <Text style={[styles.detailValue, { color: '#10B981', fontWeight: '700' }]}>
                {fmtDollar(item.donation_amount)}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
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
            <Ionicons name="sync" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Closed Loops</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Detect influence loops: Lobbying → Bill → Committee → Donations
          </Text>
        </View>
      </LinearGradient>

      {/* Chain legend */}
      <View style={styles.legendRow}>
        {CHAIN_STEPS.map((step, idx) => (
          <View key={step.key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: step.color }]} />
            <Text style={styles.legendText}>{step.label}</Text>
            {idx < CHAIN_STEPS.length - 1 && (
              <Ionicons name="arrow-forward" size={10} color={UI_COLORS.TEXT_MUTED} style={{ marginLeft: 4 }} />
            )}
          </View>
        ))}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorSubtext}>This feature requires the closed-loop detection endpoint.</Text>
        </View>
      ) : loops.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
        >
          <EmptyState title="No loops detected" message="Closed-loop influence patterns have not been detected yet. Data is still being analyzed." />
        </ScrollView>
      ) : (
        <FlatList
          data={loops}
          keyExtractor={(item, idx) => item.id?.toString() || `loop-${idx}`}
          renderItem={renderLoop}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
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
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 4, marginTop: 12, alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: '600', color: UI_COLORS.TEXT_MUTED },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  loopCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  loopHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  loopTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, flex: 1 },
  loopAmount: { fontSize: 14, fontWeight: '800', color: UI_COLORS.ACCENT },
  chainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  chainStep: { alignItems: 'center', position: 'relative' },
  chainCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  chainLabel: { fontSize: 9, fontWeight: '600', marginTop: 3 },
  chainArrow: { position: 'absolute', right: -14, top: 10 },
  loopDetails: { borderTopWidth: 1, borderTopColor: UI_COLORS.BORDER, paddingTop: 8, gap: 4 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, fontWeight: '600' },
  detailValue: { fontSize: 11, color: UI_COLORS.TEXT_PRIMARY, fontWeight: '600', flex: 1, textAlign: 'right' },
  errorBox: { padding: 24, alignItems: 'center' },
  errorText: { color: '#DC2626', fontSize: 14, fontWeight: '600' },
  errorSubtext: { color: UI_COLORS.TEXT_MUTED, fontSize: 12, marginTop: 4, textAlign: 'center' },
});
