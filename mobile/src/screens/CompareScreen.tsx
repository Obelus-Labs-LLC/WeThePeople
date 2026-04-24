import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
  TextInput, FlatList, Modal, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, RouteProp } from '@react-navigation/native';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { apiClient } from '../api/client';
const ACCENT = '#2563EB';
const log = (msg: string, err: unknown) => console.warn(`[CompareScreen] ${msg}:`, err);

type CompareRouteParams = {
  Compare: { sector: string };
};

interface Company {
  id?: string;
  name: string;
  slug?: string;
}

interface CompanyDetails {
  name: string;
  lobbying_total?: number;
  contract_total?: number;
  enforcement_count?: number;
  donation_total?: number;
}

function formatDollars(amount?: number): string {
  if (amount == null || amount === 0) return '$0';
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

function formatCount(n?: number): string {
  if (n == null) return '0';
  return n.toLocaleString();
}

interface CompanyPickerProps {
  label: string;
  companies: Company[];
  selected: Company | null;
  onSelect: (c: Company) => void;
  loading: boolean;
}

function CompanyPicker({ label, companies, selected, onSelect, loading }: CompanyPickerProps) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={[styles.pickerButtonText, !selected && { color: UI_COLORS.TEXT_MUTED }]}>
          {selected ? selected.name : 'Select company...'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={UI_COLORS.TEXT_MUTED} />
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <TouchableOpacity onPress={() => { setVisible(false); setSearch(''); }}>
                <Ionicons name="close" size={24} color={UI_COLORS.TEXT_PRIMARY} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={UI_COLORS.TEXT_MUTED} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search companies..."
                placeholderTextColor={UI_COLORS.TEXT_MUTED}
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
            </View>

            {loading ? (
              <View style={{ padding: 40 }}><LoadingSpinner message="Loading companies..." /></View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item, idx) => item.id || item.slug || `${item.name}-${idx}`}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      selected?.name === item.name && styles.modalItemSelected,
                    ]}
                    onPress={() => { onSelect(item); setVisible(false); setSearch(''); }}
                  >
                    <Text style={[
                      styles.modalItemText,
                      selected?.name === item.name && { color: ACCENT, fontWeight: '700' },
                    ]}>
                      {item.name}
                    </Text>
                    {selected?.name === item.name && (
                      <Ionicons name="checkmark-circle" size={18} color={ACCENT} />
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={styles.emptyText}>No companies match your search</Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

interface MetricRowProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  valueA?: number;
  valueB?: number;
  format: (v?: number) => string;
}

function MetricRow({ label, icon, valueA, valueB, format }: MetricRowProps) {
  const a = valueA || 0;
  const b = valueB || 0;
  const aHigher = a > b;
  const bHigher = b > a;
  const tied = a === b;

  return (
    <View style={styles.metricRow}>
      <View style={[styles.metricCell, aHigher && styles.metricCellHighlight]}>
        <Text style={[styles.metricValue, aHigher && styles.metricValueHighlight]}>
          {format(valueA)}
        </Text>
      </View>

      <View style={styles.metricCenter}>
        <Ionicons name={icon} size={14} color={UI_COLORS.TEXT_MUTED} />
        <Text style={styles.metricLabel}>{label}</Text>
      </View>

      <View style={[styles.metricCell, bHigher && styles.metricCellHighlight]}>
        <Text style={[styles.metricValue, bHigher && styles.metricValueHighlight]}>
          {format(valueB)}
        </Text>
      </View>
    </View>
  );
}

export default function CompareScreen() {
  const route = useRoute<RouteProp<CompareRouteParams, 'Compare'>>();
  const sector = route.params?.sector || 'finance';

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [companyA, setCompanyA] = useState<Company | null>(null);
  const [companyB, setCompanyB] = useState<Company | null>(null);
  const [detailsA, setDetailsA] = useState<CompanyDetails | null>(null);
  const [detailsB, setDetailsB] = useState<CompanyDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadCompanies = useCallback(async () => {
    try {
      setCompaniesLoading(true);
      // Finance still uses the /institutions endpoint via getInstitutions;
      // every other sector routes through the unified getSectorCompanies.
      let list: any[] = [];
      if (sector === 'finance') {
        const data = await apiClient.getInstitutions({ limit: 200 });
        list = (data as any).institutions || [];
      } else if (sector === 'health') {
        const data = await apiClient.getCompanies({ limit: 200 });
        list = (data as any).companies || [];
      } else if (sector === 'tech') {
        const data = await apiClient.getTechCompanies({ limit: 200 });
        list = (data as any).companies || [];
      } else {
        const data = await apiClient.getSectorCompanies(sector, { limit: 200 });
        list = (data as any).companies || [];
      }
      setCompanies(Array.isArray(list) ? list : []);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load companies');
      log('loadCompanies failed', e);
    } finally {
      setCompaniesLoading(false);
    }
  }, [sector]);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  // Fetch details when both companies are selected
  useEffect(() => {
    if (!companyA || !companyB) {
      setDetailsA(null);
      setDetailsB(null);
      return;
    }

    const fetchDetails = async () => {
      setDetailsLoading(true);
      try {
        const idA = companyA.slug || companyA.id || companyA.name;
        const idB = companyB.slug || companyB.id || companyB.name;
        const fetchOne = async (id: string) => {
          if (sector === 'finance') return apiClient.getInstitutionDetail(id);
          if (sector === 'health') return apiClient.getCompanyDetail(id);
          if (sector === 'tech') return apiClient.getTechCompanyDetail(id);
          return apiClient.getSectorCompanyDetail(sector, id);
        };
        const [dataA, dataB] = await Promise.all([fetchOne(idA), fetchOne(idB)]);
        setDetailsA(dataA as any);
        setDetailsB(dataB as any);
        setError('');
      } catch (e: any) {
        setError(e?.message || 'Failed to load company details');
        log('detail load failed', e);
      } finally {
        setDetailsLoading(false);
      }
    };

    fetchDetails();
  }, [companyA, companyB, sector]);

  const onRefresh = () => {
    setRefreshing(true);
    loadCompanies().finally(() => setRefreshing(false));
  };

  const handleSwap = () => {
    const tmpA = companyA;
    const tmpDetailsA = detailsA;
    setCompanyA(companyB);
    setCompanyB(tmpA);
    setDetailsA(detailsB);
    setDetailsB(tmpDetailsA);
  };

  const sectorLabel = sector.charAt(0).toUpperCase() + sector.slice(1);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      {/* Hero */}
      <LinearGradient
        colors={['#2563EB', '#1D4ED8', '#1E40AF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="swap-horizontal" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Compare Companies</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Side-by-side comparison of {sectorLabel} sector companies across lobbying, contracts, enforcement, and donations
          </Text>
          <View style={styles.heroStatRow}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{companies.length}</Text>
              <Text style={styles.heroStatLabel}>Companies</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{sectorLabel}</Text>
              <Text style={styles.heroStatLabel}>Sector</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {error ? (
        <View style={styles.section}>
          <EmptyState title="Error" message={error} />
        </View>
      ) : (
        <>
          {/* Company Pickers */}
          <View style={styles.section}>
            <View style={[styles.sectionTitleRow, { marginBottom: 12 }]}>
              <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
              <Text style={styles.sectionTitle}>Select Companies</Text>
            </View>

            <CompanyPicker
              label="Company A"
              companies={companies}
              selected={companyA}
              onSelect={setCompanyA}
              loading={companiesLoading}
            />

            {/* Swap button */}
            <View style={styles.swapRow}>
              <TouchableOpacity
                style={styles.swapButton}
                onPress={handleSwap}
                activeOpacity={0.7}
                disabled={!companyA && !companyB}
              >
                <Ionicons name="swap-vertical" size={20} color="#FFFFFF" />
                <Text style={styles.swapText}>Swap</Text>
              </TouchableOpacity>
            </View>

            <CompanyPicker
              label="Company B"
              companies={companies}
              selected={companyB}
              onSelect={setCompanyB}
              loading={companiesLoading}
            />
          </View>

          {/* Comparison Results */}
          {companyA && companyB && (
            <View style={styles.section}>
              <View style={[styles.sectionTitleRow, { marginBottom: 12 }]}>
                <View style={[styles.accentBar, { backgroundColor: '#10B981' }]} />
                <Text style={styles.sectionTitle}>Comparison</Text>
              </View>

              {detailsLoading ? (
                <LoadingSpinner message="Loading comparison..." />
              ) : detailsA && detailsB ? (
                <View style={styles.comparisonCard}>
                  {/* Company name headers */}
                  <View style={styles.comparisonHeader}>
                    <Text style={styles.compHeaderName} numberOfLines={2}>{detailsA.name || companyA.name}</Text>
                    <Text style={styles.compHeaderVs}>vs</Text>
                    <Text style={styles.compHeaderName} numberOfLines={2}>{detailsB.name || companyB.name}</Text>
                  </View>

                  <View style={styles.divider} />

                  <MetricRow
                    label="Lobbying"
                    icon="megaphone"
                    valueA={detailsA.lobbying_total}
                    valueB={detailsB.lobbying_total}
                    format={formatDollars}
                  />
                  <MetricRow
                    label="Contracts"
                    icon="document-text"
                    valueA={detailsA.contract_total}
                    valueB={detailsB.contract_total}
                    format={formatDollars}
                  />
                  <MetricRow
                    label="Enforcement"
                    icon="shield-checkmark"
                    valueA={detailsA.enforcement_count}
                    valueB={detailsB.enforcement_count}
                    format={formatCount}
                  />
                  <MetricRow
                    label="Donations"
                    icon="cash"
                    valueA={detailsA.donation_total}
                    valueB={detailsB.donation_total}
                    format={formatDollars}
                  />
                </View>
              ) : (
                <EmptyState title="No Data" message="Could not load comparison data." />
              )}
            </View>
          )}

          {/* Prompt to select */}
          {(!companyA || !companyB) && (
            <View style={styles.promptSection}>
              <Ionicons name="information-circle-outline" size={32} color={UI_COLORS.TEXT_MUTED} />
              <Text style={styles.promptText}>
                Select two companies above to see a side-by-side comparison
              </Text>
            </View>
          )}
        </>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Data: Federal lobbying, contracts, enforcement & donations</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { paddingBottom: 24 },
  hero: {
    borderRadius: 16, padding: 20, marginHorizontal: 16, marginTop: 12,
    overflow: 'hidden', position: 'relative',
  },
  heroOrb: {
    position: 'absolute', top: -60, right: -40, width: 180, height: 180,
    borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroInner: { position: 'relative' },
  heroIconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  heroStatRow: { flexDirection: 'row', gap: 24 },
  heroStat: {},
  heroStatValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  heroStatLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
  section: { paddingHorizontal: 16, marginTop: 12, marginBottom: 16 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accentBar: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },

  // Company picker
  pickerWrap: { marginBottom: 8 },
  pickerLabel: { fontSize: 12, fontWeight: '700', color: UI_COLORS.TEXT_SECONDARY, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  pickerButton: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  pickerButtonText: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },

  // Swap
  swapRow: { alignItems: 'center', marginVertical: 8 },
  swapButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: ACCENT, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  swapText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: UI_COLORS.PRIMARY_BG, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '75%', paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: UI_COLORS.SECONDARY_BG, borderRadius: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: UI_COLORS.TEXT_PRIMARY },
  modalItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT,
  },
  modalItemSelected: { backgroundColor: '#2563EB08' },
  modalItemText: { fontSize: 14, color: UI_COLORS.TEXT_PRIMARY },
  emptyText: { fontSize: 13, color: UI_COLORS.TEXT_MUTED },

  // Comparison card
  comparisonCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  comparisonHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
  },
  compHeaderName: { flex: 1, fontSize: 14, fontWeight: '700', color: ACCENT, textAlign: 'center' },
  compHeaderVs: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_MUTED, marginHorizontal: 8 },
  divider: { height: 1, backgroundColor: UI_COLORS.BORDER_LIGHT, marginBottom: 12 },

  // Metric rows
  metricRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 10,
  },
  metricCell: {
    flex: 1, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4,
    borderRadius: 8, backgroundColor: UI_COLORS.SECONDARY_BG,
  },
  metricCellHighlight: { backgroundColor: '#10B98112' },
  metricValue: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  metricValueHighlight: { color: '#10B981' },
  metricCenter: { alignItems: 'center', width: 80, paddingHorizontal: 4 },
  metricLabel: { fontSize: 10, fontWeight: '600', color: UI_COLORS.TEXT_MUTED, textAlign: 'center', marginTop: 2 },

  // Prompt
  promptSection: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32 },
  promptText: { fontSize: 14, color: UI_COLORS.TEXT_MUTED, textAlign: 'center', marginTop: 8, lineHeight: 20 },

  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
});
