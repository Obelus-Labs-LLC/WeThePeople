import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';

interface AboutScreenProps {
  navigation?: any;
}

export default function AboutScreen({ navigation }: AboutScreenProps) {
  const appVersion = Constants.expoConfig?.version || (Constants as any).manifest?.version || '1.0.0';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Logo / Hero */}
      <LinearGradient
        colors={['#1B7A3D', '#15693A', '#0F5831']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Ionicons name="flag" size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.logoText}>We The People</Text>
          </View>
          <Text style={styles.versionText}>Version {appVersion}</Text>
        </View>
      </LinearGradient>

      {/* Mission */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.accentBar, { backgroundColor: UI_COLORS.ACCENT }]} />
          <Text style={styles.sectionTitle}>Our Mission</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.bodyText}>
            WeThePeople is a civic transparency platform that tracks how corporations lobby Congress,
            win government contracts, face enforcement actions, and donate to politicians.
          </Text>
          <Text style={[styles.bodyText, { marginTop: 10 }]}>
            We believe that democracy works best when citizens can follow the money. Every data point
            in this app is sourced from official government APIs and public records, making it easy
            to hold power accountable.
          </Text>
          <Text style={[styles.bodyText, { marginTop: 10 }]}>
            Covering Finance, Health, Technology, and Energy sectors, our platform recontextualizes
            every industry through the lens of political influence.
          </Text>
        </View>
      </View>

      {/* Built By */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.accentBar, { backgroundColor: UI_COLORS.GOLD }]} />
          <Text style={styles.sectionTitle}>Built By</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.builderRow}>
            <View style={styles.builderIcon}>
              <Ionicons name="code-slash" size={20} color={UI_COLORS.ACCENT} />
            </View>
            <View style={styles.builderInfo}>
              <Text style={styles.builderName}>Obelus Labs LLC</Text>
              <Text style={styles.builderDetail}>Building tools for civic transparency</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Links */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.accentBar, { backgroundColor: UI_COLORS.TEXT_MUTED }]} />
          <Text style={styles.sectionTitle}>Links</Text>
        </View>

        <TouchableOpacity
          style={styles.linkCard}
          onPress={() => Linking.openURL('https://github.com/Obelus-Labs-LLC/WeThePeople')}
          activeOpacity={0.7}
        >
          <Ionicons name="logo-github" size={22} color={UI_COLORS.TEXT_PRIMARY} />
          <View style={styles.linkInfo}>
            <Text style={styles.linkTitle}>GitHub Repository</Text>
            <Text style={styles.linkSubtitle}>Open source on GitHub</Text>
          </View>
          <Ionicons name="open-outline" size={16} color={UI_COLORS.TEXT_MUTED} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkCard}
          onPress={() => Linking.openURL('https://wethepeopleforus.com')}
          activeOpacity={0.7}
        >
          <Ionicons name="globe-outline" size={22} color={UI_COLORS.ACCENT} />
          <View style={styles.linkInfo}>
            <Text style={styles.linkTitle}>Website</Text>
            <Text style={styles.linkSubtitle}>wethepeopleforus.com</Text>
          </View>
          <Ionicons name="open-outline" size={16} color={UI_COLORS.TEXT_MUTED} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkCard}
          onPress={() => navigation?.navigate?.('Methodology')}
          activeOpacity={0.7}
        >
          <Ionicons name="flask-outline" size={22} color={UI_COLORS.GOLD} />
          <View style={styles.linkInfo}>
            <Text style={styles.linkTitle}>Methodology</Text>
            <Text style={styles.linkSubtitle}>Data sources and known limitations</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
        </TouchableOpacity>
      </View>

      {/* Legal */}
      <View style={styles.section}>
        <View style={styles.card}>
          <Text style={styles.legalText}>
            This app provides publicly available government data for informational purposes.
            All data is sourced from official government APIs and public records.
          </Text>
          <Text style={styles.legalCopy}>{'\u00A9'} 2025 Obelus Labs LLC. All rights reserved.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  content: { paddingBottom: 32 },
  hero: {
    borderRadius: 16, padding: 28, marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    overflow: 'hidden', position: 'relative', alignItems: 'center',
  },
  heroOrb: {
    position: 'absolute', top: -60, right: -40, width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroInner: { position: 'relative', alignItems: 'center' },
  logoContainer: { alignItems: 'center', marginBottom: 8 },
  logoCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  logoText: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  versionText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },
  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  accentBar: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 16, fontWeight: '700' },
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  bodyText: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 14, lineHeight: 21 },
  builderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  builderIcon: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: UI_COLORS.ACCENT + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  builderInfo: { flex: 1 },
  builderName: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  builderDetail: { fontSize: 13, color: UI_COLORS.TEXT_SECONDARY, marginTop: 2 },
  linkCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 10, padding: 14, marginBottom: 8, gap: 12,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  linkInfo: { flex: 1 },
  linkTitle: { fontSize: 15, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  linkSubtitle: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, marginTop: 1 },
  legalText: { color: UI_COLORS.TEXT_MUTED, fontSize: 13, lineHeight: 19 },
  legalCopy: { color: UI_COLORS.TEXT_MUTED, fontSize: 12, marginTop: 10, fontWeight: '500' },
});
