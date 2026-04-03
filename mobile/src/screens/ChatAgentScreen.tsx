import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';

const API_BASE = 'https://api.wethepeopleforus.com';
const ACCENT = '#7C3AED';

interface ChatAction {
  label: string;
  url: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  actions?: ChatAction[];
}

const SUGGESTED_QUESTIONS = [
  "Who's the biggest lobbying spender?",
  'Show me congressional trades in tech stocks',
  'Which politicians trade the most?',
  'What anomalies were detected this week?',
];

function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      );
    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 200);
    const a3 = animate(dot3, 400);
    a1.start();
    a2.start();
    a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  const dotStyle = (anim: Animated.Value) => ({
    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
  });

  return (
    <View style={styles.typingWrap}>
      <View style={styles.assistantBubble}>
        <View style={styles.typingDots}>
          <Animated.View style={[styles.dot, dotStyle(dot1)]} />
          <Animated.View style={[styles.dot, dotStyle(dot2)]} />
          <Animated.View style={[styles.dot, dotStyle(dot3)]} />
        </View>
      </View>
    </View>
  );
}

export default function ChatAgentScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const cleaned = text.trim();
    if (!cleaned || loading) return;

    setInput('');
    setError('');
    const userMsg: ChatMessage = { role: 'user', text: cleaned };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    scrollToBottom();

    try {
      const res = await fetch(`${API_BASE}/chat/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: cleaned }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        text: data.answer || 'No response.',
        actions: data.actions,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      if (data.remaining != null) setRemaining(data.remaining);
    } catch (e: any) {
      setError(e.message || 'Failed to send message');
      const errMsg: ChatMessage = {
        role: 'assistant',
        text: 'Sorry, something went wrong. Please try again.',
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }, [loading, scrollToBottom]);

  const hasMessages = messages.length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.messageArea}
        contentContainerStyle={styles.messageContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero - hidden after first message */}
        {!hasMessages && (
          <LinearGradient
            colors={['#7C3AED', '#6D28D9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroOrb} />
            <View style={styles.heroInner}>
              <View style={styles.heroIconRow}>
                <Ionicons name="chatbubble" size={24} color="#FFFFFF" />
                <Text style={styles.heroTitle}>AI Research Agent</Text>
              </View>
              <Text style={styles.heroSubtitle}>
                Ask questions about lobbying, congressional trades, political spending, and more.
              </Text>
            </View>
          </LinearGradient>
        )}

        {/* Suggested Questions */}
        {!hasMessages && (
          <View style={styles.suggestedSection}>
            <Text style={styles.suggestedLabel}>Try asking</Text>
            {SUGGESTED_QUESTIONS.map((q, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.suggestedCard}
                activeOpacity={0.7}
                onPress={() => sendMessage(q)}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={ACCENT} />
                <Text style={styles.suggestedText}>{q}</Text>
                <Ionicons name="arrow-forward" size={14} color={UI_COLORS.TEXT_MUTED} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Messages */}
        {messages.map((msg, idx) => (
          <View
            key={idx}
            style={[
              styles.messageRow,
              msg.role === 'user' ? styles.messageRowUser : styles.messageRowAssistant,
            ]}
          >
            <View
              style={[
                styles.bubble,
                msg.role === 'user' ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  msg.role === 'user' ? styles.userBubbleText : styles.assistantBubbleText,
                ]}
              >
                {msg.text}
              </Text>
            </View>
            {/* Action buttons */}
            {msg.actions && msg.actions.length > 0 && (
              <View style={styles.actionsRow}>
                {msg.actions.map((action, aIdx) => (
                  <TouchableOpacity key={aIdx} style={styles.actionChip} activeOpacity={0.7}>
                    <Ionicons name="open-outline" size={12} color={ACCENT} />
                    <Text style={styles.actionChipText}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ))}

        {/* Typing indicator */}
        {loading && <TypingIndicator />}

        {/* Error */}
        {error && !loading ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      {/* Bottom area */}
      <View style={styles.bottomBar}>
        {remaining != null && (
          <Text style={styles.remainingText}>
            {remaining} question{remaining !== 1 ? 's' : ''} remaining today
          </Text>
        )}
        <View style={styles.inputRow}>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Ask a question..."
              placeholderTextColor={UI_COLORS.TEXT_MUTED}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={() => sendMessage(input)}
              blurOnSubmit
            />
          </View>
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || loading}
          >
            <Ionicons name="send" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  messageArea: { flex: 1 },
  messageContent: { paddingBottom: 12 },
  // Hero
  hero: {
    borderRadius: 16, padding: 20, marginHorizontal: 16, marginTop: 12,
    overflow: 'hidden', position: 'relative',
  },
  heroOrb: {
    position: 'absolute', top: -60, right: -40, width: 180, height: 180,
    borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroInner: { position: 'relative' },
  heroIconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19 },
  // Suggested
  suggestedSection: { paddingHorizontal: 16, marginTop: 20 },
  suggestedLabel: {
    fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_MUTED,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  suggestedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  suggestedText: { flex: 1, fontSize: 14, fontWeight: '500', color: UI_COLORS.TEXT_PRIMARY },
  // Messages
  messageRow: { paddingHorizontal: 16, marginTop: 10 },
  messageRowUser: { alignItems: 'flex-end' },
  messageRowAssistant: { alignItems: 'flex-start' },
  bubble: { maxWidth: '85%' as any, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: { backgroundColor: '#2563EB', borderBottomRightRadius: 4 },
  assistantBubble: { backgroundColor: '#374151', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  userBubbleText: { color: '#FFFFFF' },
  assistantBubbleText: { color: '#F3F4F6' },
  // Actions
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F3E8FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#DDD6FE',
  },
  actionChipText: { fontSize: 12, fontWeight: '600', color: ACCENT },
  // Typing indicator
  typingWrap: { paddingHorizontal: 16, marginTop: 10, alignItems: 'flex-start' },
  typingDots: { flexDirection: 'row', gap: 5, paddingVertical: 4, paddingHorizontal: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#9CA3AF' },
  // Error
  errorText: { color: '#DC2626', fontSize: 12, fontWeight: '600', marginTop: 8, paddingHorizontal: 16 },
  // Bottom bar
  bottomBar: {
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: UI_COLORS.PRIMARY_BG,
    borderTopWidth: 1, borderTopColor: UI_COLORS.BORDER,
  },
  remainingText: {
    fontSize: 11, color: UI_COLORS.TEXT_MUTED, textAlign: 'center', marginBottom: 8, fontWeight: '600',
  },
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  inputWrap: {
    flex: 1, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    maxHeight: 100,
  },
  input: {
    fontSize: 15, color: UI_COLORS.TEXT_PRIMARY, fontWeight: '500',
    maxHeight: 80,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: ACCENT,
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
});
