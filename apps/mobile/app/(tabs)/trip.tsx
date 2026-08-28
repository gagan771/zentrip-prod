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

import {
  addTripBooking,
  approveAdaptivePlan,
  createAdaptivePlan,
  createTrip,
  generateItinerary,
  getTripTimeline,
  listAdaptivePlans,
  recordPlanFeedback,
  updateTravelerProfile,
  type AdaptivePlan,
} from '../../lib/trips';
import { saveOfflineTripPack } from '../../lib/offline-trip';
import {
  prefillFromHop,
  prefillSearchParams,
  stayPrefillFromDay,
  type TripPrefill,
} from '../../lib/trip-prefill';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';
import { useStore } from '../../store/useStore';
import { useRouter } from 'expo-router';

function openExplore(router: ReturnType<typeof useRouter>, city: string, place?: string) {
  router.push({
    pathname: '/(tabs)/explore',
    params: place ? { city, q: place } : { city },
  });
}

function openGuide(router: ReturnType<typeof useRouter>, city: string, place?: string) {
  router.push({
    pathname: '/(tabs)/guide',
    params: place ? { city, place } : { city },
  });
}

function openCompareHop(router: ReturnType<typeof useRouter>, seed: TripPrefill) {
  router.push({
    pathname: '/(tabs)/compare',
    params: prefillSearchParams(seed),
  });
}

function openBookingHop(router: ReturnType<typeof useRouter>, seed: TripPrefill) {
  router.push({
    pathname: '/services/booking',
    params: prefillSearchParams(seed),
  });
}

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
  { id: 'gt', label: 'Golden Triangle', cities: 'Delhi, Agra, Jaipur' },
  { id: 'dv', label: 'Delhi–Varanasi', cities: 'Delhi, Varanasi' },
  { id: 'rj', label: 'Rajasthan loop', cities: 'Jaipur, Udaipur, Jodhpur' },
];

function formatLocalDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function NewTripForm({ onCreated }: { onCreated: (tripId: string) => void }) {
  const today = new Date();
  const [cities, setCities] = useState('Delhi, Agra, Jaipur');
  const [startDate, setStartDate] = useState(formatLocalDate(addDays(today, 14)));
  const [endDate, setEndDate] = useState(formatLocalDate(addDays(today, 20)));
  const [budgetLevel, setBudgetLevel] = useState<'backpacker' | 'comfort' | 'luxury' | 'mixed'>('backpacker');
  const [interests, setInterests] = useState('history, food');
  const [pace, setPace] = useState<'relaxed' | 'balanced' | 'packed'>('balanced');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      await updateTravelerProfile({
        interests: interests.split(',').map((item) => item.trim()).filter(Boolean),
        pace,
        transportPreferences: [],
        walkingTolerance: 'medium',
        wakeTime: '08:00',
        sleepTime: '22:30',
        travelParty: 'solo',
        accessibility: [],
        foodPreferences: [],
      });
      return createTrip({
        startDate,
        endDate,
        cities: cities
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        budgetLevel,
      });
    },
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
          {PRESET_CORRIDORS.map((preset) => (
            <TouchableOpacity
              key={preset.id}
              style={[styles.presetChip, cities === preset.cities && styles.presetChipActive]}
              onPress={() => setCities(preset.cities)}
            >
              <Text style={cities === preset.cities ? styles.presetTextActive : styles.presetText}>
                {preset.label}
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
              autoCapitalize="none"
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
              autoCapitalize="none"
            />
          </View>
        </View>
      </View>
      <View style={styles.presetRow}>
        <TouchableOpacity
          style={styles.presetChip}
          onPress={() => {
            const start = addDays(new Date(), 7);
            setStartDate(formatLocalDate(start));
            setEndDate(formatLocalDate(addDays(start, 6)));
          }}
        >
          <Text style={styles.presetText}>Next week · 7 days</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.presetChip}
          onPress={() => {
            const start = addDays(new Date(), 1);
            setStartDate(formatLocalDate(start));
            setEndDate(formatLocalDate(addDays(start, 3)));
          }}
        >
          <Text style={styles.presetText}>Tomorrow · 3 days</Text>
        </TouchableOpacity>
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

      <View style={styles.fieldSection}>
        <Text style={styles.label}>What kind of experience do you want?</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="sparkles-outline" size={18} color={colors.inkMuted} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            value={interests}
            onChangeText={setInterests}
            placeholder="history, food, nature"
            placeholderTextColor={colors.inkSubtle}
          />
        </View>
        <View style={styles.presetRow}>
          {(['relaxed', 'balanced', 'packed'] as const).map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.presetChip, pace === option && styles.presetChipActive]}
              onPress={() => setPace(option)}
            >
              <Text style={pace === option ? styles.presetTextActive : styles.presetText}>
                {option === 'relaxed' ? 'Relaxed' : option === 'packed' ? 'Packed' : 'Balanced'} pace
              </Text>
            </TouchableOpacity>
          ))}
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [bookingTitle, setBookingTitle] = useState('');
  const [bookingProvider, setBookingProvider] = useState('IRCTC');
  const [showAddBooking, setShowAddBooking] = useState(false);
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);

  const timelineQuery = useQuery({
    queryKey: ['tripTimeline', tripId],
    queryFn: () => getTripTimeline(tripId),
  });

  const plansQuery = useQuery({
    queryKey: ['adaptivePlans', tripId],
    queryFn: () => listAdaptivePlans(tripId),
  });

  const generateMutation = useMutation({
    mutationFn: () => generateItinerary(tripId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tripTimeline', tripId] });
    },
  });

  const adaptiveMutation = useMutation({
    mutationFn: () => createAdaptivePlan(tripId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adaptivePlans', tripId] });
      queryClient.invalidateQueries({ queryKey: ['tripTimeline', tripId] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (plan: AdaptivePlan) => approveAdaptivePlan(tripId, plan.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adaptivePlans', tripId] }),
  });

  const feedbackMutation = useMutation({
    mutationFn: (itemKey: string) => {
      if (!adaptivePlan) throw new Error('No adaptive plan loaded');
      return recordPlanFeedback(tripId, adaptivePlan.id, { itemKey, action: 'reject', reason: 'Not a fit for this traveler' });
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
      setShowAddBooking(false);
      queryClient.invalidateQueries({ queryKey: ['tripTimeline', tripId] });
    },
  });

  const trip = timelineQuery.data?.trip;
  const adaptivePlan = plansQuery.data?.[0];
  const days = adaptivePlan?.days ?? timelineQuery.data?.days ?? [];
  const bookings = timelineQuery.data?.bookings ?? [];

  if (timelineQuery.isLoading) {
    return (
      <View style={styles.emptyState}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.emptyTitle}>Loading your journey</Text>
        <Text style={styles.emptySubtitle}>Fetching itinerary and saved bookings…</Text>
      </View>
    );
  }

  if (timelineQuery.isError && !timelineQuery.data) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.error} />
        <Text style={styles.emptyTitle}>Could not load this trip</Text>
        <Text style={styles.emptySubtitle}>
          {timelineQuery.error instanceof Error ? timelineQuery.error.message : 'Check your connection and try again.'}
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => timelineQuery.refetch()}>
          <Text style={styles.primaryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
        <TouchableOpacity
          style={[styles.secondaryOutline, adaptiveMutation.isPending && styles.buttonDisabled]}
          onPress={() => adaptiveMutation.mutate()}
          disabled={adaptiveMutation.isPending}
          activeOpacity={0.85}
        >
          {adaptiveMutation.isPending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <View style={styles.btnInner}>
              <Ionicons name="sparkles-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.secondaryOutlineText}>
                {adaptivePlan ? 'Regenerate personalized draft' : 'Generate personalized draft'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {adaptivePlan ? (
        <View style={styles.formCard}>
          <View style={styles.routeHeaderTop}>
            <Text style={styles.label}>Personalized itinerary · v{adaptivePlan.version}</Text>
            <Text style={styles.routeMetaText}>{adaptivePlan.status.replaceAll('_', ' ')}</Text>
          </View>
          <Text style={styles.formSubtitle}>
            {adaptivePlan.validation.fallbackUsed
              ? 'Grounded fallback used. Review the plan before booking.'
              : 'Built from your preferences, published destination knowledge, and validated schedule rules.'}
          </Text>
          {adaptivePlan.status !== 'approved' ? (
            <TouchableOpacity
              style={[styles.primaryButton, approveMutation.isPending && styles.buttonDisabled]}
              onPress={() => approveMutation.mutate(adaptivePlan)}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Approve this itinerary</Text>}
            </TouchableOpacity>
          ) : (
            <View style={styles.kbBadge}>
              <Ionicons name="checkmark-circle" size={13} color={colors.sage} />
              <Text style={styles.kbBadgeText}>APPROVED FOR BOOKING</Text>
            </View>
          )}
        </View>
      ) : null}

      <View style={styles.formCard}>
        <Text style={styles.label}>Journey bookings</Text>
        <Text style={styles.formSubtitle}>
          Open official hotel, cab, and flight sites. Save a booking here only after you complete it there — search
          results are not bookings.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/services/booking')}
          activeOpacity={0.85}
        >
          <View style={styles.btnInner}>
            <Ionicons name="car-outline" size={16} color={colors.white} style={{ marginRight: 6 }} />
            <Text style={styles.primaryButtonText}>Book hotels, cabs & flights</Text>
          </View>
        </TouchableOpacity>
        {bookings.map((booking) => (
          <View key={booking.id} style={styles.activityCard}>
            <Text style={styles.activityPlace}>{booking.title}</Text>
            <Text style={styles.activityReason}>
              {booking.provider} · {booking.kind} · {booking.status}
            </Text>
          </View>
        ))}
        {!showAddBooking ? (
          <TouchableOpacity style={styles.secondaryOutline} onPress={() => setShowAddBooking(true)}>
            <Text style={styles.secondaryOutlineText}>Log a completed booking</Text>
          </TouchableOpacity>
        ) : (
          <>
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
              <Text style={styles.primaryButtonText}>Save to timeline</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAddBooking(false)}>
              <Text style={styles.startOverText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity
          style={styles.secondaryOutline}
          onPress={async () => {
            const timeline = timelineQuery.data;
            if (!timeline) return;
            const cachedAt = await saveOfflineTripPack(tripId, timeline);
            setOfflineSavedAt(cachedAt);
          }}
        >
          <Text style={styles.secondaryOutlineText}>
            {offlineSavedAt
              ? `Offline pack ready · ${new Date(offlineSavedAt).toLocaleString()}`
              : 'Download trip for offline'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.emergencyCard}>
        <Text style={styles.label}>Emergency (works offline)</Text>
        <Text style={styles.formSubtitle}>112 national emergency · 1363 tourist helpline</Text>
        <View style={styles.emergencyRow}>
          <TouchableOpacity style={styles.emergencyBtn} onPress={() => router.push('/(tabs)/guardian')}>
            <Text style={styles.emergencyBtnText}>Open Guardian</Text>
          </TouchableOpacity>
        </View>
      </View>

      {generateMutation.isError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.errorText}>
            {generateMutation.error instanceof Error ? generateMutation.error.message : 'Generation failed'}
          </Text>
        </View>
      ) : null}

      {adaptiveMutation.isError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.errorText}>
            {adaptiveMutation.error instanceof Error ? adaptiveMutation.error.message : 'Personalized planning failed'}
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
        {days.map((day, dayIndex) => {
          const hop = prefillFromHop(days, dayIndex, trip?.budgetLevel);
          const staySeed = hop ? null : stayPrefillFromDay(days, dayIndex, trip?.budgetLevel);
          return (
          <View key={day.day} style={styles.dayCard}>
            {/* Day Header */}
            <View style={styles.dayHeader}>
              <View style={styles.dayNumberPill}>
                <Text style={styles.dayNumberText}>DAY {day.day}</Text>
              </View>
              <Text style={styles.dayCity}>{day.city}</Text>
              <Text style={styles.dayDate}>{day.date}</Text>
            </View>
            <View style={styles.dayActions}>
              <TouchableOpacity
                style={styles.dayActionChip}
                onPress={() => openExplore(router, day.city)}
                activeOpacity={0.85}
              >
                <Ionicons name="sparkles-outline" size={13} color={colors.primary} />
                <Text style={styles.dayActionText}>Explore {day.city}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dayActionChip}
                onPress={() => openGuide(router, day.city)}
                activeOpacity={0.85}
              >
                <Ionicons name="camera-outline" size={13} color={colors.primary} />
                <Text style={styles.dayActionText}>Heritage Lens</Text>
              </TouchableOpacity>
              {hop ? (
                <>
                  <TouchableOpacity
                    style={styles.dayActionChip}
                    onPress={() => openCompareHop(router, hop)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="git-compare-outline" size={13} color={colors.primary} />
                    <Text style={styles.dayActionText}>
                      Compare {hop.origin} → {hop.destination}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dayActionChip}
                    onPress={() => openBookingHop(router, hop)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="open-outline" size={13} color={colors.primary} />
                    <Text style={styles.dayActionText}>Book this hop</Text>
                  </TouchableOpacity>
                </>
              ) : staySeed ? (
                <>
                  <TouchableOpacity
                    style={styles.dayActionChip}
                    onPress={() => openCompareHop(router, staySeed)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="bed-outline" size={13} color={colors.primary} />
                    <Text style={styles.dayActionText}>Compare stays in {day.city}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dayActionChip}
                    onPress={() => openBookingHop(router, staySeed)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="open-outline" size={13} color={colors.primary} />
                    <Text style={styles.dayActionText}>Book stays in {day.city}</Text>
                  </TouchableOpacity>
                </>
              ) : null}
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
                    <View style={styles.placeActions}>
                      <TouchableOpacity
                        style={styles.placeAction}
                        onPress={() => openExplore(router, day.city, activity.placeName)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="sparkles-outline" size={12} color={colors.primary} />
                        <Text style={styles.placeActionText}>Explore</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.placeAction}
                        onPress={() => openGuide(router, day.city, activity.placeName)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="camera-outline" size={12} color={colors.primary} />
                        <Text style={styles.placeActionText}>Open Lens</Text>
                      </TouchableOpacity>
                      {adaptivePlan ? (
                        <TouchableOpacity
                          style={styles.placeAction}
                          onPress={() => feedbackMutation.mutate(`${day.day}:${activity.placeId ?? activity.placeName}`)}
                          disabled={feedbackMutation.isPending}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="thumbs-down-outline" size={12} color={colors.primary} />
                          <Text style={styles.placeActionText}>Not for me</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
          );
        })}

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
    borderRadius: radii.xxl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
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
  secondaryOutline: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.cardWarm,
  },
  secondaryOutlineText: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  emergencyCard: {
    backgroundColor: colors.errorBg,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#E5B6AA',
    gap: spacing.sm,
  },
  emergencyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  emergencyBtn: {
    backgroundColor: colors.error,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  emergencyBtnText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: typography.fontSize.caption,
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
    flex: 1,
    paddingRight: spacing.xs,
  },
  dayActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  dayActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  dayActionText: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
  },
  placeActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  placeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  placeActionText: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
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
