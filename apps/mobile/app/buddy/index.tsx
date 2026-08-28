import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { findBuddyMatches } from '../../lib/social';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';

export default function BuddyScreen() {
  const insets = useSafeAreaInsets();
  const [request, setRequest] = useState(
    'Find travel buddies for Golden Triangle in October, architecture and photography, backpacker to comfort pace'
  );
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const mutation = useMutation({ mutationFn: () => findBuddyMatches(request) });
  const matches = mutation.data?.matches ?? [];

  return (
    <View style={styles.screenWrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <Ionicons name="people-outline" size={12} color={colors.primary} />
            <Text style={styles.eyebrow}>TRAVEL BUDDY MATCH</Text>
          </View>
          <Text style={styles.title}>Find Your People</Text>
          <Text style={styles.subtitle}>
            Aggregate compatibility scoring based on shared corridor timing, pace, and interests. Personal details remain private until mutual consent.
          </Text>
        </View>

        {/* Search Input Card */}
        <View style={styles.formCard}>
          <Text style={styles.label}>Your Travel Intent & Style</Text>
          <TextInput
            value={request}
            onChangeText={setRequest}
            multiline
            style={styles.input}
            placeholder="Describe your destination, dates, vibe, and pace..."
            placeholderTextColor={colors.inkSubtle}
          />
          <TouchableOpacity onPress={() => setAgeConfirmed((value) => !value)} style={styles.tag}>
            <Text style={styles.tagText}>
              {ageConfirmed ? '18+ confirmed' : 'I confirm I am 18 or older'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, (mutation.isPending || request.trim().length < 3 || !ageConfirmed) && styles.buttonDisabled]}
            onPress={() => mutation.mutate()}
            disabled={mutation.isPending || request.trim().length < 3 || !ageConfirmed}
            activeOpacity={0.85}
          >
            {mutation.isPending ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <View style={styles.btnInner}>
                <Ionicons name="sparkles" size={16} color={colors.white} style={{ marginRight: 6 }} />
                <Text style={styles.buttonText}>Find Compatible Groups</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {mutation.isError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={14} color={colors.error} />
            <Text style={styles.errorText}>Could not find groups. Check your network.</Text>
          </View>
        ) : null}

        {/* Matches List */}
        {matches.length > 0 ? (
          <View style={styles.matchesSection}>
            <Text style={styles.sectionTitle}>Compatible Golden Triangle Groups</Text>
            {matches.map((match) => (
              <View key={match.groupId} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.scorePill}>
                    <Text style={styles.scoreText}>{match.compatibility}% MATCH</Text>
                  </View>
                  <View style={styles.membersBadge}>
                    <Ionicons name="person-outline" size={12} color={colors.inkMuted} />
                    <Text style={styles.members}>{match.members} travelers</Text>
                  </View>
                </View>

                <Text style={styles.groupName}>{match.name}</Text>

                <View style={styles.tagRow}>
                  <View style={styles.tag}>
                    <Ionicons name="location-outline" size={11} color={colors.primary} />
                    <Text style={styles.tagText}>{match.destination}</Text>
                  </View>
                  <View style={styles.tag}>
                    <Ionicons name="calendar-outline" size={11} color={colors.inkMuted} />
                    <Text style={styles.tagText}>{match.dateRange}</Text>
                  </View>
                  <View style={styles.tag}>
                    <Ionicons name="wallet-outline" size={11} color={colors.sage} />
                    <Text style={styles.tagText}>{match.budgetBand}</Text>
                  </View>
                </View>

                <View style={styles.styleBox}>
                  <Text style={styles.styleLabel}>STYLE · INTERESTS</Text>
                  <Text style={styles.styleText}>
                    {match.style} · {match.interests}
                  </Text>
                </View>
                <Text style={styles.styleText}>
                  Request to join stays private until the group consents. No chat until then.
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    alignItems: 'flex-start',
    gap: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
    marginBottom: 4,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontSize: typography.fontSize.display,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
    maxWidth: 320,
  },

  formCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    ...shadows.md,
  },
  label: {
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
    color: colors.ink,
  },
  input: {
    backgroundColor: colors.backgroundWarm,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 88,
    padding: spacing.md,
    textAlignVertical: 'top',
    fontSize: typography.fontSize.body,
    color: colors.ink,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    height: 48,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.white,
    fontSize: typography.fontSize.body,
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radii.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.fontSize.caption,
  },

  matchesSection: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.title2,
    fontWeight: '800',
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.sm,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scorePill: {
    backgroundColor: colors.sageSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  scoreText: {
    color: colors.sage,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  membersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  members: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
  },
  groupName: {
    color: colors.ink,
    fontSize: typography.fontSize.headline,
    fontWeight: '800',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.cardWarm,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.xs,
  },
  tagText: {
    color: colors.ink,
    fontSize: typography.fontSize.micro,
    fontWeight: '600',
  },
  styleBox: {
    backgroundColor: colors.cardWarm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    gap: 2,
    marginTop: 2,
  },
  styleLabel: {
    color: colors.primary,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  styleText: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
  },
});

