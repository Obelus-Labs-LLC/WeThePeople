import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';

// ── FAQ map (Tier 1 — free, no API call) ──

const FAQ: Record<string, string> = {
  'what data sources': 'We track data from 26 sources including Congress.gov, Senate LDA (lobbying), USASpending.gov (contracts), FEC (donations), SEC EDGAR (filings), OpenFDA, ClinicalTrials.gov, USPTO (patents), and more.',
  'how often updated': 'Most data syncs daily via our automated scheduler. Congressional trades update within 24-48 hours of disclosure. Lobbying data updates quarterly.',
  'what sectors': 'We track 6 sectors: Politics, Finance, Health, Technology, Energy, and Transportation.',
  'how does verification work': 'Our claim verification pipeline extracts claims from text, matches them against 9 data sources, and scores them as Strong, Moderate, Weak, or Unverified.',
  'how many politicians': 'We track 547 members of Congress with their voting records, stock trades, committee memberships, and campaign donations.',
  'how many companies': 'We track over 500 companies across Finance (144), Health (134), Technology (139), Energy (89), and Transportation (73).',
  'what is this': 'WeThePeople is a civic transparency platform that tracks how corporations lobby Congress, win government contracts, face enforcement actions, and donate to politicians.',
  'is this free': 'Yes, WeThePeople is completely free to use. The platform is open-source and funded through GitHub Sponsors.',
  'what are congressional trades': 'Congressional trades are stock transactions made by members of Congress. Under the STOCK Act, lawmakers must disclose trades within 45 days. We track over 4,600 trades.',
  'what is lobbying': 'Lobbying is when companies spend money to influence legislation. We track lobbying disclosures from the Senate LDA database.',
};

// ── Navigation intent matching ──

interface NavMatch {
  screen: string;
  tab?: string;
  params?: Record<string, any>;
  label: string;
}

const NAV_PATTERNS: Array<{ pattern: RegExp; match: NavMatch }> = [
  { pattern: /\b(trades?|stock trades?|congressional trades?)\b/i, match: { screen: 'CongressionalTrades', tab: 'PoliticsTab', label: 'Congressional Trades' } },
  { pattern: /\b(committees?)\b/i, match: { screen: 'Committees', tab: 'PoliticsTab', label: 'Committees' } },
  { pattern: /\b(legislation|bills?)\b/i, match: { screen: 'LegislationTracker', tab: 'PoliticsTab', label: 'Legislation Tracker' } },
  { pattern: /\b(find.*(rep|representative))\b/i, match: { screen: 'FindRep', tab: 'PoliticsTab', label: 'Find Your Rep' } },
  { pattern: /\b(state explorer|states)\b/i, match: { screen: 'StateExplorer', tab: 'PoliticsTab', label: 'State Explorer' } },
  { pattern: /\b(influence network|network)\b/i, match: { screen: 'InfluenceNetwork', tab: 'HomeTab', label: 'Influence Network' } },
  { pattern: /\b(spending map|map)\b/i, match: { screen: 'SpendingMap', tab: 'HomeTab', label: 'Spending Map' } },
  { pattern: /\b(money flow|sankey)\b/i, match: { screen: 'MoneyFlow', tab: 'HomeTab', label: 'Money Flow' } },
  { pattern: /\b(insider trad(es?|ing))\b/i, match: { screen: 'InsiderTrades', tab: 'FinanceTab', label: 'Insider Trades' } },
  { pattern: /\b(drug lookup|drugs?)\b/i, match: { screen: 'DrugLookup', tab: 'HealthTab', label: 'Drug Lookup' } },
  { pattern: /\b(patent)\b/i, match: { screen: 'PatentSearch', tab: 'TechnologyTab', label: 'Patent Search' } },
  { pattern: /\b(methodology)\b/i, match: { screen: 'Methodology', tab: 'HomeTab', label: 'Methodology' } },
  { pattern: /\b(about)\b/i, match: { screen: 'About', tab: 'HomeTab', label: 'About' } },
];

