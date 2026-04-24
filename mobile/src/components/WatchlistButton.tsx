import React, { useCallback, useEffect, useState } from 'react';
import {
  TouchableOpacity, Text, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { UI_COLORS } from '../constants/colors';

const ACCENT = '#2563EB';

interface Props {
  entityType: 'politician' | 'person' | 'company' | 'institution' | 'bill' | 'sector';
  entityId: string;
  entityName?: string;
  sector?: string;
  // When false, render a compact icon-only button (for header areas).
  showLabel?: boolean;
}

/**
 * Follow/unfollow an entity. Self-contained: fetches current watching
 * state on mount, toggles on press, and prompts the user to sign in if
 * they aren't authenticated.
 */
export default function WatchlistButton({
  entityType, entityId, entityName, sector, showLabel = true,
}: Props) {
  const { isAuthenticated } = useAuth();
  const navigation = useNavigation<any>();
  const [watching, setWatching] = useState<boolean>(false);
  const [itemId, setItemId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [initializing, setInitializing] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated || !entityId) {
      setInitializing(false);
      return;
    }
    apiClient.checkWatchlist(entityType, entityId)
      .then((res) => {
        if (cancelled) return;
        setWatching(res.watching);
        setItemId(res.item_id);
      })
      .catch((e) => { if (!cancelled) console.warn('[WatchlistButton] check', e); })
      .finally(() => { if (!cancelled) setInitializing(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated, entityType, entityId]);

  const onPress = useCallback(async () => {
    if (!isAuthenticated) {
      Alert.alert(
        'Sign in to track',
        'Create a free account to follow politicians, companies, bills, and sectors.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Sign in', onPress: () => navigation.navigate('Login') },
        ],
      );
      return;
    }
    setLoading(true);
    try {
      if (watching && itemId != null) {
        await apiClient.removeFromWatchlist(itemId);
        setWatching(false);
        setItemId(null);
      } else {
        const res = await apiClient.addToWatchlist({
          entity_type: entityType,
          entity_id: entityId,
          entity_name: entityName,
          sector,
        });
        setWatching(true);
        if (res.id != null) setItemId(res.id);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not update watchlist.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, watching, itemId, entityType, entityId, entityName, sector, navigation]);

  const busy = loading || initializing;
  const iconName = watching ? 'bookmark' : 'bookmark-outline';
  const activeColor = watching ? ACCENT : UI_COLORS.TEXT_SECONDARY;

  if (!showLabel) {
    return (
      <TouchableOpacity
        style={styles.iconOnly}
        onPress={onPress}
        disabled={busy}
        accessibilityLabel={watching ? 'Unfollow' : 'Follow'}
      >
        {busy ? (
          <ActivityIndicator size="small" color={activeColor} />
        ) : (
          <Ionicons name={iconName} size={22} color={activeColor} />
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.button, watching && styles.buttonActive]}
      onPress={onPress}
      disabled={busy}
    >
      {busy ? (
        <ActivityIndicator size="small" color={watching ? ACCENT : UI_COLORS.TEXT_SECONDARY} />
      ) : (
        <>
          <Ionicons name={iconName} size={14} color={activeColor} />
          <Text style={[styles.label, watching && styles.labelActive]}>
            {watching ? 'Following' : 'Follow'}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    backgroundColor: UI_COLORS.CARD_BG,
  },
  buttonActive: {
    borderColor: ACCENT + '50',
    backgroundColor: ACCENT + '12',
  },
  label: { fontSize: 12, fontWeight: '700', color: UI_COLORS.TEXT_SECONDARY },
  labelActive: { color: ACCENT },
  iconOnly: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
