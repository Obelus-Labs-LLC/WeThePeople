import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, RefreshControl, Linking,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type {
  InstitutionDetail, SECFiling, FDICFinancial,
  CFPBComplaint, ComplaintSummary, NewsArticle,
} from '../api/types';
import { LoadingSpinner, StatCard, EmptyState } from '../components/ui';
import { SectorTypeBadge } from '../components/ui';

type TabKey = 'overview' | 'filings' | 'complaints' | 'news';

const SECTOR_COLORS: Record<string, string> = {
  bank: '#2563EB', investment: '#8B5CF6', insurance: '#F59E0B',
  fintech: '#10B981', central_bank: '#DC2626',
};

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return 'N/A';
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function formatPct(val: number | null | undefined): string {
  if (val == null) return 'N/A';
  return `${val.toFixed(2)}%`;
}

function formatNewsDate(raw: string): string {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    const now = new Date();
    const diffH = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
    if (diffH < 1) return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;
    if (diffH < 48) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

export default function InstitutionScreen() {
  const route = useRoute<any>();
  const { institution_id } = route.params;

  const [detail, setDetail] = useState<InstitutionDetail | null>(null);
  const [filings, setFilings] = useState<SECFiling[]>([]);
  const [financials, setFinancials] = useState<FDICFinancial[]>([]);
  const [complaints, setComplaints] = useState<CFPBComplaint[]>([]);
  const [complaintSummary, setComplaintSummary] = useState<ComplaintSummary | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const loadData = async () => {
    try {
      const [detailRes, filingsRes, financialsRes, complaintsRes, summaryRes] = await Promise.all([
        apiClient.getInstitutionDetail(institution_id),
        apiClient.getInstitutionFilings(institution_id, { limit: 20 }),
        apiClient.getInstitutionFinancials(institution_id, { limit: 8 }),
        apiClient.getInstitutionComplaints(institution_id, { limit: 20 }),
        apiClient.getInstitutionComplaintSummary(institution_id),
      ]);
      setDetail(detailRes);
      setFilings(filingsRes.filings || []);
      setFinancials(financialsRes.financials || []);
      setComplaints(complaintsRes.complaints || []);
      setComplaintSummary(summaryRes);
    } catch (err: any) {
      console.error('Failed to load institution:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, [institution_id]);

  // Load news when tab switches
  useEffect(() => {
    if (activeTab === 'news' && news.length === 0 && !newsLoading && detail) {
      setNewsLoading(true);
      apiClient.getNews(detail.display_name, 15)
        .then((res) => setNews(res.articles || []))
        .catch(() => {})
        .finally(() => setNewsLoading(false));
    }
  }, [activeTab, detail]);

  if (loading) return <LoadingSpinner message="Loading institution..." />;
  if (!detail) return <EmptyState title="Not Found" message="Institution data unavailable." />;

  const sColor = SECTOR_COLORS[detail.sector_type] || '#6B7280';
  const latestFin = detail.latest_financial;

  const TABS: { key: TabKey; label: string; icon: any }[] = [
    { key: 'overview', label: 'Overview', icon: 'grid-outline' },
    { key: 'filings', label: 'Filings', icon: 'document-text-outline' },
    { key: 'complaints', label: 'Complaints', icon: 'chatbubble-ellipses-outline' },
    { key: 'news', label: 'News', icon: 'newspaper-outline' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadData(); }}
          tintColor={UI_COLORS.ACCENT}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        {detail.logo_url ? (
          <Image source={{ uri: detail.logo_url }} style={styles.headerLogo} />
        ) : (
          <View style={[styles.headerIcon, { backgroundColor: sColor + '15' }]}>
            <Text style={[styles.headerIconText, { color: sColor }]}>
              {detail.ticker ? detail.ticker.substring(0, 3) : detail.display_name.charAt(0)}
            </Text>
          </View>
        )}
        <Text style={styles.headerName}>{detail.display_name}</Text>
        <View style={styles.headerMeta}>
          {detail.ticker && <Text style={styles.headerTicker}>{detail.ticker}</Text>}
          <SectorTypeBadge sectorType={detail.sector_type} />
          {detail.headquarters && <Text style={styles.headerHQ}>{detail.headquarters}</Text>}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon} size={14} color={activeTab === tab.key ? UI_COLORS.ACCENT : UI_COLORS.TEXT_MUTED} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* === Overview Tab === */}
      {activeTab === 'overview' && (
        <View style={styles.tabContent}>
          <View style={styles.statsGrid}>
            <TouchableOpacity style={styles.statHalf} onPress={() => setActiveTab('filings')}>
              <StatCard label="SEC Filings" value={detail.filing_count} accent="blue" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.statHalf} onPress={() => setActiveTab('complaints')}>
              <StatCard label="CFPB Complaints" value={detail.complaint_count} accent="red" />
            </TouchableOpacity>
            <View style={styles.statHalf}>
              <StatCard label="FDIC Reports" value={detail.financial_count} accent="gold" />
            </View>
            <TouchableOpacity style={styles.statHalf} onPress={() => setActiveTab('complaints')}>
              <StatCard
                label="Timely Response"
                value={complaintSummary?.timely_response_pct != null ? `${complaintSummary.timely_response_pct}%` : 'N/A'}
                accent="green"
              />
            </TouchableOpacity>
          </View>

          {latestFin && (
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Ionicons name="stats-chart" size={16} color={UI_COLORS.GOLD} />
                <Text style={styles.cardTitle}>Latest FDIC Financial Snapshot</Text>
              </View>
              <Text style={styles.cardSubtitle}>As of {latestFin.report_date || 'N/A'}</Text>
              <View style={styles.finGrid}>
                <FinRow label="Total Assets" value={formatCurrency(latestFin.total_assets)} />
                <FinRow label="Total Deposits" value={formatCurrency(latestFin.total_deposits)} />
                <FinRow label="Net Income" value={formatCurrency(latestFin.net_income)} />
                <FinRow label="ROA" value={formatPct(latestFin.roa)} />
                <FinRow label="ROE" value={formatPct(latestFin.roe)} />
                <FinRow label="Tier 1 Capital" value={formatPct(latestFin.tier1_capital_ratio)} />
              </View>
            </View>
          )}

          {complaintSummary && Object.keys(complaintSummary.by_product).length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Ionicons name="pie-chart-outline" size={16} color="#DC2626" />
                <Text style={styles.cardTitle}>Complaints by Product</Text>
              </View>
              {Object.entries(complaintSummary.by_product)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 6)
                .map(([product, count]) => (
                  <View key={product} style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel} numberOfLines={1}>{product || 'Unknown'}</Text>
                    <Text style={styles.breakdownValue}>{count}</Text>
                  </View>
                ))}
            </View>
          )}
        </View>
      )}

      {/* === Filings Tab === */}
      {activeTab === 'filings' && (
        <View style={styles.tabContent}>
          {filings.length === 0 ? (
            <EmptyState title="No filings yet" message="Run data sync to ingest SEC filings." />
          ) : (
            filings.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={styles.filingCard}
                onPress={() => f.primary_doc_url && Linking.openURL(f.primary_doc_url)}
                activeOpacity={f.primary_doc_url ? 0.7 : 1}
              >
                <View style={styles.filingHeader}>
                  <View style={styles.formBadge}>
                    <Text style={styles.formBadgeText}>{f.form_type}</Text>
                  </View>
                  <Text style={styles.filingDate}>{f.filing_date || 'N/A'}</Text>
                </View>
                {f.description && (
                  <Text style={styles.filingDesc} numberOfLines={2}>{f.description}</Text>
                )}
                {f.primary_doc_url && (
                  <View style={styles.linkRow}>
                    <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
                    <Text style={styles.linkText}>View on SEC EDGAR</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      {/* === Complaints Tab === */}
      {activeTab === 'complaints' && (
        <View style={styles.tabContent}>
          {complaints.length === 0 ? (
            <EmptyState title="No complaints yet" message="Run data sync to ingest CFPB complaints." />
          ) : (
            complaints.map((c) => {
              const complaintUrl = c.complaint_id
                ? `https://www.consumerfinance.gov/data-research/consumer-complaints/search/detail/${c.complaint_id}`
                : null;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.complaintCard}
                  onPress={() => complaintUrl && Linking.openURL(complaintUrl)}
                  disabled={!complaintUrl}
                >
                  <View style={styles.complaintHeader}>
                    <Text style={styles.complaintProduct}>{c.product || 'Unknown Product'}</Text>
                    <Text style={styles.complaintDate}>{c.date_received || 'N/A'}</Text>
                  </View>
                  <Text style={styles.complaintIssue} numberOfLines={2}>
                    {c.issue || 'No issue description'}
                  </Text>
                  <View style={styles.complaintMeta}>
                    {c.company_response && (
                      <Text style={styles.complaintResponse} numberOfLines={1}>
                        {c.company_response}
                      </Text>
                    )}
                    {c.timely_response && (
                      <View style={[styles.timelyBadge, {
                        backgroundColor: c.timely_response === 'Yes' ? '#10B981' + '15' : '#DC2626' + '15',
                      }]}>
                        <Text style={[styles.timelyText, {
                          color: c.timely_response === 'Yes' ? '#10B981' : '#DC2626',
                        }]}>
                          {c.timely_response === 'Yes' ? 'Timely' : 'Late'}
                        </Text>
                      </View>
                    )}
                    {c.state && <Text style={styles.complaintState}>{c.state}</Text>}
                  </View>
                  {complaintUrl && (
                    <View style={[styles.linkRow, { marginTop: 6 }]}>
                      <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
                      <Text style={styles.linkText}>View on CFPB</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}

      {/* === News Tab === */}
      {activeTab === 'news' && (
        <View style={styles.tabContent}>
          {newsLoading ? (
            <LoadingSpinner message="Loading news..." />
          ) : news.length === 0 ? (
            <EmptyState title="No recent news" message="No articles found for this institution." />
          ) : (
            news.map((article, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.newsCard}
                onPress={() => article.link && Linking.openURL(article.link)}
                activeOpacity={0.7}
              >
                <View style={styles.newsSourceRow}>
                  {article.source ? (
                    <Text style={styles.newsSource}>{article.source}</Text>
                  ) : null}
                  <Text style={styles.newsDate}>{formatNewsDate(article.published)}</Text>
                </View>
                <Text style={styles.newsTitle} numberOfLines={3}>{article.title}</Text>
                <View style={styles.linkRow}>
                  <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
                  <Text style={styles.linkText}>Read article</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

function FinRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.finRow}>
      <Text style={styles.finLabel}>{label}</Text>
      <Text style={styles.finValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { paddingBottom: 32 },

  // Header
  header: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 },
  headerLogo: {
    width: 64, height: 64, borderRadius: 16, backgroundColor: '#F0F2EF', marginBottom: 12,
  },
  headerIcon: {
    width: 64, height: 64, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  headerIconText: { fontSize: 20, fontWeight: '900' },
  headerName: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTicker: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 14, fontWeight: '700' },
  headerHQ: { color: UI_COLORS.TEXT_MUTED, fontSize: 12 },

  // Tabs
  tabRow: {
    flexDirection: 'row', paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER, marginBottom: 12,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, gap: 4,
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: UI_COLORS.ACCENT },
  tabText: { color: UI_COLORS.TEXT_MUTED, fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: UI_COLORS.ACCENT },

  tabContent: { paddingHorizontal: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statHalf: { width: '48%' as any, flexGrow: 1 },

  // Cards
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  cardTitle: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 15, fontWeight: '700' },
  cardSubtitle: { color: UI_COLORS.TEXT_MUTED, fontSize: 11, marginBottom: 12 },
  finGrid: { gap: 8 },
  finRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  finLabel: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 13 },
  finValue: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  breakdownRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER,
  },
  breakdownLabel: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 12, flex: 1, marginRight: 8 },
  breakdownValue: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // Filings
  filingCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  filingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  formBadge: { backgroundColor: '#2563EB' + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  formBadgeText: { color: '#2563EB', fontSize: 11, fontWeight: '700' },
  filingDate: { color: UI_COLORS.TEXT_MUTED, fontSize: 11 },
  filingDesc: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 12, lineHeight: 16, marginBottom: 6 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { color: UI_COLORS.ACCENT, fontSize: 11, fontWeight: '600' },

  // Complaints
  complaintCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  complaintHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  complaintProduct: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 13, fontWeight: '600', flex: 1 },
  complaintDate: { color: UI_COLORS.TEXT_MUTED, fontSize: 11 },
  complaintIssue: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 12, lineHeight: 16, marginBottom: 8 },
  complaintMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  complaintResponse: { color: UI_COLORS.TEXT_MUTED, fontSize: 10, flex: 1 },
  timelyBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  timelyText: { fontSize: 10, fontWeight: '600' },
  complaintState: { color: UI_COLORS.TEXT_MUTED, fontSize: 10, fontWeight: '600' },

  // News
  newsCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  newsSourceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  newsSource: {
    fontSize: 11, fontWeight: '700', color: UI_COLORS.ACCENT, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  newsDate: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  newsTitle: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 20, marginBottom: 8 },
});
