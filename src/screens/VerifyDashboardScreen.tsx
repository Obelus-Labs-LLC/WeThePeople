import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS, TIER_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { StatCard, LoadingSpinner, EmptyState } from '../components/ui';
import SectionHeader from '../components/SectionHeader';

interface VerifyDashboardScreenProps {
  navigation?: any;
}

function tierColor(tier: string | null): string {
  return TIER_COLORS[tier || 'none'] || TIER_COLORS.none;
}

function tierLabel(tier: string | null): string {
  if (tier === 'strong') return 'Strong';
  if (tier === 'moderate') return 'Moderate';
  if (tier === 'weak') return 'Weak';
  return 'Unverified';
}

export default function VerifyDashboardScreen({ navigation }: VerifyDashboardScreenProps) {
  const [stats, setStats] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, listRes] = await Promise.all([
        apiClient.getVerificationStats(),
        apiClient.getVerifications({ limit: 20 }),
      ]);
      setStats(statsRes);
      setItems(listRes.items || []);
    } catch (e) {
      console.error('Failed to load verification data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) return <LoadingSpinner message="Loading verifications..." />;

  const renderItem = ({ item }: { item: any }) => {
    const tier = item.evaluation?.tier || item.tier || 'none';
    const color = tierColor(tier);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation?.navigate('VerifyResult', { id: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.tierBadge, { backgroundColor: color + '20' }]}>
            <View style={[styles.tierDot, { backgroundColor: color }]} />
            <Text style={[styles.tierText, { color }]}>{tierLabel(tier)}</Text>
          </View>
          {item.evaluation?.score != null && (
            <Text style={styles.score}>{Math.round(item.evaluation.score * 100)}%</Text>
          )}
        </View>
        <Text style={styles.claimText} numberOfLines={3}>{item.text}</Text>
        {item.person_id && (
          <Text style={styles.entityText}>{item.person_id}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {/* Hero */}
            <LinearGradient
              colors={['#059669', '#047857', '#065F46']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroInner}>
                <Ionicons name="shield-checkmark" size={24} color="#FFFFFF" />
                <Text style={styles.heroTitle}>Claim Verification</Text>
                <Text style={styles.heroSubtitle}>Compare what they say to what they do</Text>
              </View>
            </LinearGradient>

            {/* Stats */}
            {stats && (
              <View style={styles.statsRow}>
                <StatCard
                  label="Total Claims"
                  value={stats.total_claims?.toLocaleString() || '0'}
                  icon="document-text"
                  color="#10B981"
                />
                <StatCard
                  label="Evaluated"
                  value={stats.total_evaluated?.toLocaleString() || '0'}
                  icon="checkmark-circle"
                  color="#3B82F6"
                />
                <StatCard
                  label="Entities"
                  value={stats.unique_entities?.toLocaleString() || '0'}
                  icon="people"
                  color="#8B5CF6"
                />
              </View>
            )}

            {/* Submit CTA */}
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={() => navigation?.navigate('VerifySubmit')}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle" size={20} color="#FFFFFF" />
              <Text style={styles.ctaText}>Submit New Verification</Text>
            </TouchableOpacity>

            <SectionHeader title="Recent Verifications" />
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon="shield-checkmark-outline"
            title="No Verifications Yet"
            subtitle="Submit the first claim to verify"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.PRIMARY_BG,
  },
  list: {
    paddingBottom: 32,
  },
  hero: {
    borderRadius: 16,
    margin: 16,
    padding: 24,
    overflow: 'hidden',
  },
  heroInner: {
    alignItems: 'center',
    gap: 8,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    paddingVertical: 14,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER_LIGHT,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tierDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tierText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  score: {
    fontSize: 12,
    fontWeight: '600',
    color: UI_COLORS.TEXT_MUTED,
    fontVariant: ['tabular-nums'],
  },
  claimText: {
    fontSize: 13,
    color: UI_COLORS.TEXT_PRIMARY,
    lineHeight: 19,
  },
  entityText: {
    fontSize: 11,
    color: UI_COLORS.TEXT_MUTED,
    marginTop: 6,
  },
});
