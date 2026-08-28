import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HandoffStrip } from '../../../components/booking/BookingHandoffButton';
import { MonumentTicketsStrip } from '../../../components/booking/MonumentTicketsStrip';
import { BOOKING_SECTIONS, catalogHandoffs } from '../../../lib/booking-catalog';
import { listStayHandoffs, listTransportHandoffs, type ProviderHandoff } from '../../../lib/compare';
import { prefillFromSearchParams, prefillFromTrip } from '../../../lib/trip-prefill';
import { getTrip } from '../../../lib/trips';
import { colors, radii, shadows, spacing, typography } from '../../../lib/theme';
import { useStore } from '../../../store/useStore';

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function mergeHandoffs(live: ProviderHandoff[], fallback: ReturnType<typeof catalogHandoffs>) {
  if (!live.length) return fallback;
  const byKey = new Map(live.map((item) => [item.key, item]));
  return fallback.map((item) => byKey.get(item.key) ?? item);
}

export default function BookingHandoffScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    origin?: string | string[];
    destination?: string | string[];
    stayCity?: string | string[];
    departureDate?: string | string[];
    checkIn?: string | string[];
    checkOut?: string | string[];
    budgetLevel?: string | string[];
    prefill?: string | string[];
    source?: string | string[];
  }>();
  const activeTripId = useStore((s) => s.activeTripId);
  const seededRef = useRef(false);
  const hopKeyRef = useRef<string | null>(null);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  }, []);
  const [origin, setOrigin] = useState('Delhi');
  const [destination, setDestination] = useState('Agra');
  const [departureDate, setDepartureDate] = useState(() => formatDate(today));
  const [checkIn, setCheckIn] = useState(() => formatDate(today));
  const [checkOut, setCheckOut] = useState(() => formatDate(addDays(today, 2)));
  const [city, setCity] = useState('Jaipur');
  const [transport, setTransport] = useState<ProviderHandoff[]>([]);
  const [stays, setStays] = useState<ProviderHandoff[]>([]);
  const [activeChip, setActiveChip] = useState<'today' | 'tomorrow' | 'plus3' | 'trip'>('today');
  const [tripPrefillLabel, setTripPrefillLabel] = useState<string | null>(null);
  const [prefillSource, setPrefillSource] = useState<'trip' | 'hop' | 'stay' | null>(null);

  const fallback = useMemo(() => catalogHandoffs(), []);

  const tripQuery = useQuery({
    queryKey: ['trip', activeTripId],
    queryFn: () => getTrip(activeTripId as string),
    enabled: Boolean(activeTripId),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const [nextTransport, nextStays] = await Promise.all([
        origin.trim() && destination.trim() && origin.trim().toLowerCase() !== destination.trim().toLowerCase()
          ? listTransportHandoffs({ origin, destination, departureDate })
          : Promise.resolve([] as ProviderHandoff[]),
        listStayHandoffs({ city, checkIn, checkOut }),
      ]);
      return { nextTransport, nextStays };
    },
    onSuccess: (data) => {
      setTransport(data.nextTransport);
      setStays(data.nextStays);
    },
  });

  function applySeed(seed: NonNullable<ReturnType<typeof prefillFromTrip>>) {
    seededRef.current = true;
    if (seed.source !== 'stay') {
      setOrigin(seed.origin);
      setDestination(seed.destination);
      setDepartureDate(seed.departureDate);
    }
    setCity(seed.stayCity);
    setCheckIn(seed.checkIn);
    setCheckOut(seed.checkOut);
    setActiveChip('trip');
    setTripPrefillLabel(seed.label);
    setPrefillSource(seed.source);
  }

  useEffect(() => {
    const seed = prefillFromSearchParams(params);
    if (!seed) return;
    const key = `${seed.source}:${seed.origin}:${seed.destination}:${seed.stayCity}:${seed.departureDate}`;
    if (hopKeyRef.current === key) return;
    hopKeyRef.current = key;
    applySeed(seed);
  }, [params]);

  useEffect(() => {
    if (seededRef.current || !tripQuery.data) return;
    const seed = prefillFromTrip(tripQuery.data);
    if (!seed) return;
    applySeed(seed);
  }, [tripQuery.data]);

  useEffect(() => {
    mutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After trip prefill lands once, refresh provider deep-links with seeded cities/dates.
  useEffect(() => {
    if (!tripPrefillLabel || !seededRef.current) return;
    mutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripPrefillLabel]);

  function applyDateChip(chip: 'today' | 'tomorrow' | 'plus3') {
    const offset = chip === 'today' ? 0 : chip === 'tomorrow' ? 1 : 3;
    const departure = addDays(today, offset);
    const stayOut = addDays(departure, 2);
    setActiveChip(chip);
    setTripPrefillLabel(null);
    setPrefillSource(null);
    setDepartureDate(formatDate(departure));
    setCheckIn(formatDate(departure));
    setCheckOut(formatDate(stayOut));
  }

  const all = mergeHandoffs([...transport, ...stays], fallback);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.badgeRow}>
          <Ionicons name="open-outline" size={12} color={colors.primary} />
          <Text style={styles.eyebrow}>BOOK LIVE</Text>
        </View>
        <Text style={styles.title}>Hotels, cabs & flights</Text>
        <Text style={styles.subtitle}>
          Tap a company logo to open its official site. You pay them, not Zentrip.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {activeTripId && tripQuery.isLoading ? (
          <View style={styles.prefillBanner}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.prefillText}>Loading your trip to prefill cities…</Text>
          </View>
        ) : null}
        {tripPrefillLabel ? (
          <View style={styles.prefillBanner}>
            <Ionicons name="map-outline" size={14} color={colors.primary} />
            <Text style={styles.prefillText}>
              {prefillSource === 'hop'
                ? `This hop · ${tripPrefillLabel}`
                : prefillSource === 'stay'
                  ? `This city · ${tripPrefillLabel}`
                  : `Prefilling from your trip · ${tripPrefillLabel}`}
            </Text>
          </View>
        ) : null}

        <View style={styles.searchCard}>
          <Text style={styles.searchTitle}>Trip details</Text>
          <Text style={styles.label}>Quick dates</Text>
          <View style={styles.chipRow}>
            {(
              [
                { id: 'today' as const, label: 'Today' },
                { id: 'tomorrow' as const, label: 'Tomorrow' },
                { id: 'plus3' as const, label: '+3 days' },
              ]
            ).map((chip) => {
              const active = activeChip === chip.id;
              return (
                <TouchableOpacity
                  key={chip.id}
                  style={[styles.dateChip, active && styles.dateChipActive]}
                  onPress={() => applyDateChip(chip.id)}
                  activeOpacity={0.85}
                >
                  <Text style={active ? styles.dateChipTextActive : styles.dateChipText}>{chip.label}</Text>
                </TouchableOpacity>
              );
            })}
            {activeChip === 'trip' ? (
              <View style={[styles.dateChip, styles.dateChipActive]}>
                <Text style={styles.dateChipTextActive}>
                  {prefillSource === 'hop' ? 'This hop' : prefillSource === 'stay' ? 'This city' : 'From trip'}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.label}>From / to</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={origin}
              onChangeText={(value) => {
                setOrigin(value);
                setTripPrefillLabel(null);
                setPrefillSource(null);
              }}
              placeholder="Origin"
              placeholderTextColor={colors.inkSubtle}
            />
            <TextInput
              style={styles.input}
              value={destination}
              onChangeText={(value) => {
                setDestination(value);
                setTripPrefillLabel(null);
                setPrefillSource(null);
              }}
              placeholder="Destination"
              placeholderTextColor={colors.inkSubtle}
            />
          </View>
          <TextInput
            style={styles.input}
            value={departureDate}
            onChangeText={(value) => {
              setDepartureDate(value);
              setActiveChip('today');
              setTripPrefillLabel(null);
              setPrefillSource(null);
            }}
            placeholder="Travel date YYYY-MM-DD"
            placeholderTextColor={colors.inkSubtle}
          />
          <Text style={styles.label}>Hotel city</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={(value) => {
              setCity(value);
              setTripPrefillLabel(null);
              setPrefillSource(null);
            }}
            placeholder="City"
            placeholderTextColor={colors.inkSubtle}
          />
          <View style={styles.row}>
            <TextInput style={styles.input} value={checkIn} onChangeText={setCheckIn} placeholder="Check-in" placeholderTextColor={colors.inkSubtle} />
            <TextInput style={styles.input} value={checkOut} onChangeText={setCheckOut} placeholder="Check-out" placeholderTextColor={colors.inkSubtle} />
          </View>
          <TouchableOpacity style={styles.primary} onPress={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryText}>Update search on provider sites</Text>
            )}
          </TouchableOpacity>
          {mutation.isError ? (
            <Text style={styles.error}>Could not pre-fill search. Logos still open the official homepages.</Text>
          ) : null}
        </View>

        {mutation.isPending && !all.length ? (
          <View style={styles.loadingStrip}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.prefillText}>Loading provider logos…</Text>
          </View>
        ) : null}

        {BOOKING_SECTIONS.map((section) => (
          <HandoffStrip
            key={section.id}
            title={section.title}
            subtitle={section.subtitle}
            icon={section.icon}
            handoffs={all}
            categories={section.categories}
          />
        ))}
        <MonumentTicketsStrip city={city} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 4,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
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
  eyebrow: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  title: {
    color: colors.ink,
    fontSize: typography.fontSize.hero,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.body,
    lineHeight: 21,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 48,
    gap: 16,
  },
  prefillBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  prefillText: {
    color: colors.primary,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
    flex: 1,
  },
  loadingStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  searchCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 10,
    ...shadows.sm,
  },
  searchTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.headline,
    fontWeight: '800',
  },
  label: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  dateChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.full,
    backgroundColor: colors.cardWarm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dateChipText: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
  },
  dateChipTextActive: {
    color: colors.white,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.sandSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    height: 44,
    color: colors.ink,
  },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryText: { color: colors.white, fontWeight: '800' },
  error: { color: colors.error, fontSize: 13, lineHeight: 18 },
});
