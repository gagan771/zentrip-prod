import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getRiskPatterns } from '../../lib/risk';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';

const CITIES = ['Delhi', 'Agra', 'Jaipur'];

export default function RiskScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [city, setCity] = useState('Delhi');
  const query = useQuery({ queryKey: ['risk-patterns', city], queryFn: () => getRiskPatterns(city) });

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: spacing.md, paddingBottom: 100 }]}
      >
        <Text style={styles.eyebrow}>GUARDIAN / RISK INTELLIGENCE</Text>
        <Text style={styles.title}>Specific patterns, practical actions.</Text>
        <Text style={styles.subtitle}>
          These are location-based patterns, not labels for an entire city or accusations against a named business.
        </Text>
        <View style={styles.cityRow}>
          {CITIES.map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.cityChip, city === item && styles.cityActive]}
              onPress={() => setCity(item)}
            >
              <Text style={city === item ? styles.cityActiveText : styles.cityText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {query.isLoading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loaderText}>Loading risk patterns…</Text>
          </View>
        ) : null}

        {query.isError ? (
          <View>
            <Text style={styles.error}>Could not load risk patterns.</Text>
            <TouchableOpacity onPress={() => query.refetch()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {query.data?.results.map((risk) => (
          <View key={risk.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.category}>{risk.category.replace('_', ' ')}</Text>
              <Text style={styles.confidence}>
                {risk.confidence} · verified {risk.lastVerified}
              </Text>
            </View>
            <Text style={styles.location}>{risk.locationLabel}</Text>
            <Text style={styles.pattern}>{risk.pattern}</Text>
            <Text style={styles.action}>Recommended: {risk.recommendation}</Text>
            <Text style={styles.source}>Source: {risk.sourceName}</Text>
          </View>
        ))}

        {!query.isFetching && query.data && query.data.results.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.empty}>No published patterns for {city} yet.</Text>
            <Text style={styles.subtitle}>This is not a claim that the city is risk-free. Open Guardian for 112 / 1363.</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <TouchableOpacity
          style={styles.footerCta}
          onPress={() => router.push('/(tabs)/guardian')}
          activeOpacity={0.85}
        >
          <Ionicons name="shield-checkmark" size={18} color={colors.white} />
          <Text style={styles.footerCtaText}>Open Safety Guardian</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: {
    color: colors.ink,
    fontSize: typography.fontSize.display,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.body,
    lineHeight: 19,
  },
  cityRow: { flexDirection: 'row', gap: spacing.sm },
  cityChip: {
    borderColor: colors.border,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  cityActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  cityText: { color: colors.inkMuted, fontSize: typography.fontSize.caption },
  cityActiveText: {
    color: colors.white,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  loader: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  loaderText: { color: colors.inkMuted, fontSize: typography.fontSize.caption },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
    ...shadows.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  category: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  confidence: { color: colors.inkMuted, fontSize: typography.fontSize.micro },
  location: {
    color: colors.ink,
    fontSize: typography.fontSize.headline,
    fontWeight: '800',
  },
  pattern: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.body,
    lineHeight: 19,
  },
  action: {
    color: colors.sage,
    fontSize: typography.fontSize.body,
    lineHeight: 19,
    fontWeight: '700',
  },
  source: { color: colors.inkSubtle, fontSize: typography.fontSize.micro },
  error: { color: colors.error, backgroundColor: colors.errorBg, padding: spacing.md, borderRadius: radii.md },
  empty: { color: colors.inkMuted, paddingVertical: spacing.sm },
  emptyBox: { gap: spacing.xs, paddingVertical: spacing.md },
  retryBtn: { marginTop: spacing.sm },
  retryText: { color: colors.primary, fontWeight: '800' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  footerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.error,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    ...shadows.md,
  },
  footerCtaText: {
    color: colors.white,
    fontSize: typography.fontSize.body,
    fontWeight: '800',
  },
});