interface IntentResult {
  answer: string;
  navMatch?: NavMatch;
}

function matchIntent(input: string): IntentResult | null {
  const lower = input.toLowerCase().trim();

  // FAQ matching
  for (const [key, answer] of Object.entries(FAQ)) {
    if (lower.includes(key)) return { answer };
  }

  // Navigation matching
  const hasNavIntent = /\b(show|go to|open|take me|navigate|where is|find)\b/i.test(lower);
  if (hasNavIntent) {
    for (const { pattern, match } of NAV_PATTERNS) {
      if (pattern.test(lower)) {
        return { answer: `Opening ${match.label}.`, navMatch: match };
      }
    }
  }

  return null;
}

// ── Types ──

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  loading?: boolean;
  navMatch?: NavMatch;
}

const SUGGESTED = [
  'Who trades the most stock?',
  'What data sources do you use?',
  'Show me the influence network',
  'How does verification work?',
];

interface ChatAgentScreenProps {
  navigation?: any;
}

export default function ChatAgentScreen({ navigation }: ChatAgentScreenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    apiClient.chatRemaining().then((data) => setRemaining(data.remaining)).catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const addMessage = useCallback((msg: Omit<Message, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setMessages((prev) => [...prev, { ...msg, id }]);
    return id;
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<Message>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  }, []);

  const navigateTo = useCallback((navMatch: NavMatch) => {
    if (navigation) {
      if (navMatch.tab) {
        navigation.navigate(navMatch.tab, {
          screen: navMatch.screen,
          params: navMatch.params,
        });
      } else {
        navigation.navigate(navMatch.screen, navMatch.params);
      }
    }
  }, [navigation]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;
    const question = text.trim();
    setInput('');
    setSending(true);

    addMessage({ role: 'user', text: question });

    // Tier 1: Client-side intent matching
    const intent = matchIntent(question);
    if (intent) {
      addMessage({ role: 'assistant', text: intent.answer, navMatch: intent.navMatch });
      if (intent.navMatch) {
        setTimeout(() => navigateTo(intent.navMatch!), 800);
      }
      setSending(false);
      return;
    }

    // Tier 2+3: Backend
    const loadingId = addMessage({ role: 'assistant', text: '', loading: true });

    try {
      const response = await apiClient.chatAsk(question);
      // Handle navigate actions from Haiku response
      let responseNavMatch: NavMatch | undefined;
      if (response.action) {
        if (response.action.type === 'navigate' && response.action.path) {
          // Map web paths to mobile screen names
          const pathMap: Record<string, NavMatch> = {
            '/politics/trades': { screen: 'CongressionalTrades', tab: 'PoliticsTab', label: 'Congressional Trades' },
            '/politics/people': { screen: 'People', tab: 'PoliticsTab', label: 'Politicians' },
            '/politics/legislation': { screen: 'LegislationTracker', tab: 'PoliticsTab', label: 'Legislation' },
            '/politics/committees': { screen: 'Committees', tab: 'PoliticsTab', label: 'Committees' },
            '/politics/find-rep': { screen: 'FindRep', tab: 'PoliticsTab', label: 'Find Your Rep' },
            '/politics/states': { screen: 'StateExplorer', tab: 'PoliticsTab', label: 'State Explorer' },
            '/influence/network': { screen: 'InfluenceNetwork', tab: 'HomeTab', label: 'Influence Network' },
            '/influence/map': { screen: 'SpendingMap', tab: 'HomeTab', label: 'Spending Map' },
            '/influence/money-flow': { screen: 'MoneyFlow', tab: 'HomeTab', label: 'Money Flow' },
            '/finance/insider-trades': { screen: 'InsiderTrades', tab: 'FinanceTab', label: 'Insider Trades' },
            '/health/drugs': { screen: 'DrugLookup', tab: 'HealthTab', label: 'Drug Lookup' },
            '/technology/patents': { screen: 'PatentSearch', tab: 'TechnologyTab', label: 'Patent Search' },
            '/verify': { screen: 'VerifyDashboard', tab: 'HomeTab', label: 'Verification' },
            '/methodology': { screen: 'Methodology', tab: 'HomeTab', label: 'Methodology' },
          };
          responseNavMatch = pathMap[response.action.path];
        }
      }
      updateMessage(loadingId, { text: response.answer, loading: false, navMatch: responseNavMatch });
      if (responseNavMatch) {
        setTimeout(() => navigateTo(responseNavMatch!), 800);
      }
      if (!response.cached && remaining !== null) {
        setRemaining((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
      }
    } catch (err: any) {
      updateMessage(loadingId, {
        text: err.message || 'Sorry, I could not process that question.',
        loading: false,
      });
    } finally {
      setSending(false);
    }
  }, [sending, addMessage, updateMessage, remaining, navigateTo]);

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[styles.messageBubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
      {item.loading ? (
        <ActivityIndicator size="small" color={UI_COLORS.TEXT_MUTED} />
      ) : (
        <>
          <Text style={[styles.messageText, item.role === 'user' && styles.userText]}>
            {item.text}
          </Text>
          {item.navMatch && (
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => navigateTo(item.navMatch!)}
            >
              <Ionicons name="arrow-forward" size={14} color={UI_COLORS.ACCENT} />
              <Text style={styles.navButtonText}>Go to {item.navMatch.label}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.statusDot} />
          <Text style={styles.headerTitle}>Ask about the data</Text>
        </View>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.closeButton}>
          <Ionicons name="close" size={22} color={UI_COLORS.TEXT_MUTED} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      {messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            Ask me anything about lobbying, trades, contracts, or political data.
          </Text>
          <View style={styles.suggestedContainer}>
            {SUGGESTED.map((q) => (
              <TouchableOpacity key={q} style={styles.suggestedChip} onPress={() => sendMessage(q)}>
                <Text style={styles.suggestedText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      {/* Input area */}
      <View style={styles.inputContainer}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask a question..."
          placeholderTextColor={UI_COLORS.TEXT_MUTED}
          onSubmitEditing={() => sendMessage(input)}
          returnKeyType="send"
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || sending}
        >
          <Ionicons name="arrow-up" size={18} color={!input.trim() || sending ? UI_COLORS.TEXT_MUTED : '#FFFFFF'} />
        </TouchableOpacity>
      </View>
      {remaining !== null && (
        <Text style={styles.remainingText}>
          {remaining} AI question{remaining !== 1 ? 's' : ''} remaining today
        </Text>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.PRIMARY_BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.BORDER,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: UI_COLORS.ACCENT,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: UI_COLORS.TEXT_PRIMARY,
  },
  closeButton: {
    padding: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 14,
    color: UI_COLORS.TEXT_MUTED,
    textAlign: 'center',
    marginBottom: 20,
  },
  suggestedContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  suggestedChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: UI_COLORS.CARD_BG_ELEVATED,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
  },
  suggestedText: {
    fontSize: 12,
    color: UI_COLORS.TEXT_SECONDARY,
  },
  messagesList: {
    padding: 16,
    gap: 10,
  },
  messageBubble: {
    maxWidth: '85%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: UI_COLORS.ACCENT,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: UI_COLORS.CARD_BG_ELEVATED,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    color: UI_COLORS.TEXT_PRIMARY,
  },
  userText: {
    color: '#FFFFFF',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  navButtonText: {
    fontSize: 12,
    color: UI_COLORS.ACCENT,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.BORDER,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: UI_COLORS.CARD_BG_ELEVATED,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: UI_COLORS.TEXT_PRIMARY,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: UI_COLORS.ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: UI_COLORS.CARD_BG_ELEVATED,
  },
  remainingText: {
    textAlign: 'center',
    fontSize: 11,
    color: UI_COLORS.TEXT_MUTED,
    paddingBottom: 8,
  },
});
