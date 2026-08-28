import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

import { createTrip, generateItinerary, getTripTimeline, addTripBooking, requestOnboardingCall, getOnboardingConfig } from '../../lib/trips';
import { getOfflineTripPack, saveOfflineTripPack } from '../../lib/offline-trip';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';
import { useStore } from '../../store/useStore';

const BUDGET_LEVELS: Array<{
  id: 'backpacker' | 'comfort' | 'luxury' | 'mixed';
  label: string;
  icon: string;
  desc: string;
}> = [
  { id: 'backpacker', label: 'Backpacker', icon: 'trail-sign-outline', desc: 'Hostels & local transit' },
  { id: 'comfort', label: 'Comfort', icon: 'bed-outline', desc: 'Boutique stays & AC rail' },
  { id: 'luxury', label: 'Luxury', icon: 'sparkles-outline', desc: 'Heritage havelis & private cabs' },
  { id: 'mixed', label: 'Mixed', icon: 'swap-horizontal-outline', desc: 'Flexible balanced style' },
];

const PRESET_CORRIDORS = [
  'Delhi, Agra, Jaipur',
  'Delhi, Varanasi',
  'Jaipur, Udaipur, Jodhpur',
];

function NewTripForm({ onCreated }: { onCreated: (tripId: string) => void }) {
  const [cities, setCities] = useState('Delhi, Agra, Jaipur');
  const [startDate, setStartDate] = useState('2026-10-10');
  const [endDate, setEndDate] = useState('2026-10-16');
  const [budgetLevel, setBudgetLevel] = useState<'backpacker' | 'comfort' | 'luxury' | 'mixed'>('backpacker');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      createTrip({
        startDate,
        endDate,
        cities: cities
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        budgetLevel,
      }),
    onSuccess: (trip) => onCreated(trip.id),
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create trip'),
  });

  return (
    <View style={styles.formCard}>
      <View style={styles.badgeRow}>
        <Ionicons name="map-outline" size={12} color={colors.primary} />
        <Text style={styles.badgeText}>TRIP ARCHITECT</Text>
      </View>

      <Text style={styles.formTitle}>Craft your Journey</Text>
      <Text style={styles.formSubtitle}>
        Set your destinations and travel dates. Zentrip builds a grounded itinerary backed by real knowledge.
      </Text>

      {/* Cities Input */}
      <View style={styles.fieldSection}>
        <Text style={styles.label}>Cities to visit</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="location-outline" size={18} color={colors.inkMuted} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            value={cities}
            onChangeText={setCities}
            placeholder="e.g. Delhi, Agra, Jaipur"
            placeholderTextColor={colors.inkSubtle}
          />
        </View>

        {/* Quick Presets */}
        <View style={styles.presetRow}>
          <Text style={styles.presetLabel}>Presets:</Text>
          {PRESET_CORRIDORS.map((preset) => (
            <TouchableOpacity
              key={preset}
              style={[styles.presetChip, cities === preset && styles.presetChipActive]}
              onPress={() => setCities(preset)}
            >
              <Text style={cities === preset ? styles.presetTextActive : styles.presetText}>
                {preset.split(',')[0]}...
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Dates Section */}
      <View style={styles.dateRow}>
        <View style={styles.dateCol}>
          <Text style={styles.label}>Start date</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="calendar-outline" size={16} color={colors.inkMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.inkSubtle}
            />
          </View>
        </View>

        <View style={styles.dateCol}>
          <Text style={styles.label}>End date</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="calendar-outline" size={16} color={colors.inkMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.inkSubtle}
            />
          </View>
        </View>
      </View>

      {/* Budget Style Selection */}
      <View style={styles.fieldSection}>
        <Text style={styles.label}>Travel Style & Budget</Text>
        <View style={styles.budgetGrid}>
          {BUDGET_LEVELS.map((item) => {
            const active = budgetLevel === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.budgetCard, active && styles.budgetCardActive]}
                onPress={() => setBudgetLevel(item.id)}
                activeOpacity={0.8}
              >
                <View style={styles.budgetTopline}>
                  <Ionicons
                    name={item.icon as any}
                    size={16}
                    color={active ? colors.primary : colors.inkMuted}
                  />
                  <Text style={[styles.budgetCardLabel, active && styles.budgetCardLabelActive]}>
                    {item.label}
                  </Text>
                </View>
                <Text style={styles.budgetCardDesc}>{item.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.primaryButton, createMutation.isPending && styles.buttonDisabled]}
        onPress={() => createMutation.mutate()}
        disabled={createMutation.isPending}
        activeOpacity={0.85}
      >
        {createMutation.isPending ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <View style={styles.btnInner}>
            <Ionicons name="sparkles" size={18} color={colors.white} style={{ marginRight: 6 }} />
            <Text style={styles.primaryButtonText}>Create Itinerary Draft</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

function ItineraryView({ tripId, onStartOver }: { tripId: string; onStartOver: () => void }) {
  const queryClient = useQueryClient();
  const [bookingTitle, setBookingTitle] = useState('');
  const [bookingProvider, setBookingProvider] = useState('IRCTC');
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [callConsent, setCallConsent] = useState(false);

  const timelineQuery = useQuery({
    queryKey: ['tripTimeline', tripId],
    queryFn: () => getTripTimeline(tripId),
  });
  const onboardingConfig = useQuery({
    queryKey: ['onboardingConfig'],
    queryFn: getOnboardingConfig,
  });

  const generateMutation = useMutation({
    mutationFn: () => generateItinerary(tripId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tripTimeline', tripId] });
    },
  });

  const bookingMutation = useMutation({
    mutationFn: () =>
      addTripBooking(tripId, {
        kind: 'transport',
        title: bookingTitle.trim(),
        provider: bookingProvider.trim() || 'Manual',
        startsAt: null,
        endsAt: null,
        reference: null,
        status: 'confirmed',
        deepLink: null,
      }),
    onSuccess: () => {
      setBookingTitle('');
      queryClient.invalidateQueries({ queryKey: ['tripTimeline', tripId] });
    },
  });

  const callMutation = useMutation({
    mutationFn: () =>
      requestOnboardingCall({
        phoneNumber: phoneNumber.trim(),
        callConsent: true,
        recordingConsent: false,
      }),
  });

  const trip = timelineQuery.data?.trip;
  const days = timelineQuery.data?.days ?? [];
  const bookings = timelineQuery.data?.bookings ?? [];

  return (
    <View style={styles.itineraryContainer}>
      {/* Route Header Card */}
      <View style={styles.routeHeaderCard}>
        <View style={styles.routeHeaderTop}>
          <View style={styles.routePill}>
            <Ionicons name="compass-outline" size={12} color={colors.white} />
            <Text style={styles.routePillText}>CONFIRMED TRIP</Text>
          </View>
          <TouchableOpacity onPress={onStartOver} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.startOverText}>Start over</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.routeTitle}>
          {trip?.cities.join('  ➔  ') ?? 'Your Route'}
        </Text>

        <View style={styles.routeMetaRow}>
          <View style={styles.routeMetaBadge}>
            <Ionicons name="calendar-outline" size={12} color="#D1D7DC" />
            <Text style={styles.routeMetaText}>
              {trip?.startDate} - {trip?.endDate}
            </Text>
          </View>
          <View style={styles.routeMetaBadge}>
            <Ionicons name="wallet-outline" size={12} color="#D1D7DC" />
            <Text style={styles.routeMetaText}>{trip?.budgetLevel}</Text>
          </View>
          <View style={styles.routeMetaBadge}>
            <Ionicons name="checkmark-circle-outline" size={12} color={colors.sage} />
            <Text style={styles.routeMetaText}>{trip?.status}</Text>
          </View>
        </View>

        {/* Generate / Regenerate Button */}
        <TouchableOpacity
          style={styles.generateButton}
          onPress={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          activeOpacity={0.85}
        >
          {generateMutation.isPending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <View style={styles.btnInner}>
              <Ionicons name="refresh-outline" size={16} color={colors.white} style={{ marginRight: 6 }} />
              <Text style={styles.generateButtonText}>
                {days.length ? 'Regenerate itinerary' : 'Generate mindful itinerary'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>Journey bookings</Text>
        <Text style={styles.formSubtitle}>
          Save a hand-off you already booked elsewhere. Zentrip does not invent live tickets.
        </Text>
        {bookings.map((booking) => (
          <View key={booking.id} style={styles.activityCard}>
            <Text style={styles.activityPlace}>{booking.title}</Text>
            <Text style={styles.activityReason}>
              {booking.provider} · {booking.kind} · {booking.status}
            </Text>
          </View>
        ))}
        <TextInput
          style={styles.input}
          value={bookingTitle}
          onChangeText={setBookingTitle}
          placeholder="Delhi → Agra Shatabdi"
          placeholderTextColor={colors.inkSubtle}
        />
        <TextInput
          style={styles.input}
          value={bookingProvider}
          onChangeText={setBookingProvider}
          placeholder="Provider (IRCTC, RedBus, hotel)"
          placeholderTextColor={colors.inkSubtle}
        />
        <TouchableOpacity
          style={[styles.primaryButton, (!bookingTitle.trim() || bookingMutation.isPending) && styles.buttonDisabled]}
          onPress={() => bookingMutation.mutate()}
          disabled={!bookingTitle.trim() || bookingMutation.isPending}
        >
          <Text style={styles.primaryButtonText}>Add booking to timeline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={async () => {
            const timeline = timelineQuery.data;
            if (!timeline) return;
            const cachedAt = await saveOfflineTripPack(tripId, timeline);
            setOfflineSavedAt(cachedAt);
          }}
        >
          <Text style={styles.primaryButtonText}>
            {offlineSavedAt ? `Offline pack saved · ${new Date(offlineSavedAt).toLocaleString()}` : 'Download trip for offline'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={async () => {
            const pack = await getOfflineTripPack(tripId);
            if (pack) setOfflineSavedAt(pack.cachedAt);
          }}
        >
          <Text style={styles.primaryButtonText}>Check offline pack</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>Optional AI onboarding call</Text>
        <Text style={styles.formSubtitle}>
          {onboardingConfig.data?.ready
            ? 'Twilio is configured. The call is not recorded. Consent is required before we place it.'
            : `Not ready yet. Set ${onboardingConfig.data?.missing.join(', ') || 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, PUBLIC_BASE_URL'} on the API, then expose HTTPS via a tunnel so Twilio can reach the callbacks.`}
        </Text>
        <TextInput
          style={styles.input}
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          placeholder="+14155550123"
          keyboardType="phone-pad"
          placeholderTextColor={colors.inkSubtle}
        />
        <TouchableOpacity onPress={() => setCallConsent((value) => !value)}>
          <Text style={styles.formSubtitle}>{callConsent ? 'Consent given' : 'Tap to consent to an AI-placed call'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, (!callConsent || phoneNumber.trim().length < 8 || callMutation.isPending || onboardingConfig.data?.ready === false) && styles.buttonDisabled]}
          disabled={!callConsent || phoneNumber.trim().length < 8 || callMutation.isPending || onboardingConfig.data?.ready === false}
          onPress={() => callMutation.mutate()}
        >
          <Text style={styles.primaryButtonText}>
            {callMutation.isSuccess
              ? `Call ${callMutation.data.status}`
              : onboardingConfig.data?.ready === false
                ? 'Twilio not configured'
                : 'Request onboarding call'}
          </Text>
        </TouchableOpacity>
        {callMutation.isError ? (
          <Text style={styles.errorText}>
            {callMutation.error instanceof Error ? callMutation.error.message : 'Call could not be placed'}
          </Text>
        ) : null}
      </View>

      {generateMutation.isError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.errorText}>
            {generateMutation.error instanceof Error ? generateMutation.error.message : 'Generation failed'}
          </Text>
        </View>
      ) : null}

      {generateMutation.data && !generateMutation.data.groundedInKnowledgeBase ? (
        <View style={styles.warningBanner}>
          <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
          <Text style={styles.warningText}>
            Cities generated with baseline information. Seed knowledge base for deep historical citations.
          </Text>
        </View>
      ) : null}

      {/* Day by Day Cards */}
      <View style={styles.timelineList}>
        {days.map((day) => (
          <View key={day.day} style={styles.dayCard}>
            {/* Day Header */}
            <View style={styles.dayHeader}>
              <View style={styles.dayNumberPill}>
                <Text style={styles.dayNumberText}>DAY {day.day}</Text>
              </View>
              <Text style={styles.dayCity}>{day.city}</Text>
              <Text style={styles.dayDate}>{day.date}</Text>
            </View>

            {/* Activities Vertical Timeline */}
            <View style={styles.activityTimeline}>
              {day.activities.map((activity, i) => (
                <View key={i} style={styles.activityNode}>
                  <View style={styles.timeColumn}>
                    <Text style={styles.activityTime}>{activity.startTime}</Text>
                    <View style={styles.verticalTimelineLine} />
                  </View>

                  <View style={styles.activityCard}>
                    <View style={styles.activityTopline}>
                      <Text style={styles.activityPlace}>{activity.placeName}</Text>
                      <View style={styles.kbBadge}>
                        <Ionicons name="shield-checkmark" size={10} color={colors.sage} />
                        <Text style={styles.kbBadgeText}>VERIFIED</Text>
                      </View>
                    </View>
                    <Text style={styles.activityReason}>{activity.reason}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        {!days.length && !generateMutation.isPending ? (
          <View style={styles.emptyState}>
            <Ionicons name="sparkles-outline" size={32} color={colors.primary} />
            <Text style={styles.emptyTitle}>Ready to shape your days</Text>
            <Text style={styles.emptySubtitle}>
              Tap "Generate mindful itinerary" above to retrieve grounded stops for each corridor city.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function TripScreen() {
  const insets = useSafeAreaInsets();
  const activeTripId = useStore((s) => s.activeTripId);
  const setActiveTripId = useStore((s) => s.setActiveTripId);

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
        {!activeTripId ? (
          <NewTripForm onCreated={setActiveTripId} />
        ) : (
          <ItineraryView tripId={activeTripId} onStartOver={() => setActiveTripId(null)} />
        )}
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

  formCard: {
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
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
    alignSelf: 'flex-start',
  },
  badgeText: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  formTitle: {
    fontSize: typography.fontSize.display,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.4,
  },
  formSubtitle: {
    fontSize: typography.fontSize.body,
    color: colors.inkMuted,
    lineHeight: typography.lineHeight.body,
  },

  fieldSection: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  label: {
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: 0.2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundWarm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: typography.fontSize.body,
    color: colors.ink,
    height: '100%',
  },

  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  presetLabel: {
    fontSize: typography.fontSize.micro,
    color: colors.inkSubtle,
    fontWeight: '600',
  },
  presetChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
    backgroundColor: colors.cardWarm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  presetText: {
    fontSize: typography.fontSize.micro,
    color: colors.inkMuted,
  },
  presetTextActive: {
    fontSize: typography.fontSize.micro,
    color: colors.primary,
    fontWeight: '700',
  },

  dateRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  dateCol: {
    flex: 1,
    gap: spacing.xs,
  },

  budgetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  budgetCard: {
    width: '48%',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: 4,
  },
  budgetCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  budgetTopline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  budgetCardLabel: {
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
    color: colors.ink,
  },
  budgetCardLabelActive: {
    color: colors.primary,
  },
  budgetCardDesc: {
    fontSize: typography.fontSize.micro,
    color: colors.inkMuted,
    lineHeight: 14,
  },

  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    ...shadows.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: typography.fontSize.headline,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radii.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
    flex: 1,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningBg,
    padding: spacing.md,
    borderRadius: radii.sm,
  },
  warningText: {
    color: colors.warning,
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
    flex: 1,
  },

  itineraryContainer: {
    gap: spacing.lg,
  },
  routeHeaderCard: {
    backgroundColor: colors.ink,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadows.lg,
  },
  routeHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  routePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  routePillText: {
    color: colors.white,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1,
  },
  startOverText: {
    color: '#E8D2AA',
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  routeTitle: {
    color: colors.white,
    fontSize: typography.fontSize.display,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  routeMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  routeMetaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  routeMetaText: {
    color: '#D1D7DC',
    fontSize: typography.fontSize.micro,
    textTransform: 'capitalize',
  },
  generateButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  generateButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },

  timelineList: {
    gap: spacing.lg,
  },
  dayCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.sm,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: spacing.sm,
  },
  dayNumberPill: {
    backgroundColor: colors.sandLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  dayNumberText: {
    color: colors.goldDark,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1,
  },
  dayCity: {
    fontSize: typography.fontSize.headline,
    fontWeight: '800',
    color: colors.ink,
  },
  dayDate: {
    marginLeft: 'auto',
    fontSize: typography.fontSize.micro,
    color: colors.inkSubtle,
  },

  activityTimeline: {
    gap: spacing.md,
  },
  activityNode: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timeColumn: {
    width: 60,
    alignItems: 'flex-start',
  },
  activityTime: {
    fontSize: typography.fontSize.micro,
    fontWeight: '700',
    color: colors.primary,
  },
  verticalTimelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginLeft: 6,
    marginTop: 4,
  },
  activityCard: {
    flex: 1,
    backgroundColor: colors.cardWarm,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activityTopline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityPlace: {
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
    color: colors.ink,
  },
  kbBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.sageSoft,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  kbBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.sage,
  },
  activityReason: {
    fontSize: typography.fontSize.micro,
    color: colors.inkMuted,
    lineHeight: 16,
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: typography.fontSize.title2,
    fontWeight: '700',
    color: colors.ink,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.body,
    color: colors.inkMuted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: typography.lineHeight.body,
  },
});
