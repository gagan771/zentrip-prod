import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import {
  recommendDestinations,
  type DestinationRecommendation,
} from '../../lib/guide';
import { submitAgentFeedback } from '../../lib/agent';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';

const INTERESTS = [
  ['culture', 'Culture'],
  ['food', 'Food'],
  ['nature', 'Nature'],
  ['wildlife', 'Wildlife'],
  ['beach', 'Beach'],
  ['mountains', 'Mountains'],
  ['wellness', 'Wellness'],
  ['adventure', 'Adventure'],
] as const;

const BUDGETS = [
  ['backpacker', 'Budget'],
  ['comfort', 'Comfort'],
  ['luxury', 'Luxury'],
  ['mixed', 'Flexible'],
] as const;

const PARTIES = [
  ['solo', 'Solo'],
  ['couple', 'Couple'],
  ['family', 'Family'],
  ['group', 'Group'],
] as const;

function RecommendationCard({ item }: { item: DestinationRecommendation }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <Text style={styles.cardLocation}>{item.city}</Text>
        </View>
        <View style={styles.scorePill}>
          <Text style={styles.scoreText}>{Math.round(item.score * 100)}%</Text>
          <Text style={styles.scoreLabel}>fit</Text>
        </View>
      </View>

      <View style={styles.tagRow}>
        {item.experienceTags.slice(0, 4).map((tag) => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.fact}>{item.fact}</Text>

      {item.accessNotes ? (
        <View style={styles.noteRow}>
          <Ionicons name="walk-outline" size={16} color={colors.primary} />
          <Text style={styles.noteText}>{item.accessNotes}</Text>
        </View>
      ) : null}
      {item.safetyNotes ? (
        <View style={styles.noteRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.sage} />
          <Text style={styles.noteText}>{item.safetyNotes}</Text>
        </View>
      ) : null}
      {item.operationalWarnings?.length ? (
        <View style={styles.warningRow}>
          <Ionicons name="time-outline" size={16} color={colors.goldDark} />
          <Text style={styles.warningText}>{item.operationalWarnings.join(' · ')}</Text>
        </View>
      ) : null}

      {item.tradeoffs.length ? (
        <Text style={styles.tradeoff}>Worth knowing: {item.tradeoffs.join(' ')}</Text>
      ) : null}
      <Text style={styles.source}>
        {item.source.confidence} source · verified {item.source.lastVerified || 'date unavailable'}
      </Text>
    </View>
  );
}

