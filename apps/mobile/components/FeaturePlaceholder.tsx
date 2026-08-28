import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, shadows, spacing, typography } from '../lib/theme';

type FeaturePlaceholderProps = {
  featureNumber: string;
  title: string;
  phase: string;
  doc: string;
  description: string;
};

export function FeaturePlaceholder({ featureNumber, title, phase, doc, description }: FeaturePlaceholderProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.screenWrapper}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <View style={styles.badgeRow}>
          <View style={styles.featureBadge}>
            <Ionicons name="sparkles" size={10} color={colors.primary} />
            <Text style={styles.featureBadgeText}>MODULE {featureNumber}</Text>
          </View>
          <View style={styles.phaseBadge}>
            <Text style={styles.phaseBadgeText}>{phase.toUpperCase()}</Text>
          </View>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>

        <View style={styles.specBox}>
          <Ionicons name="document-text-outline" size={14} color={colors.inkMuted} />
          <Text style={styles.docRef}>Architectural Spec: zentrip-feature-specs/{doc}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadows.md,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  featureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  featureBadgeText: {
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1.2,
  },
  phaseBadge: {
    backgroundColor: colors.cardWarm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  phaseBadgeText: {
    fontSize: typography.fontSize.micro,
    fontWeight: '700',
    color: colors.inkMuted,
  },
  title: {
    fontSize: typography.fontSize.hero,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.4,
  },
  description: {
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
    color: colors.inkMuted,
  },
  specBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.cardWarm,
    padding: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.xs,
  },
  docRef: {
    fontSize: typography.fontSize.micro,
    color: colors.inkMuted,
    fontWeight: '600',
  },
});

