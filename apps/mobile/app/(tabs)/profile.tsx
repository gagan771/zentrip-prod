import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { logout } from '../../lib/auth';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';
import { TravelerPreferences, useStore } from '../../store/useStore';

const INTERESTS = [
  'Culture & Heritage',
  'Street Food & Dining',
  'Monuments & Forts',
  'Slow Morning Walks',
  'Sacred Sites & Ghats',
  'Artisans & Textiles',
  'Nature & Escapes',
  'Local Train Journeys',
];

const PACE_OPTIONS: Array<{ id: TravelerPreferences['pace']; label: string; sub: string }> = [
  { id: 'relaxed', label: 'Relaxed', sub: '1-2 mindful stops/day' },
  { id: 'balanced', label: 'Balanced', sub: '3-4 curated stops' },
  { id: 'packed', label: 'Packed', sub: 'Full day exploration' },
];

const BUDGET_OPTIONS: Array<{ id: TravelerPreferences['budget']; label: string; icon: string }> = [
  { id: 'backpacker', label: 'Backpacker', icon: 'trail-sign-outline' },
  { id: 'comfort', label: 'Comfort', icon: 'bed-outline' },
  { id: 'luxury', label: 'Luxury', icon: 'sparkles-outline' },
  { id: 'mixed', label: 'Mixed', icon: 'swap-horizontal-outline' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const preferences = useStore((s) => s.travelerPreferences);
  const setPreferences = useStore((s) => s.setTravelerPreferences);
  const [notifications, setNotifications] = useState(true);
  const [offlineSync, setOfflineSync] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  function toggleInterest(interest: string) {
    const exists = preferences.interests.some((i) => i.toLowerCase() === interest.toLowerCase());
    const interests = exists
      ? preferences.interests.filter((item) => item.toLowerCase() !== interest.toLowerCase())
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
    <View style={styles.screenWrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Passport Profile Card */}
        <View style={styles.passportCard}>
          <View style={styles.passportTopline}>
            <View style={styles.passportBadge}>
              <Ionicons name="sparkles" size={10} color="#E8D2AA" />
              <Text style={styles.passportBadgeText}>ZENTRIP TRAVELER</Text>
            </View>
            <Ionicons name="finger-print-outline" size={24} color="rgba(255, 255, 255, 0.4)" />
          </View>

          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user?.name?.[0] ?? 'Z').toUpperCase()}
              </Text>
            </View>
            <View style={styles.avatarInfo}>
              <Text style={styles.name}>{user?.name ?? 'Traveler'}</Text>
              <Text style={styles.email}>{user?.email ?? 'Zentrip Explorer'}</Text>
            </View>
          </View>

          {/* Stats Bar */}
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>Phase 2</Text>
              <Text style={styles.statLabel}>CORRIDOR</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>Delhi · Agra · Jaipur</Text>
              <Text style={styles.statLabel}>REGION</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>Verified</Text>
              <Text style={styles.statLabel}>KB STATUS</Text>
            </View>
          </View>
        </View>

        {/* Travel Style Configuration */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="options-outline" size={18} color={colors.primary} />
            <View>
              <Text style={styles.sectionTitle}>Travel Philosophy</Text>
              <Text style={styles.sectionSubtitle}>Tailors Zenny’s pacing and recommendations</Text>
            </View>
          </View>

          {/* Pace */}
          <Text style={styles.fieldLabel}>Preferred Pace</Text>
          <View style={styles.paceGrid}>
            {PACE_OPTIONS.map((item) => {
              const active = preferences.pace === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.paceCard, active && styles.paceCardActive]}
                  onPress={() => setPreferences({ pace: item.id })}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.paceCardTitle, active && styles.paceCardTitleActive]}>
                    {item.label}
                  </Text>
                  <Text style={styles.paceCardSub}>{item.sub}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Budget */}
          <Text style={styles.fieldLabel}>Budget Tier</Text>
          <View style={styles.budgetRow}>
            {BUDGET_OPTIONS.map((item) => {
              const active = preferences.budget === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.budgetChip, active && styles.budgetChipActive]}
                  onPress={() => setPreferences({ budget: item.id })}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={14}
                    color={active ? colors.white : colors.inkMuted}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={active ? styles.budgetChipTextActive : styles.budgetChipText}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Interests */}
          <Text style={styles.fieldLabel}>Travel Interests</Text>
          <View style={styles.interestWrap}>
            {INTERESTS.map((interest) => {
              const selected = preferences.interests.some(
                (i) => i.toLowerCase() === interest.toLowerCase()
              );
              return (
                <TouchableOpacity
                  key={interest}
                  style={[styles.interestChip, selected && styles.interestChipActive]}
                  onPress={() => toggleInterest(interest)}
                  activeOpacity={0.8}
                >
                  {selected ? (
                    <Ionicons name="checkmark" size={13} color={colors.sage} style={{ marginRight: 4 }} />
                  ) : null}
                  <Text style={selected ? styles.interestTextActive : styles.interestText}>
                    {interest}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Preferences & Settings */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="settings-outline" size={18} color={colors.ink} />
            <Text style={styles.sectionTitle}>App Preferences</Text>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>Mindful Travel Reminders</Text>
              <Text style={styles.settingBody}>Gentle notifications for morning departures and sunset viewpoints.</Text>
            </View>
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ false: colors.borderDark, true: colors.sageSoft }}
              thumbColor={notifications ? colors.sage : colors.white}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>Offline Knowledge Cache</Text>
              <Text style={styles.settingBody}>Keep corridor monument data available without data connectivity.</Text>
            </View>
            <Switch
              value={offlineSync}
              onValueChange={setOfflineSync}
              trackColor={{ false: colors.borderDark, true: colors.sageSoft }}
              thumbColor={offlineSync ? colors.sage : colors.white}
            />
          </View>
        </View>

        {/* Quick Link to Trip */}
        <TouchableOpacity
          style={styles.tripLink}
          onPress={() => router.push('/(tabs)/trip')}
          activeOpacity={0.85}
        >
          <View style={styles.tripLinkLeft}>
            <Ionicons name="map-outline" size={20} color={colors.primary} />
            <Text style={styles.tripLinkText}>View active trip itinerary</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={colors.primary} />
        </TouchableOpacity>

        {/* Sign Out Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.error} style={{ marginRight: 6 }} />
          <Text style={styles.logoutText}>{loggingOut ? 'Signing out...' : 'Sign Out'}</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Zentrip · India Travel Companion v1.0.0</Text>
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

  passportCard: {
    backgroundColor: colors.ink,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadows.lg,
  },
  passportTopline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  passportBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  passportBadgeText: {
    color: '#E8D2AA',
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E8D2AA',
  },
  avatarText: {
    color: colors.white,
    fontSize: typography.fontSize.title1,
    fontWeight: '800',
  },
  avatarInfo: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.white,
    fontSize: typography.fontSize.title1,
    fontWeight: '800',
  },
  email: {
    color: '#D1D7DC',
    fontSize: typography.fontSize.caption,
  },

  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: radii.md,
    padding: spacing.md,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
  },
  statValue: {
    color: colors.white,
    fontSize: typography.fontSize.micro,
    fontWeight: '700',
    textAlign: 'center',
  },
  statLabel: {
    color: '#E8D2AA',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },

  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadows.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.headline,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
  },

  fieldLabel: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
    marginTop: 4,
  },

  paceGrid: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  paceCard: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardWarm,
    alignItems: 'center',
    gap: 2,
  },
  paceCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  paceCardTitle: {
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
    color: colors.ink,
  },
  paceCardTitleActive: {
    color: colors.primary,
  },
  paceCardSub: {
    fontSize: 9,
    color: colors.inkMuted,
    textAlign: 'center',
  },

  budgetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  budgetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.full,
    backgroundColor: colors.cardWarm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  budgetChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  budgetChipText: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
  },
  budgetChipTextActive: {
    color: colors.white,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },

  interestWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  interestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.full,
    backgroundColor: colors.cardWarm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  interestChipActive: {
    backgroundColor: colors.sageSoft,
    borderColor: colors.sage,
  },
  interestText: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
  },
  interestTextActive: {
    color: colors.sage,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },

  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  settingCopy: {
    flex: 1,
    gap: 2,
  },
  settingTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  settingBody: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
    lineHeight: 15,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
  },

  tripLink: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#F9D9D0',
  },
  tripLinkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tripLinkText: {
    color: colors.primary,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.errorBg,
  },
  logoutText: {
    color: colors.error,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  version: {
    color: colors.inkSubtle,
    fontSize: typography.fontSize.micro,
    textAlign: 'center',
  },
});

