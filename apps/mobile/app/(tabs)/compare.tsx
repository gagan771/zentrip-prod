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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BudgetLevel, CompareResult, recordCompareOutcome, searchCompare, searchStays, StayResult } from '../../lib/compare';
import { HandoffStrip } from '../../components/booking/BookingHandoffButton';
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

function ResultCard({ result }: { result: CompareResult }) {
  const outcomeMutation = useMutation({
    mutationFn: () => recordCompareOutcome(result.recommendationId, 'opened'),
  });

  const isRecommended = result.badges.includes('RECOMMENDED');
  const reliabilityPct = Math.round(result.reliabilityScore * 100);

  return (
    <TouchableOpacity
      style={[styles.resultCard, isRecommended && styles.recommendedCard]}
      onPress={() => outcomeMutation.mutate()}
      activeOpacity={0.88}
    >
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
          <Text style={styles.reliabilityText}>{reliabilityPct}% reliability</Text>
        </View>
      </View>

      <View style={styles.explanationBox}>
        <Text style={styles.explanationKicker}>WHY ZENNY CHOSE THIS</Text>
        <Text style={styles.explanation}>{result.explanation}</Text>
      </View>
    </TouchableOpacity>
  );
}

function StayCard({ result }: { result: StayResult }) {
  return (
    <View style={styles.stayCard}>
      <View style={styles.stayTopline}>
        <View style={styles.resultBadgeRow}>
          {result.badges.map((badge) => <Text key={badge} style={styles.stayBadge}>{badge}</Text>)}
        </View>
        <Text style={styles.stayType}>{result.stayType}</Text>
      </View>
      <Text style={styles.provider}>{result.provider}</Text>
      <View style={styles.stayScoreRow}>
        <Text style={styles.stayScore}>Stay Score {Math.round(result.score * 10)}/10</Text>
        <Text style={styles.reliabilityText}>{result.rating}/5 rating</Text>
      </View>
      <Text style={styles.explanation}>{result.explanation}</Text>
      <View style={styles.stayPriceRow}>
        <Text style={styles.price}>₹{result.pricePerNight}/night</Text>
        <Text style={styles.fee}>₹{result.totalPrice} total · {result.distanceToCenterKm} km to center</Text>
      </View>
      <View style={styles.breakdown}>
        <Text style={styles.breakdownTitle}>WHY THIS FITS</Text>
        {result.scoreBreakdown.slice(0, 5).map((item) => (
          <View key={item.key} style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>{item.label}</Text>
            <Text style={styles.breakdownValue}>{item.score}/100 · {item.weight}% weight</Text>
          </View>
        ))}
      </View>
      {result.contextSignals.map((signal) => <Text key={signal} style={styles.contextSignal}>✦ {signal}</Text>)}
      <Text style={styles.disclaimer}>Typical estimate. Book live on MakeMyTrip, Goibibo, Booking.com, or Airbnb below.</Text>
    </View>
  );
}

