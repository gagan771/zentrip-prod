import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HandoffStrip } from '../../../components/booking/BookingHandoffButton';
import { listStayHandoffs, listTransportHandoffs, type ProviderHandoff } from '../../../lib/compare';
import { colors, radii, spacing, typography } from '../../../lib/theme';

type Category = 'all' | 'train' | 'bus' | 'flight' | 'stay' | 'cab';

export default function BookingHandoffScreen() {
  const insets = useSafeAreaInsets();
  const [origin, setOrigin] = useState('Delhi');
  const [destination, setDestination] = useState('Agra');
  const [departureDate, setDepartureDate] = useState('2026-10-10');
  const [checkIn, setCheckIn] = useState('2026-10-10');
  const [checkOut, setCheckOut] = useState('2026-10-12');
  const [city, setCity] = useState('Jaipur');
  const [category, setCategory] = useState<Category>('all');
  const [transport, setTransport] = useState<ProviderHandoff[]>([]);
  const [stays, setStays] = useState<ProviderHandoff[]>([]);

  const mutation = useMutation({
    mutationFn: async () => {
      const [nextTransport, nextStays] = await Promise.all([
        listTransportHandoffs({ origin, destination, departureDate }),
        listStayHandoffs({ city, checkIn, checkOut }),
      ]);
      return { nextTransport, nextStays };
    },
    onSuccess: (data) => {
      setTransport(data.nextTransport);
      setStays(data.nextStays);
    },
  });

  const all = [...transport, ...stays];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: 48 }]}>
      <Text style={styles.eyebrow}>LIVE PROVIDER HANDOFF</Text>
      <Text style={styles.title}>Book on the official sites</Text>
      <Text style={styles.subtitle}>
        Same pattern as Blinkit, Zepto, and Swiggy: Zentrip opens IRCTC, RedBus, AbhiBus, Goibibo, MakeMyTrip, Air India, IndiGo, and other official sites. You pay them, not us.
      </Text>

      <Text style={styles.label}>From / to</Text>
      <View style={styles.row}>
        <TextInput style={styles.input} value={origin} onChangeText={setOrigin} placeholder="Origin" />
        <TextInput style={styles.input} value={destination} onChangeText={setDestination} placeholder="Destination" />
      </View>
      <TextInput style={styles.input} value={departureDate} onChangeText={setDepartureDate} placeholder="Travel date YYYY-MM-DD" />
      <Text style={styles.label}>Stay city</Text>
      <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="City" />
      <View style={styles.row}>
        <TextInput style={styles.input} value={checkIn} onChangeText={setCheckIn} placeholder="Check-in" />
        <TextInput style={styles.input} value={checkOut} onChangeText={setCheckOut} placeholder="Check-out" />
      </View>

      <TouchableOpacity style={styles.primary} onPress={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Load live booking sites</Text>}
      </TouchableOpacity>
      {mutation.isError ? <Text style={styles.error}>{mutation.error instanceof Error ? mutation.error.message : 'Could not load providers'}</Text> : null}

      <View style={styles.filters}>
        {(['all', 'train', 'bus', 'flight', 'stay', 'cab'] as Category[]).map((item) => (
          <TouchableOpacity key={item} style={[styles.filter, category === item && styles.filterActive]} onPress={() => setCategory(item)}>
            <Text style={category === item ? styles.filterTextActive : styles.filterText}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {category === 'all' || category === 'train' ? <HandoffStrip title="TRAINS · IRCTC AND OTAS" handoffs={all} category="train" /> : null}
      {category === 'all' || category === 'bus' ? <HandoffStrip title="BUSES · REDBUS AND ABHIBUS" handoffs={all} category="bus" /> : null}
      {category === 'all' || category === 'flight' ? <HandoffStrip title="FLIGHTS · AIR INDIA, INDIGO, MMT, GOIBIBO, IXIGO, CLEARTRIP, YATRA" handoffs={all} category="flight" /> : null}
      {category === 'all' || category === 'stay' ? <HandoffStrip title="STAYS · MMT, GOIBIBO, BOOKING, AGODA, AIRBNB" handoffs={all} category="stay" /> : null}
      {category === 'all' || category === 'cab' ? <HandoffStrip title="CABS · UBER, OLA, RAPIDO" handoffs={all} category="cab" /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, gap: 12 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '800' },
  subtitle: { color: colors.inkMuted, fontSize: 14, lineHeight: 21 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.card,
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
  },
  primaryText: { color: colors.white, fontWeight: '800' },
  error: { color: colors.error, fontSize: 13 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.inkMuted, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  filterTextActive: { color: colors.white, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
});
