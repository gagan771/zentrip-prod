import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { activateExplorer, applyExplorer, getExplorerMissions, getExplorerProfile, getExplorerSubmissions, submitExplorerMission, type ExplorerMission } from '../../lib/explorer';

export default function ExplorerScreen() {
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const profile = useQuery({ queryKey: ['explorer-profile'], queryFn: getExplorerProfile });
  const missions = useQuery({ queryKey: ['explorer-missions'], queryFn: () => getExplorerMissions() });
  const submissions = useQuery({ queryKey: ['explorer-submissions'], queryFn: getExplorerSubmissions, enabled: Boolean(profile.data) });
  const [city, setCity] = useState('Jaipur');
  const [motivation, setMotivation] = useState('I want to contribute careful, location-verified observations for future travelers.');
  const [selected, setSelected] = useState<ExplorerMission | null>(null);
  const [submission, setSubmission] = useState('');
  const applyMutation = useMutation({ mutationFn: () => applyExplorer(city, motivation), onSuccess: () => client.invalidateQueries({ queryKey: ['explorer-profile'] }) });
  const activateMutation = useMutation({ mutationFn: activateExplorer, onSuccess: () => client.invalidateQueries({ queryKey: ['explorer-profile'] }) });
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
  return <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}>
    <Text style={styles.eyebrow}>PHASE 5 / EXPLORER PROGRAM</Text><Text style={styles.title}>Verify what travelers need.</Text><Text style={styles.subtitle}>Missions produce reviewable evidence for places, events, and stays. Points never justify unsafe exploration.</Text>
    {profile.data ? <View style={styles.profile}><Text style={styles.profileTitle}>Explorer status · {profileStatus}</Text><Text style={styles.profileStats}>{profile.data.missionsCompleted} missions · {profile.data.reputationPoints} reputation points</Text><Text style={styles.note}>Submissions require approval before they can become verified content.</Text>{profileStatus === 'applicant' ? <TouchableOpacity style={styles.primary} onPress={() => activateMutation.mutate()} disabled={activateMutation.isPending}><Text style={styles.primaryText}>{activateMutation.isPending ? 'Submitting…' : 'Complete safety briefing & request approval'}</Text></TouchableOpacity> : null}{profileStatus === 'pending_review' ? <Text style={styles.note}>Safety briefing recorded. A staff reviewer must approve your profile before missions unlock.</Text> : null}</View> : <View style={styles.panel}><Text style={styles.sectionTitle}>Apply to participate</Text><TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="Corridor city" /><TextInput style={[styles.input, styles.multiline]} value={motivation} onChangeText={setMotivation} multiline /><TouchableOpacity style={styles.primary} onPress={() => applyMutation.mutate()} disabled={applyMutation.isPending}><Text style={styles.primaryText}>{applyMutation.isPending ? 'Applying…' : 'Submit application'}</Text></TouchableOpacity></View>}
    <Text style={styles.sectionTitle}>Open missions</Text>
    {missions.data?.map((mission) => <View key={mission.id} style={styles.card}><View style={styles.cardTop}><Text style={styles.category}>{mission.category}</Text><Text style={styles.city}>{mission.city}</Text></View><Text style={styles.missionTitle}>{mission.title}</Text><Text style={styles.description}>{mission.description}</Text><Text style={styles.safety}>Safety: {mission.safetyNote}</Text>{profileStatus === 'active' || profileStatus === 'certified' ? <TouchableOpacity style={styles.secondary} onPress={() => setSelected(mission)}><Text style={styles.secondaryText}>Submit observation</Text></TouchableOpacity> : <Text style={styles.note}>Available after Explorer approval.</Text>}</View>)}
    {selected ? <View style={styles.panel}><Text style={styles.sectionTitle}>Submission · {selected.title}</Text><TextInput style={[styles.input, styles.multiline]} value={submission} onChangeText={setSubmission} placeholder="Describe only what you observed…" multiline /><TouchableOpacity style={styles.primary} onPress={() => submitMutation.mutate()} disabled={submitMutation.isPending || submission.trim().length < 20}><Text style={styles.primaryText}>{submitMutation.isPending ? 'Submitting…' : 'Submit with optional GPS'}</Text></TouchableOpacity></View> : null}
    {submissions.data?.length ? <Text style={styles.sectionTitle}>Your submissions</Text> : null}
    {submissions.data?.map((item) => (
      <View key={item.id} style={styles.card}>
        <Text style={styles.category}>{item.status}</Text>
        <Text style={styles.description}>{item.text}</Text>
        {item.reviewerNote ? <Text style={styles.note}>Reviewer: {item.reviewerNote}</Text> : null}
      </View>
    ))}
  </ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#FBFAF6' }, content: { padding: 20, paddingBottom: 48, gap: 14 }, eyebrow: { color: '#8C3C29', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }, title: { color: '#1C2128', fontSize: 27, fontWeight: '800' }, subtitle: { color: '#687078', fontSize: 13, lineHeight: 19 }, profile: { backgroundColor: '#F1EAD6', borderRadius: 16, gap: 7, padding: 16 }, profileTitle: { color: '#6B5A2A', fontWeight: '800' }, profileStats: { color: '#6B5A2A', fontSize: 13 }, sectionTitle: { color: '#1C2128', fontSize: 17, fontWeight: '800' }, panel: { backgroundColor: '#fff', borderColor: '#E5E1D7', borderRadius: 16, borderWidth: 1, gap: 10, padding: 16 }, input: { backgroundColor: '#FBFAF6', borderColor: '#E5E1D7', borderRadius: 10, borderWidth: 1, color: '#1C2128', padding: 12 }, multiline: { minHeight: 80, textAlignVertical: 'top' }, primary: { alignItems: 'center', backgroundColor: '#1C2128', borderRadius: 11, paddingVertical: 13 }, primaryText: { color: '#fff', fontWeight: '800' }, card: { backgroundColor: '#fff', borderColor: '#E5E1D7', borderRadius: 16, borderWidth: 1, gap: 8, padding: 16 }, cardTop: { flexDirection: 'row', justifyContent: 'space-between' }, category: { color: '#8C3C29', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }, city: { color: '#687078', fontSize: 11 }, missionTitle: { color: '#1C2128', fontSize: 17, fontWeight: '800' }, description: { color: '#515963', fontSize: 13, lineHeight: 19 }, safety: { color: '#8C3C29', fontSize: 12, lineHeight: 17 }, note: { color: '#687078', fontSize: 11, lineHeight: 16 }, secondary: { alignItems: 'center', borderColor: '#1C2128', borderRadius: 10, borderWidth: 1, paddingVertical: 10 }, secondaryText: { color: '#1C2128', fontWeight: '800' } });
