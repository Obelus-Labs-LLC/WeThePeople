import React from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';

export default function PrivacyPolicyScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Ionicons name="lock-closed" size={28} color={UI_COLORS.ACCENT} />
        <Text style={styles.title}>Privacy Policy</Text>
      </View>
      <Text style={styles.body}>
        WeThePeople is committed to protecting your privacy. This app collects minimal data and does not track individual users.
      </Text>
      <Text style={styles.body}>
        All data displayed in this application comes from publicly available government sources including Congress.gov, USASpending.gov, Senate LDA, FEC, and other official APIs.
      </Text>
      <Text style={styles.body}>
        We do not sell, share, or distribute any personal information. The app does not require an account or any personal data to use.
      </Text>
      <TouchableOpacity
        style={styles.linkBtn}
        onPress={() => Linking.openURL('https://wethepeopleforus.com/privacy')}
      >
        <Ionicons name="open-outline" size={14} color={UI_COLORS.ACCENT} />
        <Text style={styles.linkText}>View full policy on website</Text>
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
