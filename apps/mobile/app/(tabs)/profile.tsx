import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

import { logout } from '../../lib/auth';
import { TravelerPreferences, useStore } from '../../store/useStore';

const INTERESTS = ['Culture', 'Food', 'Nature', 'History', 'Adventure', 'Slow travel'];
const PACE_OPTIONS: TravelerPreferences['pace'][] = ['relaxed', 'balanced', 'packed'];
const BUDGET_OPTIONS: TravelerPreferences['budget'][] = ['backpacker', 'comfort', 'luxury', 'mixed'];

export default function ProfileScreen() {
  const router = useRouter();
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const preferences = useStore((s) => s.travelerPreferences);
  const setPreferences = useStore((s) => s.setTravelerPreferences);
  const [notifications, setNotifications] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  function toggleInterest(interest: string) {
    const interests = preferences.interests.includes(interest)
      ? preferences.interests.filter((item) => item !== interest)
      : [...preferences.interests, interest];
    setPreferences({ interests });
  }

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    setUser(null);
    setLoggingOut(false);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.name?.[0] ?? 'Z').toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user?.name ?? 'Traveler'}</Text>
        <Text style={styles.email}>{user?.email ?? 'Zentrip traveler'}</Text>
        <Text style={styles.member}>TRAVELER PROFILE</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>HOW YOU LIKE TO TRAVEL</Text>
        <Text style={styles.sectionTitle}>Make every suggestion feel more like you.</Text>

        <Text style={styles.fieldLabel}>Pace</Text>
        <View style={styles.optionRow}>
          {PACE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.option, preferences.pace === option && styles.optionActive]}
              onPress={() => setPreferences({ pace: option })}
            >
              <Text style={preferences.pace === option ? styles.optionTextActive : styles.optionText}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Budget</Text>
        <View style={styles.optionWrap}>
          {BUDGET_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.option, preferences.budget === option && styles.optionActive]}
              onPress={() => setPreferences({ budget: option })}
            >
              <Text style={preferences.budget === option ? styles.optionTextActive : styles.optionText}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Interests</Text>
        <View style={styles.optionWrap}>
          {INTERESTS.map((interest) => {
            const selected = preferences.interests.includes(interest);
            return (
              <TouchableOpacity key={interest} style={[styles.interest, selected && styles.interestActive]} onPress={() => toggleInterest(interest)}>
                <Text style={selected ? styles.interestTextActive : styles.interestText}>{selected ? '✓ ' : ''}{interest}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>APP SETTINGS</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingTitle}>Travel nudges</Text>
            <Text style={styles.settingBody}>Useful reminders around your active trip.</Text>
          </View>
          <Switch value={notifications} onValueChange={setNotifications} trackColor={{ false: '#D9D9D9', true: '#AFC4B1' }} thumbColor={notifications ? '#1C2128' : '#fff'} />
        </View>
      </View>

      <TouchableOpacity style={styles.tripLink} onPress={() => router.push('/(tabs)/trip')}>
        <Text style={styles.tripLinkText}>View my trip</Text>
        <Text style={styles.tripLinkArrow}>→</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={loggingOut}>
        <Text style={styles.logoutText}>{loggingOut ? 'Signing out...' : 'Sign out'}</Text>
      </TouchableOpacity>
      <Text style={styles.version}>Zentrip · Phase 2 build</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FBFAF6' },
  content: { padding: 20, paddingBottom: 42, gap: 18 },
  profileHeader: { alignItems: 'center', paddingVertical: 10 },
  avatar: { width: 78, height: 78, borderRadius: 39, backgroundColor: '#1C2128', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 31, fontWeight: '700' },
  name: { color: '#1C2128', fontSize: 25, fontWeight: '700', marginTop: 12 },
  email: { color: '#687078', fontSize: 13, marginTop: 4 },
  member: { color: '#8C3C29', fontSize: 10, letterSpacing: 1.4, fontWeight: '800', marginTop: 13 },
  section: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E9E7E0', borderRadius: 18, padding: 16, gap: 10 },
  sectionLabel: { color: '#687078', fontSize: 10, letterSpacing: 1.4, fontWeight: '800' },
  sectionTitle: { color: '#1C2128', fontSize: 18, lineHeight: 23, fontWeight: '700', marginBottom: 5 },
  fieldLabel: { color: '#1C2128', fontSize: 13, fontWeight: '700', marginTop: 4 },
  optionRow: { flexDirection: 'row', gap: 8 },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderWidth: 1, borderColor: '#D9D9D9', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  optionActive: { backgroundColor: '#1C2128', borderColor: '#1C2128' },
  optionText: { color: '#687078', fontSize: 12, textTransform: 'capitalize' },
  optionTextActive: { color: '#fff', fontSize: 12, textTransform: 'capitalize', fontWeight: '600' },
  interest: { borderWidth: 1, borderColor: '#D9D9D9', borderRadius: 16, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#fff' },
  interestActive: { borderColor: '#AFC4B1', backgroundColor: '#DCE7DC' },
  interestText: { color: '#687078', fontSize: 12 },
  interestTextActive: { color: '#47614E', fontSize: 12, fontWeight: '600' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 3 },
  settingCopy: { flex: 1, paddingRight: 12 },
  settingTitle: { color: '#1C2128', fontSize: 14, fontWeight: '700' },
  settingBody: { color: '#687078', fontSize: 12, lineHeight: 17, marginTop: 3 },
  tripLink: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F1EAD6', borderRadius: 13, padding: 15 },
  tripLinkText: { color: '#1C2128', fontSize: 14, fontWeight: '700' },
  tripLinkArrow: { color: '#8C3C29', fontSize: 20 },
  logoutButton: { alignItems: 'center', paddingVertical: 12 },
  logoutText: { color: '#8C3C29', fontSize: 14, fontWeight: '600' },
  version: { color: '#A0A39F', fontSize: 11, textAlign: 'center' },
});
