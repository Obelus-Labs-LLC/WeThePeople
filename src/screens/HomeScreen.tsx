import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_WIDTH = (width - 48 - CARD_GAP) / 2;

// Politics-first sector definitions with updated taglines
const SECTOR_CARDS = [
  {
    slug: 'politics',
    name: 'Politics',
    tagline: 'Follow the money from industry to Congress',
    icon: '\u{1F3DB}\uFE0F',
    gradientStart: '#2563EB',
    gradientEnd: '#4338CA',
    tab: 'PoliticsTab',
    available: true,
  },
  {
    slug: 'finance',
    name: 'Finance',
    tagline: 'Lobbying, contracts & enforcement on Wall Street',
    icon: '\u{1F4B0}',
    gradientStart: '#10B981',
    gradientEnd: '#0F766E',
    tab: 'FinanceTab',
    available: true,
  },
  {
    slug: 'health',
    name: 'Health',
    tagline: 'How pharma lobbies, wins contracts & faces regulators',
    icon: '\u{1F3E5}',
    gradientStart: '#F43F5E',
    gradientEnd: '#BE185D',
    tab: 'HealthTab',
    available: true,
  },
  {
    slug: 'energy',
    name: 'Oil, Gas & Energy',
    tagline: 'Tracking energy industry influence on policy',
    icon: '\u{1F6E2}\uFE0F',
    gradientStart: '#475569',
    gradientEnd: '#3F3F46',
    tab: 'EnergyTab',
    available: true,
  },
  {
    slug: 'technology',
    name: 'Technology',
    tagline: 'Big Tech lobbying, patents & government contracts',
    icon: '\u{1F4BB}',
    gradientStart: '#8B5CF6',
    gradientEnd: '#7C3AED',
    tab: 'TechnologyTab',
    available: true,
  },
];

const COMING_SOON = [
  {
    slug: 'chemicals',
    name: 'Chemicals',
    tagline: 'Chemical industry safety & lobbying',
    icon: '\u2697\uFE0F',
    gradientStart: '#F59E0B',
    gradientEnd: '#C2410C',
  },
  {
    slug: 'defense',
    name: 'Defense',
    tagline: 'Military contractor accountability',
    icon: '\u{1F6E1}\uFE0F',
    gradientStart: '#DC2626',
    gradientEnd: '#9F1239',
  },
  {
    slug: 'agriculture',
    name: 'Agriculture',
    tagline: 'Food safety & farming lobbying',
    icon: '\u{1F33E}',
    gradientStart: '#84CC16',
    gradientEnd: '#15803D',
  },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const handleSectorPress = (sector: typeof SECTOR_CARDS[0]) => {
    navigation.getParent()?.navigate(sector.tab);
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
              Follow the money from industry to politics
            </Text>
            <View style={styles.pillRow}>
              <View style={styles.pillOutline}>
                <Text style={styles.pillText}>24+ Federal Sources</Text>
              </View>
              <View style={styles.pillGold}>
                <Text style={styles.pillGoldText}>5 Sectors Live</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* Influence Explorer Card */}
        <View style={styles.gridContainer}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('InfluenceExplorer')}
            style={styles.influenceCard}
          >
            <LinearGradient
              colors={['#C5960C', '#8B6914']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.influenceGradient}
            >
              <Ionicons name="git-network" size={24} color="#FFFFFF" />
              <View style={styles.influenceTextContainer}>
                <Text style={styles.influenceTitle}>Influence Explorer</Text>
                <Text style={styles.influenceSubtitle}>See how money connects corporations to politicians</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
            </LinearGradient>
          </TouchableOpacity>

          {/* Sector grid */}
          <View style={styles.grid}>
            {SECTOR_CARDS.map((sector) => (
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
          {COMING_SOON.length > 0 && (
            <>
              <View style={styles.sectionRow}>
                <View style={styles.accentBar} />
                <Text style={styles.sectionTitle}>Coming Soon</Text>
              </View>
              <View style={styles.grid}>
                {COMING_SOON.map((sector) => (
                  <TouchableOpacity
                    key={sector.slug}
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('ComingSoon', { sector })}
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

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            WeThePeople — Follow the money from industry to politics
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
  // -- Gradient Hero --
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
  // -- Influence Explorer --
  influenceCard: {
    marginBottom: CARD_GAP,
  },
  influenceGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 18,
    gap: 14,
  },
  influenceTextContainer: {
    flex: 1,
  },
  influenceTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  influenceSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  // -- Grid --
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
  // -- Section Headers --
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
  // -- Footer --
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
