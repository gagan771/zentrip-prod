import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { searchKnowledge } from '../../lib/knowledge';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';

const STEPS = [
  {
    title: 'Prefer UPI at merchants',
    body: 'UPI is India’s interoperable bank-to-bank payment rail. Scan an official merchant QR — never a handwritten number sent over chat.',
  },
  {
    title: 'Foreign-traveler PPI wallets',
    body: 'Eligible visitors can get a prepaid UPI-linked wallet at select international airports. Treat outstanding-balance caps as sourced guidance, not a live bank quote.',
  },
  {
    title: 'Keep a cash fallback',
    body: 'Heritage sites and small stalls may be cash-only. Carry small notes. Zentrip does not custody money or issue a wallet.',
  },
];

export default function PaymentAssistanceScreen() {
  const insets = useSafeAreaInsets();
  const query = useQuery({
    queryKey: ['payment-knowledge'],
    queryFn: () => searchKnowledge('UPI'),
  });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxxl }]}
    >
      <View style={styles.badge}>
        <Ionicons name="wallet-outline" size={12} color={colors.primary} />
        <Text style={styles.badgeText}>FEATURE 18 · EXPLAINER ONLY</Text>
      </View>
      <Text style={styles.title}>Pay in India without a Zentrip wallet</Text>
      <Text style={styles.subtitle}>
        This module explains sourced payment rails. It never holds funds, never invents FX rates, and never completes a transfer.
      </Text>

      {STEPS.map((step) => (
        <View key={step.title} style={styles.card}>
          <Text style={styles.cardTitle}>{step.title}</Text>
          <Text style={styles.cardBody}>{step.body}</Text>
        </View>
      ))}

      <Text style={styles.section}>Sourced knowledge</Text>
      {query.data?.results.map((item) => (
        <View key={item.claimId} style={styles.card}>
          <Text style={styles.cardTitle}>{item.entityName}</Text>
          <Text style={styles.cardBody}>{item.claim}</Text>
          <Text style={styles.source}>
            {item.citation.sourceName} · {item.citation.confidence} · verified {item.citation.lastVerified}
          </Text>
        </View>
      ))}
      {query.isError ? (
        <Text style={styles.error}>Could not load payment knowledge. Sign in and check the API.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  badgeText: { color: colors.primary, fontSize: typography.fontSize.micro, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.ink, fontSize: typography.fontSize.display, fontWeight: '800' },
  subtitle: { color: colors.inkMuted, fontSize: typography.fontSize.body, lineHeight: 21 },
  section: { color: colors.ink, fontSize: typography.fontSize.headline, fontWeight: '800', marginTop: spacing.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadows.sm,
  },
  cardTitle: { color: colors.ink, fontSize: typography.fontSize.headline, fontWeight: '800' },
  cardBody: { color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 18 },
  source: { color: colors.sage, fontSize: typography.fontSize.micro, fontWeight: '700' },
  error: { color: colors.error, backgroundColor: colors.errorBg, padding: spacing.md, borderRadius: radii.md },
});
