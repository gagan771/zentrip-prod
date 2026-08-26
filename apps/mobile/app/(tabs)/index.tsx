import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { getItinerary, getTrip } from '../../lib/trips';
import { useStore } from '../../store/useStore';

const COLORS = {
  ink: '#1C2128',
  muted: '#687078',
  line: '#E9E7E0',
  paper: '#FBFAF6',
  sand: '#F1EAD6',
  clay: '#8C3C29',
  sage: '#DCE7DC',
};

export default function HomeScreen() {
  const router = useRouter();
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.eyebrow}>ZENTRIP / HOME</Text>
          <Text style={styles.greeting}>Good morning, {user?.name?.split(' ')[0] ?? 'traveler'}</Text>
        </View>
        <TouchableOpacity style={styles.avatar} onPress={() => router.push('/(tabs)/profile')}>
          <Text style={styles.avatarText}>{(user?.name?.[0] ?? 'Z').toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroKicker}>YOUR INDIA COMPANION</Text>
          <Text style={styles.heroTitle}>Plan less. Notice more.</Text>
          <Text style={styles.heroBody}>
            A grounded trip plan, local context, and a calm second opinion whenever you need it.
          </Text>
        </View>
        <Text style={styles.heroMark}>✦</Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your journey</Text>
        {trip ? (
          <TouchableOpacity onPress={() => router.push('/(tabs)/trip')}>
            <Text style={styles.sectionLink}>Open trip</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {trip ? (
        <TouchableOpacity style={styles.tripCard} onPress={() => router.push('/(tabs)/trip')}>
          <View style={styles.tripCardTop}>
            <View style={styles.tripBadge}>
              <Text style={styles.tripBadgeText}>ACTIVE PLAN</Text>
            </View>
            <Text style={styles.tripStatus}>{trip.status}</Text>
          </View>
          <Text style={styles.tripTitle}>{trip.cities.join('  →  ')}</Text>
          <Text style={styles.tripDates}>
            {trip.startDate}  ·  {trip.endDate}  ·  {trip.budgetLevel}
          </Text>
          {nextDay ? (
            <View style={styles.nextDay}>
              <Text style={styles.nextDayLabel}>FIRST DAY</Text>
              <Text style={styles.nextDayTitle}>{nextDay.city}</Text>
              <Text style={styles.nextDayBody}>
                {nextDay.activities.length ? `${nextDay.activities.length} grounded stops ready` : 'No stops yet'}
              </Text>
            </View>
          ) : (
            <View style={styles.nextDay}>
              <Text style={styles.nextDayLabel}>NEXT STEP</Text>
              <Text style={styles.nextDayTitle}>Generate your itinerary</Text>
              <Text style={styles.nextDayBody}>Turn your cities into a day-by-day plan.</Text>
            </View>
          )}
        </TouchableOpacity>
      ) : (
        <View style={styles.emptyTripCard}>
          <Text style={styles.emptyTripIcon}>⌁</Text>
          <Text style={styles.emptyTripTitle}>Your next chapter starts here</Text>
          <Text style={styles.emptyTripBody}>Create a trip and let Zentrip shape the first thoughtful draft.</Text>
          <TouchableOpacity style={styles.darkButton} onPress={() => router.push('/(tabs)/trip')}>
            <Text style={styles.darkButtonText}>Create a trip</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.sectionTitle}>Make today easier</Text>
      <View style={styles.actionGrid}>
        <TouchableOpacity style={[styles.actionCard, { backgroundColor: COLORS.sand }]} onPress={() => router.push('/(tabs)/companion')}>
          <Text style={styles.actionIcon}>◌</Text>
          <Text style={styles.actionTitle}>Ask Companion</Text>
          <Text style={styles.actionBody}>A quick answer for the road.</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionCard, { backgroundColor: COLORS.sage }]} onPress={() => router.push('/(tabs)/explore')}>
          <Text style={styles.actionIcon}>◇</Text>
          <Text style={styles.actionTitle}>Explore places</Text>
          <Text style={styles.actionBody}>Start with sourced ideas.</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.preferenceNote}>
        <Text style={styles.preferenceLabel}>YOUR TRAVEL STYLE</Text>
        <Text style={styles.preferenceText}>
          {preferences.pace} pace  ·  {preferences.budget}  ·  {preferences.interests.slice(0, 2).join(' + ')}
        </Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
          <Text style={styles.preferenceLink}>Tune your profile →</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, paddingBottom: 40, gap: 18 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  eyebrow: { fontSize: 10, letterSpacing: 1.6, color: COLORS.muted, fontWeight: '700' },
  greeting: { marginTop: 7, fontSize: 25, lineHeight: 31, color: COLORS.ink, fontWeight: '700' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  hero: { minHeight: 166, borderRadius: 22, backgroundColor: COLORS.ink, padding: 20, flexDirection: 'row', overflow: 'hidden' },
  heroCopy: { flex: 1, paddingRight: 12 },
  heroKicker: { color: '#BFC8C0', fontSize: 10, letterSpacing: 1.4, fontWeight: '700' },
  heroTitle: { color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '700', marginTop: 13 },
  heroBody: { color: '#D4D8D4', fontSize: 13, lineHeight: 19, marginTop: 9 },
  heroMark: { color: '#E7D4A3', fontSize: 76, lineHeight: 80, position: 'absolute', right: 9, bottom: -12, opacity: 0.8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '700' },
  sectionLink: { color: COLORS.clay, fontSize: 13, fontWeight: '600' },
  tripCard: { borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, padding: 16, gap: 10 },
  tripCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tripBadge: { backgroundColor: COLORS.sage, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 },
  tripBadgeText: { color: '#47614E', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  tripStatus: { color: COLORS.muted, fontSize: 12, textTransform: 'capitalize' },
  tripTitle: { color: COLORS.ink, fontSize: 21, fontWeight: '700', marginTop: 2 },
  tripDates: { color: COLORS.muted, fontSize: 12 },
  nextDay: { borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 12, marginTop: 3 },
  nextDayLabel: { color: COLORS.clay, fontSize: 10, letterSpacing: 1.3, fontWeight: '800' },
  nextDayTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '700', marginTop: 5 },
  nextDayBody: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  emptyTripCard: { borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, padding: 19 },
  emptyTripIcon: { color: COLORS.clay, fontSize: 26 },
  emptyTripTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '700', marginTop: 5 },
  emptyTripBody: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 6, maxWidth: 300 },
  darkButton: { backgroundColor: COLORS.ink, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 15 },
  darkButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  actionGrid: { flexDirection: 'row', gap: 10 },
  actionCard: { flex: 1, minHeight: 132, borderRadius: 16, padding: 14 },
  actionIcon: { color: COLORS.ink, fontSize: 25 },
  actionTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '700', marginTop: 11 },
  actionBody: { color: COLORS.muted, fontSize: 12, lineHeight: 17, marginTop: 5 },
  preferenceNote: { borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 16, gap: 6 },
  preferenceLabel: { color: COLORS.muted, fontSize: 10, letterSpacing: 1.3, fontWeight: '800' },
  preferenceText: { color: COLORS.ink, fontSize: 14, textTransform: 'capitalize' },
  preferenceLink: { color: COLORS.clay, fontSize: 13, fontWeight: '600', marginTop: 2 },
});
