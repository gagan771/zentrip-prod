import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

const LATER_PHASE_FEATURES = [
  { href: '/(tabs)/compare', label: 'Compare / Decision Engine', doc: '03' },
  { href: '/(tabs)/guide', label: 'Guide & Translator', doc: '06 / 07' },
  { href: '/(tabs)/guardian', label: 'Guardian / Emergency', doc: '15' },
  { href: '/services/grocery', label: 'Services (incl. grocery)', doc: '05' },
  { href: '/community', label: 'Destination Community', doc: '08' },
  { href: '/buddy', label: 'Travel Buddy', doc: '10' },
  { href: '/trails', label: 'Trails', doc: '11' },
] as const;

export default function MoreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>More</Text>
      <Text style={styles.subtitle}>V2/V3 features — not tabs yet, see 00-engineering-phase-roadmap.md</Text>
      {LATER_PHASE_FEATURES.map((item) => (
        <Link key={item.href} href={item.href} asChild>
          <Text style={styles.link}>
            {item.label} <Text style={styles.doc}>({item.doc})</Text>
          </Text>
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    color: '#8A8A8A',
  },
  link: {
    fontSize: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  doc: {
    fontSize: 12,
    color: '#8A8A8A',
  },
});
