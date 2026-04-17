import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * Optional tag shown to the user so we can tell where the crash happened
   * ("App", "TabNavigator", "BillDetail", etc.). Not used for routing.
   */
  tag?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches any unhandled render/render-phase exception inside its subtree
 * and shows a recoverable fallback screen instead of a blank white one.
 *
 * This exists because React Native has no built-in fallback for render
 * errors: one bad `LinearGradient` color or a missing `route.params`
 * used to kill the whole app silently.
 */
export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // No external crash reporter wired up yet; log to the dev console so at
    // least Expo / Metro picks it up. Real remote reporting would go here.
    // eslint-disable-next-line no-console
    console.error(
      `[ErrorBoundary${this.props.tag ? `:${this.props.tag}` : ''}]`,
      error,
      info?.componentStack
    );
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.wrap}>
        <View style={styles.iconCircle}>
          <Ionicons name="warning" size={32} color="#DC2626" />
        </View>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.subtitle}>
          The app hit an unexpected error. You can try again — your data is safe.
        </Text>

        <ScrollView style={styles.detailWrap} contentContainerStyle={{ padding: 12 }}>
          <Text style={styles.errorName}>{error.name || 'Error'}</Text>
          <Text style={styles.errorMessage}>{error.message}</Text>
        </ScrollView>

        <TouchableOpacity style={styles.retryBtn} onPress={this.reset} activeOpacity={0.85}>
          <Ionicons name="refresh" size={16} color="#FFFFFF" />
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: UI_COLORS.PRIMARY_BG,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DC262615',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: UI_COLORS.TEXT_PRIMARY,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: UI_COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  detailWrap: {
    maxHeight: 160,
    alignSelf: 'stretch',
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    marginBottom: 20,
  },
  errorName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 12,
    color: UI_COLORS.TEXT_SECONDARY,
    lineHeight: 17,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: UI_COLORS.ACCENT,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
