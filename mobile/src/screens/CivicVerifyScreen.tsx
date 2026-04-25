import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const ACCENT = '#10B981';

export default function CivicVerifyScreen() {
  const navigation = useNavigation<any>();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<any>(null);
  const [zip, setZip] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStatus = async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    try {
      const s = await apiClient.getVerificationStatus();
      setStatus(s);
    } catch (e) {
      console.warn('[CivicVerifyScreen] status', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, [isAuthenticated]);

  const submit = async () => {
    setError('');
    if (!/^\d{5}$/.test(zip)) {
      setError('Enter a 5-digit ZIP code.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.verifyResidence(zip);
      Alert.alert('Verified', res.message || `You are now verified as a ${res.state} resident.`);
      await loadStatus();
    } catch (e: any) {
      setError(e?.message || 'Verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loading) return <ActivityIndicator style={{ padding: 40 }} color={ACCENT} />;

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.authGate}>
          <Ionicons name="lock-closed" size={36} color={UI_COLORS.TEXT_MUTED} />
          <Text style={styles.gateTitle}>Sign in to verify</Text>
          <Text style={styles.gateDesc}>
            Residence verification requires a free account so we can store your verification level.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.primaryBtnText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={[ACCENT, '#059669', '#047857']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Ionicons name="shield-checkmark" size={28} color="#FFFFFF" />
          <Text style={styles.heroTitle}>Verify your residence</Text>
          <Text style={styles.heroSubtitle}>
            Residence verification unlocks trusted-citizen features like higher-weighted votes on civic proposals.
          </Text>
        </LinearGradient>

        <View style={styles.card}>
          <Text style={styles.label}>Current verification</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: (status?.level || 0) > 0 ? ACCENT : UI_COLORS.TEXT_MUTED }]} />
            <Text style={styles.statusText}>
              Level {status?.level || 0}{status?.level_label ? ` \u00B7 ${status.level_label}` : ''}
            </Text>
          </View>
          {status?.verified_state && (
            <Text style={styles.statusMeta}>
              Verified as resident of {status.verified_state}{status.verified_zip ? ` (${status.verified_zip})` : ''}
            </Text>
          )}

          <Text style={[styles.label, { marginTop: 24 }]}>Verify by ZIP</Text>
          <TextInput
            style={styles.input}
            placeholder="5 digits"
            placeholderTextColor={UI_COLORS.TEXT_MUTED}
            keyboardType="number-pad"
            maxLength={5}
            value={zip}
            onChangeText={setZip}
          />
          <Text style={styles.hint}>
            Level 1 verification uses your ZIP to bind an account to a state. Higher levels (government ID, address) are only available on the web.
          </Text>

          {!!error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={14} color="#DC2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, (!zip || submitting) && { opacity: 0.5 }]}
            onPress={submit}
            disabled={!zip || submitting}
          >
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>Verify</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  hero: { padding: 24, paddingTop: 32, gap: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 8 },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: UI_COLORS.CARD_BG, margin: 16, padding: 18, borderRadius: 12, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  label: { fontSize: 12, fontWeight: '700', color: UI_COLORS.TEXT_SECONDARY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  statusMeta: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, marginTop: 6 },
  input: { backgroundColor: UI_COLORS.SECONDARY_BG, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: UI_COLORS.TEXT_PRIMARY, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  hint: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 8, lineHeight: 16 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#DC262615', borderRadius: 8, padding: 10, marginTop: 12 },
  errorText: { flex: 1, fontSize: 12, color: '#DC2626', fontWeight: '600' },
  primaryBtn: { backgroundColor: ACCENT, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 14 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  authGate: { padding: 32, alignItems: 'center', gap: 12 },
  gateTitle: { fontSize: 18, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY },
  gateDesc: { fontSize: 13, color: UI_COLORS.TEXT_SECONDARY, textAlign: 'center', lineHeight: 19 },
});
