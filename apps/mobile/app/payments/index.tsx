import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  formatKnowledgeSyncedAt,
  readCachedKnowledgeSearch,
  searchKnowledge,
} from '../../lib/knowledge';
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

const QR_SCAN_STEPS = [
  'Open your bank or UPI app (not Zentrip — we never hold funds).',
  'Choose Scan QR / Pay, then point the camera at the merchant’s printed QR.',
  'Confirm the merchant name matches the shop before you enter the amount.',
  'Enter the amount, review once, then authorize with your UPI PIN.',
];

export default function PaymentAssistanceScreen() {
  const query = useQuery({
    queryKey: ['payment-knowledge'],
    queryFn: () => searchKnowledge('UPI'),
  });
  const cacheQuery = useQuery({
    queryKey: ['payment-knowledge-cache'],
    queryFn: () => readCachedKnowledgeSearch('UPI'),
    staleTime: Infinity,
  });
  const knowledge =
    query.data ??
    (cacheQuery.data
      ? {
          ...cacheQuery.data.response,
          source: 'cache' as const,
          syncedAt: cacheQuery.data.syncedAt,
        }
      : undefined);
  const knowledgeSource = knowledge?.source ?? null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: spacing.md, paddingBottom: spacing.xxxl }]}
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

      <View style={styles.card}>
        <Text style={styles.cardTitle}>How to scan a merchant QR</Text>
        <Text style={styles.cardBody}>Offline checklist — works even when this screen is cached:</Text>
        {QR_SCAN_STEPS.map((step, index) => (
          <View key={step} style={styles.stepRow}>
            <Text style={styles.stepNum}>{index + 1}</Text>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.section}>Sourced knowledge</Text>
      {knowledgeSource ? (
        <Text style={knowledgeSource === 'cache' ? styles.cacheNote : styles.liveNote}>
          {knowledgeSource === 'live'
            ? `Live from server${knowledge?.syncedAt ? ` · synced ${formatKnowledgeSyncedAt(knowledge.syncedAt)}` : ''}`
            : `Last synced ${knowledge?.syncedAt ? formatKnowledgeSyncedAt(knowledge.syncedAt) : 'earlier'} · not live`}
        </Text>
      ) : null}
      {query.isLoading && !knowledge ? (
        <View style={styles.card}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.cardBody}>Loading payment citations…</Text>
        </View>
      ) : null}
      {knowledge?.results.map((item) => (
        <View key={item.claimId} style={styles.card}>
          <Text style={styles.cardTitle}>{item.entityName}</Text>
          <Text style={styles.cardBody}>{item.claim}</Text>
          <Text style={styles.source}>
            {item.citation.sourceName} · {item.citation.confidence} · verified {item.citation.lastVerified}
          </Text>
        </View>
      ))}
      {query.isError && !knowledge ? (
        <View style={styles.card}>
          <Text style={styles.error}>Could not load payment knowledge. Check your network.</Text>
          <TouchableOpacity onPress={() => query.refetch()}>
            <Text style={styles.retry}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {knowledgeSource === 'cache' ? (
        <TouchableOpacity onPress={() => query.refetch()}>
          <Text style={styles.retry}>Retry live knowledge</Text>
        </TouchableOpacity>
      ) : null}
      {knowledge && knowledge.results.length === 0 ? (
        <Text style={styles.cardBody}>No payment citations in the knowledge base yet. The checklist above still applies offline.</Text>
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
  stepRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginTop: 4 },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.sageSoft,
    color: colors.sage,
    textAlign: 'center',
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    lineHeight: 20,
    overflow: 'hidden',
  },
  stepText: { flex: 1, color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 18 },
  source: { color: colors.sage, fontSize: typography.fontSize.micro, fontWeight: '700' },
  liveNote: { color: colors.sage, fontSize: typography.fontSize.caption, fontWeight: '700' },
  cacheNote: { color: colors.goldDark, fontSize: typography.fontSize.caption, fontWeight: '700' },
  error: { color: colors.error, backgroundColor: colors.errorBg, padding: spacing.md, borderRadius: radii.md },
  retry: { color: colors.primary, fontWeight: '800', fontSize: typography.fontSize.caption, marginTop: 6 },
});
