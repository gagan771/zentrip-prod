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

import { createTrip, generateItinerary, getTripTimeline } from '../../lib/trips';
import { useStore } from '../../store/useStore';

const BUDGET_LEVELS = ['backpacker', 'comfort', 'luxury', 'mixed'] as const;

function NewTripForm({ onCreated }: { onCreated: (tripId: string) => void }) {
  const [cities, setCities] = useState('Delhi, Agra, Jaipur');
  const [startDate, setStartDate] = useState('2026-10-10');
  const [endDate, setEndDate] = useState('2026-10-16');
  const [budgetLevel, setBudgetLevel] = useState<(typeof BUDGET_LEVELS)[number]>('backpacker');
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
    <ScrollView contentContainerStyle={styles.form}>
      <Text style={styles.formTitle}>Plan a trip</Text>

      <Text style={styles.label}>Cities (comma-separated)</Text>
      <TextInput style={styles.input} value={cities} onChangeText={setCities} />

      <Text style={styles.label}>Start date</Text>
      <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />

      <Text style={styles.label}>End date</Text>
      <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" />

      <Text style={styles.label}>Budget</Text>
      <View style={styles.budgetRow}>
        {BUDGET_LEVELS.map((level) => (
          <TouchableOpacity
            key={level}
            style={[styles.budgetChip, budgetLevel === level && styles.budgetChipActive]}
            onPress={() => setBudgetLevel(level)}
          >
            <Text style={budgetLevel === level ? styles.budgetChipTextActive : styles.budgetChipText}>{level}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => createMutation.mutate()}
        disabled={createMutation.isPending}
      >
        {createMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Create trip</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function ItineraryView({ tripId, onStartOver }: { tripId: string; onStartOver: () => void }) {
  const queryClient = useQueryClient();

  // Single aggregation fetch (GET /v1/trips/:id/timeline) — the backend merges the
  // trip record and its itinerary days into one payload so this screen no longer
  // needs two separate round trips. See lib/trips.ts TripTimeline for how this shape
  // leaves room for future booking sources to be merged in server-side.
  const timelineQuery = useQuery({ queryKey: ['tripTimeline', tripId], queryFn: () => getTripTimeline(tripId) });

  const generateMutation = useMutation({
    mutationFn: () => generateItinerary(tripId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tripTimeline', tripId] });
    },
  });

  const trip = timelineQuery.data?.trip;
  const days = timelineQuery.data?.days ?? [];

  return (
    <ScrollView contentContainerStyle={styles.form}>
      <View style={styles.tripHeader}>
        <Text style={styles.formTitle}>{trip?.cities.join(' → ') ?? 'Trip'}</Text>
        <TouchableOpacity onPress={onStartOver}>
          <Text style={styles.startOver}>Start over</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtle}>
        {trip?.startDate} → {trip?.endDate} · {trip?.budgetLevel} · {trip?.status}
      </Text>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => generateMutation.mutate()}
        disabled={generateMutation.isPending}
      >
        {generateMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>{days.length ? 'Regenerate itinerary' : 'Generate itinerary'}</Text>
        )}
      </TouchableOpacity>

      {generateMutation.isError ? (
        <Text style={styles.error}>
          {generateMutation.error instanceof Error ? generateMutation.error.message : 'Generation failed'}
        </Text>
      ) : null}
      {generateMutation.data && !generateMutation.data.groundedInKnowledgeBase ? (
        <Text style={styles.warning}>
          No Knowledge Base entries matched these cities — run `python -m app.seed` on the backend, or add real
          entries, for a grounded itinerary.
        </Text>
      ) : null}

      {days.map((day) => (
        <View key={day.day} style={styles.dayCard}>
          <Text style={styles.dayTitle}>
            Day {day.day} · {day.city} · {day.date}
          </Text>
          {day.activities.map((activity, i) => (
            <View key={i} style={styles.activityRow}>
              <Text style={styles.activityTime}>{activity.startTime}</Text>
              <View style={styles.activityBody}>
                <Text style={styles.activityName}>{activity.placeName}</Text>
                <Text style={styles.activityReason}>{activity.reason}</Text>
              </View>
            </View>
          ))}
        </View>
      ))}

      {!days.length && !generateMutation.isPending ? (
        <Text style={styles.subtle}>No itinerary yet — tap "Generate itinerary" above.</Text>
      ) : null}
    </ScrollView>
  );
}

export default function TripScreen() {
  const activeTripId = useStore((s) => s.activeTripId);
  const setActiveTripId = useStore((s) => s.setActiveTripId);

  if (!activeTripId) {
    return <NewTripForm onCreated={setActiveTripId} />;
  }
  return <ItineraryView tripId={activeTripId} onStartOver={() => setActiveTripId(null)} />;
}

const styles = StyleSheet.create({
  form: { padding: 20, gap: 10 },
  formTitle: { fontSize: 22, fontWeight: '700' },
  label: { fontSize: 13, color: '#5B6169', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#D9D9D9', borderRadius: 8, padding: 12, fontSize: 15 },
  budgetRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  budgetChip: { borderWidth: 1, borderColor: '#D9D9D9', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  budgetChipActive: { backgroundColor: '#1C2128', borderColor: '#1C2128' },
  budgetChipText: { fontSize: 13 },
  budgetChipTextActive: { fontSize: 13, color: '#fff' },
  error: { color: '#8C3C29', fontSize: 13 },
  warning: { color: '#96692A', fontSize: 13 },
  primaryButton: { backgroundColor: '#1C2128', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  startOver: { color: '#8C3C29', fontSize: 13 },
  subtle: { fontSize: 13, color: '#8A8F86' },
  dayCard: { borderWidth: 1, borderColor: '#EFEFEF', borderRadius: 8, padding: 12, marginTop: 8, gap: 8 },
  dayTitle: { fontWeight: '700', fontSize: 15 },
  activityRow: { flexDirection: 'row', gap: 10 },
  activityTime: { width: 52, fontSize: 12, color: '#5B6169' },
  activityBody: { flex: 1 },
  activityName: { fontWeight: '600', fontSize: 14 },
  activityReason: { fontSize: 12, color: '#5B6169' },
});
