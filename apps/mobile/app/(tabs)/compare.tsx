import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
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

import { API_BASE_URL } from '../../lib/api-client';
import {
  BudgetLevel,
  CompareResult,
  listCabPartners,
  recordCompareOutcome,
  searchCabs,
  searchCompare,
  searchStays,
  StayResult,
} from '../../lib/compare';
import { HandoffStrip } from '../../components/booking/BookingHandoffButton';
import { prefillFromSearchParams, prefillFromTrip, prefillSearchParams } from '../../lib/trip-prefill';
import { getTrip } from '../../lib/trips';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';
import { useStore } from '../../store/useStore';

const CITIES = ['Delhi', 'Agra', 'Jaipur'];
const BUDGETS: Array<{ id: BudgetLevel; label: string; icon: string }> = [
  { id: 'backpacker', label: 'Backpacker', icon: 'trail-sign-outline' },
  { id: 'comfort', label: 'Comfort', icon: 'bed-outline' },
  { id: 'luxury', label: 'Luxury', icon: 'sparkles-outline' },
  { id: 'mixed', label: 'Mixed', icon: 'swap-horizontal-outline' },
];
const STAY_STYLES = ['balanced', 'social', 'quiet', 'remote_work', 'trek', 'solo'];
const ROUTE_PRESETS = [
  { origin: 'Delhi', destination: 'Agra', label: 'Delhi → Agra' },
  { origin: 'Agra', destination: 'Jaipur', label: 'Agra → Jaipur' },
  { origin: 'Jaipur', destination: 'Delhi', label: 'Jaipur → Delhi' },
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

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function timeLabel(dateTime: string) {
  return dateTime.length >= 16 ? dateTime.slice(11, 16) : dateTime;
}

function durationLabel(minutes: number) {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}h ${mins}m`;
}

function getModeIcon(mode: string) {
  switch (mode?.toLowerCase()) {
    case 'train':
    case 'rail':
      return 'train-outline';
    case 'cab':
    case 'taxi':
    case 'car':
      return 'car-outline';
    case 'bus':
    case 'coach':
      return 'bus-outline';
    case 'flight':
    case 'air':
      return 'airplane-outline';
    default:
      return 'navigate-outline';
  }
}

function ResultCard({
  result,
  bookingParams,
}: {
  result: CompareResult;
  bookingParams: Record<string, string>;
}) {
  const router = useRouter();
  const outcomeMutation = useMutation({
    mutationFn: () => recordCompareOutcome(result.recommendationId, 'opened'),
  });

  const isRecommended = result.badges.includes('RECOMMENDED');
  const reliabilityPct = Math.round(result.reliabilityScore * 100);

  return (
    <View style={[styles.resultCard, isRecommended && styles.recommendedCard]}>
      <View style={styles.resultTopline}>
        <View style={styles.resultBadgeRow}>
          {result.badges.map((badge) => {
            const isRec = badge === 'RECOMMENDED';
            return (
              <View
                key={badge}
                style={[styles.badge, isRec ? styles.recommendedBadge : styles.neutralBadge]}
              >
                {isRec ? <Text style={styles.badgeStar}>✦</Text> : null}
                <Text style={isRec ? styles.recommendedBadgeText : styles.neutralBadgeText}>
                  {badge}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.modePill}>
          <Ionicons name={getModeIcon(result.mode) as any} size={13} color={colors.ink} />
          <Text style={styles.modeText}>{result.mode}</Text>
        </View>
      </View>

      <Text style={styles.provider}>{result.provider}</Text>
      <Text style={styles.demoEstimate}>Demo corridor estimate · confirm live before booking</Text>

      <View style={styles.routeRow}>
        <View style={styles.routeStation}>
          <Text style={styles.routeTime}>{timeLabel(result.departureAt)}</Text>
          <Text style={styles.routeCode}>{result.origin.toUpperCase()}</Text>
        </View>

        <View style={styles.routeLineWrap}>
          <Text style={styles.duration}>{durationLabel(result.durationMinutes)}</Text>
          <View style={styles.routeLine}>
            <View style={styles.routeLineDot} />
            <View style={styles.routeLineBar} />
            <Ionicons name={getModeIcon(result.mode) as any} size={12} color={colors.primary} />
            <View style={styles.routeLineBar} />
            <View style={styles.routeLineDot} />
          </View>
        </View>

        <View style={[styles.routeStation, styles.routeStationRight]}>
          <Text style={styles.routeTime}>{timeLabel(result.arrivalAt)}</Text>
          <Text style={styles.routeCode}>{result.destination.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.resultFooter}>
        <View>
          <View style={styles.priceRow}>
            <Text style={styles.price}>₹{result.totalPrice}</Text>
            <Text style={styles.pricePer}>total</Text>
          </View>
          <Text style={styles.fee}>includes ₹{result.fees} taxes & booking fees</Text>
        </View>

        <View style={styles.reliabilityBadge}>
          <Ionicons name="shield-checkmark" size={13} color={colors.sage} />
          <Text style={styles.reliabilityText}>{reliabilityPct}% est. reliability</Text>
        </View>
      </View>

      <View style={styles.explanationBox}>
        <Text style={styles.explanationKicker}>WHY ZENNY CHOSE THIS</Text>
        <Text style={styles.explanation}>{result.explanation}</Text>
      </View>

      <TouchableOpacity
        style={styles.bookCta}
        onPress={() => {
          outcomeMutation.mutate();
          router.push({ pathname: '/services/booking', params: bookingParams });
        }}
        activeOpacity={0.85}
      >
        <Text style={styles.bookCtaText}>Book live on provider sites</Text>
        <Ionicons name="open-outline" size={14} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

function FareGroup({
  title,
  results,
  bookingParams,
}: {
  title: string;
  results: CompareResult[];
  bookingParams: Record<string, string>;
}) {
  if (!results.length) return null;
  return (
    <View style={styles.stayGroup}>
      <View style={styles.stayGroupHeader}>
        <Text style={styles.stayGroupTitle}>{title}</Text>
        <Text style={styles.resultCount}>
          {results.length} option{results.length === 1 ? '' : 's'}
        </Text>
      </View>
      {results.map((result) => (
        <ResultCard key={result.recommendationId} result={result} bookingParams={bookingParams} />
      ))}
    </View>
  );
}

function StayCard({ result }: { result: StayResult }) {
  const isRecommended = result.badges.includes('RECOMMENDED');
  return (
    <View style={[styles.stayCard, isRecommended && styles.recommendedCard]}>
      <View style={styles.stayTopline}>
        <View style={styles.resultBadgeRow}>
          {result.badges.map((badge) => {
            const isRec = badge === 'RECOMMENDED';
            return (
              <View
                key={badge}
                style={[styles.badge, isRec ? styles.recommendedBadge : styles.neutralBadge]}
              >
                {isRec ? <Text style={styles.badgeStar}>✦</Text> : null}
                <Text style={isRec ? styles.recommendedBadgeText : styles.neutralBadgeText}>
                  {badge}
                </Text>
              </View>
            );
          })}
        </View>
        <View style={styles.stayTypePill}>
          <Ionicons
            name={result.stayType.toLowerCase() === 'hostel' ? 'people-outline' : 'bed-outline'}
            size={12}
            color={colors.ink}
          />
          <Text style={styles.stayType}>{result.stayType}</Text>
        </View>
      </View>
      <Text style={styles.provider}>{result.provider}</Text>
      <Text style={styles.demoEstimate}>Typical corridor estimate · confirm live before booking</Text>
      <View style={styles.stayScoreRow}>
        <Text style={styles.stayScore}>Stay Score {Math.round(result.score * 10)}/10</Text>
        <Text style={styles.reliabilityText}>{result.rating}/5 rating</Text>
      </View>
      <View style={styles.stayPriceRow}>
        <View>
          <View style={styles.priceRow}>
            <Text style={styles.price}>₹{result.pricePerNight}</Text>
            <Text style={styles.pricePer}>/night</Text>
          </View>
          <Text style={styles.fee}>
            ₹{result.totalPrice} total · {result.distanceToCenterKm} km to center
          </Text>
        </View>
      </View>
      <View style={styles.explanationBox}>
        <Text style={styles.explanationKicker}>WHY THIS FITS</Text>
        <Text style={styles.explanation}>{result.explanation}</Text>
      </View>
      {result.scoreBreakdown.slice(0, 4).map((item) => (
        <View key={item.key} style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{item.label}</Text>
          <Text style={styles.breakdownValue}>
            {item.score}/100 · {item.weight}%
          </Text>
        </View>
      ))}
      {result.contextSignals.map((signal) => (
        <Text key={signal} style={styles.contextSignal}>
          ✦ {signal}
        </Text>
      ))}
    </View>
  );
}

function StayGroup({ title, results }: { title: string; results: StayResult[] }) {
  if (!results.length) return null;
  return (
    <View style={styles.stayGroup}>
      <View style={styles.stayGroupHeader}>
        <Text style={styles.stayGroupTitle}>{title}</Text>
        <Text style={styles.resultCount}>
          {results.length} stay{results.length === 1 ? '' : 's'}
        </Text>
      </View>
      {results.map((result) => (
        <StayCard key={result.recommendationId} result={result} />
      ))}
    </View>
  );
}

export default function CompareScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    pickup?: string | string[];
    drop?: string | string[];
    tab?: string | string[];
  }>();
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const activeTripId = useStore((s) => s.activeTripId);
  const seededRef = useRef(false);
  const hopKeyRef = useRef<string | null>(null);
  const [origin, setOrigin] = useState('Delhi');
  const [destination, setDestination] = useState('Agra');
  const [departureDate, setDepartureDate] = useState(formatLocalDate(addDays(new Date(), 7)));
  const [budgetLevel, setBudgetLevel] = useState<BudgetLevel>('backpacker');
  const [stayCity, setStayCity] = useState('Jaipur');
  const [checkIn, setCheckIn] = useState(formatLocalDate(addDays(new Date(), 7)));
  const [checkOut, setCheckOut] = useState(formatLocalDate(addDays(new Date(), 9)));
  const [stayStyle, setStayStyle] = useState('balanced');
  const [tripPrefillLabel, setTripPrefillLabel] = useState<string | null>(null);
  const [prefillSource, setPrefillSource] = useState<'trip' | 'hop' | 'stay' | null>(null);
  const [pickup, setPickup] = useState('Current location');
  const [drop, setDrop] = useState('');

  const tripQuery = useQuery({
    queryKey: ['trip', activeTripId],
    queryFn: () => getTrip(activeTripId as string),
    enabled: Boolean(activeTripId) && user?.id !== 'guest',
  });

  function applySeed(seed: NonNullable<ReturnType<typeof prefillFromTrip>>) {
    seededRef.current = true;
    if (seed.source !== 'stay') {
      setOrigin(seed.origin);
      setDestination(seed.destination);
      setDepartureDate(seed.departureDate);
    }
    setStayCity(seed.stayCity);
    setCheckIn(seed.checkIn);
    setCheckOut(seed.checkOut);
    setBudgetLevel(seed.budgetLevel);
    setTripPrefillLabel(seed.label);
    setPrefillSource(seed.source);
    setDrop(seed.stayCity || seed.destination);
    setPickup('Current location');
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

  const searchMutation = useMutation({
    mutationFn: () => searchCompare({ origin, destination, departureDate, budgetLevel }),
  });
  const stayMutation = useMutation({
    mutationFn: () => searchStays({ city: stayCity, checkIn, checkOut, budgetLevel, travelerStyle: stayStyle, guests: 1 }),
  });
  const cabMutation = useMutation({
    mutationFn: () =>
      searchCabs({
        pickup: pickup.trim() || 'Current location',
        drop: (drop.trim() || destination).trim(),
        tripId: activeTripId ?? undefined,
      }),
  });
  const partnersQuery = useQuery({
    queryKey: ['cab-partners'],
    queryFn: listCabPartners,
    enabled: user?.id !== 'guest',
  });
  const cabAutostart = useRef(false);

  useEffect(() => {
    const nextPickup = firstParam(params.pickup);
    const nextDrop = firstParam(params.drop);
    if (nextPickup) setPickup(nextPickup);
    if (nextDrop) setDrop(nextDrop);
  }, [params.pickup, params.drop]);

  useEffect(() => {
    if (cabAutostart.current) return;
    if (firstParam(params.tab) !== 'cabs') return;
    const dest = (drop || destination).trim();
    if (dest.length < 2) return;
    cabAutostart.current = true;
    cabMutation.mutate();
  }, [cabMutation, destination, drop, params.tab]);

  function clearPrefillBanner() {
    setTripPrefillLabel(null);
    setPrefillSource(null);
  }

  function swapCities() {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
    clearPrefillBanner();
  }

  const bookingParams = prefillSearchParams({
    origin,
    destination,
    stayCity,
    departureDate,
    checkIn,
    checkOut,
    budgetLevel,
    label: tripPrefillLabel ?? `${origin} → ${destination}`,
    fromTrip: true,
    source: prefillSource ?? 'trip',
  });

  const isGuest = user?.id === 'guest';
  if (isGuest) {
    return (
      <View style={[styles.guestScreen, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.guestBadge}>
          <Ionicons name="git-compare-outline" size={14} color={colors.primary} />
          <Text style={styles.guestBadgeText}>DECISION ENGINE</Text>
        </View>
        <Text style={styles.guestTitle}>Compare is ready when you are</Text>
        <Text style={styles.guestBody}>
          Zentrip scores corridor transport with verified pricing, comfort, and transparent formulas. Sign in to
          save private recommendations.
        </Text>
        <TouchableOpacity
          style={styles.guestButton}
          onPress={() => {
            setUser(null);
            router.replace('/(auth)/login');
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.guestButtonText}>Sign In to Continue</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/(tabs)/explore')} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.inkMuted, fontWeight: '600', textAlign: 'center' }}>
            Keep exploring as guest
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

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
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <Ionicons name="git-compare-outline" size={12} color={colors.primary} />
            <Text style={styles.eyebrow}>TRANSPARENT DECISION ENGINE</Text>
          </View>
          <Text style={styles.title}>Find the better way</Text>
          <Text style={styles.subtitle}>
            Typical corridor ranking is a guide. Live trains, buses, flights, and stays open on IRCTC, RedBus, AbhiBus, Goibibo, MakeMyTrip, and other official sites — same handoff pattern as Blinkit and Zepto.
          </Text>
        </View>

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

        <View style={styles.formCard}>
          <View style={styles.badgeRow}>
            <Ionicons name="car-outline" size={12} color={colors.primary} />
            <Text style={styles.eyebrow}>GET THERE · LAST MILE</Text>
          </View>
          <Text style={styles.fieldLabel}>Pickup</Text>
          <TextInput
            style={styles.input}
            value={pickup}
            onChangeText={setPickup}
            placeholder="Current location"
            placeholderTextColor={colors.inkSubtle}
          />
          <Text style={styles.fieldLabel}>Drop</Text>
          <View style={styles.cityChips}>
            {CITIES.map((city) => (
              <TouchableOpacity
                key={`cab-${city}`}
                style={[styles.cityChip, drop === city && styles.cityChipActive]}
                onPress={() => setDrop(city)}
              >
                <Text style={drop === city ? styles.cityTextActive : styles.cityText}>{city}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={drop}
            onChangeText={setDrop}
            placeholder={destination || 'Today’s city or a monument'}
            placeholderTextColor={colors.inkSubtle}
          />
          {cabMutation.isError ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={14} color={colors.error} />
              <Text style={styles.errorText}>
                {cabMutation.error instanceof Error ? cabMutation.error.message : 'Cab search failed'}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.searchButton, cabMutation.isPending && styles.searchButtonDisabled]}
            onPress={() => cabMutation.mutate()}
            disabled={cabMutation.isPending}
            activeOpacity={0.85}
          >
            {cabMutation.isPending ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <View style={styles.btnInner}>
                <Ionicons name="navigate-outline" size={16} color={colors.white} style={{ marginRight: 6 }} />
                <Text style={styles.searchButtonText}>Open ride apps</Text>
              </View>
            )}
          </TouchableOpacity>
          {cabMutation.data ? (
            <View style={styles.cabResults}>
              <View style={styles.notice}>
                <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.noticeTitle}>
                    {cabMutation.data.isLive ? 'LIVE PARTNER QUOTES' : 'OFFICIAL APP HANDOFF'}
                  </Text>
                  <Text style={styles.noticeBody}>{cabMutation.data.message}</Text>
                </View>
              </View>
              <Text style={styles.cabHint}>{cabMutation.data.smartPickupHint}</Text>
              <HandoffStrip
                title="CABS"
                subtitle={`${cabMutation.data.pickup} → ${cabMutation.data.drop} · confirm fare on the app`}
                handoffs={cabMutation.data.handoffs ?? []}
                category="cab"
              />
            </View>
          ) : null}
          <TouchableOpacity
            style={styles.applyRow}
            onPress={() => void Linking.openURL(`${API_BASE_URL.replace(/\/$/, '')}/v1/compare/cabs/apply`)}
            activeOpacity={0.8}
          >
            <Ionicons name="briefcase-outline" size={16} color={colors.primary} />
            <Text style={styles.applyText}>Apply for live cab quotes (Ola, Uber, ONDC, Namma Yatri)</Text>
            <Ionicons name="open-outline" size={14} color={colors.primary} />
          </TouchableOpacity>
          {partnersQuery.data?.length ? (
            <View style={styles.partnerChips}>
              {partnersQuery.data.map((partner) => (
                <TouchableOpacity
                  key={partner.key}
                  style={styles.partnerChip}
                  onPress={() => void Linking.openURL(partner.applyUrl)}
                >
                  <Text style={styles.partnerChipText}>{partner.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.formCard}>
          <Text style={styles.fieldLabel}>Quick corridor routes</Text>
          <View style={styles.cityChips}>
            {ROUTE_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.label}
                style={[
                  styles.cityChip,
                  origin === preset.origin && destination === preset.destination && styles.cityChipActive,
                ]}
                onPress={() => {
                  setOrigin(preset.origin);
                  setDestination(preset.destination);
                  clearPrefillBanner();
                }}
              >
                <Text
                  style={
                    origin === preset.origin && destination === preset.destination
                      ? styles.cityTextActive
                      : styles.cityText
                  }
                >
                  {preset.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.routePickersRow}>
            <View style={styles.routeSide}>
              <Text style={styles.fieldLabel}>Origin</Text>
              <View style={styles.cityChips}>
                {CITIES.map((city) => (
                  <TouchableOpacity
                    key={city}
                    style={[styles.cityChip, origin === city && styles.cityChipActive]}
                    onPress={() => {
                      setOrigin(city);
                      clearPrefillBanner();
                    }}
                  >
                    <Text style={origin === city ? styles.cityTextActive : styles.cityText}>{city}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.input}
                value={origin}
                onChangeText={setOrigin}
                placeholder="Any Indian city"
                placeholderTextColor={colors.inkSubtle}
              />
            </View>

            <TouchableOpacity style={styles.swapBtn} onPress={swapCities} activeOpacity={0.8}>
              <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
            </TouchableOpacity>

            <View style={styles.routeSide}>
              <Text style={styles.fieldLabel}>Destination</Text>
              <View style={styles.cityChips}>
                {CITIES.map((city) => (
                  <TouchableOpacity
                    key={city}
                    style={[styles.cityChip, destination === city && styles.cityChipActive]}
                    onPress={() => {
                      setDestination(city);
                      clearPrefillBanner();
                    }}
                  >
                    <Text style={destination === city ? styles.cityTextActive : styles.cityText}>{city}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.input}
                value={destination}
                onChangeText={setDestination}
                placeholder="Any Indian city"
                placeholderTextColor={colors.inkSubtle}
              />
            </View>
          </View>

          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>Departure date</Text>
            <View style={styles.cityChips}>
              {[
                { label: 'Tomorrow', days: 1 },
                { label: 'In 3 days', days: 3 },
                { label: 'Next week', days: 7 },
              ].map((chip) => (
                <TouchableOpacity
                  key={chip.label}
                  style={styles.cityChip}
                  onPress={() => setDepartureDate(formatLocalDate(addDays(new Date(), chip.days)))}
                >
                  <Text style={styles.cityText}>{chip.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.inputWrapper}>
              <Ionicons name="calendar-outline" size={16} color={colors.inkMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={departureDate}
                onChangeText={setDepartureDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.inkSubtle}
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>Travel style</Text>
            <View style={styles.budgetRow}>
              {BUDGETS.map((budget) => {
                const active = budgetLevel === budget.id;
                return (
                  <TouchableOpacity
                    key={budget.id}
                    style={[styles.budgetChip, active && styles.budgetChipActive]}
                    onPress={() => setBudgetLevel(budget.id)}
                  >
                    <Ionicons
                      name={budget.icon as any}
                      size={13}
                      color={active ? colors.white : colors.inkMuted}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={active ? styles.budgetTextActive : styles.budgetText}>{budget.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {origin === destination ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={14} color={colors.error} />
              <Text style={styles.errorText}>Please select two different cities.</Text>
            </View>
          ) : null}

          {searchMutation.isError ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={14} color={colors.error} />
              <Text style={styles.errorText}>
                {searchMutation.error instanceof Error ? searchMutation.error.message : 'Comparison failed'}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.searchButton,
              (origin === destination || searchMutation.isPending) && styles.searchButtonDisabled,
            ]}
            onPress={() => searchMutation.mutate()}
            disabled={origin === destination || searchMutation.isPending}
            activeOpacity={0.85}
          >
            {searchMutation.isPending ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <View style={styles.btnInner}>
                <Ionicons name="sparkles" size={16} color={colors.white} style={{ marginRight: 6 }} />
                <Text style={styles.searchButtonText}>Compare Travel Options</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {!searchMutation.data && !searchMutation.isPending ? (
          <View style={styles.empty}>
            <Ionicons name="map-outline" size={32} color={colors.inkSubtle} />
            <Text style={styles.emptyText}>
              Try Delhi → Agra for the classic Golden Triangle hop. Results are demo estimates — book live on IRCTC or
              RedBus below after you compare.
            </Text>
          </View>
        ) : null}

        {searchMutation.data ? (
          <View style={styles.resultsContainer}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>Ranked choices</Text>
              <Text style={styles.resultCount}>
                {searchMutation.data.results.length} option{searchMutation.data.results.length === 1 ? '' : 's'}
              </Text>
            </View>

            <View style={styles.notice}>
              <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.noticeTitle}>TYPICAL CORRIDOR RANKING</Text>
                <Text style={styles.noticeBody}>{searchMutation.data.message}</Text>
              </View>
            </View>

            {searchMutation.data.results.length ? (
              <>
                <FareGroup
                  title="Recommended"
                  results={searchMutation.data.results.filter((row) => row.badges.includes('RECOMMENDED'))}
                  bookingParams={bookingParams}
                />
                <FareGroup
                  title="Other corridor options"
                  results={searchMutation.data.results.filter((row) => !row.badges.includes('RECOMMENDED'))}
                  bookingParams={bookingParams}
                />
              </>
            ) : (
              <View style={styles.empty}>
                <Ionicons name="train-outline" size={32} color={colors.inkSubtle} />
                <Text style={styles.emptyText}>No verified options for this route yet.</Text>
              </View>
            )}

            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>Book live on provider sites</Text>
              <Text style={styles.resultCount}>After ranked fares</Text>
            </View>
            <Text style={styles.subtitle}>
              Provider tiles sit below ranked fares so they do not compete with price rows. You pay them, not Zentrip.
            </Text>
            <HandoffStrip
              title="TRAINS"
              subtitle="Official sites, not Zentrip bookings."
              handoffs={searchMutation.data.handoffs ?? []}
              category="train"
            />
            <HandoffStrip
              title="BUSES"
              subtitle="Official sites, not Zentrip bookings."
              handoffs={searchMutation.data.handoffs ?? []}
              category="bus"
            />
            <HandoffStrip
              title="FLIGHTS"
              subtitle="Official sites, not Zentrip bookings."
              handoffs={searchMutation.data.handoffs ?? []}
              category="flight"
            />
            <HandoffStrip
              title="CABS"
              subtitle="Official sites, not Zentrip bookings."
              handoffs={searchMutation.data.handoffs ?? []}
              category="cab"
            />
          </View>
        ) : null}

        <View style={styles.staySection}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>Stays · hostels & hotels</Text>
            <Text style={styles.resultCount}>Separate from fares</Text>
          </View>
          <Text style={styles.subtitle}>
            Ranked by Stay Score for atmosphere, quietness, work fit, trek access, and solo travel — not mixed into train rows.
          </Text>

          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>City</Text>
            <View style={styles.stayCityRow}>
              {CITIES.map((city) => (
                <TouchableOpacity
                  key={city}
                  style={[styles.cityChip, stayCity === city && styles.cityChipActive]}
                  onPress={() => setStayCity(city)}
                >
                  <Text style={stayCity === city ? styles.cityTextActive : styles.cityText}>{city}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={stayCity}
              onChangeText={setStayCity}
              placeholder="Any Indian city"
              placeholderTextColor={colors.inkSubtle}
            />

            <Text style={styles.fieldLabel}>Stay preference</Text>
            <View style={styles.budgetRow}>
              {STAY_STYLES.map((style) => (
                <TouchableOpacity
                  key={style}
                  style={[styles.budgetChip, stayStyle === style && styles.budgetChipActive]}
                  onPress={() => setStayStyle(style)}
                >
                  <Text style={stayStyle === style ? styles.budgetTextActive : styles.budgetText}>
                    {style.replaceAll('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Dates</Text>
            <View style={styles.cityChips}>
              {[
                { label: 'Tonight · 2 nights', start: 0, nights: 2 },
                { label: 'In 3 days', start: 3, nights: 2 },
                { label: 'Next week', start: 7, nights: 2 },
              ].map((chip) => (
                <TouchableOpacity
                  key={chip.label}
                  style={styles.cityChip}
                  onPress={() => {
                    const start = addDays(new Date(), chip.start);
                    setCheckIn(formatLocalDate(start));
                    setCheckOut(formatLocalDate(addDays(start, chip.nights)));
                  }}
                >
                  <Text style={styles.cityText}>{chip.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.stayDateRow}>
              <TextInput
                style={styles.stayDateInput}
                value={checkIn}
                onChangeText={setCheckIn}
                placeholder="Check-in YYYY-MM-DD"
                placeholderTextColor={colors.inkSubtle}
              />
              <TextInput
                style={styles.stayDateInput}
                value={checkOut}
                onChangeText={setCheckOut}
                placeholder="Check-out YYYY-MM-DD"
                placeholderTextColor={colors.inkSubtle}
              />
            </View>

            {checkOut <= checkIn ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={14} color={colors.error} />
                <Text style={styles.errorText}>Check-out must be after check-in.</Text>
              </View>
            ) : null}

            {stayMutation.isError ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={14} color={colors.error} />
                <Text style={styles.errorText}>
                  {stayMutation.error instanceof Error ? stayMutation.error.message : 'Stay search failed'}
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.staySearchButton,
                (stayMutation.isPending || checkOut <= checkIn) && styles.searchButtonDisabled,
              ]}
              onPress={() => stayMutation.mutate()}
              disabled={stayMutation.isPending || checkOut <= checkIn}
              activeOpacity={0.85}
            >
              {stayMutation.isPending ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <View style={styles.btnInner}>
                  <Ionicons name="bed-outline" size={16} color={colors.white} style={{ marginRight: 6 }} />
                  <Text style={styles.searchButtonText}>Search stays</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {stayMutation.isPending && !stayMutation.data ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.emptyText}>Ranking hostels and hotels for {stayCity}…</Text>
            </View>
          ) : null}

          {!stayMutation.data && !stayMutation.isPending && !stayMutation.isError ? (
            <View style={styles.empty}>
              <Ionicons name="bed-outline" size={32} color={colors.inkSubtle} />
              <Text style={styles.emptyText}>
                Search a corridor city to rank stays. Results are typical estimates — live rooms open on MakeMyTrip,
                Goibibo, Booking.com, or Airbnb after you scan the list.
              </Text>
            </View>
          ) : null}

          {stayMutation.data ? (
            <View style={styles.stayResults}>
              <View style={styles.notice}>
                <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.noticeTitle}>TYPICAL STAY ESTIMATES</Text>
                  <Text style={styles.noticeBody}>{stayMutation.data.message}</Text>
                </View>
              </View>

              {!stayMutation.data.results.length ? (
                <View style={styles.empty}>
                  <Ionicons name="bed-outline" size={32} color={colors.inkSubtle} />
                  <Text style={styles.emptyText}>
                    No ranked stays for {stayCity} yet. Corridor demo coverage is Delhi, Agra, and Jaipur.
                  </Text>
                </View>
              ) : (
                <>
                  <StayGroup
                    title="Recommended first"
                    results={stayMutation.data.results.filter((row) => row.badges.includes('RECOMMENDED'))}
                  />
                  <StayGroup
                    title="Hostels"
                    results={stayMutation.data.results.filter(
                      (row) =>
                        !row.badges.includes('RECOMMENDED') && row.stayType.toLowerCase() === 'hostel',
                    )}
                  />
                  <StayGroup
                    title="Hotels"
                    results={stayMutation.data.results.filter(
                      (row) =>
                        !row.badges.includes('RECOMMENDED') && row.stayType.toLowerCase() !== 'hostel',
                    )}
                  />
                </>
              )}

              <HandoffStrip
                title="BOOK LIVE — AFTER YOU SCAN"
                subtitle="Provider sites, not Zentrip bookings. These tiles sit below the ranked stays so they do not compete with price rows."
                handoffs={stayMutation.data.handoffs ?? []}
                category="stay"
              />
            </View>
          ) : null}
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
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadows.md,
  },
  cabResults: {
    gap: spacing.md,
  },
  cabHint: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
    lineHeight: typography.lineHeight.body,
  },
  applyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  applyText: {
    flex: 1,
    color: colors.primary,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  partnerChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  partnerChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.cardSubtle,
  },
  partnerChipText: {
    color: colors.ink,
    fontSize: typography.fontSize.micro,
    fontWeight: '700',
  },
  routePickersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  routeSide: {
    flex: 1,
    gap: 4,
  },
  swapBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  cityChips: {
    gap: 4,
  },
  cityChip: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.cardWarm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cityChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  cityText: {
    color: colors.ink,
    fontSize: typography.fontSize.micro,
    fontWeight: '600',
  },
  cityTextActive: {
    color: colors.white,
    fontSize: typography.fontSize.micro,
    fontWeight: '700',
  },

  fieldSection: {
    gap: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundWarm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 46,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: typography.fontSize.body,
    color: colors.ink,
  },

  budgetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  budgetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.cardWarm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  budgetChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  budgetText: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
  },
  budgetTextActive: {
    color: colors.white,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },

  searchButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    ...shadows.sm,
  },
  searchButtonDisabled: {
    opacity: 0.5,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.body,
    fontWeight: '700',
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.errorBg,
    padding: spacing.sm,
    borderRadius: radii.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.fontSize.micro,
    fontWeight: '600',
  },

  resultsContainer: {
    gap: spacing.md,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  resultTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.title2,
    fontWeight: '800',
  },
  resultCount: {
    color: colors.inkSubtle,
    fontSize: typography.fontSize.caption,
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.cardWarm,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeTitle: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  noticeBody: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
    lineHeight: 15,
    marginTop: 2,
  },

  resultCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.sm,
  },
  recommendedCard: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  resultTopline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recommendedBadge: {
    backgroundColor: colors.sageSoft,
  },
  neutralBadge: {
    backgroundColor: colors.sandLight,
  },
  badgeStar: {
    fontSize: 9,
    color: colors.sage,
  },
  recommendedBadgeText: {
    color: colors.sage,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  neutralBadgeText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.cardWarm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  modeText: {
    color: colors.ink,
    fontSize: typography.fontSize.micro,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  provider: {
    color: colors.ink,
    fontSize: typography.fontSize.title2,
    fontWeight: '800',
  },

  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routeStation: {
    alignItems: 'flex-start',
    width: 70,
  },
  routeStationRight: {
    alignItems: 'flex-end',
  },
  routeTime: {
    color: colors.ink,
    fontSize: typography.fontSize.title1,
    fontWeight: '800',
  },
  routeCode: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
  },
  routeLineWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: 4,
  },
  duration: {
    color: colors.inkSubtle,
    fontSize: typography.fontSize.micro,
    fontWeight: '600',
  },
  routeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 4,
  },
  routeLineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  routeLineBar: {
    flex: 1,
    height: 1.5,
    backgroundColor: colors.borderDark,
  },

  resultFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  price: {
    color: colors.ink,
    fontSize: typography.fontSize.display,
    fontWeight: '800',
  },
  pricePer: {
    color: colors.inkSubtle,
    fontSize: typography.fontSize.micro,
  },
  fee: {
    color: colors.inkSubtle,
    fontSize: typography.fontSize.micro,
    marginTop: 2,
  },
  reliabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.sageSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  reliabilityText: {
    color: colors.sage,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },

  explanationBox: {
    backgroundColor: colors.cardWarm,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 4,
  },
  demoEstimate: {
    color: colors.inkSubtle,
    fontSize: typography.fontSize.micro,
    fontWeight: '600',
    marginTop: -4,
  },
  bookCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 12,
    marginTop: 4,
  },
  bookCtaText: {
    color: colors.white,
    fontSize: typography.fontSize.caption,
    fontWeight: '800',
  },
  explanationKicker: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  explanation: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
    lineHeight: 16,
  },

  staySection: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  stayCityRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  stayDateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stayDateInput: {
    flex: 1,
    backgroundColor: colors.backgroundWarm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    height: 44,
    color: colors.ink,
    fontSize: typography.fontSize.micro,
  },
  staySearchButton: {
    backgroundColor: colors.sage,
    borderRadius: radii.md,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    ...shadows.sm,
  },
  stayResults: {
    gap: spacing.md,
  },
  stayGroup: {
    gap: spacing.sm,
  },
  stayGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  stayGroupTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.headline,
    fontWeight: '800',
  },
  stayCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.sm,
  },
  stayTopline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stayTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.cardWarm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  stayType: {
    color: colors.ink,
    fontSize: typography.fontSize.micro,
    textTransform: 'capitalize',
    fontWeight: '700',
  },
  stayScoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stayScore: {
    color: colors.sage,
    fontSize: typography.fontSize.title2,
    fontWeight: '800',
  },
  stayPriceRow: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
    gap: 2,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  breakdownLabel: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
  },
  breakdownValue: {
    color: colors.inkSubtle,
    fontSize: 9,
  },
  contextSignal: {
    color: colors.sage,
    fontSize: typography.fontSize.micro,
    lineHeight: 16,
  },

  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.body,
  },

  guestScreen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  guestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  guestBadgeText: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  guestTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.hero,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  guestBody: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
  },
  guestButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  guestButtonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: typography.fontSize.body,
  },
});
