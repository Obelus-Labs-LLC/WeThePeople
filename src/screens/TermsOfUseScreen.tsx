import React from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';

export default function TermsOfUseScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Ionicons name="document-text" size={28} color={UI_COLORS.ACCENT} />
        <Text style={styles.title}>Terms of Use</Text>
      </View>
      <Text style={styles.body}>
        WeThePeople is a civic transparency platform providing publicly available government data for informational purposes only.
      </Text>
      <Text style={styles.body}>
        The data presented is sourced from official government APIs and public records. While we strive for accuracy, we cannot guarantee the completeness or timeliness of all information.
      </Text>
      <Text style={styles.body}>
        This platform is not affiliated with any government agency. Use of this application constitutes acceptance of these terms.
      </Text>
      <TouchableOpacity
        style={styles.linkBtn}
        onPress={() => Linking.openURL('https://wethepeopleforus.com/terms')}
      >
        <Ionicons name="open-outline" size={14} color={UI_COLORS.ACCENT} />
        <Text style={styles.linkText}>View full terms on website</Text>
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
