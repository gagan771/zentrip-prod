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
import { useRouter } from 'expo-router';

import { createExpertCase, getAvailableExperts, getExpertCases } from '../../lib/experts';
import { colors, radii, spacing, typography } from '../../lib/theme';

const CITIES = ['Delhi', 'Agra', 'Jaipur'];

export default function ExpertsScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const [city, setCity] = useState('Jaipur');
  const [question, setQuestion] = useState('');
  const [category, setCategory] = useState('local_advice');
  const cases = useQuery({ queryKey: ['expert-cases'], queryFn: getExpertCases });
  const experts = useQuery({ queryKey: ['available-experts', city], queryFn: () => getAvailableExperts(city) });
  const mutation = useMutation({
    mutationFn: () => createExpertCase({ city, category, question }),
    onSuccess: () => {
      setQuestion('');
      client.invalidateQueries({ queryKey: ['expert-cases'] });
    },
  });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: spacing.md, paddingBottom: spacing.xxxl }]}
    >
      <Text style={styles.eyebrow}>PHASE 5 / LOCAL EXPERTS</Text>
      <Text style={styles.title}>Ask a human when judgment matters.</Text>
      <Text style={styles.subtitle}>
        Experts support local context and disputed content. They are not emergency responders—use Guardian for emergencies.
      </Text>
      <View style={styles.panel}>
        <Text style={styles.label}>What do you need help with?</Text>
        <View style={styles.chips}>
          {['local_advice', 'community_report', 'content_dispute', 'non_emergency_safety'].map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.chip, category === item && styles.chipActive]}
              onPress={() => setCategory(item)}
            >
              <Text style={category === item ? styles.chipActiveText : styles.chipText}>
                {item.replaceAll('_', ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.chips}>
          {CITIES.map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.chip, city === item && styles.chipActive]}
              onPress={() => setCity(item)}
            >
              <Text style={city === item ? styles.chipActiveText : styles.chipText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={colors.inkSubtle} />
        <TextInput
          style={[styles.input, styles.multiline]}
          value={question}
          onChangeText={setQuestion}
          multiline
          placeholder="Describe the question with context…"
          placeholderTextColor={colors.inkSubtle}
        />
        {mutation.isError ? (
          <Text style={styles.error}>
            {mutation.error instanceof Error ? mutation.error.message : 'Could not send that question.'}
          </Text>
        ) : null}
        <TouchableOpacity
          style={styles.primary}
          onPress={() => mutation.mutate()}
          disabled={mutation.isPending || question.trim().length < 10}
        >
          {mutation.isPending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.primaryText}>Ask local expert</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/(tabs)/guardian')}>
          <Text style={styles.guardianLink}>Emergency? Open Guardian instead</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.sectionTitle}>Available corridor experts</Text>
      {experts.isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.note}>Loading experts in {city}…</Text>
        </View>
      ) : null}
      {experts.isError ? (
        <View style={styles.stateBox}>
          <Text style={styles.error}>Could not load experts. Check your network.</Text>
          <TouchableOpacity onPress={() => experts.refetch()}>
            <Text style={styles.guardianLink}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!experts.isLoading && !experts.isError && !(experts.data?.length) ? (
        <Text style={styles.note}>No listed experts for {city} yet. You can still send a case.</Text>
      ) : null}
      {experts.data?.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.question}>
            {item.displayName} · {item.city}
          </Text>
          <Text style={styles.note}>
            {item.specialties.join(' · ')} · rating {item.rating}
          </Text>
        </View>
      ))}
      <Text style={styles.sectionTitle}>Your cases</Text>
      {cases.isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.note}>Loading your cases…</Text>
        </View>
      ) : null}
      {cases.isError ? (
        <View style={styles.stateBox}>
          <Text style={styles.error}>Could not load cases.</Text>
          <TouchableOpacity onPress={() => cases.refetch()}>
            <Text style={styles.guardianLink}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!cases.isLoading && !cases.isError && !(cases.data?.length) ? (
        <Text style={styles.note}>No cases yet. Ask above when a human should review something the app cannot.</Text>
      ) : null}
      {cases.data?.map((item) => (
        <View key={item.id} style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.status}>{item.status}</Text>
            <Text style={styles.city}>{item.city}</Text>
          </View>
          <Text style={styles.question}>{item.question}</Text>
          {item.response ? (
            <Text style={styles.response}>Local Expert: {item.response}</Text>
          ) : (
            <Text style={styles.note}>Waiting for an available expert.</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: { color: colors.ink, fontSize: typography.fontSize.display, fontWeight: '800' },
  subtitle: { color: colors.inkMuted, fontSize: typography.fontSize.body, lineHeight: 19 },
  panel: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  label: { color: colors.ink, fontSize: typography.fontSize.body, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    borderColor: colors.border,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.inkMuted, fontSize: typography.fontSize.micro },
  chipActiveText: {
    color: colors.white,
    fontSize: typography.fontSize.micro,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    padding: spacing.md,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  primary: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    paddingVertical: 13,
  },
  primaryText: { color: colors.white, fontWeight: '800' },
  sectionTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.title2,
    fontWeight: '800',
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  status: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  city: { color: colors.inkMuted, fontSize: typography.fontSize.caption },
  question: { color: colors.ink, fontSize: typography.fontSize.body, lineHeight: 20 },
  response: { color: colors.sage, fontSize: typography.fontSize.body, lineHeight: 19 },
  note: { color: colors.inkMuted, fontSize: typography.fontSize.caption },
  error: {
    color: colors.error,
    backgroundColor: colors.errorBg,
    padding: spacing.sm,
    borderRadius: radii.sm,
    fontSize: typography.fontSize.caption,
  },
  stateBox: { gap: spacing.sm, alignItems: 'flex-start' },
  guardianLink: {
    color: colors.primary,
    fontSize: typography.fontSize.caption,
    fontWeight: '800',
    textAlign: 'center',
  },
});
