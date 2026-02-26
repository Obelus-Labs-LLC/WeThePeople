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
import { UI_COLORS } from '../constants/colors';
import { SECTORS } from '../data/sectors';

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_WIDTH = (width - 48 - CARD_GAP) / 2;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const SECTOR_TAB_MAP: Record<string, string> = {
    politics: 'PoliticsTab',
    finance: 'FinanceTab',
    health: 'HealthTab',
    technology: 'TechnologyTab',
  };

  const handleSectorPress = (sector: typeof SECTORS[0]) => {
    if (sector.available) {
      const tabName = SECTOR_TAB_MAP[sector.slug] || 'PoliticsTab';
      navigation.getParent()?.navigate(tabName);
    } else {
      navigation.navigate('ComingSoon', { sector });
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.brandRow}>
            <View style={styles.brandIcon}>
              <Text style={styles.brandIconText}>WP</Text>
            </View>
            <Text style={styles.brandTitle}>We The People</Text>
          </View>
          <Text style={styles.tagline}>ACCOUNTABILITY ACROSS EVERY SECTOR</Text>
          <View style={styles.divider} />
          <Text style={styles.headline}>Which sector are you interested in?</Text>
          <Text style={styles.subtitle}>
            We track what the powerful actually do — actions, votes, and legislation.
          </Text>
        </View>

        {/* Sector grid */}
        <View style={styles.grid}>
          {SECTORS.map((sector) => (
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
                {!sector.available && (
                  <View style={styles.soonBadge}>
                    <Text style={styles.soonText}>SOON</Text>
                  </View>
                )}
                <Text style={styles.cardIcon}>{sector.icon}</Text>
                <Text style={styles.cardName}>{sector.name}</Text>
                <Text style={styles.cardTagline}>{sector.tagline}</Text>
              </LinearGradient>
            </TouchableOpacity>
          ))}
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
  hero: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  brandIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: UI_COLORS.ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandIconText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  brandTitle: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: {
    color: UI_COLORS.ACCENT,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 6,
  },
  divider: {
    width: 48,
    height: 2,
    backgroundColor: UI_COLORS.ACCENT + '40',
    borderRadius: 1,
    marginBottom: 20,
  },
  headline: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  soonBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.25)',
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
