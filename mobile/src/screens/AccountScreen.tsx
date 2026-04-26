import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, Alert,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';
import { apiClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const ACCENT = '#2563EB';
const log = (msg: string, err: unknown) => console.warn(`[AccountScreen] ${msg}:`, err);

type Tab = 'profile' | 'notifications' | 'follows';

const ENTITY_ICONS: Record<string, any> = {
  politician: 'person',
  person: 'person',
  company: 'business',
  institution: 'business',
  bill: 'document-text',
  sector: 'layers',
};

const ENTITY_COLORS: Record<string, string> = {
  politician: '#2563EB',
  person: '#2563EB',
  company: '#10B981',
  institution: '#10B981',
  bill: '#7C3AED',
  sector: '#F59E0B',
};

interface WatchlistItem {
  id: number;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  sector: string;
  created_at: string;
}

interface Preferences {
  zip_code?: string | null;
  digest_opt_in?: boolean;
  alert_opt_in?: boolean;
}

export default function AccountScreen() {
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<Tab>('profile');

  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);

  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadPreferences = useCallback(async () => {
    if (!isAuthenticated) return;
    setPrefsLoading(true);
    try {
      const data = await apiClient.getPreferences();
      setPrefs({
        zip_code: data.zip_code,
        digest_opt_in: !!data.digest_opt_in,
        alert_opt_in: !!data.alert_opt_in,
      });
    } catch (e) {
      log('loadPreferences', e);
    } finally {
      setPrefsLoading(false);
    }
  }, [isAuthenticated]);

  const loadWatchlist = useCallback(async () => {
    if (!isAuthenticated) return;
    setWatchlistLoading(true);
    try {
      const data = await apiClient.getWatchlist();
      setWatchlist(data.items || []);
    } catch (e) {
      log('loadWatchlist', e);
    } finally {
      setWatchlistLoading(false);
    }
  }, [isAuthenticated]);

  // Re-fetch whenever the screen gains focus (e.g. user comes back after
  // toggling a follow on some entity detail screen). Throttled at 5s
  // to avoid hammering /auth/preferences and /auth/watchlist when the
  // user navigates rapidly between screens (which used to fire two
  // un-aborted requests per focus event with no cancellation).
  const lastFocusFetchRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastFocusFetchRef.current < 5000) return;
      lastFocusFetchRef.current = now;
      loadPreferences();
      loadWatchlist();
    }, [loadPreferences, loadWatchlist]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadPreferences(), loadWatchlist()]);
    setRefreshing(false);
  }, [loadPreferences, loadWatchlist]);

  const savePrefs = useCallback(async (next: Partial<Preferences>) => {
    if (!prefs) return;
    const merged = { ...prefs, ...next };
    setPrefs(merged);  // optimistic
    setPrefsSaving(true);
    try {
      await apiClient.setPreferences({
        zip_code: merged.zip_code || undefined,
        digest_opt_in: merged.digest_opt_in,
        alert_opt_in: merged.alert_opt_in,
      });
    } catch (e: any) {
      log('savePrefs', e);
      Alert.alert('Save failed', e?.message || 'Could not save preferences.');
      // Re-fetch to resync with server on failure.
      loadPreferences();
    } finally {
      setPrefsSaving(false);
    }
  }, [prefs, loadPreferences]);

  const removeFromWatchlist = useCallback(async (item: WatchlistItem) => {
    Alert.alert(
      'Stop tracking?',
      `Remove ${item.entity_name || item.entity_id} from your watchlist?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.removeFromWatchlist(item.id);
              setWatchlist((curr) => curr.filter((w) => w.id !== item.id));
            } catch (e: any) {
              log('remove', e);
              Alert.alert('Error', e?.message || 'Could not remove.');
            }
          },
        },
      ],
    );
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert('Sign out?', 'You\u2019ll need to sign in again to track entities.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout() },
    ]);
  }, [logout]);

  if (authLoading) return <LoadingSpinner message="Loading account..." />;

  if (!isAuthenticated) {
    return <SignedOutView />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      <LinearGradient
        colors={['#2563EB', '#1D4ED8', '#1E3A8A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.display_name || user?.email || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.displayName}>{user?.display_name || user?.email}</Text>
        <Text style={styles.userMeta}>{user?.role?.toUpperCase() || 'FREE'} tier</Text>
      </LinearGradient>

      <View style={styles.tabBar}>
        {(['profile', 'notifications', 'follows'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'follows' ? `Follows (${watchlist.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'profile' && (
        <ProfileTab user={user} onLogout={handleLogout} />
      )}
      {tab === 'notifications' && (
        <NotificationsTab prefs={prefs} loading={prefsLoading} saving={prefsSaving} onChange={savePrefs} />
      )}
      {tab === 'follows' && (
        <FollowsTab
          items={watchlist}
          loading={watchlistLoading}
          onRemove={removeFromWatchlist}
          navigate={navigation.navigate}
        />
      )}
    </ScrollView>
  );
}

function SignedOutView() {
  const navigation = useNavigation<any>();
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <LinearGradient
        colors={['#2563EB', '#1D4ED8', '#1E3A8A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.signedOutHero}
      >
        <Ionicons name="person-circle" size={56} color="rgba(255,255,255,0.95)" />
        <Text style={styles.signedOutTitle}>Sign in to track</Text>
        <Text style={styles.signedOutSubtitle}>
          Follow politicians, companies, bills, or whole sectors. Get the weekly digest.
        </Text>
      </LinearGradient>

      <View style={{ padding: 20, gap: 10 }}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('Login')}>
          <Ionicons name="log-in" size={16} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>Sign in</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate('Signup')}>
          <Text style={styles.secondaryBtnText}>Create a free account</Text>
        </TouchableOpacity>
      </View>

      <View style={{ padding: 20 }}>
        <Text style={styles.featureHeader}>What you get</Text>
        <View style={styles.featureList}>
          <Feature icon="bookmark" color="#2563EB" title="Track favorites" desc="Star politicians, companies, and bills" />
          <Feature icon="mail" color="#10B981" title="Weekly digest" desc="Monday email summarizing your watchlist" />
          <Feature icon="warning" color="#F59E0B" title="Anomaly alerts" desc="Notifications when unusual patterns trigger" />
          <Feature icon="trophy" color="#CA8A04" title="Civic badges" desc="Earn recognition for contributions" />
        </View>
      </View>
    </ScrollView>
  );
}

function Feature({ icon, color, title, desc }: { icon: any; color: string; title: string; desc: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={[styles.featureIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

function ProfileTab({ user, onLogout }: { user: any; onLogout: () => void }) {
  return (
    <View style={styles.tabPane}>
      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>Email</Text>
        <Text style={styles.fieldValue}>{user?.email}</Text>
      </View>
      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>Display name</Text>
        <Text style={styles.fieldValue}>{user?.display_name || '\u2014'}</Text>
      </View>
      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>Tier</Text>
        <Text style={styles.fieldValue}>{user?.role || 'free'}</Text>
      </View>

      <Text style={styles.hint}>
        Profile fields other than preferences are only editable on the web.
      </Text>

      <TouchableOpacity style={styles.dangerBtn} onPress={onLogout}>
        <Ionicons name="log-out" size={16} color="#DC2626" />
        <Text style={styles.dangerBtnText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

function NotificationsTab({
  prefs, loading, saving, onChange,
}: {
  prefs: Preferences | null;
  loading: boolean;
  saving: boolean;
  onChange: (next: Partial<Preferences>) => void;
}) {
  if (loading && !prefs) return <ActivityIndicator style={{ padding: 20 }} color={ACCENT} />;
  if (!prefs) return <EmptyState title="Could not load preferences" />;

  return (
    <View style={styles.tabPane}>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchLabel}>Weekly digest</Text>
          <Text style={styles.switchSub}>Monday summary of your tracked entities</Text>
        </View>
        <Switch
          value={!!prefs.digest_opt_in}
          onValueChange={(v) => onChange({ digest_opt_in: v })}
          thumbColor="#FFFFFF"
          trackColor={{ true: ACCENT, false: UI_COLORS.BORDER }}
        />
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchLabel}>Anomaly alerts</Text>
          <Text style={styles.switchSub}>Ping me when something unusual happens</Text>
        </View>
        <Switch
          value={!!prefs.alert_opt_in}
          onValueChange={(v) => onChange({ alert_opt_in: v })}
          thumbColor="#FFFFFF"
          trackColor={{ true: ACCENT, false: UI_COLORS.BORDER }}
        />
      </View>

      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>ZIP code</Text>
        <Text style={styles.fieldValue}>{prefs.zip_code || '\u2014'}</Text>
      </View>
      <Text style={styles.hint}>
        ZIP is editable on the web. On mobile you can toggle notifications here.
      </Text>

      {saving && <ActivityIndicator style={{ marginTop: 10 }} color={ACCENT} />}
    </View>
  );
}

function FollowsTab({
  items, loading, onRemove, navigate,
}: {
  items: WatchlistItem[];
  loading: boolean;
  onRemove: (w: WatchlistItem) => void;
  navigate: (name: string, params?: any) => void;
}) {
  const byType = useMemo(() => {
    const buckets: Record<string, WatchlistItem[]> = {};
    for (const item of items) {
      const t = item.entity_type;
      if (!buckets[t]) buckets[t] = [];
      buckets[t].push(item);
    }
    return buckets;
  }, [items]);

  if (loading && items.length === 0) return <ActivityIndicator style={{ padding: 20 }} color={ACCENT} />;

  if (items.length === 0) {
    return (
      <View style={styles.tabPane}>
        <EmptyState
          title="Not tracking anyone yet"
          message="Open a politician, company, or bill and tap Follow to add them here."
        />
      </View>
    );
  }

  return (
    <View style={styles.tabPane}>
      {Object.entries(byType).map(([type, rows]) => {
        const color = ENTITY_COLORS[type] || '#6B7280';
        const icon = ENTITY_ICONS[type] || 'bookmark';
        return (
          <View key={type} style={styles.followSection}>
            <View style={styles.followSectionHead}>
              <Ionicons name={icon} size={14} color={color} />
              <Text style={[styles.followSectionTitle, { color }]}>
                {type.charAt(0).toUpperCase() + type.slice(1)}s ({rows.length})
              </Text>
            </View>
            {rows.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.followRow}
                onPress={() => navigateToEntity(navigate, item)}
              >
                <View style={[styles.followIcon, { backgroundColor: color + '15' }]}>
                  <Ionicons name={icon} size={16} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.followName} numberOfLines={1}>{item.entity_name || item.entity_id}</Text>
                  {item.sector && <Text style={styles.followSector}>{item.sector}</Text>}
                </View>
                <TouchableOpacity
                  style={styles.unfollowBtn}
                  onPress={() => onRemove(item)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle" size={18} color={UI_COLORS.TEXT_MUTED} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function navigateToEntity(navigate: (name: string, params?: any) => void, item: WatchlistItem) {
  // Best-effort deep link into the appropriate detail screen.
  if (item.entity_type === 'politician' || item.entity_type === 'person') {
    navigate('PersonDetail', { person_id: item.entity_id });
  } else if (item.entity_type === 'bill') {
    navigate('BillDetail', { bill_id: item.entity_id });
  } else if (item.entity_type === 'company' && item.sector) {
    const route = SECTOR_COMPANY_ROUTE[item.sector] || null;
    if (route) navigate(route, { company_id: item.entity_id });
  }
  // sector / institution / others: no deep link — leave on Account screen.
}

const SECTOR_COMPANY_ROUTE: Record<string, string> = {
  energy: 'EnergyCompanyDetail',
  transportation: 'TransportationCompanyDetail',
  defense: 'DefenseCompanyDetail',
  chemicals: 'ChemicalsCompanyDetail',
  agriculture: 'AgricultureCompanyDetail',
  telecom: 'TelecomCompanyDetail',
  education: 'EducationCompanyDetail',
  tech: 'TechCompanyDetail',
  technology: 'TechCompanyDetail',
  health: 'CompanyDetail',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { paddingBottom: 32 },
  hero: { padding: 24, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  displayName: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginBottom: 2 },
  userMeta: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  tabBar: { flexDirection: 'row', backgroundColor: UI_COLORS.CARD_BG, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: ACCENT },
  tabText: { fontSize: 12, fontWeight: '700', color: UI_COLORS.TEXT_MUTED, textTransform: 'capitalize' },
  tabTextActive: { color: ACCENT },
  tabPane: { padding: 16 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: UI_COLORS.TEXT_SECONDARY, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldValue: { fontSize: 14, color: UI_COLORS.TEXT_PRIMARY, fontWeight: '600' },
  hint: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 10, lineHeight: 16 },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: '#DC2626' + '40', backgroundColor: '#DC262608' },
  dangerBtnText: { color: '#DC2626', fontSize: 14, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT },
  switchLabel: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  switchSub: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2 },
  followSection: { marginBottom: 16 },
  followSectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  followSectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  followRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  followIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  followName: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  followSector: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2, textTransform: 'capitalize' },
  unfollowBtn: { padding: 4 },
  // Signed-out layout
  signedOutHero: { alignItems: 'center', padding: 32, paddingTop: 48, gap: 8 },
  signedOutTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  signedOutSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ACCENT, paddingVertical: 14, borderRadius: 10 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondaryBtn: { borderWidth: 1, borderColor: ACCENT + '50', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  secondaryBtnText: { color: ACCENT, fontSize: 14, fontWeight: '700' },
  featureHeader: { fontSize: 12, fontWeight: '700', color: UI_COLORS.TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  featureList: { gap: 10 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  featureIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  featureTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  featureDesc: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2, lineHeight: 15 },
});