export default function CompareScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useStore((s) => s.user);
  const [origin, setOrigin] = useState('Delhi');
  const [destination, setDestination] = useState('Agra');
  const [departureDate, setDepartureDate] = useState('2026-10-10');
  const [budgetLevel, setBudgetLevel] = useState<BudgetLevel>('backpacker');
  const [stayCity, setStayCity] = useState('Jaipur');
  const [checkIn, setCheckIn] = useState('2026-10-10');
  const [checkOut, setCheckOut] = useState('2026-10-12');
  const [stayStyle, setStayStyle] = useState('balanced');

  const searchMutation = useMutation({
    mutationFn: () => searchCompare({ origin, destination, departureDate, budgetLevel }),
  });
  const stayMutation = useMutation({
    mutationFn: () => searchStays({ city: stayCity, checkIn, checkOut, budgetLevel, travelerStyle: stayStyle, guests: 1 }),
  });

  function swapCities() {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  }

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
          onPress={() => router.push('/(tabs)/profile')}
          activeOpacity={0.85}
        >
          <Text style={styles.guestButtonText}>Sign In to Continue</Text>
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

        <View style={styles.formCard}>
          <View style={styles.routePickersRow}>
            <View style={styles.routeSide}>
              <Text style={styles.fieldLabel}>Origin</Text>
              <View style={styles.cityChips}>
                {CITIES.map((city) => (
                  <TouchableOpacity
                    key={city}
                    style={[styles.cityChip, origin === city && styles.cityChipActive]}
                    onPress={() => setOrigin(city)}
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
                    onPress={() => setDestination(city)}
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
            <View style={styles.inputWrapper}>
              <Ionicons name="calendar-outline" size={16} color={colors.inkMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={departureDate}
                onChangeText={setDepartureDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.inkSubtle}
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
                <Text style={styles.noticeTitle}>LIVE BOOKING ON PROVIDER SITES</Text>
                <Text style={styles.noticeBody}>{searchMutation.data.message}</Text>
              </View>
            </View>

            <HandoffStrip title="TRAINS" handoffs={searchMutation.data.handoffs ?? []} category="train" />
            <HandoffStrip title="BUSES" handoffs={searchMutation.data.handoffs ?? []} category="bus" />
            <HandoffStrip title="FLIGHTS" handoffs={searchMutation.data.handoffs ?? []} category="flight" />
            <HandoffStrip title="CABS" handoffs={searchMutation.data.handoffs ?? []} category="cab" />

            {searchMutation.data.results.map((result) => (
              <ResultCard key={result.recommendationId} result={result} />
            ))}

            {!searchMutation.data.results.length ? (
              <View style={styles.empty}>
                <Ionicons name="train-outline" size={32} color={colors.inkSubtle} />
                <Text style={styles.emptyText}>No verified options for this route yet.</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.staySection}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>Find a stay</Text>
            <Text style={styles.resultCount}>Feature 09</Text>
          </View>
          <Text style={styles.subtitle}>Social atmosphere, quietness, work fit, trek access, and solo fit—explained as a Stay Score.</Text>
          <View style={styles.stayCityRow}>
            {CITIES.map((city) => <TouchableOpacity key={city} style={[styles.cityChip, stayCity === city && styles.cityChipActive]} onPress={() => setStayCity(city)}><Text style={stayCity === city ? styles.cityTextActive : styles.cityText}>{city}</Text></TouchableOpacity>)}
          </View>
          <TextInput style={styles.input} value={stayCity} onChangeText={setStayCity} placeholder="Any Indian city" placeholderTextColor={colors.inkSubtle} />
          <Text style={styles.fieldLabel}>Stay preference</Text>
          <View style={styles.budgetRow}>
            {STAY_STYLES.map((style) => <TouchableOpacity key={style} style={[styles.budgetChip, stayStyle === style && styles.budgetChipActive]} onPress={() => setStayStyle(style)}><Text style={stayStyle === style ? styles.budgetTextActive : styles.budgetText}>{style.replace('_', ' ')}</Text></TouchableOpacity>)}
          </View>
          <View style={styles.stayDateRow}>
            <TextInput style={styles.stayDateInput} value={checkIn} onChangeText={setCheckIn} placeholder="Check-in YYYY-MM-DD" placeholderTextColor={colors.inkSubtle} />
            <TextInput style={styles.stayDateInput} value={checkOut} onChangeText={setCheckOut} placeholder="Check-out YYYY-MM-DD" placeholderTextColor={colors.inkSubtle} />
          </View>
          <TouchableOpacity style={styles.searchButton} onPress={() => stayMutation.mutate()} disabled={stayMutation.isPending} activeOpacity={0.85}>
            {stayMutation.isPending ? <ActivityIndicator color={colors.white} /> : <Text style={styles.searchButtonText}>Search contextual stays</Text>}
          </TouchableOpacity>
          {stayMutation.isError ? <Text style={styles.errorText}>{stayMutation.error instanceof Error ? stayMutation.error.message : 'Stay search failed'}</Text> : null}
          {stayMutation.data ? <View style={styles.stayResults}><View style={styles.notice}><Ionicons name="information-circle-outline" size={16} color={colors.primary} /><View style={{ flex: 1 }}><Text style={styles.noticeTitle}>LIVE STAY SITES</Text><Text style={styles.noticeBody}>{stayMutation.data.message}</Text></View></View><HandoffStrip title="HOTELS & HOSTELS" handoffs={stayMutation.data.handoffs ?? []} category="stay" />{stayMutation.data.results.map((result) => <StayCard key={result.recommendationId} result={result} />)}</View> : null}
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

  formCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadows.md,
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
    gap: 2,
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
  stayResults: {
    gap: spacing.md,
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
  },
  stayBadge: {
    color: colors.primary,
    backgroundColor: colors.sandLight,
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: '800',
  },
  stayType: {
    color: colors.inkMuted,
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
    color: colors.primary,
    fontSize: typography.fontSize.title2,
    fontWeight: '800',
  },
  stayPriceRow: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
    gap: 2,
  },
  breakdown: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
    gap: 4,
  },
  breakdownTitle: {
    color: colors.inkSubtle,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
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
  disclaimer: {
    color: colors.error,
    fontSize: 9,
    fontWeight: '600',
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
