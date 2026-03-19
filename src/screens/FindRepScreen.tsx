import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS, PARTY_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { RepresentativeResult } from '../api/types';
import { LoadingSpinner, EmptyState, PartyBadge, ChamberBadge } from '../components/ui';

export default function FindRepScreen() {
  const navigation = useNavigation<any>();
  const [zip, setZip] = useState('');
  const [reps, setReps] = useState<RepresentativeResult[]>([]);
  const [stateName, setStateName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (zip.length < 5) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const res = await apiClient.getRepresentatives(zip);
      setReps(res.representatives || []);
      setStateName(res.state || '');
    } catch (err: any) {
      setError(err.message || 'Failed to find representatives');
      setReps([]);
    } finally {
      setLoading(false);
    }
  };

  const getContributeUrl = (party: string, name: string) => {
    const letter = party?.charAt(0).toUpperCase();
    const searchName = encodeURIComponent(name);
    if (letter === 'D') return `https://secure.actblue.com/search?q=${searchName}`;
    if (letter === 'R') return `https://secure.winred.com/search?q=${searchName}`;
    return null;
  };

  const renderRep = ({ item }: { item: RepresentativeResult }) => {
    const partyColor = PARTY_COLORS[item.party?.charAt(0).toUpperCase()] || '#6B7280';
    const contributeUrl = getContributeUrl(item.party, item.display_name);

    return (
      <TouchableOpacity
        style={styles.repCard}
        onPress={() => navigation.navigate('PersonDetail', { person_id: item.person_id })}
      >
        {/* Senator badge */}
        {item.is_senator && (
          <View style={styles.senatorBadge}>
            <Ionicons name="star" size={12} color={UI_COLORS.GOLD} />
            <Text style={styles.senatorText}>Your Senator</Text>
          </View>
        )}

        <View style={styles.repRow}>
          {item.photo_url ? (
            <Image source={{ uri: item.photo_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{item.display_name.charAt(0)}</Text>
            </View>
          )}

          <View style={styles.repInfo}>
            <Text style={styles.repName}>{item.display_name}</Text>
            <Text style={styles.repState}>
              {item.state}{item.district ? ` - District ${item.district}` : ''}
            </Text>
            <View style={styles.badgeRow}>
              <PartyBadge party={item.party} />
              <ChamberBadge chamber={item.chamber} />
            </View>
          </View>

          <Ionicons name="chevron-forward" size={18} color={UI_COLORS.TEXT_MUTED} />
        </View>

        {/* Contribute button */}
        {contributeUrl && (
          <TouchableOpacity
            style={[styles.contributeBtn, { backgroundColor: partyColor + '15', borderColor: partyColor + '30' }]}
            onPress={() => Linking.openURL(contributeUrl)}
          >
            <Ionicons name="heart-outline" size={14} color={partyColor} />
            <Text style={[styles.contributeText, { color: partyColor }]}>Contribute to Campaign</Text>
            <Ionicons name="open-outline" size={12} color={partyColor} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Hero section */}
      <View style={styles.heroCard}>
        <Ionicons name="location-outline" size={32} color={UI_COLORS.ACCENT} />
        <Text style={styles.heroTitle}>Find Your Representatives</Text>
        <Text style={styles.heroSubtitle}>
          Enter your ZIP code to find your congressional representatives
        </Text>

        <View style={styles.inputRow}>
          <View style={styles.zipInputWrap}>
            <Ionicons name="map-outline" size={16} color={UI_COLORS.TEXT_MUTED} />
            <TextInput
              style={styles.zipInput}
              value={zip}
              onChangeText={(text) => setZip(text.replace(/[^0-9]/g, '').slice(0, 5))}
              placeholder="Enter ZIP code"
              placeholderTextColor={UI_COLORS.TEXT_MUTED}
              keyboardType="number-pad"
              maxLength={5}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
          </View>
          <TouchableOpacity
            style={[styles.searchBtn, zip.length < 5 && styles.searchBtnDisabled]}
            onPress={handleSearch}
            disabled={zip.length < 5}
          >
            <Ionicons name="search" size={18} color="#fff" />
            <Text style={styles.searchBtnText}>Find</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Results */}
      {loading ? (
        <LoadingSpinner message="Finding your representatives..." />
      ) : error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={32} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : hasSearched && reps.length === 0 ? (
        <EmptyState
          title="No representatives found"
          message="Please check your ZIP code and try again."
        />
      ) : reps.length > 0 ? (
        <>
          {stateName ? (
            <View style={styles.stateHeader}>
              <Text style={styles.stateHeaderText}>Representatives for {stateName}</Text>
            </View>
          ) : null}
          <FlatList
            data={reps}
            keyExtractor={(item) => item.person_id}
            renderItem={renderRep}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            showsVerticalScrollIndicator={false}
          />
        </>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.SECONDARY_BG,
  },
  heroCard: {
    backgroundColor: UI_COLORS.CARD_BG,
    margin: 16,
    marginBottom: 0,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: UI_COLORS.TEXT_PRIMARY,
    marginTop: 10,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    color: UI_COLORS.TEXT_MUTED,
    textAlign: 'center',
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  zipInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI_COLORS.SECONDARY_BG,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
  },
  zipInput: {
    flex: 1,
    fontSize: 16,
    color: UI_COLORS.TEXT_PRIMARY,
    paddingVertical: 12,
  },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: UI_COLORS.ACCENT,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  searchBtnDisabled: {
    opacity: 0.5,
  },
  searchBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  stateHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stateHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.TEXT_PRIMARY,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  repCard: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  senatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: UI_COLORS.GOLD_LIGHT,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 10,
  },
  senatorText: {
    fontSize: 11,
    fontWeight: '700',
    color: UI_COLORS.GOLD,
  },
  repRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: UI_COLORS.ACCENT_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: UI_COLORS.ACCENT,
    fontSize: 18,
    fontWeight: '700',
  },
  repInfo: {
    flex: 1,
    gap: 2,
  },
  repName: {
    fontSize: 16,
    fontWeight: '700',
    color: UI_COLORS.TEXT_PRIMARY,
  },
  repState: {
    fontSize: 12,
    color: UI_COLORS.TEXT_MUTED,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  contributeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  contributeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  errorBox: {
    padding: 32,
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center',
  },
});
