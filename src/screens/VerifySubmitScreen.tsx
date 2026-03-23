import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS, TIER_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';

interface VerifySubmitScreenProps {
  navigation?: any;
}

interface EntityOption {
  id: string;
  name: string;
  type: string;
}

function tierLabel(tier: string | null): string {
  if (tier === 'strong') return 'Strong';
  if (tier === 'moderate') return 'Moderate';
  if (tier === 'weak') return 'Weak';
  return 'Unverified';
}

export default function VerifySubmitScreen({ navigation }: VerifySubmitScreenProps) {
  const [text, setText] = useState('');
  const [entityQuery, setEntityQuery] = useState('');
  const [entityResults, setEntityResults] = useState<EntityOption[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<EntityOption | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  // Entity search with debounce
  useEffect(() => {
    if (entityQuery.length < 2) {
      setEntityResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiClient.globalSearch(entityQuery);
        // Search API returns {politicians: [], companies: []} — merge both
        const options: EntityOption[] = [];
        if (Array.isArray(res.politicians)) {
          for (const p of res.politicians) {
            options.push({
              id: p.person_id || p.id,
              name: p.display_name || p.name || p.title,
              type: 'politician',
            });
          }
        }
        if (Array.isArray(res.companies)) {
          for (const c of res.companies) {
            options.push({
              id: c.entity_id || c.id || c.company_id || c.institution_id,
              name: c.display_name || c.name,
              type: c.sector || c.entity_type || 'tech',
            });
          }
        }
        // Fallback: if backend returns flat results array
        if (!res.politicians && !res.companies && Array.isArray(res.results)) {
          for (const r of res.results) {
            options.push({
              id: r.id || r.person_id || r.entity_id,
              name: r.name || r.display_name || r.title,
              type: r.entity_type || r.type || 'politician',
            });
          }
        }
        setEntityResults(options);
      } catch {
        // silently fail
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [entityQuery]);

  const handleSubmit = async () => {
    if (!selectedEntity || text.length < 20) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiClient.submitVerification(text, selectedEntity.id, selectedEntity.type);
      setResult(res);
    } catch (e: any) {
      setError(e.message || 'Verification failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = selectedEntity && text.length >= 20 && !submitting;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Submit Verification</Text>
        <Text style={styles.subtitle}>
          Paste a speech or press release. We will extract and verify each claim against the legislative record.
        </Text>

        {/* Claim text */}
        <Text style={styles.label}>Claim text</Text>
        <TextInput
          style={styles.textArea}
          multiline
          numberOfLines={6}
          value={text}
          onChangeText={setText}
          placeholder="Paste a speech, press release, or article..."
          placeholderTextColor={UI_COLORS.TEXT_MUTED}
          textAlignVertical="top"
        />
        <Text style={styles.hint}>Minimum 20 characters</Text>

        {/* Entity selector */}
        <Text style={styles.label}>Who made this claim?</Text>
        {selectedEntity ? (
          <View style={styles.selectedEntity}>
            <Text style={styles.selectedName}>{selectedEntity.name}</Text>
            <Text style={styles.selectedType}>{selectedEntity.type}</Text>
            <TouchableOpacity
              onPress={() => { setSelectedEntity(null); setEntityQuery(''); }}
              style={styles.changeBtn}
            >
              <Text style={styles.changeBtnText}>Change</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={UI_COLORS.TEXT_MUTED} />
              <TextInput
                style={styles.searchInput}
                value={entityQuery}
                onChangeText={setEntityQuery}
                placeholder="Search politicians or companies..."
                placeholderTextColor={UI_COLORS.TEXT_MUTED}
              />
              {searching && <ActivityIndicator size="small" color={UI_COLORS.ACCENT} />}
            </View>
            {entityResults.length > 0 && (
              <View style={styles.dropdown}>
                {entityResults.map((ent) => (
                  <TouchableOpacity
                    key={`${ent.type}-${ent.id}`}
                    style={styles.dropdownItem}
                    onPress={() => {
                      setSelectedEntity(ent);
                      setEntityResults([]);
                      setEntityQuery('');
                    }}
                  >
                    <Text style={styles.dropdownName}>{ent.name}</Text>
                    <Text style={styles.dropdownType}>{ent.type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Rate limit notice */}
        <Text style={styles.rateNotice}>5 free verifications per day</Text>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.7}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>Verify Claims</Text>
          )}
        </TouchableOpacity>

        {/* Results */}
        {result && result.verifications && result.verifications.length > 0 && (
          <View style={styles.resultsSection}>
            <Text style={styles.resultsTitle}>
              {result.claims_extracted} claim{result.claims_extracted !== 1 ? 's' : ''} verified
            </Text>
            {result.verifications.map((claim: any, i: number) => {
              const tier = claim.evaluation?.tier || 'none';
              const color = TIER_COLORS[tier] || TIER_COLORS.none;
              return (
                <TouchableOpacity
                  key={claim.id || i}
                  style={styles.resultCard}
                  onPress={() => claim.id && navigation?.navigate('VerifyResult', { id: claim.id })}
                  activeOpacity={0.7}
                >
                  <View style={[styles.tierBadge, { backgroundColor: color + '20' }]}>
                    <View style={[styles.tierDot, { backgroundColor: color }]} />
                    <Text style={[styles.tierText, { color }]}>{tierLabel(tier)}</Text>
                  </View>
                  <Text style={styles.resultClaimText} numberOfLines={3}>{claim.text}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.PRIMARY_BG,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: UI_COLORS.TEXT_PRIMARY,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: UI_COLORS.TEXT_SECONDARY,
    marginBottom: 20,
    lineHeight: 19,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: UI_COLORS.TEXT_PRIMARY,
    marginBottom: 6,
    marginTop: 12,
  },
  textArea: {
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: UI_COLORS.TEXT_PRIMARY,
    backgroundColor: UI_COLORS.SECONDARY_BG,
    minHeight: 120,
  },
  hint: {
    fontSize: 11,
    color: UI_COLORS.TEXT_MUTED,
    marginTop: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: UI_COLORS.SECONDARY_BG,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: UI_COLORS.TEXT_PRIMARY,
  },
  dropdown: {
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    borderRadius: 12,
    marginTop: 4,
    backgroundColor: UI_COLORS.CARD_BG,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.BORDER_LIGHT,
  },
  dropdownName: {
    fontSize: 14,
    fontWeight: '500',
    color: UI_COLORS.TEXT_PRIMARY,
  },
  dropdownType: {
    fontSize: 10,
    fontWeight: '700',
    color: UI_COLORS.ACCENT,
    textTransform: 'uppercase',
  },
  selectedEntity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#10B981' + '40',
    backgroundColor: '#10B981' + '10',
    borderRadius: 12,
    padding: 12,
  },
  selectedName: {
    fontSize: 14,
    fontWeight: '600',
    color: UI_COLORS.TEXT_PRIMARY,
    flex: 1,
  },
  selectedType: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
    textTransform: 'uppercase',
  },
  changeBtn: {
    paddingHorizontal: 8,
  },
  changeBtnText: {
    fontSize: 12,
    color: UI_COLORS.TEXT_MUTED,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EF4444' + '15',
    borderWidth: 1,
    borderColor: '#EF4444' + '30',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
    flex: 1,
  },
  rateNotice: {
    fontSize: 11,
    color: UI_COLORS.TEXT_MUTED,
    marginTop: 16,
    textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  resultsSection: {
    marginTop: 24,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: UI_COLORS.TEXT_PRIMARY,
    marginBottom: 12,
  },
  resultCard: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER_LIGHT,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 8,
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
  resultClaimText: {
    fontSize: 13,
    color: UI_COLORS.TEXT_PRIMARY,
    lineHeight: 19,
  },
});