export default function RecommendationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [interests, setInterests] = useState<string[]>(['culture']);
  const [budget, setBudget] = useState<(typeof BUDGETS)[number][0]>('mixed');
  const [party, setParty] = useState<(typeof PARTIES)[number][0]>('solo');
  const [days, setDays] = useState('4');
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<'helpful' | 'not_helpful' | null>(null);
  const [request, setRequest] = useState<{
    interests: string[];
    budget: typeof budget;
    travelParty: typeof party;
    days: number;
    query?: string;
  } | null>(null);

  const recommendations = useQuery({
    queryKey: ['destination-recommendations', request],
    queryFn: () => recommendDestinations(request || {}),
    enabled: Boolean(request),
    staleTime: 5 * 60 * 1000,
  });

  function toggleInterest(interest: string) {
    setInterests((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest],
    );
  }

  function submit() {
    const parsedDays = Number.parseInt(days, 10);
    setRequest({
      interests: interests.length ? interests : ['culture'],
      budget,
      travelParty: party,
      days: Number.isFinite(parsedDays) ? Math.max(1, Math.min(parsedDays, 30)) : 4,
      query: query.trim() || undefined,
    });
    setFeedback(null);
  }

  async function sendFeedback(helpful: boolean) {
    const interactionId = recommendations.data?.interactionId;
    if (!interactionId || feedback) return;
    try {
      await submitAgentFeedback(interactionId, helpful);
      setFeedback(helpful ? 'helpful' : 'not_helpful');
    } catch {
      // Feedback is optional and should never interrupt destination discovery.
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={22} color={colors.ink} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>Z E N N Y  ·  INDIA</Text>
            <Text style={styles.title}>Where should you go?</Text>
            <Text style={styles.subtitle}>A short, sourced list shaped around your time, energy, and travel style.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What are you drawn to?</Text>
          <View style={styles.chipWrap}>
            {INTERESTS.map(([id, label]) => {
              const selected = interests.includes(id);
              return (
                <Pressable key={id} onPress={() => toggleInterest(id)} style={[styles.choice, selected && styles.choiceActive]}>
                  <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your trip shape</Text>
          <TextInput
            value={days}
            onChangeText={setDays}
            keyboardType="number-pad"
            style={styles.input}
            placeholder="Days (e.g. 4)"
            placeholderTextColor={colors.inkSubtle}
            accessibilityLabel="Trip length in days"
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            style={styles.input}
            placeholder="Anything specific? e.g. quiet, North India"
            placeholderTextColor={colors.inkSubtle}
            accessibilityLabel="Additional travel preference"
          />
          <Text style={styles.fieldLabel}>Budget</Text>
          <View style={styles.chipWrap}>
            {BUDGETS.map(([id, label]) => (
              <Pressable key={id} onPress={() => setBudget(id)} style={[styles.choice, budget === id && styles.choiceActive]}>
                <Text style={[styles.choiceText, budget === id && styles.choiceTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.fieldLabel}>Travelling as</Text>
          <View style={styles.chipWrap}>
            {PARTIES.map(([id, label]) => (
              <Pressable key={id} onPress={() => setParty(id)} style={[styles.choice, party === id && styles.choiceActive]}>
                <Text style={[styles.choiceText, party === id && styles.choiceTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={submit} activeOpacity={0.86}>
          <Ionicons name="sparkles-outline" size={19} color={colors.white} />
          <Text style={styles.primaryButtonText}>Find my best matches</Text>
        </TouchableOpacity>

        {recommendations.isFetching ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Checking reviewed Indian destinations…</Text>
          </View>
        ) : null}
        {recommendations.isError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Could not load recommendations</Text>
            <Text style={styles.errorText}>Check your connection and try again. Zenny will not invent a destination when the source service is unavailable.</Text>
          </View>
        ) : null}
        {recommendations.data ? (
          <View style={styles.results}>
            <View style={styles.resultsHeader}>
              <Text style={styles.sectionTitle}>Your strongest matches</Text>
              <Text style={styles.resultsMeta}>{recommendations.data.provenance} · {recommendations.data.results.length} results</Text>
            </View>
            {recommendations.data.results.map((item) => <RecommendationCard key={item.placeId} item={item} />)}
            {recommendations.data.interactionId ? (
              <View style={styles.feedbackBox}>
                <Text style={styles.feedbackPrompt}>Did this shortlist help?</Text>
                <View style={styles.feedbackActions}>
                  <Pressable
                    onPress={() => sendFeedback(true)}
                    disabled={Boolean(feedback)}
                    style={[styles.feedbackButton, feedback === 'helpful' && styles.feedbackButtonActive]}
                    accessibilityLabel="Mark recommendations helpful"
                  >
                    <Ionicons name="thumbs-up-outline" size={16} color={colors.primary} />
                    <Text style={styles.feedbackText}>Helpful</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => sendFeedback(false)}
                    disabled={Boolean(feedback)}
                    style={[styles.feedbackButton, feedback === 'not_helpful' && styles.feedbackButtonActive]}
                    accessibilityLabel="Mark recommendations not helpful"
                  >
                    <Ionicons name="thumbs-down-outline" size={16} color={colors.primary} />
                    <Text style={styles.feedbackText}>Not quite</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            <Text style={styles.disclaimer}>Scores explain fit, not certainty. Check current weather, closures, permits, and transport before booking.</Text>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="map-outline" size={28} color={colors.primary} />
            <Text style={styles.emptyTitle}>India, your way</Text>
            <Text style={styles.emptyText}>Choose a few interests and we’ll return diverse, source-backed destination ideas.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'flex-start' },
  backButton: { width: 38, height: 38, borderRadius: radii.full, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadows.sm },
  headerCopy: { flex: 1 },
  kicker: { color: colors.primary, fontSize: typography.fontSize.micro, fontWeight: '800', letterSpacing: 1.8, marginBottom: spacing.xs },
  title: { color: colors.ink, fontSize: typography.fontSize.hero, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: colors.inkMuted, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body, marginTop: spacing.xs },
  section: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  sectionTitle: { color: colors.ink, fontSize: typography.fontSize.title2, fontWeight: '800' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  choice: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, borderRadius: radii.full, paddingHorizontal: spacing.md, paddingVertical: 9 },
  choiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { color: colors.inkMuted, fontSize: typography.fontSize.caption, fontWeight: '700' },
  choiceTextActive: { color: colors.white },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.white, color: colors.ink, height: 48, paddingHorizontal: spacing.md, marginTop: spacing.sm, fontSize: typography.fontSize.body },
  fieldLabel: { color: colors.inkMuted, fontSize: typography.fontSize.caption, fontWeight: '700', marginTop: spacing.md },
  primaryButton: { marginHorizontal: spacing.lg, marginTop: spacing.xl, height: 52, borderRadius: radii.md, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, ...shadows.sm },
  primaryButtonText: { color: colors.white, fontSize: typography.fontSize.body, fontWeight: '800' },
  loading: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.xl },
  loadingText: { color: colors.inkMuted, fontSize: typography.fontSize.caption },
  results: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  resultsHeader: { marginBottom: spacing.sm },
  resultsMeta: { color: colors.inkSubtle, fontSize: typography.fontSize.micro, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.8 },
  card: { backgroundColor: colors.white, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md, ...shadows.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  cardTitleWrap: { flex: 1 },
  cardTitle: { color: colors.ink, fontSize: typography.fontSize.title2, fontWeight: '800' },
  cardLocation: { color: colors.inkMuted, fontSize: typography.fontSize.caption, marginTop: 2 },
  scorePill: { backgroundColor: colors.primarySoft, borderRadius: radii.md, paddingHorizontal: 9, paddingVertical: 6, alignItems: 'center' },
  scoreText: { color: colors.primary, fontSize: typography.fontSize.body, fontWeight: '800' },
  scoreLabel: { color: colors.primary, fontSize: typography.fontSize.micro, fontWeight: '700' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: spacing.sm },
  tag: { backgroundColor: colors.cardSubtle, borderRadius: radii.full, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { color: colors.inkMuted, fontSize: typography.fontSize.micro, fontWeight: '700' },
  fact: { color: colors.ink, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body, marginTop: spacing.sm },
  noteRow: { flexDirection: 'row', gap: 7, marginTop: spacing.sm, alignItems: 'flex-start' },
  noteText: { flex: 1, color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 18 },
  warningRow: { flexDirection: 'row', gap: 7, marginTop: spacing.sm, alignItems: 'flex-start' },
  warningText: { flex: 1, color: colors.goldDark, fontSize: typography.fontSize.caption, lineHeight: 18, fontWeight: '700' },
  tradeoff: { color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 18, marginTop: spacing.sm, fontStyle: 'italic' },
  source: { color: colors.inkSubtle, fontSize: typography.fontSize.micro, marginTop: spacing.md },
  disclaimer: { color: colors.inkSubtle, fontSize: typography.fontSize.micro, lineHeight: 16, textAlign: 'center', marginTop: spacing.xs },
  feedbackBox: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  feedbackPrompt: { color: colors.ink, fontSize: typography.fontSize.caption, fontWeight: '800', textAlign: 'center' },
  feedbackActions: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  feedbackButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radii.full, paddingHorizontal: spacing.md, paddingVertical: 8 },
  feedbackButtonActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  feedbackText: { color: colors.primary, fontSize: typography.fontSize.caption, fontWeight: '700' },
  emptyState: { marginHorizontal: spacing.lg, marginTop: spacing.xl, padding: spacing.xl, borderRadius: radii.lg, backgroundColor: colors.primarySoft, alignItems: 'center' },
  emptyTitle: { color: colors.ink, fontSize: typography.fontSize.title2, fontWeight: '800', marginTop: spacing.sm },
  emptyText: { color: colors.inkMuted, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body, textAlign: 'center', marginTop: spacing.xs },
  errorCard: { marginHorizontal: spacing.lg, marginTop: spacing.xl, borderRadius: radii.md, backgroundColor: colors.errorBg, padding: spacing.md },
  errorTitle: { color: colors.error, fontWeight: '800', fontSize: typography.fontSize.body },
  errorText: { color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 18, marginTop: spacing.xs },
});
