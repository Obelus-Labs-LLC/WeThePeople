import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { UI_COLORS, TIER_COLORS, PARTY_COLORS, ACCENT_COLORS } from '../constants/colors';

// ── Loading Spinner ──
export function LoadingSpinner({ message }: { message?: string }) {
  return (
    <View style={uiStyles.center}>
      <ActivityIndicator size="large" color={UI_COLORS.ACCENT} />
      {message && <Text style={uiStyles.loadingText}>{message}</Text>}
    </View>
  );
}

// ── Empty State ──
export function EmptyState({ title, message, onRetry }: { title: string; message?: string; onRetry?: () => void }) {
  return (
    <View style={uiStyles.emptyContainer}>
      <Text style={uiStyles.emptyTitle}>{title}</Text>
      {message && <Text style={uiStyles.emptyMessage}>{message}</Text>}
      {onRetry && (
        <TouchableOpacity onPress={onRetry} style={uiStyles.retryBtn} accessibilityRole="button" accessibilityLabel="Retry loading">
          <Text style={uiStyles.retryText}>Tap to retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Stat Card ──
export function StatCard({
  label,
  value,
  accent = 'green',
  subtitle,
}: {
  label: string;
  value: string | number;
  accent?: string;
  subtitle?: string;
}) {
  const accentColor = ACCENT_COLORS[accent] || UI_COLORS.ACCENT;
  return (
    <View style={[uiStyles.statCard, { borderLeftColor: accentColor }]}>
      <Text style={uiStyles.statLabel}>{label}</Text>
      <Text style={[uiStyles.statValue, { color: accentColor }]}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </Text>
      {subtitle && <Text style={uiStyles.statSubtitle}>{subtitle}</Text>}
    </View>
  );
}

// ── Tier Badge ──
export function TierBadge({ tier }: { tier: string }) {
  const color = TIER_COLORS[tier] || TIER_COLORS.none;
  return (
    <View style={[uiStyles.badge, { backgroundColor: color + '15', borderColor: color + '30' }]}>
      <View style={[uiStyles.badgeDot, { backgroundColor: color }]} />
      <Text style={[uiStyles.badgeText, { color }]}>
        {tier.charAt(0).toUpperCase() + tier.slice(1)}
      </Text>
    </View>
  );
}

// ── Party Badge ──
export function PartyBadge({ party }: { party: string }) {
  const letter = party?.charAt(0).toUpperCase() || '?';
  const color = PARTY_COLORS[letter] || PARTY_COLORS[party] || '#6B7280';
  const label =
    letter === 'D' ? 'Dem' : letter === 'R' ? 'Rep' : letter === 'I' ? 'Ind' : party;
  return (
    <View style={[uiStyles.badge, { backgroundColor: color + '12', borderColor: color + '25' }]}>
      <Text style={[uiStyles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ── Chamber Badge ──
export function ChamberBadge({ chamber }: { chamber: string }) {
  const isHouse =
    chamber?.toLowerCase().includes('house') || chamber?.toLowerCase() === 'lower';
  const label = isHouse ? 'House' : 'Senate';
  return (
    <View style={[uiStyles.badge, { backgroundColor: '#F0F2EF', borderColor: '#E2E8E0' }]}>
      <Text style={[uiStyles.badgeText, { color: '#4A5E4A' }]}>{label}</Text>
    </View>
  );
}

// ── Tier Progress Bar ──
export function TierProgressBar({
  segments,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;

  return (
    <View>
      <View style={uiStyles.progressBarTrack}>
        {segments.map((seg) =>
          seg.value > 0 ? (
            <View
              key={seg.label}
              style={[
                uiStyles.progressBarSegment,
                {
                  backgroundColor: seg.color,
                  flex: seg.value / total,
                },
              ]}
            />
          ) : null
        )}
      </View>
      <View style={uiStyles.progressLegend}>
        {segments.map((seg) => (
          <View key={seg.label} style={uiStyles.legendItem}>
            <View style={[uiStyles.legendDot, { backgroundColor: seg.color }]} />
            <Text style={uiStyles.legendText}>
              {seg.label} ({seg.value})
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Score Bar ──
export function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(score * 100, 100);
  return (
    <View style={uiStyles.scoreBarContainer}>
      <View style={uiStyles.scoreBarTrack}>
        <View style={[uiStyles.scoreBarFill, { width: `${pct}%` as any }]} />
      </View>
      <Text style={uiStyles.scoreBarText}>{pct.toFixed(0)}%</Text>
    </View>
  );
}

// ── Sector Type Badge (Finance) ──
const SECTOR_TYPE_COLORS: Record<string, string> = {
  bank: '#2563EB',
  investment: '#8B5CF6',
  insurance: '#F59E0B',
  fintech: '#10B981',
  central_bank: '#DC2626',
};

export function SectorTypeBadge({ sectorType }: { sectorType: string }) {
  const color = SECTOR_TYPE_COLORS[sectorType] || '#6B7280';
  const label = sectorType.replace('_', ' ');
  return (
    <View style={[uiStyles.badge, { backgroundColor: color + '12', borderColor: color + '25' }]}>
      <Text style={[uiStyles.badgeText, { color, textTransform: 'capitalize' }]}>{label}</Text>
    </View>
  );
}

// ── Company Type Badge (Health) ──
const COMPANY_TYPE_COLORS: Record<string, string> = {
  pharma: '#2563EB',
  biotech: '#8B5CF6',
  insurer: '#F59E0B',
  pharmacy: '#10B981',
  distributor: '#64748B',
};

export function CompanyTypeBadge({ companyType }: { companyType: string }) {
  const color = COMPANY_TYPE_COLORS[companyType] || '#6B7280';
  const label = companyType.replace('_', ' ');
  return (
    <View style={[uiStyles.badge, { backgroundColor: color + '12', borderColor: color + '25' }]}>
      <Text style={[uiStyles.badgeText, { color, textTransform: 'capitalize' }]}>{label}</Text>
    </View>
  );
}

// ── Skeleton Loader ──
function SkeletonPulse({ style }: { style?: any }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <Animated.View
      style={[
        { backgroundColor: UI_COLORS.BORDER, borderRadius: 6, opacity },
        style,
      ]}
    />
  );
}

export function SkeletonCard() {
  return (
    <View style={uiStyles.skeletonCard}>
      <SkeletonPulse style={{ width: '40%', height: 12, marginBottom: 10 }} />
      <SkeletonPulse style={{ width: '100%', height: 10, marginBottom: 6 }} />
      <SkeletonPulse style={{ width: '75%', height: 10 }} />
    </View>
  );
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

export function SkeletonRow() {
  return (
    <View style={uiStyles.skeletonRow}>
      <SkeletonPulse style={{ width: 44, height: 44, borderRadius: 22 }} />
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonPulse style={{ width: '60%', height: 12 }} />
        <SkeletonPulse style={{ width: '40%', height: 10 }} />
      </View>
    </View>
  );
}

export function SkeletonPersonRows({ count = 5 }: { count?: number }) {
  return (
    <View style={{ gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}

const uiStyles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: UI_COLORS.PRIMARY_BG,
  },
  loadingText: {
    marginTop: 12,
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 14,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptyMessage: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 13,
    textAlign: 'center',
  },
  statCard: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  statLabel: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  statSubtitle: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  progressBarTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E8ECE8',
    overflow: 'hidden',
  },
  progressBarSegment: {
    height: '100%',
  },
  progressLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
  },
  scoreBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  scoreBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E8ECE8',
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    backgroundColor: UI_COLORS.ACCENT,
    borderRadius: 3,
  },
  scoreBarText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    minWidth: 30,
  },
  // ── Skeleton ──
  skeletonCard: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.ACCENT + '15',
    borderRadius: 8,
  },
  retryText: {
    color: UI_COLORS.ACCENT,
    fontSize: 13,
    fontWeight: '600',
  },
});
