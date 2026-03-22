import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Dimensions, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { LoadingSpinner, StatCard } from '../components/ui';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface StoryStep {
  key: string;
  title: string;
  icon: string;
  color: string;
  description: string;
  statLabel?: string;
  statValue?: string;
}

const STORY_STEPS: StoryStep[] = [
  {
    key: 'landscape',
    title: 'The Landscape',
    icon: 'earth',
    color: '#2563EB',
    description: 'Corporations across finance, health, tech, and energy sectors interact with government through multiple channels.',
  },
  {
    key: 'lobbying',
    title: 'Lobbying Congress',
    icon: 'megaphone',
    color: '#1B7A3D',
    description: 'Companies spend billions lobbying Congress each year to influence legislation favorable to their industries.',
  },
  {
    key: 'contracts',
    title: 'Winning Contracts',
    icon: 'briefcase',
    color: '#C5960C',
    description: 'The same companies that lobby Congress then receive government contracts worth billions of dollars.',
  },
  {
    key: 'comparison',
    title: 'The Overlap',
    icon: 'git-compare',
    color: '#8B5CF6',
    description: 'Companies that lobby more tend to win more government contracts, raising questions about the relationship between influence and public spending.',
  },
  {
    key: 'enforcement',
    title: 'Enforcement Gap',
    icon: 'shield-checkmark',
    color: '#DC2626',
    description: 'Despite billions in lobbying and contracts, enforcement actions against major corporations remain relatively rare.',
  },
];

