import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

import { BudgetLevel, CompareResult, recordCompareOutcome, searchCompare } from '../../lib/compare';
import { useStore } from '../../store/useStore';

const CITIES = ['Delhi', 'Agra', 'Jaipur'];
const BUDGETS: BudgetLevel[] = ['backpacker', 'comfort', 'luxury', 'mixed'];

function timeLabel(dateTime: string) {
  return dateTime.length >= 16 ? dateTime.slice(11, 16) : dateTime;
}

function durationLabel(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function ResultCard({ result }: { result: CompareResult }) {
  const outcomeMutation = useMutation({
    mutationFn: () => recordCompareOutcome(result.recommendationId, 'opened'),
  });

  return (
    <TouchableOpacity style={styles.resultCard} onPress={() => outcomeMutation.mutate()} activeOpacity={0.8}>
      <View style={styles.resultTopline}>
        <View style={styles.badgeRow}>
          {result.badges.map((badge) => (
            <View key={badge} style={[styles.badge, badge === 'RECOMMENDED' ? styles.recommendedBadge : styles.neutralBadge]}>
              <Text style={badge === 'RECOMMENDED' ? styles.recommendedBadgeText : styles.neutralBadgeText}>{badge}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.mode}>{result.mode}</Text>
      </View>

      <Text style={styles.provider}>{result.provider}</Text>
      <View style={styles.routeRow}>
        <View>
          <Text style={styles.routeTime}>{timeLabel(result.departureAt)}</Text>
          <Text style={styles.routeCode}>{result.origin}</Text>
        </View>
        <View style={styles.routeLine}>
          <Text style={styles.duration}>{durationLabel(result.durationMinutes)}</Text>
          <View style={styles.line} />
        </View>
        <View style={styles.arrival}>
          <Text style={styles.routeTime}>{timeLabel(result.arrivalAt)}</Text>
          <Text style={styles.routeCode}>{result.destination}</Text>
        </View>
      </View>

      <View style={styles.resultFooter}>
        <View>
          <Text style={styles.price}>₹{result.totalPrice}</Text>
          <Text style={styles.fee}>includes ₹{result.fees} fees</Text>
        </View>
        <Text style={styles.reliability}>{Math.round(result.reliabilityScore * 100)}% reliability</Text>
      </View>
      <Text style={styles.explanation}>{result.explanation}</Text>
      <Text style={styles.disclaimer}>Demo result · not live or bookable</Text>
    </TouchableOpacity>
  );
}

export default function CompareScreen() {
  const router = useRouter();
  const user = useStore((s) => s.user);
  const [origin, setOrigin] = useState('Delhi');
  const [destination, setDestination] = useState('Agra');
  const [departureDate, setDepartureDate] = useState('2026-10-10');
  const [budgetLevel, setBudgetLevel] = useState<BudgetLevel>('backpacker');

  const searchMutation = useMutation({
    mutationFn: () => searchCompare({ origin, destination, departureDate, budgetLevel }),
  });

  const isGuest = user?.id === 'guest';
  if (isGuest) {
    return (
      <View style={styles.guestScreen}>
        <Text style={styles.eyebrow}>COMPARE / PHASE 2</Text>
        <Text style={styles.guestTitle}>Compare is ready when you are.</Text>
        <Text style={styles.guestBody}>
          Comparison searches are saved to your account so recommendations can stay private and explainable.
          Sign in when your connection is ready.
        </Text>
        <TouchableOpacity style={styles.guestButton} onPress={() => router.push('/(tabs)/profile')}>
          <Text style={styles.guestButtonText}>Open profile to sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>COMPARE / PHASE 2</Text>
      <Text style={styles.title}>Find the better way.</Text>
      <Text style={styles.subtitle}>Compare corridor transport choices with a transparent score—not a black box.</Text>

      <View style={styles.formCard}>
        <Text style={styles.fieldLabel}>Leaving from</Text>
        <View style={styles.cityRow}>
          {CITIES.map((city) => (
            <TouchableOpacity key={city} style={[styles.cityChip, origin === city && styles.cityChipActive]} onPress={() => setOrigin(city)}>
              <Text style={origin === city ? styles.cityTextActive : styles.cityText}>{city}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Going to</Text>
        <View style={styles.cityRow}>
          {CITIES.map((city) => (
            <TouchableOpacity key={city} style={[styles.cityChip, destination === city && styles.cityChipActive]} onPress={() => setDestination(city)}>
              <Text style={destination === city ? styles.cityTextActive : styles.cityText}>{city}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Departure date</Text>
        <TextInput style={styles.input} value={departureDate} onChangeText={setDepartureDate} placeholder="YYYY-MM-DD" />

        <Text style={styles.fieldLabel}>Travel style</Text>
        <View style={styles.budgetRow}>
          {BUDGETS.map((budget) => (
            <TouchableOpacity key={budget} style={[styles.budgetChip, budgetLevel === budget && styles.budgetChipActive]} onPress={() => setBudgetLevel(budget)}>
              <Text style={budgetLevel === budget ? styles.budgetTextActive : styles.budgetText}>{budget}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.searchButton, (origin === destination || searchMutation.isPending) && styles.searchButtonDisabled]}
          onPress={() => searchMutation.mutate()}
          disabled={origin === destination || searchMutation.isPending}
        >
          <Text style={styles.searchButtonText}>{searchMutation.isPending ? 'Comparing...' : 'Compare options'}</Text>
        </TouchableOpacity>
      </View>

      {origin === destination ? <Text style={styles.error}>Choose two different cities.</Text> : null}
      {searchMutation.isError ? (
        <Text style={styles.error}>
          {searchMutation.error instanceof Error ? searchMutation.error.message : 'Comparison failed'}
        </Text>
      ) : null}

      {searchMutation.data ? (
        <>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>Your comparison</Text>
            <Text style={styles.resultCount}>{searchMutation.data.results.length} options</Text>
          </View>
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>DEMO DATA · LIVE CHECK REQUIRED</Text>
            <Text style={styles.noticeBody}>{searchMutation.data.message}</Text>
          </View>
          {searchMutation.data.results.map((result) => (
            <ResultCard key={result.recommendationId} result={result} />
          ))}
          {!searchMutation.data.results.length ? <Text style={styles.empty}>No options for this route yet.</Text> : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FBFAF6' },
  content: { padding: 20, paddingBottom: 42, gap: 12 },
  eyebrow: { color: '#8C3C29', fontSize: 10, letterSpacing: 1.5, fontWeight: '800', marginTop: 4 },
  title: { color: '#1C2128', fontSize: 29, lineHeight: 35, fontWeight: '700', marginTop: 5 },
  subtitle: { color: '#687078', fontSize: 13, lineHeight: 19, marginBottom: 6 },
  formCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E9E7E0', borderRadius: 18, padding: 16, gap: 9 },
  fieldLabel: { color: '#1C2128', fontSize: 13, fontWeight: '700', marginTop: 3 },
  cityRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  cityChip: { borderWidth: 1, borderColor: '#D9D9D9', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  cityChipActive: { backgroundColor: '#1C2128', borderColor: '#1C2128' },
  cityText: { color: '#687078', fontSize: 12 },
  cityTextActive: { color: '#fff', fontSize: 12, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#D9D9D9', borderRadius: 9, padding: 11, color: '#1C2128', fontSize: 14 },
  budgetRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  budgetChip: { borderRadius: 15, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: '#F4F3EF' },
  budgetChipActive: { backgroundColor: '#DCE7DC' },
  budgetText: { color: '#687078', fontSize: 11, textTransform: 'capitalize' },
  budgetTextActive: { color: '#47614E', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  searchButton: { backgroundColor: '#1C2128', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 5 },
  searchButtonDisabled: { opacity: 0.55 },
  searchButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  error: { color: '#8C3C29', fontSize: 12 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 },
  resultTitle: { color: '#1C2128', fontSize: 19, fontWeight: '700' },
  resultCount: { color: '#8A8F86', fontSize: 12 },
  notice: { backgroundColor: '#F1EAD6', borderRadius: 11, padding: 12, gap: 4 },
  noticeTitle: { color: '#8C3C29', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  noticeBody: { color: '#5B6169', fontSize: 12, lineHeight: 17 },
  resultCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E9E7E0', borderRadius: 17, padding: 15, gap: 9 },
  resultTopline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badgeRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', flex: 1 },
  badge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4 },
  recommendedBadge: { backgroundColor: '#DCE7DC' },
  neutralBadge: { backgroundColor: '#F1EAD6' },
  recommendedBadgeText: { color: '#47614E', fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  neutralBadgeText: { color: '#8C3C29', fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  mode: { color: '#687078', fontSize: 12, textTransform: 'capitalize' },
  provider: { color: '#1C2128', fontSize: 16, fontWeight: '700' },
  routeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  routeTime: { color: '#1C2128', fontSize: 20, fontWeight: '700' },
  routeCode: { color: '#687078', fontSize: 10, letterSpacing: 1.1, fontWeight: '700', marginTop: 2 },
  routeLine: { flex: 1, alignItems: 'center', paddingHorizontal: 10, gap: 3 },
  duration: { color: '#8A8F86', fontSize: 10 },
  line: { height: 1, backgroundColor: '#CFCFC9', width: '100%' },
  arrival: { alignItems: 'flex-end' },
  resultFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: '#F0EFEB', paddingTop: 10 },
  price: { color: '#1C2128', fontSize: 22, fontWeight: '700' },
  fee: { color: '#8A8F86', fontSize: 10, marginTop: 2 },
  reliability: { color: '#54705B', fontSize: 11, fontWeight: '600' },
  explanation: { color: '#687078', fontSize: 11, lineHeight: 16 },
  disclaimer: { color: '#8C3C29', fontSize: 10, fontWeight: '600' },
  empty: { color: '#687078', fontSize: 13, textAlign: 'center', paddingVertical: 22 },
  guestScreen: { flex: 1, backgroundColor: '#FBFAF6', padding: 24, justifyContent: 'center' },
  guestTitle: { color: '#1C2128', fontSize: 27, lineHeight: 33, fontWeight: '700', marginTop: 9 },
  guestBody: { color: '#687078', fontSize: 14, lineHeight: 21, marginTop: 10 },
  guestButton: { backgroundColor: '#1C2128', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 20 },
  guestButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
