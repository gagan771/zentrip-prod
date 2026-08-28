import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { logout } from '../../lib/auth';
import {
  formatKnowledgeSyncedAt,
  readKnowledgeCacheMeta,
  refreshKnowledgeCache,
} from '../../lib/knowledge';
import { latestPhilosophy, listPreferences, syncTravelPhilosophy } from '../../lib/preferences';
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
  const queryClient = useQueryClient();
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const preferences = useStore((s) => s.travelerPreferences);
  const setPreferences = useStore((s) => s.setTravelerPreferences);
  const [loggingOut, setLoggingOut] = useState(false);
  const [prefSync, setPrefSync] = useState<'local' | 'saving' | 'saved' | 'offline'>('local');
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isGuest = !user || user.id === 'guest';
  const knowledgeMetaQuery = useQuery({
    queryKey: ['knowledgeCacheMeta'],
    queryFn: readKnowledgeCacheMeta,
  });
  const knowledgeSync = useMutation({
    mutationFn: refreshKnowledgeCache,
    onSuccess: (meta) => {
      queryClient.setQueryData(['knowledgeCacheMeta'], meta);
      queryClient.invalidateQueries({ queryKey: ['explore-knowledge'] });
      queryClient.invalidateQueries({ queryKey: ['explore-knowledge-cache'] });
      queryClient.invalidateQueries({ queryKey: ['guide-place-brief'] });
      queryClient.invalidateQueries({ queryKey: ['guide-place-brief-cache'] });
      queryClient.invalidateQueries({ queryKey: ['payment-knowledge'] });
      queryClient.invalidateQueries({ queryKey: ['payment-knowledge-cache'] });
    },
  });
  const knowledgeMeta = knowledgeSync.data ?? knowledgeMetaQuery.data;
  const knowledgeSyncedAt = knowledgeMeta?.lastSyncedAt ?? null;
  const knowledgeSyncedMs = knowledgeSyncedAt ? new Date(knowledgeSyncedAt).getTime() : NaN;
  const knowledgeLive =
    !knowledgeSync.isPending &&
    !knowledgeSync.isError &&
    Number.isFinite(knowledgeSyncedMs) &&
    Date.now() - knowledgeSyncedMs < 45_000;

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['knowledgeCacheMeta'] });
    }, [queryClient]),
  );

  useEffect(() => {
    if (isGuest) {
      setPrefSync('local');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const remote = await listPreferences();
        if (cancelled) return;
        const parsed = latestPhilosophy(remote);
        if (parsed) {
          setPreferences(parsed);
          setPrefSync('saved');
        } else {
          await syncTravelPhilosophy(useStore.getState().travelerPreferences);
          if (!cancelled) setPrefSync('saved');
        }
      } catch {
        if (!cancelled) setPrefSync('offline');
      }
    })();
    return () => {
      cancelled = true;
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [isGuest, user?.id, setPreferences]);

  function updatePreferences(partial: Partial<TravelerPreferences>) {
    setPreferences(partial);
    if (isGuest) {
      setPrefSync('local');
      return;
    }
    setPrefSync('saving');
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      syncTravelPhilosophy(useStore.getState().travelerPreferences)
        .then(() => setPrefSync('saved'))
        .catch(() => setPrefSync('offline'));
    }, 700);
  }

  function toggleInterest(interest: string) {
    const exists = preferences.interests.some((i) => i.toLowerCase() === interest.toLowerCase());
    const interests = exists
      ? preferences.interests.filter((item) => item.toLowerCase() !== interest.toLowerCase())
      : [...preferences.interests, interest];
    updatePreferences({ interests });
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
              <Text style={styles.passportBadgeText}>
                {isGuest ? 'GUEST PASSPORT' : 'ZENTRIP TRAVELER'}
              </Text>
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
              <Text style={styles.email}>
                {isGuest ? 'Exploring as guest — Sign in to save trips' : user?.email ?? 'Zentrip Explorer'}
              </Text>
            </View>
          </View>

          {isGuest ? (
            <TouchableOpacity
              style={styles.guestSignIn}
              onPress={() => {
                setUser(null);
                router.replace('/(auth)/login');
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.guestSignInText}>Sign in to save trips</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.ink} />
            </TouchableOpacity>
          ) : null}

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
              <Text style={styles.sectionSubtitle}>
                {isGuest
                  ? 'Saved on this device. Sign in to keep this on your account.'
                  : prefSync === 'saving'
                    ? 'Saving to your account…'
                    : prefSync === 'saved'
                      ? 'Saved to your account via preferences'
                      : prefSync === 'offline'
                        ? 'Couldn’t reach the server — saved on this device'
                        : 'Tailors Zenny’s pacing and recommendations'}
              </Text>
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
                  onPress={() => updatePreferences({ pace: item.id })}
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
                  onPress={() => updatePreferences({ budget: item.id })}
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
              <Text style={styles.settingBody}>
                Gentle notifications for morning departures and sunset viewpoints.
              </Text>
              <Text style={styles.comingSoon}>Coming soon</Text>
            </View>
            <Switch
              value={false}
              disabled
              trackColor={{ false: colors.borderDark, true: colors.sageSoft }}
              thumbColor={colors.white}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.knowledgeBlock}>
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>Offline Knowledge Cache</Text>
              <Text style={styles.settingBody}>
                Last successful knowledge search is saved on this device. Explore, Guide, and Payments use it when the
                server is unreachable — never shown as live.
              </Text>
              <View
                style={[
                  styles.knowledgeStatus,
                  knowledgeLive ? styles.knowledgeStatusLive : knowledgeSyncedAt ? styles.knowledgeStatusCached : null,
                ]}
              >
                <Ionicons
                  name={
                    knowledgeLive
                      ? 'cloud-done-outline'
                      : knowledgeSyncedAt
                        ? 'cloud-offline-outline'
                        : 'cloud-outline'
                  }
                  size={14}
                  color={knowledgeLive ? colors.sage : knowledgeSyncedAt ? colors.goldDark : colors.inkMuted}
                />
                <Text
                  style={[
                    styles.knowledgeStatusText,
                    knowledgeLive
                      ? styles.knowledgeStatusTextLive
                      : knowledgeSyncedAt
                        ? styles.knowledgeStatusTextCached
                        : null,
                  ]}
                >
                  {knowledgeLive
                    ? `Live from server · synced ${knowledgeSyncedAt ? formatKnowledgeSyncedAt(knowledgeSyncedAt) : 'just now'}`
                    : knowledgeSyncedAt
                      ? `Last synced ${formatKnowledgeSyncedAt(knowledgeSyncedAt)} · not live`
                      : 'Never synced — needs a network once'}
                </Text>
              </View>
              {knowledgeMeta && knowledgeMeta.queryCount > 0 ? (
                <Text style={styles.settingBody}>
                  {knowledgeMeta.queryCount} saved search
                  {knowledgeMeta.queryCount === 1 ? '' : 'es'}
                  {knowledgeMeta.lastQuery
                    ? ` · last “${knowledgeMeta.lastQuery}${knowledgeMeta.lastCity ? ` · ${knowledgeMeta.lastCity}` : ''}”`
                    : ''}
                </Text>
              ) : null}
              {knowledgeSync.isError ? (
                <Text style={styles.knowledgeError}>
                  {knowledgeSyncedAt
                    ? 'Could not reach the server. Saved citations stay last-synced, not live.'
                    : 'Could not sync. Knowledge needs a network once.'}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.knowledgeSyncBtn, knowledgeSync.isPending && styles.knowledgeSyncBtnDisabled]}
              onPress={() => knowledgeSync.mutate()}
              disabled={knowledgeSync.isPending}
              activeOpacity={0.85}
            >
              {knowledgeSync.isPending ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.knowledgeSyncText}>
                  {knowledgeSyncedAt ? 'Refresh cache' : 'Sync corridor knowledge'}
                </Text>
              )}
            </TouchableOpacity>
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
        {!isGuest ? (
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            disabled={loggingOut}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.error} style={{ marginRight: 6 }} />
            <Text style={styles.logoutText}>{loggingOut ? 'Signing out...' : 'Sign Out'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => {
              setUser(null);
              router.replace('/(auth)/login');
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="log-in-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.logoutText, { color: colors.primary }]}>Sign in</Text>
          </TouchableOpacity>
        )}

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
    backgroundColor: colors.sageDark,
    borderRadius: radii.xxl,
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
  guestSignIn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.goldSoft,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  guestSignInText: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
    fontWeight: '800',
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
  comingSoon: {
    color: colors.goldDark,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  knowledgeBlock: {
    gap: spacing.sm,
  },
  knowledgeStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    backgroundColor: colors.cardWarm,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  knowledgeStatusLive: {
    backgroundColor: colors.successBg,
    borderColor: colors.sageSoft,
  },
  knowledgeStatusCached: {
    backgroundColor: colors.warningBg,
    borderColor: colors.border,
  },
  knowledgeStatusText: {
    flex: 1,
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
    fontWeight: '700',
  },
  knowledgeStatusTextLive: {
    color: colors.sage,
  },
  knowledgeStatusTextCached: {
    color: colors.goldDark,
  },
  knowledgeError: {
    color: colors.error,
    fontSize: typography.fontSize.micro,
    fontWeight: '600',
    marginTop: 2,
  },
  knowledgeSyncBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    minHeight: 40,
  },
  knowledgeSyncBtnDisabled: {
    opacity: 0.7,
  },
  knowledgeSyncText: {
    color: colors.white,
    fontSize: typography.fontSize.caption,
    fontWeight: '800',
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