export default function DataStoryScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiClient.getInfluenceStats().catch(() => null);
      setStats(res);
    } catch (e) {
      console.error('Data story load failed:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  // Update steps with live stats
  const enrichedSteps = STORY_STEPS.map(step => {
    if (!stats) return step;
    switch (step.key) {
      case 'landscape':
        return { ...step, statLabel: 'Politicians Tracked', statValue: String(stats.politicians_connected || '---') };
      case 'lobbying':
        return { ...step, statLabel: 'Total Lobbying', statValue: formatDollar(stats.total_lobbying_spend) };
      case 'contracts':
        return { ...step, statLabel: 'Contract Value', statValue: formatDollar(stats.total_contract_value) };
      case 'comparison':
        return { ...step, statLabel: 'Companies Tracked', statValue: String(stats.companies_tracked || '500+') };
      case 'enforcement':
        return { ...step, statLabel: 'Enforcement Actions', statValue: String(stats.total_enforcement_actions || '---') };
      default:
        return step;
    }
  });

  // Auto-play
  useEffect(() => {
    if (!isPlaying) return;
    timerRef.current = setTimeout(() => {
      const next = currentStep + 1;
      if (next >= enrichedSteps.length) {
        setIsPlaying(false);
        return;
      }
      animateTransition(next);
    }, 4000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isPlaying, currentStep, enrichedSteps.length]);

  const animateTransition = (next: number) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
    setTimeout(() => setCurrentStep(next), 200);
  };

  const goToStep = (idx: number) => {
    setIsPlaying(false);
    animateTransition(idx);
  };

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (currentStep >= enrichedSteps.length - 1) setCurrentStep(0);
      setIsPlaying(true);
    }
  };

  if (loading) return <LoadingSpinner message="Loading data story..." />;

  const step = enrichedSteps[currentStep];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
    >
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
            <Ionicons name="book" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>The Data Story</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            A narrative journey through corporate influence on government
          </Text>
        </View>
      </LinearGradient>

      {/* Progress dots */}
      <View style={styles.progressRow}>
        {enrichedSteps.map((s, idx) => (
          <TouchableOpacity key={s.key} onPress={() => goToStep(idx)}>
            <View
              style={[
                styles.progressDot,
                { backgroundColor: idx === currentStep ? s.color : UI_COLORS.BORDER },
                idx <= currentStep && { backgroundColor: s.color },
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>

      {/* Play/Pause control */}
      <View style={styles.controlRow}>
        <TouchableOpacity style={styles.controlBtn} onPress={togglePlay}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color={UI_COLORS.ACCENT} />
          <Text style={styles.controlText}>{isPlaying ? 'Pause' : 'Play Story'}</Text>
        </TouchableOpacity>
        <Text style={styles.stepCounter}>
          {currentStep + 1} of {enrichedSteps.length}
        </Text>
      </View>

      {/* Current step */}
      <Animated.View style={[styles.stepCard, { opacity: fadeAnim, borderLeftColor: step.color }]}>
        <View style={[styles.stepIconCircle, { backgroundColor: step.color + '15' }]}>
          <Ionicons name={step.icon as any} size={28} color={step.color} />
        </View>
        <Text style={[styles.stepTitle, { color: step.color }]}>{step.title}</Text>
        <Text style={styles.stepDescription}>{step.description}</Text>
        {step.statLabel && step.statValue && (
          <View style={styles.stepStatRow}>
            <View style={styles.statItem}>
              <StatCard label={step.statLabel} value={step.statValue} accent="green" />
            </View>
          </View>
        )}
      </Animated.View>

      {/* Navigation arrows */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.navBtn, currentStep === 0 && styles.navBtnDisabled]}
          disabled={currentStep === 0}
          onPress={() => goToStep(currentStep - 1)}
        >
          <Ionicons name="chevron-back" size={20} color={currentStep === 0 ? UI_COLORS.TEXT_MUTED : UI_COLORS.ACCENT} />
          <Text style={[styles.navBtnText, currentStep === 0 && { color: UI_COLORS.TEXT_MUTED }]}>Previous</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navBtn, currentStep === enrichedSteps.length - 1 && styles.navBtnDisabled]}
          disabled={currentStep === enrichedSteps.length - 1}
          onPress={() => goToStep(currentStep + 1)}
        >
          <Text style={[styles.navBtnText, currentStep === enrichedSteps.length - 1 && { color: UI_COLORS.TEXT_MUTED }]}>Next</Text>
          <Ionicons name="chevron-forward" size={20} color={currentStep === enrichedSteps.length - 1 ? UI_COLORS.TEXT_MUTED : UI_COLORS.ACCENT} />
        </TouchableOpacity>
      </View>

      {/* Step overview list */}
      <View style={styles.overviewSection}>
        <Text style={styles.overviewTitle}>All Steps</Text>
        {enrichedSteps.map((s, idx) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.overviewCard, idx === currentStep && { borderLeftColor: s.color, borderLeftWidth: 3 }]}
            onPress={() => goToStep(idx)}
          >
            <Ionicons name={s.icon as any} size={18} color={idx === currentStep ? s.color : UI_COLORS.TEXT_MUTED} />
            <Text style={[styles.overviewText, idx === currentStep && { color: s.color, fontWeight: '700' }]}>
              {s.title}
            </Text>
            {idx <= currentStep && (
              <Ionicons name="checkmark-circle" size={16} color={s.color} style={{ marginLeft: 'auto' }} />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

function formatDollar(val: number | null | undefined): string {
  if (val == null) return '$0';
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  content: { paddingBottom: 32 },
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
  progressRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 16 },
  progressDot: { width: 10, height: 10, borderRadius: 5 },
  controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 12 },
  controlBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: UI_COLORS.ACCENT + '12' },
  controlText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.ACCENT },
  stepCounter: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, fontWeight: '600' },
  stepCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 16, padding: 24, marginHorizontal: 16, marginTop: 16,
    borderWidth: 1, borderColor: UI_COLORS.BORDER, borderLeftWidth: 4, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  stepIconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  stepTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  stepDescription: { fontSize: 14, color: UI_COLORS.TEXT_SECONDARY, textAlign: 'center', lineHeight: 21 },
  stepStatRow: { marginTop: 16, width: '100%' },
  statItem: { flex: 1 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 16 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: UI_COLORS.CARD_BG, borderWidth: 1, borderColor: UI_COLORS.BORDER },
  navBtnDisabled: { opacity: 0.5 },
  navBtnText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.ACCENT },
  overviewSection: { marginTop: 24, paddingHorizontal: 16 },
  overviewTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 8 },
  overviewCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 8,
    backgroundColor: UI_COLORS.CARD_BG, borderWidth: 1, borderColor: UI_COLORS.BORDER, marginBottom: 6,
  },
  overviewText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
});
