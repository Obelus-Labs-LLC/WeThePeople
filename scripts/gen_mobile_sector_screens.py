"""Generator for per-sector mobile Dashboard + Companies list screens.

Spits out a Telecom and Education pair by adapting the Agriculture templates
to the two sectors we haven't shipped yet. Routes get wired in TabNavigator
separately.

Idempotent — rerun to regenerate from the current templates.
"""
from pathlib import Path
from textwrap import dedent


def render_dashboard(sector, screen, title, subtitle, hero_grad, accent, icon,
                     sector_colors, footer_sources):
    sector_colors_js = ",\n".join(f"  '{k}': '{v}'," for k, v in sector_colors.items())
    cap = sector.capitalize()
    grad_list = "['" + "', '".join(hero_grad) + "']"
    return (
        "import React, { useEffect, useState } from 'react';\n"
        "import {\n"
        "  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,\n"
        "} from 'react-native';\n"
        "import { useNavigation } from '@react-navigation/native';\n"
        "import { Ionicons } from '@expo/vector-icons';\n"
        "import { LinearGradient } from 'expo-linear-gradient';\n"
        "import { UI_COLORS } from '../constants/colors';\n"
        "import { LoadingSpinner, StatCard, EmptyState } from '../components/ui';\n"
        "\n"
        "import { apiClient } from '../api/client';\n"
        f"const SECTOR = '{sector}';\n"
        f"const log = (msg: string, err: unknown) => console.warn(`[{screen}] ${{msg}}:`, err);\n"
        "\n"
        "const SECTOR_COLORS: Record<string, string> = {\n"
        f"{sector_colors_js}\n"
        "};\n"
        "\n"
        f"const ACCENT = '{accent}';\n"
        "\n"
        f"export default function {screen}() {{\n"
        "  const navigation = useNavigation<any>();\n"
        "  const [stats, setStats] = useState<any>(null);\n"
        "  const [companies, setCompanies] = useState<any[]>([]);\n"
        "  const [loading, setLoading] = useState(true);\n"
        "  const [refreshing, setRefreshing] = useState(false);\n"
        "  const [error, setError] = useState('');\n"
        "\n"
        "  const loadData = async () => {\n"
        "    try {\n"
        "      const [statsRes, compRes] = await Promise.all([\n"
        "        apiClient.getSectorDashboardStats(SECTOR),\n"
        "        apiClient.getSectorCompanies(SECTOR, { limit: 6 }),\n"
        "      ]);\n"
        "      setStats(statsRes);\n"
        "      setCompanies((compRes as any).companies || []);\n"
        "      setError('');\n"
        "    } catch (e: any) {\n"
        "      setError(e?.message || 'Failed to load');\n"
        "      log('loadData failed', e);\n"
        "    } finally {\n"
        "      setLoading(false);\n"
        "      setRefreshing(false);\n"
        "    }\n"
        "  };\n"
        "\n"
        "  useEffect(() => { loadData(); }, []);\n"
        "  const onRefresh = () => { setRefreshing(true); loadData(); };\n"
        "\n"
        f"  if (loading) return <LoadingSpinner message=\"Loading {sector} data...\" />;\n"
        "  if (error) return <EmptyState title=\"Error\" message={error} />;\n"
        "  if (!stats) return <EmptyState title=\"No Data\" />;\n"
        "\n"
        "  return (\n"
        "    <ScrollView\n"
        "      style={styles.container}\n"
        "      contentContainerStyle={styles.scrollContent}\n"
        "      showsVerticalScrollIndicator={false}\n"
        "      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}\n"
        "    >\n"
        "      <LinearGradient\n"
        f"        colors={{{grad_list}}}\n"
        "        start={{ x: 0, y: 0 }}\n"
        "        end={{ x: 1, y: 1 }}\n"
        "        style={styles.hero}\n"
        "      >\n"
        "        <View style={styles.heroOrb} />\n"
        "        <View style={styles.heroInner}>\n"
        "          <View style={styles.heroIconRow}>\n"
        f"            <Ionicons name=\"{icon}\" size={{24}} color=\"#FFFFFF\" />\n"
        f"            <Text style={{styles.heroTitle}}>{title}</Text>\n"
        "          </View>\n"
        "          <Text style={styles.heroSubtitle}>\n"
        f"            {subtitle}\n"
        "          </Text>\n"
        "        </View>\n"
        "      </LinearGradient>\n"
        "\n"
        "      <View style={styles.statsGrid}>\n"
        "        <View style={styles.statHalf}>\n"
        "          <StatCard label=\"Companies\" value={stats.total_companies} accent=\"blue\" />\n"
        "        </View>\n"
        "        <View style={styles.statHalf}>\n"
        "          <StatCard label=\"SEC Filings\" value={stats.total_filings} accent=\"purple\" />\n"
        "        </View>\n"
        "        <View style={styles.statHalf}>\n"
        "          <StatCard label=\"Gov Contracts\" value={stats.total_contracts} accent=\"emerald\" />\n"
        "        </View>\n"
        "        <View style={styles.statHalf}>\n"
        "          <StatCard label=\"Enforcement\" value={stats.total_enforcement} accent=\"red\" />\n"
        "        </View>\n"
        "      </View>\n"
        "\n"
        "      {stats.by_sector && Object.keys(stats.by_sector).length > 0 && (\n"
        "        <View style={styles.section}>\n"
        "          <View style={[styles.sectionTitleRow, { marginBottom: 12 }]}>\n"
        "            <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />\n"
        "            <Text style={styles.sectionTitle}>By Sector Type</Text>\n"
        "          </View>\n"
        "          <View style={styles.chipRow}>\n"
        "            {Object.entries(stats.by_sector).map(([key, count]) => (\n"
        "              <View key={key} style={[styles.chip, { backgroundColor: (SECTOR_COLORS[key] || '#6B7280') + '15' }]}>\n"
        "                <View style={[styles.chipDot, { backgroundColor: SECTOR_COLORS[key] || '#6B7280' }]} />\n"
        "                <Text style={[styles.chipText, { color: SECTOR_COLORS[key] || '#6B7280' }]}>\n"
        "                  {key} ({count as number})\n"
        "                </Text>\n"
        "              </View>\n"
        "            ))}\n"
        "          </View>\n"
        "        </View>\n"
        "      )}\n"
        "\n"
        "      <View style={styles.section}>\n"
        "        <View style={styles.sectionHeader}>\n"
        "          <View style={styles.sectionTitleRow}>\n"
        "            <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />\n"
        "            <Text style={styles.sectionTitle}>Featured Companies</Text>\n"
        "          </View>\n"
        f"          <TouchableOpacity onPress={{() => navigation.navigate('{cap}CompaniesDirectory')}}>\n"
        "            <Text style={styles.seeAll}>See All \u2192</Text>\n"
        "          </TouchableOpacity>\n"
        "        </View>\n"
        "        {companies.map((c: any) => (\n"
        "          <TouchableOpacity\n"
        "            key={c.company_id}\n"
        "            style={styles.companyCard}\n"
        f"            onPress={{() => navigation.navigate('{cap}CompanyDetail', {{ company_id: c.company_id }})}}\n"
        "          >\n"
        "            <View style={[styles.iconWrap, { backgroundColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '15' }]}>\n"
        f"              <Ionicons name=\"{icon}\" size={{20}} color={{SECTOR_COLORS[c.sector_type] || '#6B7280'}} />\n"
        "            </View>\n"
        "            <View style={styles.companyInfo}>\n"
        "              <Text style={styles.companyName} numberOfLines={1}>{c.display_name}</Text>\n"
        "              <View style={styles.companyMeta}>\n"
        "                {c.ticker && <Text style={styles.ticker}>{c.ticker}</Text>}\n"
        "                <View style={[styles.badge, { backgroundColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '12', borderColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '25' }]}>\n"
        "                  <Text style={[styles.badgeText, { color: SECTOR_COLORS[c.sector_type] || '#6B7280' }]}>{c.sector_type}</Text>\n"
        "                </View>\n"
        "              </View>\n"
        "              <Text style={styles.companyStats}>\n"
        "                {c.contract_count || 0} contracts \u00B7 {c.filing_count || 0} filings\n"
        "              </Text>\n"
        "            </View>\n"
        "            <Ionicons name=\"chevron-forward\" size={16} color={UI_COLORS.TEXT_MUTED} />\n"
        "          </TouchableOpacity>\n"
        "        ))}\n"
        "      </View>\n"
        "\n"
        "      <TouchableOpacity\n"
        "        style={styles.compareCta}\n"
        "        onPress={() => navigation.navigate('Compare', { sector: SECTOR })}\n"
        "      >\n"
        "        <Ionicons name=\"git-compare\" size={16} color={ACCENT} />\n"
        f"        <Text style={{[styles.compareText, {{ color: ACCENT }}]}}>Compare {cap} Companies</Text>\n"
        "      </TouchableOpacity>\n"
        "\n"
        "      <View style={styles.footer}>\n"
        f"        <Text style={{styles.footerText}}>{footer_sources}</Text>\n"
        "      </View>\n"
        "    </ScrollView>\n"
        "  );\n"
        "}\n"
        "\n"
        "const styles = StyleSheet.create({\n"
        "  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },\n"
        "  scrollContent: { paddingBottom: 24 },\n"
        "  hero: { borderRadius: 16, padding: 20, marginHorizontal: 16, marginTop: 12, overflow: 'hidden', position: 'relative' },\n"
        "  heroOrb: { position: 'absolute', top: -60, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.08)' },\n"
        "  heroInner: { position: 'relative' },\n"
        "  heroIconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },\n"
        "  heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },\n"
        "  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19 },\n"
        "  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, marginTop: 12, marginBottom: 16 },\n"
        "  statHalf: { width: '48%' as any, flexGrow: 1 },\n"
        "  section: { paddingHorizontal: 16, marginBottom: 16 },\n"
        "  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },\n"
        "  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },\n"
        "  accentBar: { width: 4, height: 20, borderRadius: 2 },\n"
        "  sectionTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },\n"
        "  seeAll: { fontSize: 13, fontWeight: '600', color: ACCENT },\n"
        "  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },\n"
        "  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, gap: 6 },\n"
        "  chipDot: { width: 8, height: 8, borderRadius: 4 },\n"
        "  chipText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },\n"
        "  companyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: UI_COLORS.BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },\n"
        "  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },\n"
        "  companyInfo: { flex: 1 },\n"
        "  companyName: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },\n"
        "  companyMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 },\n"
        "  ticker: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },\n"
        "  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1 },\n"
        "  badgeText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },\n"
        "  companyStats: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 3 },\n"
        "  compareCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 16, marginBottom: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: ACCENT + '40', backgroundColor: ACCENT + '08' },\n"
        "  compareText: { fontSize: 13, fontWeight: '700' },\n"
        "  footer: { alignItems: 'center', paddingVertical: 20 },\n"
        "  footerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },\n"
        "});\n"
    )


