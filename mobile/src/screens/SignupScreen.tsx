import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { useAuth } from '../contexts/AuthContext';

const ACCENT = '#10B981';

function isEmailSyntactic(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export default function SignupScreen() {
  const navigation = useNavigation<any>();
  const { register } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [zip, setZip] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [digestOptIn, setDigestOptIn] = useState(true);
  const [alertOptIn, setAlertOptIn] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const passwordOk = password.length >= 12;
  const emailOk = isEmailSyntactic(email);
  const zipOk = !zip || /^\d{5}$/.test(zip);
  const canSubmit = useMemo(
    () => emailOk && passwordOk && zipOk && acceptTerms && !submitting,
    [emailOk, passwordOk, zipOk, acceptTerms, submitting],
  );

  const handleSubmit = async () => {
    setError('');
    if (!emailOk) { setError('Enter a valid email.'); return; }
    if (!passwordOk) { setError('Password must be at least 12 characters.'); return; }
    if (!zipOk) { setError('ZIP code must be exactly 5 digits (or leave blank).'); return; }
    if (!acceptTerms) { setError('You must agree to the Terms and Privacy Policy.'); return; }
    setSubmitting(true);
    try {
      await register(email, password, {
        displayName: displayName || undefined,
        zipCode: zip || undefined,
        digestOptIn,
        alertOptIn,
      });
      if (navigation.canGoBack()) navigation.goBack();
    } catch (e: any) {
      setError(e?.message || 'Signup failed. Try a different email.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={['#10B981', '#059669', '#047857']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Ionicons name="person-add" size={28} color="#FFFFFF" />
          <Text style={styles.heroTitle}>Create an account</Text>
          <Text style={styles.heroSubtitle}>
            Track politicians, companies, bills, and sectors. Get the weekly
            digest. All free.
          </Text>
        </LinearGradient>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={UI_COLORS.TEXT_MUTED}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="at least 12 characters"
              placeholderTextColor={UI_COLORS.TEXT_MUTED}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowPassword((v) => !v)}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Ionicons
                name={showPassword ? 'eye-off' : 'eye'}
                size={18}
                color={UI_COLORS.TEXT_MUTED}
              />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            {password ? (passwordOk ? '\u2713 Strong enough' : `${password.length}/12 characters`) : 'Use a unique password you don\u2019t use elsewhere.'}
          </Text>

          <Text style={styles.label}>Display name <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="What should we call you?"
            placeholderTextColor={UI_COLORS.TEXT_MUTED}
            autoCapitalize="words"
            value={displayName}
            onChangeText={setDisplayName}
          />

          <Text style={styles.label}>ZIP code <Text style={styles.optional}>(optional)</Text></Text>
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
            We\u2019ll use this to surface your representatives in the weekly digest.
          </Text>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Weekly digest</Text>
              <Text style={styles.switchSub}>Monday summary of your tracked entities</Text>
            </View>
            <Switch value={digestOptIn} onValueChange={setDigestOptIn} thumbColor="#FFFFFF" trackColor={{ true: ACCENT, false: UI_COLORS.BORDER }} />
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Anomaly alerts</Text>
              <Text style={styles.switchSub}>Ping me when something unusual happens</Text>
            </View>
            <Switch value={alertOptIn} onValueChange={setAlertOptIn} thumbColor="#FFFFFF" trackColor={{ true: ACCENT, false: UI_COLORS.BORDER }} />
          </View>

          <TouchableOpacity style={styles.consentRow} onPress={() => setAcceptTerms((v) => !v)}>
            <View style={[styles.checkbox, acceptTerms && { backgroundColor: ACCENT, borderColor: ACCENT }]}>
              {acceptTerms && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
            </View>
            <Text style={styles.consentText}>
              I agree to the Terms of Use and Privacy Policy.
            </Text>
          </TouchableOpacity>

          {!!error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={14} color="#DC2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>Create account</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
            <Text style={styles.backText}>Already have an account? Sign in.</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { paddingBottom: 32 },
  hero: { padding: 24, paddingTop: 32, paddingBottom: 40, gap: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', marginTop: 8 },
  heroSubtitle: { color: 'rgba(255,255,255,0.88)', fontSize: 14, lineHeight: 20 },
  form: { padding: 20, marginTop: -20, backgroundColor: UI_COLORS.CARD_BG, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 6 },
  label: { fontSize: 12, fontWeight: '700', color: UI_COLORS.TEXT_SECONDARY, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10 },
  optional: { fontSize: 10, fontWeight: '500', color: UI_COLORS.TEXT_MUTED, textTransform: 'none', letterSpacing: 0 },
  input: { backgroundColor: UI_COLORS.SECONDARY_BG, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: UI_COLORS.TEXT_PRIMARY, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  passwordWrap: { position: 'relative' },
  passwordInput: { paddingRight: 44 },
  passwordToggle: { position: 'absolute', right: 10, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 6 },
  hint: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 4, marginLeft: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: UI_COLORS.BORDER_LIGHT, marginTop: 10 },
  switchLabel: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  switchSub: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, marginTop: 4 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: UI_COLORS.BORDER, alignItems: 'center', justifyContent: 'center' },
  consentText: { flex: 1, fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 17 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#DC262615', borderRadius: 8, padding: 10, marginTop: 4 },
  errorText: { flex: 1, fontSize: 12, color: '#DC2626', fontWeight: '600' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ACCENT, paddingVertical: 14, borderRadius: 10, marginTop: 10 },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  backLink: { alignItems: 'center', paddingVertical: 14 },
  backText: { fontSize: 12, color: UI_COLORS.TEXT_MUTED },
});
