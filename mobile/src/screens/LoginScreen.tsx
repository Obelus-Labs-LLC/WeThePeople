import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { useAuth } from '../contexts/AuthContext';

const ACCENT = '#2563EB';

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const disabled = submitting || !email || !password;

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await login(email, password);
      // On success, pop back to wherever we came from (Account / gated screen).
      if (navigation.canGoBack()) navigation.goBack();
    } catch (e: any) {
      setError(e?.message || 'Login failed. Check your email and password.');
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
          colors={['#2563EB', '#1D4ED8', '#1E3A8A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Ionicons name="log-in" size={28} color="#FFFFFF" />
          <Text style={styles.heroTitle}>Welcome back</Text>
          <Text style={styles.heroSubtitle}>
            Sign in to track politicians, companies, and bills across sectors.
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
              placeholder="your password"
              placeholderTextColor={UI_COLORS.TEXT_MUTED}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
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

          {!!error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={14} color="#DC2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, disabled && styles.primaryBtnDisabled]}
            onPress={handleSubmit}
            disabled={disabled}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>Sign In</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>NEW HERE?</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('Signup')}
          >
            <Text style={styles.secondaryBtnText}>Create a free account</Text>
          </TouchableOpacity>

          <Text style={styles.hint}>
            Password resets are currently only available via the website.
          </Text>
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
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20 },
  form: { padding: 20, marginTop: -20, backgroundColor: UI_COLORS.CARD_BG, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 10 },
  label: { fontSize: 12, fontWeight: '700', color: UI_COLORS.TEXT_SECONDARY, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  input: { backgroundColor: UI_COLORS.SECONDARY_BG, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: UI_COLORS.TEXT_PRIMARY, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  passwordWrap: { position: 'relative' },
  passwordInput: { paddingRight: 44 },
  passwordToggle: { position: 'absolute', right: 10, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 6 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#DC262615', borderRadius: 8, padding: 10, marginTop: 8 },
  errorText: { flex: 1, fontSize: 12, color: '#DC2626', fontWeight: '600' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ACCENT, paddingVertical: 14, borderRadius: 10, marginTop: 14 },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: UI_COLORS.BORDER_LIGHT },
  dividerText: { fontSize: 10, fontWeight: '700', color: UI_COLORS.TEXT_MUTED, letterSpacing: 0.8 },
  secondaryBtn: { borderWidth: 1, borderColor: ACCENT + '50', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  secondaryBtnText: { color: ACCENT, fontSize: 14, fontWeight: '700' },
  hint: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, textAlign: 'center', marginTop: 14, lineHeight: 16 },
});
