import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { getCommunityEvents } from '../../lib/social';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';
import { useRouter } from 'expo-router';

const SAVED_EVENTS_KEY = 'zentrip.community.savedEventIds';

export default function CommunityScreen() {
  const router = useRouter();
  const [city, setCity] = useState<string | undefined>();
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const query = useQuery({
    queryKey: ['communityEvents', city],
    queryFn: () => getCommunityEvents(city),
  });
  const events = query.data?.events ?? [];

  useEffect(() => {
    AsyncStorage.getItem(SAVED_EVENTS_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) setSavedIds(parsed);
      })
      .catch(() => undefined);
  }, []);

  async function toggleSaved(eventId: string) {
    const next = savedIds.includes(eventId)
      ? savedIds.filter((id) => id !== eventId)
      : [...savedIds, eventId];
    setSavedIds(next);
    try {
      await AsyncStorage.setItem(SAVED_EVENTS_KEY, JSON.stringify(next));
    } catch {
      // Local preference only — ignore write failures.
    }
  }

  return (
    <View style={styles.screenWrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: spacing.md, paddingBottom: spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <Ionicons name="chatbubbles-outline" size={12} color={colors.primary} />
            <Text style={styles.eyebrow}>DESTINATION COMMUNITY</Text>
          </View>
          <Text style={styles.title}>What’s Happening</Text>
          <Text style={styles.subtitle}>
            Verified cultural gatherings, artisan workshops, and food walks across the Golden Triangle.
          </Text>
        </View>

        <View style={styles.chipsRow}>
          {['All', 'Delhi', 'Agra', 'Jaipur'].map((option) => {
            const value = option === 'All' ? undefined : option;
            const active = city === value;
            return (
              <TouchableOpacity
                key={option}
                onPress={() => setCity(value)}
                style={[styles.chip, active && styles.chipActive]}
                activeOpacity={0.8}
              >
                <Text style={active ? styles.chipTextActive : styles.chipText}>{option}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {query.isLoading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loaderText}>Fetching community updates...</Text>
          </View>
        ) : null}

        {query.isError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={14} color={colors.error} />
            <Text style={styles.errorText}>Could not load events. Check your network.</Text>
            <TouchableOpacity onPress={() => query.refetch()}>
              <Text style={styles.saveText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!query.isLoading && !events.length ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="calendar-outline" size={32} color={colors.inkSubtle} />
            <Text style={styles.emptyTitle}>No events right now</Text>
            <Text style={styles.emptySub}>Check back soon or select another city filter.</Text>
          </View>
        ) : null}

        <View style={styles.eventsList}>
          {events.map((event) => (
            <View key={event.id} style={styles.eventCard}>
              <View style={styles.cardTop}>
                <View style={styles.cityPill}>
                  <Text style={styles.cityPillText}>{event.city.toUpperCase()}</Text>
                </View>
                <View style={styles.statusPill}>
                  <Ionicons name="shield-checkmark" size={10} color={colors.sage} />
                  <Text style={styles.statusPillText}>
                    {event.verificationStatus.replace('_', ' ')}
                  </Text>
                </View>
              </View>

              <Text style={styles.eventTitle}>{event.title}</Text>

              <View style={styles.venueRow}>
                <Ionicons name="location-outline" size={14} color={colors.primary} />
                <Text style={styles.venueText}>{event.venue}</Text>
              </View>

              <View style={styles.timeRow}>
                <Ionicons name="time-outline" size={14} color={colors.inkMuted} />
                <Text style={styles.timeText}>{new Date(event.startTime).toLocaleString()}</Text>
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.sourceText}>Source: {event.source.replace('_', ' ')}</Text>
                <TouchableOpacity onPress={() => toggleSaved(event.id)}>
                  <Text style={styles.saveText}>
                    {savedIds.includes(event.id) ? 'Saved on this device' : 'Save to my list'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.exploreCity}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/explore',
                    params: { city: event.city, q: event.venue },
                  })
                }
                activeOpacity={0.85}
              >
                <Ionicons name="sparkles-outline" size={13} color={colors.primary} />
                <Text style={styles.exploreCityText}>Explore {event.city}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
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

  chipsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: colors.cardWarm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipText: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.white,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },

  loaderWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  loaderText: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
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
    flex: 1,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.xs,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.headline,
    fontWeight: '700',
  },
  emptySub: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
  },

  eventsList: {
    gap: spacing.md,
  },
  eventCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    ...shadows.sm,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cityPill: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.xs,
  },
  cityPillText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.sageSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  statusPillText: {
    color: colors.sage,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  eventTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.headline,
    fontWeight: '800',
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  venueText: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.xs,
    marginTop: spacing.xs,
    gap: 4,
  },
  sourceText: {
    color: colors.inkSubtle,
    fontSize: typography.fontSize.micro,
  },
  saveText: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '700',
  },
  exploreCity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  exploreCityText: {
    color: colors.primary,
    fontSize: typography.fontSize.caption,
    fontWeight: '800',
  },
});
