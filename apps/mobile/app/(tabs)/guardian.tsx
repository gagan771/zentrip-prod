import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/**
 * Guardian is deliberately not a FeaturePlaceholder like the other tabs: per
 * 15-zentrip-guardian-safety.md, emergency actions must never be buried behind
 * placeholder/loading UI. Even in the starter, the real 112 / helpline actions work.
 */
export default function GuardianScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Guardian</Text>
      <Text style={styles.subtitle}>Phase 3 (minimal) — see 15-zentrip-guardian-safety.md</Text>

      <TouchableOpacity style={styles.action} onPress={() => Linking.openURL('tel:112')}>
        <Text style={styles.actionText}>Call 112 — Emergency</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.action} onPress={() => Linking.openURL('tel:1363')}>
        <Text style={styles.actionText}>Call 1363 — Tourist Helpline</Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        Trusted-contact calling, location sharing, and the incident-classification flow are Phase-3 work — this
        screen intentionally ships the two real dialer actions first, per the spec's "never buried behind AI chat"
        rule.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    color: '#8A8A8A',
    marginBottom: 12,
  },
  action: {
    backgroundColor: '#8C3C29',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  actionText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  note: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 19,
    color: '#3A3A3A',
  },
});
