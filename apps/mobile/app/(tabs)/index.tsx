import { useQuery } from '@tanstack/react-query';
import { Link, useRouter } from 'expo-router';
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

import { getItinerary, getTrip } from '../../lib/trips';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';
import { useStore } from '../../store/useStore';

const INTEREST_LABELS: Record<string, string> = {
  culture: 'Culture & Heritage',
  food: 'Street Food & Dining',
  'culture & heritage': 'Culture & Heritage',
  'street food & dining': 'Street Food & Dining',
  'monuments & forts': 'Monuments & Forts',
  'slow morning walks': 'Slow Morning Walks',
  'sacred sites & ghats': 'Sacred Sites & Ghats',
  'artisans & textiles': 'Artisans & Textiles',
  'nature & escapes': 'Nature & Escapes',
  'local train journeys': 'Local Train Journeys',
};

function formatInterestLabel(interest: string): string {
  return INTEREST_LABELS[interest.toLowerCase()] ?? interest;
}

const CORRIDOR_HIGHLIGHTS = [
  {
    city: 'AGRA',
    title: 'Taj Mahal at Dawn',
    subtitle: 'Mughal symmetry along the misty Yamuna',
    badge: 'MUST SEE',
    color: colors.primarySoft,
    tagColor: colors.primary,
    icon: 'sparkles',
  },
  {
    city: 'DELHI',
    title: 'Old Delhi Spice Trail',
    subtitle: 'Centuries-old havelis, parathas, & vibrant bazaars',
    badge: 'CULINARY',
    color: colors.goldSoft,
    tagColor: colors.goldDark,
    icon: 'restaurant-outline',
  },
  {
    city: 'JAIPUR',
    title: 'Amber Fort & Courtyards',
    subtitle: 'Hilltop palaces, Sheesh Mahal mirrored halls',
    badge: 'HERITAGE',
    color: colors.sageSoft,
    tagColor: colors.sage,
    icon: 'library-outline',
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useStore((s) => s.user);
  const activeTripId = useStore((s) => s.activeTripId);
  const preferences = useStore((s) => s.travelerPreferences);

  const tripQuery = useQuery({
    queryKey: ['trip', activeTripId],
    queryFn: () => getTrip(activeTripId as string),
    enabled: Boolean(activeTripId),
  });
  const itineraryQuery = useQuery({
    queryKey: ['itinerary', activeTripId],
    queryFn: () => getItinerary(activeTripId as string),
    enabled: Boolean(activeTripId),
  });

  const trip = tripQuery.data;
  const nextDay = itineraryQuery.data?.[0];

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <View style={styles.screenWrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
        <View style={styles.topRow}>
          <View>
            <View style={styles.datePill}>
              <Ionicons name="calendar-outline" size={12} color={colors.primary} />
              <Text style={styles.dateText}>{currentDate.toUpperCase()}</Text>
            </View>
            <Text style={styles.greeting}>
              Namaste, {user?.name?.split(' ')[0] ?? 'Traveler'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => router.push('/(tabs)/profile')}
            activeOpacity={0.8}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user?.name?.[0] ?? 'Z').toUpperCase()}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Hero Editorial Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroCopy}>
            <View style={styles.heroBadgeRow}>
              <Text style={styles.heroKicker}>✦ MEET ZENNY IN THE MEADOW</Text>
            </View>
            <Text style={styles.heroTitle}>Notice more. Rush less.</Text>
            <Text style={styles.heroBody}>
              Grounded itineraries, honest scores, and a live companion waiting in the grass.
            </Text>
          </View>

          <Link href="/companion" asChild>
            <TouchableOpacity
              style={styles.heroVoiceBar}
              activeOpacity={0.85}
            >
              <View style={styles.heroVoiceLeft}>
                <View style={styles.heroMicCircle}>
                  <Ionicons name="leaf" size={16} color={colors.grassDeep} />
                </View>
                <Text style={styles.heroVoiceText}>Tap Zenny to talk live</Text>
              </View>
              <View style={styles.heroVoicePill}>
                <Text style={styles.heroVoicePillText}>OPEN MEADOW</Text>
              </View>
            </TouchableOpacity>
          </Link>
        </View>

        {/* Quick Action Dock */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Essential tools</Text>
          <Text style={styles.sectionSubtitle}>Tap for quick access</Text>
        </View>
        <View style={styles.actionGrid}>
          <Link href="/companion" asChild>
            <TouchableOpacity
              style={[styles.actionCard, { backgroundColor: colors.card }]}
              activeOpacity={0.85}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: colors.sageSoft }]}>
                <Ionicons name="leaf" size={20} color={colors.sage} />
              </View>
              <Text style={styles.actionTitle}>Ask Zenny</Text>
              <Text style={styles.actionDesc}>Meadow live call</Text>
            </TouchableOpacity>
          </Link>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.card }]}
            onPress={() => router.push('/(tabs)/guide')}
            activeOpacity={0.85}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: colors.goldSoft }]}>
              <Ionicons name="camera-outline" size={20} color={colors.goldDark} />
            </View>
            <Text style={styles.actionTitle}>Heritage Lens</Text>
            <Text style={styles.actionDesc}>Scan monuments</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.card }]}
            onPress={() => router.push('/(tabs)/compare')}
            activeOpacity={0.85}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: colors.sageSoft }]}>
              <Ionicons name="git-compare-outline" size={20} color={colors.sage} />
            </View>
            <Text style={styles.actionTitle}>Compare</Text>
            <Text style={styles.actionDesc}>Trains & stays</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.card }]}
            onPress={() => router.push('/(tabs)/guardian')}
            activeOpacity={0.85}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: colors.errorBg }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.error} />
            </View>
            <Text style={styles.actionTitle}>Guardian</Text>
            <Text style={styles.actionDesc}>112 & Helpline</Text>
          </TouchableOpacity>
        </View>

        {/* Journey / Active Trip Card */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your journey</Text>
          {trip ? (
            <TouchableOpacity onPress={() => router.push('/(tabs)/trip')}>
              <Text style={styles.sectionLink}>Open planner →</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {tripQuery.isLoading && activeTripId ? (
          <View style={styles.tripSkeleton}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.tripSkeletonText}>Loading your itinerary…</Text>
          </View>
        ) : trip ? (
          <TouchableOpacity
            style={styles.tripCard}
            onPress={() => router.push('/(tabs)/trip')}
            activeOpacity={0.88}
          >
            <View style={styles.tripCardTop}>
              <View style={styles.tripBadge}>
                <Ionicons name="sparkles" size={10} color={colors.sage} style={{ marginRight: 4 }} />
                <Text style={styles.tripBadgeText}>ACTIVE ITINERARY</Text>
              </View>
              <Text style={styles.tripStatus}>{trip.status}</Text>
            </View>

            <View style={styles.routeRow}>
              {trip.cities.map((city, idx) => (
                <View key={city} style={styles.routeCityItem}>
                  <Text style={styles.routeCityName}>{city}</Text>
                  {idx < trip.cities.length - 1 ? (
                    <Ionicons
                      name="arrow-forward"
                      size={14}
                      color={colors.primary}
                      style={styles.routeArrow}
                    />
                  ) : null}
                </View>
              ))}
            </View>

            <View style={styles.tripMetaRow}>
              <View style={styles.tripMetaItem}>
                <Ionicons name="calendar-outline" size={13} color={colors.inkMuted} />
                <Text style={styles.tripMetaText}>
                  {trip.startDate} - {trip.endDate}
                </Text>
              </View>
              <View style={styles.tripMetaItem}>
                <Ionicons name="wallet-outline" size={13} color={colors.inkMuted} />
                <Text style={styles.tripMetaText}>{trip.budgetLevel}</Text>
              </View>
            </View>

            {nextDay ? (
              <View style={styles.nextDay}>
                <View style={styles.nextDayHeader}>
                  <Text style={styles.nextDayLabel}>NEXT STAGE</Text>
                  <Text style={styles.nextDayCity}>{nextDay.city}</Text>
                </View>
                <Text style={styles.nextDayBody}>
                  {nextDay.activities.length
                    ? `${nextDay.activities.length} grounded landmark stops planned`
                    : 'Ready to generate stops'}
                </Text>
              </View>
            ) : (
              <View style={styles.nextDay}>
                <Text style={styles.nextDayLabel}>NEXT STEP</Text>
                <Text style={styles.nextDayTitle}>Generate your daily itinerary</Text>
                <Text style={styles.nextDayBody}>
                  Turn your cities into a day-by-day mindful plan.
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.emptyTripCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="map-outline" size={24} color={colors.primary} />
            </View>
            <Text style={styles.emptyTripTitle}>Plan your Golden Triangle chapter</Text>
            <Text style={styles.emptyTripBody}>
              Delhi, Agra, & Jaipur with verified knowledge grounding and zero fluff.
            </Text>
            <TouchableOpacity
              style={styles.darkButton}
              onPress={() => router.push('/(tabs)/trip')}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={18} color={colors.white} style={{ marginRight: 6 }} />
              <Text style={styles.darkButtonText}>Create a new trip</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Curated Corridor Spotlight */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Golden Triangle stories</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/explore')}>
            <Text style={styles.sectionLink}>View all →</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.highlightScroll}
        >
          {CORRIDOR_HIGHLIGHTS.map((item) => (
            <TouchableOpacity
              key={item.title}
              style={[styles.highlightCard, { backgroundColor: colors.card }]}
              onPress={() => router.push('/(tabs)/explore')}
              activeOpacity={0.85}
            >
              <View style={[styles.highlightBanner, { backgroundColor: item.color }]}>
                <View style={styles.highlightTopRow}>
                  <View style={styles.highlightBadge}>
                    <Text style={[styles.highlightBadgeText, { color: item.tagColor }]}>
                      {item.badge}
                    </Text>
                  </View>
                  <Ionicons name={item.icon as any} size={18} color={item.tagColor} />
                </View>
                <Text style={styles.highlightCity}>{item.city}</Text>
              </View>
              <View style={styles.highlightBody}>
                <Text style={styles.highlightTitle}>{item.title}</Text>
                <Text style={styles.highlightSubtitle}>{item.subtitle}</Text>
                <View style={styles.highlightFooter}>
                  <Ionicons name="checkmark-circle" size={12} color={colors.sage} />
                  <Text style={styles.highlightKb}>Verified Knowledge</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Travel Style Passport */}
        <View style={styles.preferenceCard}>
          <View style={styles.preferenceHeader}>
            <View style={styles.preferenceTag}>
              <Ionicons name="options-outline" size={12} color={colors.primary} />
              <Text style={styles.preferenceLabel}>YOUR TRAVEL STYLE</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
              <Text style={styles.preferenceLink}>Edit profile →</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.preferenceText}>
            {preferences.pace} pace  ·  {preferences.budget} budget  ·  {preferences.interests
              .slice(0, 3)
              .map(formatInterestLabel)
              .join(' + ')}
          </Text>
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
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  dateText: {
    fontSize: typography.fontSize.micro,
    letterSpacing: 1.2,
    color: colors.primary,
    fontWeight: '800',
  },
  greeting: {
    fontSize: typography.fontSize.display,
    color: colors.ink,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  avatarButton: {
    position: 'relative',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.sandLight,
    ...shadows.sm,
  },
  avatarText: {
    color: colors.white,
    fontSize: typography.fontSize.headline,
    fontWeight: '700',
  },

  heroCard: {
    borderRadius: radii.xxl,
    backgroundColor: colors.sageDark,
    padding: spacing.xl,
    overflow: 'hidden',
    ...shadows.lg,
  },
  heroCopy: {
    gap: spacing.xs,
  },
  heroBadgeRow: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  heroKicker: {
    color: '#E8D2AA',
    fontSize: typography.fontSize.micro,
    letterSpacing: 1.5,
    fontWeight: '800',
  },
  heroTitle: {
    color: colors.white,
    fontSize: typography.fontSize.display,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: spacing.xs,
  },
  heroBody: {
    color: '#D1D7DC',
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
  },
  heroVoiceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
  },
  heroVoiceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroMicCircle: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    backgroundColor: colors.skyWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroVoiceText: {
    color: colors.white,
    fontSize: typography.fontSize.body,
    fontWeight: '500',
  },
  heroVoicePill: {
    backgroundColor: 'rgba(232, 210, 170, 0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  heroVoicePillText: {
    color: '#E8D2AA',
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.title2,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    color: colors.inkSubtle,
    fontSize: typography.fontSize.caption,
  },
  sectionLink: {
    color: colors.primary,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },

  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionCard: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '47%',
    padding: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    ...shadows.sm,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  actionTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  actionDesc: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
    marginTop: 2,
  },

  tripCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.md,
  },
  tripSkeleton: {
    borderRadius: radii.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 120,
    ...shadows.sm,
  },
  tripSkeletonText: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
  },
  tripCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.sageSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  tripBadgeText: {
    color: colors.sage,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  tripStatus: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  routeCityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  routeCityName: {
    fontSize: typography.fontSize.title1,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  routeArrow: {
    marginHorizontal: 2,
  },
  tripMetaRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  tripMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tripMetaText: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
    textTransform: 'capitalize',
  },
  nextDay: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
    marginTop: 2,
  },
  nextDayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nextDayLabel: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    letterSpacing: 1.2,
    fontWeight: '800',
  },
  nextDayCity: {
    color: colors.ink,
    fontSize: typography.fontSize.headline,
    fontWeight: '700',
  },
  nextDayTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.headline,
    fontWeight: '700',
    marginTop: 2,
  },
  nextDayBody: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
  },

  emptyTripCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'flex-start',
    ...shadows.sm,
  },
  emptyIconCircle: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTripTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.title2,
    fontWeight: '800',
  },
  emptyTripBody: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
    marginTop: spacing.xs,
  },
  darkButton: {
    flexDirection: 'row',
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    ...shadows.sm,
  },
  darkButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.body,
    fontWeight: '700',
  },

  highlightScroll: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  highlightCard: {
    width: 220,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.sm,
  },
  highlightBanner: {
    padding: spacing.md,
    height: 80,
    justifyContent: 'space-between',
  },
  highlightTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  highlightBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  highlightBadgeText: {
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  highlightCity: {
    color: colors.ink,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  highlightBody: {
    padding: spacing.md,
    gap: 4,
  },
  highlightTitle: {
    fontSize: typography.fontSize.headline,
    fontWeight: '700',
    color: colors.ink,
  },
  highlightSubtitle: {
    fontSize: typography.fontSize.micro,
    color: colors.inkMuted,
    lineHeight: 15,
  },
  highlightFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  highlightKb: {
    fontSize: typography.fontSize.micro,
    color: colors.sage,
    fontWeight: '600',
  },

  preferenceCard: {
    backgroundColor: colors.cardWarm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  preferenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  preferenceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  preferenceLabel: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    letterSpacing: 1.2,
    fontWeight: '800',
  },
  preferenceText: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  preferenceLink: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '700',
  },
});

