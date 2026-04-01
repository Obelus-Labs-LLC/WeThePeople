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
          colors={['#1B7A3D', '#15693A', '#0F5831']}
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
                <Text style={styles.pillGoldText}>9 Sectors Live</Text>
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
                <LinearGradient
                  colors={[sector.gradientStart, sector.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.card}
                >
                  <Text style={styles.cardIcon}>{sector.icon}</Text>
                  <Text style={styles.cardName}>{sector.name}</Text>
                  <Text style={styles.cardTagline}>{sector.tagline}</Text>
                </LinearGradient>
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
                    <LinearGradient
                      colors={[sector.gradientStart, sector.gradientEnd]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.card, { opacity: 0.7 }]}
                    >
                      <View style={styles.soonBadge}>
                        <Text style={styles.soonText}>SOON</Text>
                      </View>
                      <Text style={styles.cardIcon}>{sector.icon}</Text>
                      <Text style={styles.cardName}>{sector.name}</Text>
                      <Text style={styles.cardTagline}>{sector.tagline}</Text>
                    </LinearGradient>
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
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('CongressionalTrades')}
              style={styles.quickToolWrapper}
            >
              <LinearGradient
                colors={['#2563EB', '#1D4ED8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quickToolCard}
              >
                <Ionicons name="trending-up" size={28} color="#FFFFFF" />
                <Text style={styles.quickToolName}>Congressional Trades</Text>
                <Text style={styles.quickToolDesc}>Stock trades by members of Congress</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('ZipLookup')}
              style={styles.quickToolWrapper}
            >
              <LinearGradient
                colors={['#10B981', '#059669']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quickToolCard}
              >
                <Ionicons name="location" size={28} color="#FFFFFF" />
                <Text style={styles.quickToolName}>ZIP Code Lookup</Text>
                <Text style={styles.quickToolDesc}>Find your representatives</Text>
              </LinearGradient>
            </TouchableOpacity>
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
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  orbGold: {
    position: 'absolute',
    bottom: -60,
    left: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(197,150,12,0.1)',
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
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  brandIconText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  brandTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.9)',
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
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  pillGold: {
    backgroundColor: 'rgba(197,150,12,0.9)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pillGoldText: {
    color: '#FFFFFF',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  soonBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  soonText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  cardIcon: {
    fontSize: 32,
    marginBottom: 10,
  },
  cardName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardTagline: {
    color: 'rgba(255,255,255,0.8)',
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
    gap: CARD_GAP,
  },
  quickToolWrapper: {
    width: CARD_WIDTH,
  },
  quickToolCard: {
    borderRadius: 16,
    padding: 18,
    minHeight: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  quickToolName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
  },
  quickToolDesc: {
    color: 'rgba(255,255,255,0.8)',
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