def render_companies(sector, screen, detail_route, icon, sector_colors):
    sector_colors_js = ",\n".join(f"  '{k}': '{v}'," for k, v in sector_colors.items())
    return (
        "import React, { useEffect, useState, useMemo } from 'react';\n"
        "import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet } from 'react-native';\n"
        "import { useNavigation } from '@react-navigation/native';\n"
        "import { Ionicons } from '@expo/vector-icons';\n"
        "import { UI_COLORS } from '../constants/colors';\n"
        "import { LoadingSpinner, EmptyState } from '../components/ui';\n"
        "\n"
        "import { apiClient } from '../api/client';\n"
        f"const SECTOR = '{sector}';\n"
        f"const log = (msg: string, err: unknown) => console.warn(`[{screen}] ${{msg}}:`, err);\n"
        "\n"
        "const SECTOR_COLORS: Record<string, string> = {\n"
        f"{sector_colors_js}\n"
        "};\n"
        "\n"
        f"export default function {screen}() {{\n"
        "  const navigation = useNavigation<any>();\n"
        "  const [companies, setCompanies] = useState<any[]>([]);\n"
        "  const [loading, setLoading] = useState(true);\n"
        "  const [error, setError] = useState('');\n"
        "  const [search, setSearch] = useState('');\n"
        "\n"
        "  useEffect(() => {\n"
        "    apiClient.getSectorCompanies(SECTOR, { limit: 200 })\n"
        "      .then((res: any) => { setCompanies(res.companies || []); })\n"
        "      .catch((e: any) => { setError(e?.message || 'Failed to load'); log('load', e); })\n"
        "      .finally(() => setLoading(false));\n"
        "  }, []);\n"
        "\n"
        "  const filtered = useMemo(() => {\n"
        "    if (!search) return companies;\n"
        "    const q = search.toLowerCase();\n"
        "    return companies.filter((c: any) =>\n"
        "      c.display_name.toLowerCase().includes(q) ||\n"
        "      (c.ticker && c.ticker.toLowerCase().includes(q)) ||\n"
        "      c.company_id.toLowerCase().includes(q)\n"
        "    );\n"
        "  }, [companies, search]);\n"
        "\n"
        "  if (loading) return <LoadingSpinner message=\"Loading companies...\" />;\n"
        "  if (error) return <EmptyState title=\"Error\" message={error} />;\n"
        "\n"
        "  const renderCompany = ({ item: c }: { item: any }) => (\n"
        "    <TouchableOpacity\n"
        "      style={styles.card}\n"
        f"      onPress={{() => navigation.navigate('{detail_route}', {{ company_id: c.company_id }})}}\n"
        "    >\n"
        "      <View style={[styles.iconWrap, { backgroundColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '15' }]}>\n"
        f"        <Ionicons name=\"{icon}\" size={{20}} color={{SECTOR_COLORS[c.sector_type] || '#6B7280'}} />\n"
        "      </View>\n"
        "      <View style={styles.info}>\n"
        "        <Text style={styles.name} numberOfLines={1}>{c.display_name}</Text>\n"
        "        <View style={styles.meta}>\n"
        "          {c.ticker && <Text style={styles.ticker}>{c.ticker}</Text>}\n"
        "          <View style={[styles.badge, { backgroundColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '12', borderColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '25' }]}>\n"
        "            <Text style={[styles.badgeText, { color: SECTOR_COLORS[c.sector_type] || '#6B7280' }]}>{c.sector_type}</Text>\n"
        "          </View>\n"
        "          {c.headquarters && <Text style={styles.hq}>{c.headquarters}</Text>}\n"
        "        </View>\n"
        "        <Text style={styles.stats}>{c.contract_count || 0} contracts \u00B7 {c.filing_count || 0} filings</Text>\n"
        "      </View>\n"
        "      <Ionicons name=\"chevron-forward\" size={16} color={UI_COLORS.TEXT_MUTED} />\n"
        "    </TouchableOpacity>\n"
        "  );\n"
        "\n"
        "  return (\n"
        "    <View style={styles.container}>\n"
        "      <View style={styles.searchWrap}>\n"
        "        <Ionicons name=\"search\" size={16} color={UI_COLORS.TEXT_MUTED} style={styles.searchIcon} />\n"
        "        <TextInput style={styles.searchInput} placeholder=\"Search companies...\" placeholderTextColor={UI_COLORS.TEXT_MUTED} value={search} onChangeText={setSearch} />\n"
        "        {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name=\"close-circle\" size={18} color={UI_COLORS.TEXT_MUTED} /></TouchableOpacity>}\n"
        "      </View>\n"
        "      <Text style={styles.countText}>Showing {filtered.length} of {companies.length}</Text>\n"
        "      <FlatList data={filtered} renderItem={renderCompany} keyExtractor={(c) => c.company_id} ItemSeparatorComponent={() => <View style={{ height: 8 }} />} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} ListEmptyComponent={<EmptyState title=\"No companies found\" />} />\n"
        "    </View>\n"
        "  );\n"
        "}\n"
        "\n"
        "const styles = StyleSheet.create({\n"
        "  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },\n"
        "  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, marginHorizontal: 16, marginTop: 12, marginBottom: 8, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },\n"
        "  searchIcon: { marginRight: 8 },\n"
        "  searchInput: { flex: 1, fontSize: 14, color: UI_COLORS.TEXT_PRIMARY },\n"
        "  countText: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, paddingHorizontal: 16, marginBottom: 8 },\n"
        "  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },\n"
        "  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },\n"
        "  info: { flex: 1 },\n"
        "  name: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },\n"
        "  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 },\n"
        "  ticker: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },\n"
        "  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1 },\n"
        "  badgeText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },\n"
        "  hq: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },\n"
        "  stats: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 3 },\n"
        "});\n"
    )


