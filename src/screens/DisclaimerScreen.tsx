import React from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';

export default function DisclaimerScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Ionicons name="warning" size={28} color={UI_COLORS.GOLD} />
        <Text style={styles.title}>Disclaimer</Text>
      </View>
      <Text style={styles.body}>
        WeThePeople provides government and corporate data for informational and educational purposes only. This is not legal, financial, or investment advice.
      </Text>
      <Text style={styles.body}>
        Congressional trade data, lobbying records, government contracts, and enforcement actions are sourced from public records and may have delays. Trading decisions should not be based solely on the data presented here.
      </Text>
      <Text style={styles.body}>
        Influence network connections shown in this app represent publicly documented relationships (lobbying filings, campaign donations, contract awards) and do not imply any wrongdoing or corruption.
      </Text>
      <Text style={styles.body}>
        AI-generated summaries are provided for convenience and may contain inaccuracies. Always verify important information with primary sources.
      </Text>
      <TouchableOpacity
        style={styles.linkBtn}
        onPress={() => Linking.openURL('https://wethepeopleforus.com/disclaimer')}
      >
        <Ionicons name="open-outline" size={14} color={UI_COLORS.ACCENT} />
        <Text style={styles.linkText}>View full disclaimer on website</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  content: { padding: 24, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY },
  body: { fontSize: 14, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 22, marginBottom: 16 },
  linkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER, marginTop: 8,
  },
  linkText: { fontSize: 14, fontWeight: '600', color: UI_COLORS.ACCENT },
});
