import { ScrollView, StyleSheet, Text, View } from 'react-native';

type FeaturePlaceholderProps = {
  featureNumber: string;
  title: string;
  phase: string;
  doc: string;
  description: string;
};

/**
 * Shared shell for every feature screen that hasn't been built yet.
 * Real screens replace this once their phase (see 00-engineering-phase-roadmap.md) starts.
 */
export function FeaturePlaceholder({ featureNumber, title, phase, doc, description }: FeaturePlaceholderProps) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.badgeRow}>
        <Text style={styles.badge}>Feature {featureNumber}</Text>
        <Text style={styles.badge}>{phase}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Text style={styles.docRef}>Full spec: zentrip-feature-specs/{doc}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    gap: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B5A2A',
    backgroundColor: '#F1EAD6',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 8,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#3A3A3A',
  },
  docRef: {
    marginTop: 12,
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#8A8A8A',
  },
});