TELECOM_COLORS = {
    "wireless": "#DB2777", "broadband": "#0EA5E9", "cable": "#7C3AED",
    "fiber": "#10B981", "satellite": "#F59E0B", "infrastructure": "#6B7280",
    "voip": "#DC2626",
}

EDUCATION_COLORS = {
    "for_profit_college": "#DC2626", "higher_ed_services": "#3B82F6",
    "edtech": "#8B5CF6", "k12_services": "#10B981",
    "publishing": "#F59E0B", "student_lending": "#CA8A04",
    "testing": "#7C3AED",
}


def main():
    out = Path("mobile/src/screens")

    (out / "TelecomDashboardScreen.tsx").write_text(
        render_dashboard(
            sector="telecom", screen="TelecomDashboardScreen",
            title="Telecom Sector",
            subtitle="Wireless, broadband, cable and fiber carriers \u2014 lobbying, contracts, SEC filings, enforcement",
            hero_grad=("#DB2777", "#BE185D", "#9D174D"),
            accent="#DB2777", icon="cellular",
            sector_colors=TELECOM_COLORS,
            footer_sources="Data: SEC EDGAR \u00B7 FCC \u00B7 USASpending.gov \u00B7 Senate LDA",
        ),
        encoding="utf-8",
    )

    (out / "EducationDashboardScreen.tsx").write_text(
        render_dashboard(
            sector="education", screen="EducationDashboardScreen",
            title="Education Sector",
            subtitle="For-profit colleges, edtech, K12 services, student lending \u2014 lobbying, contracts, enforcement",
            hero_grad=("#CA8A04", "#A16207", "#854D0E"),
            accent="#CA8A04", icon="school",
            sector_colors=EDUCATION_COLORS,
            footer_sources="Data: SEC EDGAR \u00B7 Dept. of Education \u00B7 USASpending.gov \u00B7 Senate LDA",
        ),
        encoding="utf-8",
    )

    (out / "TelecomCompaniesScreen.tsx").write_text(
        render_companies(
            sector="telecom", screen="TelecomCompaniesScreen",
            detail_route="TelecomCompanyDetail", icon="cellular",
            sector_colors=TELECOM_COLORS,
        ),
        encoding="utf-8",
    )

    (out / "EducationCompaniesScreen.tsx").write_text(
        render_companies(
            sector="education", screen="EducationCompaniesScreen",
            detail_route="EducationCompanyDetail", icon="school",
            sector_colors=EDUCATION_COLORS,
        ),
        encoding="utf-8",
    )

    for name in ("TelecomDashboardScreen", "TelecomCompaniesScreen",
                 "EducationDashboardScreen", "EducationCompaniesScreen"):
        path = out / f"{name}.tsx"
        size = len(path.read_text(encoding="utf-8").splitlines())
        print(f"  {path} ({size} lines)")


if __name__ == "__main__":
    main()
