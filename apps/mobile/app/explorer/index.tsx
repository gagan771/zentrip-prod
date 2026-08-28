import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
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

import {
  activateExplorer,
  applyExplorer,
  getExplorerMissions,
  getExplorerProfile,
  getExplorerSubmissions,
  submitExplorerMission,
  type ExplorerMission,
} from '../../lib/explorer';
import { colors, radii, spacing, typography } from '../../lib/theme';

export default function ExplorerScreen() {
  const client = useQueryClient();
  const profile = useQuery({ queryKey: ['explorer-profile'], queryFn: getExplorerProfile });
  const missions = useQuery({ queryKey: ['explorer-missions'], queryFn: () => getExplorerMissions() });
  const submissions = useQuery({
    queryKey: ['explorer-submissions'],
    queryFn: getExplorerSubmissions,
    enabled: Boolean(profile.data),
  });
  const [city, setCity] = useState('Jaipur');
  const [motivation, setMotivation] = useState(
    'I want to contribute careful, location-verified observations for future travelers.'
  );
  const [selected, setSelected] = useState<ExplorerMission | null>(null);
  const [submission, setSubmission] = useState('');
  const applyMutation = useMutation({
    mutationFn: () => applyExplorer(city, motivation),
    onSuccess: () => client.invalidateQueries({ queryKey: ['explorer-profile'] }),
  });
  const activateMutation = useMutation({
    mutationFn: activateExplorer,
    onSuccess: () => client.invalidateQueries({ queryKey: ['explorer-profile'] }),
  });
  const submitMutation = useMutation({
    mutationFn: async () => {
      let latitude: number | undefined;
      let longitude: number | undefined;
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status === 'granted') {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      }
      return submitExplorerMission(selected!.id, submission, latitude, longitude);
    },
    onSuccess: () => {
      setSelected(null);
      setSubmission('');
      client.invalidateQueries({ queryKey: ['explorer-submissions'] });
    },
  });
  const profileStatus = profile.data?.status;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: spacing.md, paddingBottom: spacing.xxxl }]}
    >
      <Text style={styles.eyebrow}>PHASE 5 / EXPLORER PROGRAM</Text>
      <Text style={styles.title}>Verify what travelers need.</Text>
      <Text style={styles.subtitle}>
        Missions produce reviewable evidence for places, events, and stays. Points never justify unsafe exploration.
      </Text>
      {profile.isLoading ? (
        <View style={styles.panel}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.note}>Loading Explorer status…</Text>
        </View>
      ) : null}
      {profile.isError ? (
        <View style={styles.panel}>
          <Text style={styles.error}>Could not load Explorer profile.</Text>
          <TouchableOpacity onPress={() => profile.refetch()}>
            <Text style={styles.retry}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {profile.data ? (
        <View style={styles.profile}>
          <Text style={styles.profileTitle}>Explorer status · {profileStatus}</Text>
          <Text style={styles.profileStats}>
            {profile.data.missionsCompleted} missions · {profile.data.reputationPoints} reputation points
          </Text>
          <Text style={styles.note}>
            Submissions require approval before they can become verified content.
          </Text>
          {activateMutation.isError ? (
            <Text style={styles.error}>
              {activateMutation.error instanceof Error ? activateMutation.error.message : 'Could not record briefing.'}
            </Text>
          ) : null}
          {profileStatus === 'applicant' ? (
            <TouchableOpacity
              style={styles.primary}
              onPress={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
            >
              <Text style={styles.primaryText}>
                {activateMutation.isPending ? 'Submitting…' : 'Complete safety briefing & request approval'}
              </Text>
            </TouchableOpacity>
          ) : null}
          {profileStatus === 'pending_review' ? (
            <Text style={styles.note}>
              Safety briefing recorded. A staff reviewer must approve your profile before missions unlock.
            </Text>
          ) : null}
        </View>
      ) : profile.isLoading || profile.isError ? null : (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Apply to participate</Text>
          <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="Corridor city" />
          <TextInput
            style={[styles.input, styles.multiline]}
            value={motivation}
            onChangeText={setMotivation}
            multiline
          />
          {applyMutation.isError ? (
            <Text style={styles.error}>
              {applyMutation.error instanceof Error ? applyMutation.error.message : 'Could not apply.'}
            </Text>
          ) : null}
          <TouchableOpacity
            style={styles.primary}
            onPress={() => applyMutation.mutate()}
            disabled={applyMutation.isPending}
          >
            {applyMutation.isPending ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryText}>Submit application</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
      <Text style={styles.sectionTitle}>Open missions</Text>
      {missions.isLoading ? (
        <View style={styles.panel}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.note}>Loading missions…</Text>
        </View>
      ) : null}
      {missions.isError ? (
        <View style={styles.panel}>
          <Text style={styles.error}>Could not load missions.</Text>
          <TouchableOpacity onPress={() => missions.refetch()}>
            <Text style={styles.retry}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!missions.isLoading && !missions.isError && !(missions.data?.length) ? (
        <Text style={styles.note}>No open missions yet. Check back after corridor coverage expands.</Text>
      ) : null}
      {missions.data?.map((mission) => (
        <View key={mission.id} style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.category}>{mission.category}</Text>
            <Text style={styles.city}>{mission.city}</Text>
          </View>
          <Text style={styles.missionTitle}>{mission.title}</Text>
          <Text style={styles.description}>{mission.description}</Text>
          <Text style={styles.safety}>Safety: {mission.safetyNote}</Text>
          {profileStatus === 'active' || profileStatus === 'certified' ? (
            <TouchableOpacity style={styles.secondary} onPress={() => setSelected(mission)}>
              <Text style={styles.secondaryText}>Submit observation</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.note}>Available after Explorer approval.</Text>
          )}
        </View>
      ))}
      {selected ? (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Submission · {selected.title}</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={submission}
            onChangeText={setSubmission}
            placeholder="Describe only what you observed…"
            multiline
          />
          {submitMutation.isError ? (
            <Text style={styles.error}>
              {submitMutation.error instanceof Error ? submitMutation.error.message : 'Could not submit observation.'}
            </Text>
          ) : null}
          <TouchableOpacity
            style={styles.primary}
            onPress={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || submission.trim().length < 20}
          >
            <Text style={styles.primaryText}>
              {submitMutation.isPending ? 'Submitting…' : 'Submit with optional GPS'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {submissions.data?.length ? <Text style={styles.sectionTitle}>Your submissions</Text> : null}
      {submissions.data?.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.category}>{item.status}</Text>
          <Text style={styles.description}>{item.text}</Text>
          {item.reviewerNote ? <Text style={styles.note}>Reviewer: {item.reviewerNote}</Text> : null}
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
  profile: {
    backgroundColor: colors.goldSoft,
    borderRadius: radii.lg,
    gap: 7,
    padding: spacing.lg,
  },
  profileTitle: { color: colors.goldDark, fontWeight: '800' },
  profileStats: { color: colors.goldDark, fontSize: typography.fontSize.body },
  sectionTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.title2,
    fontWeight: '800',
  },
  panel: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    padding: spacing.md,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  primary: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    paddingVertical: 13,
  },
  primaryText: { color: colors.white, fontWeight: '800' },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  category: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  city: { color: colors.inkMuted, fontSize: typography.fontSize.caption },
  missionTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.title2,
    fontWeight: '800',
  },
  description: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.body,
    lineHeight: 19,
  },
  safety: { color: colors.primary, fontSize: typography.fontSize.caption, lineHeight: 17 },
  note: { color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 16 },
  error: {
    color: colors.error,
    backgroundColor: colors.errorBg,
    padding: spacing.sm,
    borderRadius: radii.sm,
    fontSize: typography.fontSize.caption,
  },
  retry: { color: colors.primary, fontWeight: '800', fontSize: typography.fontSize.caption },
  secondary: {
    alignItems: 'center',
    borderColor: colors.ink,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingVertical: 10,
  },
  secondaryText: { color: colors.ink, fontWeight: '800' },
});
