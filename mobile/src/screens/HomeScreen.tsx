import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { UI_COLORS } from '../constants/colors';
import { SECTORS } from '../data/sectors';

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_WIDTH = (width - 48 - CARD_GAP) / 2;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  // Sectors with their own bottom tab
  const SECTOR_TAB_MAP: Record<string, string> = {
    politics: 'PoliticsTab',
    finance: 'FinanceTab',
    health: 'HealthTab',
    technology: 'TechnologyTab',
  };

  // Sectors accessible via HomeStack navigation
  const SECTOR_SCREEN_MAP: Record<string, string> = {
    energy: 'EnergyDashboard',
    transportation: 'TransportationDashboard',
    defense: 'DefenseDashboard',
    chemicals: 'ChemicalsDashboard',
    agriculture: 'AgricultureDashboard',
    telecom: 'TelecomDashboard',
    education: 'EducationDashboard',
  };

  const handleSectorPress = (sector: typeof SECTORS[0]) => {
    if (!sector.available) {
      navigation.navigate('ComingSoon', { sector });
      return;
    }
    // If the sector has its own tab, switch to that tab
    const tabName = SECTOR_TAB_MAP[sector.slug];
    if (tabName) {
      navigation.getParent()?.navigate(tabName);
      return;
    }
    // Otherwise navigate within the HomeStack
    const screenName = SECTOR_SCREEN_MAP[sector.slug];
    if (screenName) {
      navigation.navigate(screenName);
      return;
    }
    // Fallback
    navigation.navigate('ComingSoon', { sector });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Gradient Hero Banner */}
        <LinearGradient
          colors={['#0D1117', '#111827', '#1A1A2E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroBanner, { paddingTop: insets.top + 24 }]}
        >
          {/* Decorative blurred orbs */}
          <View style={styles.orbWhite} />
          <View style={styles.orbGold} />

          <View style={styles.heroContent}>
            <View style={styles.brandRow}>
              <View style={styles.brandIcon}>
                <Text style={styles.brandIconText}>WP</Text>
              </View>
              <Text style={styles.brandTitle}>WeThePeople</Text>
            </View>
            <Text style={styles.heroSubtitle}>
              Track what powerful people and institutions actually do
            </Text>
            <View style={styles.pillRow}>
              <View style={styles.pillOutline}>
                <Text style={styles.pillText}>24+ Federal Sources</Text>
              </View>
              <View style={styles.pillGold}>
                <Text style={styles.pillGoldText}>11 Sectors Live</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* Sector grid — overlaps the hero */}
        <View style={styles.gridContainer}>
          <View style={styles.grid}>
            {SECTORS.filter(s => s.available).map((sector) => (
              <TouchableOpacity
                key={sector.slug}
                activeOpacity={0.85}
                onPress={() => handleSectorPress(sector)}
                style={styles.cardWrapper}
              >
                <View style={styles.card}>
                  <LinearGradient
                    colors={[sector.gradientStart + '30', sector.gradientEnd + '15']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <Text style={styles.cardIcon}>{sector.icon}</Text>
                  <Text style={styles.cardName}>{sector.name}</Text>
                  <Text style={styles.cardTagline}>{sector.tagline}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Coming soon row */}
          {SECTORS.filter(s => !s.available).length > 0 && (
            <>
              <View style={styles.sectionRow}>
                <View style={styles.accentBar} />
                <Text style={styles.sectionTitle}>Coming Soon</Text>
              </View>
              <View style={styles.grid}>
                {SECTORS.filter(s => !s.available).map((sector) => (
                  <TouchableOpacity
                    key={sector.slug}
                    activeOpacity={0.85}
                    onPress={() => handleSectorPress(sector)}
                    style={styles.cardWrapper}
                  >
                    <View style={[styles.card, styles.cardComingSoon]}>
                      <LinearGradient
                        colors={[sector.gradientStart + '20', sector.gradientEnd + '08']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={styles.soonBadge}>
                        <Text style={styles.soonText}>SOON</Text>
                      </View>
                      <Text style={styles.cardIcon}>{sector.icon}</Text>
                      <Text style={styles.cardName}>{sector.name}</Text>
                      <Text style={styles.cardTagline}>{sector.tagline}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Quick Tools */}
        <View style={styles.quickToolsContainer}>
          <View style={styles.sectionRow}>
            <View style={[styles.accentBar, { backgroundColor: UI_COLORS.ACCENT }]} />
            <Text style={styles.sectionTitle}>Quick Tools</Text>
          </View>
          <View style={styles.quickToolsGrid}>
            {[
              // Personal / action tools only. All data-exploration surfaces
              // (Trades, Stories, Anomalies, State Explorer, Ask WTP,
              // Influence Network/Explorer, Enforcement, Lobbying, Contracts)
              // now live exclusively under Data Explorer to remove the
              // duplicate listing that was here.
              { screen: 'ZipLookup', icon: 'location' as const, name: 'ZIP Code Lookup', desc: 'Find your representatives', accent: '#10B981' },
              { screen: 'CivicHub', icon: 'people' as const, name: 'Civic Hub', desc: 'Promises, proposals, and badges', accent: '#2563EB' },
              { screen: 'Account', icon: 'person-circle' as const, name: 'Account', desc: 'Follow politicians, companies, bills', accent: '#2563EB' },
              { screen: 'DataExplorer', icon: 'compass' as const, name: 'Data Explorer', desc: 'Every data tool in one place', accent: '#6366F1' },
              { screen: 'DataStory', icon: 'book' as const, name: 'State of the Data', desc: 'One-read summary of everything', accent: '#059669' },
            ].map((tool) => (
              <TouchableOpacity
                key={tool.screen}
                activeOpacity={0.85}
                onPress={() => navigation.navigate(tool.screen)}
                style={styles.quickToolWrapper}
              >
                <View style={styles.quickToolCard}>
                  <Ionicons name={tool.icon} size={28} color={tool.accent} />
                  <Text style={styles.quickToolName}>{tool.name}</Text>
                  <Text style={styles.quickToolDesc}>{tool.desc}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            WeThePeople — Holding power accountable across every sector
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.SECONDARY_BG,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  // ── Gradient Hero ──
  heroBanner: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    position: 'relative',
    overflow: 'hidden',
  },
  orbWhite: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(197,160,68,0.06)',
  },
  orbGold: {
    position: 'absolute',
    bottom: -60,
    left: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(197,160,68,0.08)',
  },
  heroContent: {
    position: 'relative',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  brandIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: UI_COLORS.GOLD,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(197,160,68,0.5)',
  },
  brandIconText: {
    color: '#0A0F1A',
    fontSize: 17,
    fontWeight: '900',
  },
  brandTitle: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 16,
    lineHeight: 23,
    maxWidth: 300,
    marginBottom: 16,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pillOutline: {
    backgroundColor: UI_COLORS.GLASS,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER_LIGHT,
  },
  pillText: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: '600',
  },
  pillGold: {
    backgroundColor: UI_COLORS.GOLD,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pillGoldText: {
    color: '#0A0F1A',
    fontSize: 12,
    fontWeight: '700',
  },
  // ── Grid ──
  gridContainer: {
    marginTop: -24,
    paddingHorizontal: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  cardWrapper: {
    width: CARD_WIDTH,
  },
  card: {
    borderRadius: 16,
    padding: 18,
    minHeight: 140,
    backgroundColor: UI_COLORS.CARD_BG,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  cardComingSoon: {
    opacity: 0.6,
  },
  soonBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: UI_COLORS.GOLD_LIGHT,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.GOLD + '40',
    zIndex: 1,
  },
  soonText: {
    color: UI_COLORS.GOLD,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  cardIcon: {
    fontSize: 32,
    marginBottom: 10,
  },
  cardName: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardTagline: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 16,
  },
  // ── Section Headers ──
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  accentBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: UI_COLORS.GOLD,
  },
  sectionTitle: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '700',
  },
  // ── Quick Tools ──
  quickToolsContainer: {
    paddingHorizontal: 18,
    marginTop: 20,
  },
  quickToolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  quickToolWrapper: {
    width: CARD_WIDTH,
  },
  quickToolCard: {
    borderRadius: 16,
    padding: 18,
    minHeight: 120,
    backgroundColor: UI_COLORS.CARD_BG,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  quickToolName: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
  },
  quickToolDesc: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 12,
    lineHeight: 16,
  },
  // ── Footer ──
  footer: {
    marginTop: 32,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  footerText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    textAlign: 'center',
  },
});
