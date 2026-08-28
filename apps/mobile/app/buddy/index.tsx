import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import {
  findBuddyMatches,
  flushWaitlistQueue,
  formatWaitlistSyncedAt,
  joinBuddyWaitlist,
  listBuddyPeers,
  listBuddyThreads,
  listBuddyWaitlist,
  listDeviceWaitlist,
  offerBuddyConsent,
  readCachedWaitlistGet,
  type BuddyMatch,
} from '../../lib/social';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';

const OPEN_WAITLIST_ID = 'open-corridor-waitlist';

export default function BuddyScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [request, setRequest] = useState(
    'Find travel buddies for Golden Triangle in October, architecture and photography, backpacker to comfort pace'
  );
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [waitlistNote, setWaitlistNote] = useState<string | null>(null);
  const [waitlistNoteKind, setWaitlistNoteKind] = useState<'server' | 'device'>('server');
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);

  const mutation = useMutation({ mutationFn: () => findBuddyMatches(request) });
  const waitlistQuery = useQuery({
    queryKey: ['buddyWaitlist'],
    queryFn: listBuddyWaitlist,
  });
  const waitlistCacheQuery = useQuery({
    queryKey: ['buddyWaitlistCache'],
    queryFn: readCachedWaitlistGet,
    staleTime: Infinity,
  });
  const deviceQuery = useQuery({
    queryKey: ['buddyWaitlistOffline'],
    queryFn: listDeviceWaitlist,
  });
  const peersQuery = useQuery({
    queryKey: ['buddyPeers'],
    queryFn: listBuddyPeers,
  });
  const threadsQuery = useQuery({
    queryKey: ['buddyThreads'],
    queryFn: listBuddyThreads,
  });
  const joinMutation = useMutation({
    mutationFn: (input: { groupId: string; groupName: string }) =>
      joinBuddyWaitlist({
        groupId: input.groupId,
        groupName: input.groupName,
        requestText: request.trim() || undefined,
      }),
    onMutate: (input) => {
      setJoiningGroupId(input.groupId);
      setWaitlistError(null);
      setWaitlistNote(null);
    },
    onSuccess: (outcome) => {
      if (outcome.source === 'server') {
        setWaitlistNoteKind('server');
        setWaitlistNote(
          `Queued on the server for ${outcome.entry.groupName}. Status: ${outcome.entry.status}. Chat stays locked until another queued traveler consents back.`,
        );
      } else {
        setWaitlistNoteKind('device');
        setWaitlistNote(
          `Saved on this device for ${outcome.draft.groupName}. Not on the server yet — we’ll retry when you’re back online.`,
        );
      }
      queryClient.invalidateQueries({ queryKey: ['buddyWaitlist'] });
      queryClient.invalidateQueries({ queryKey: ['buddyWaitlistOffline'] });
      queryClient.invalidateQueries({ queryKey: ['buddyWaitlistCache'] });
      queryClient.invalidateQueries({ queryKey: ['buddyPeers'] });
      queryClient.invalidateQueries({ queryKey: ['buddyThreads'] });
    },
    onError: (caught) => {
      setWaitlistError(caught instanceof Error ? caught.message : 'Could not save waitlist request.');
    },
    onSettled: () => setJoiningGroupId(null),
  });
  const consentMutation = useMutation({
    mutationFn: (peerId: string) => offerBuddyConsent(peerId),
    onSuccess: (peer) => {
      setWaitlistError(null);
      setWaitlistNoteKind('server');
      setWaitlistNote(
        peer.chatUnlocked
          ? `Chat unlocked with ${peer.displayName ?? 'your match'}.`
          : 'Consent saved. Chat unlocks when they consent back — still no name shown until then.'
      );
      queryClient.invalidateQueries({ queryKey: ['buddyPeers'] });
      queryClient.invalidateQueries({ queryKey: ['buddyThreads'] });
    },
    onError: (caught) => {
      setWaitlistError(caught instanceof Error ? caught.message : 'Could not save consent.');
    },
  });

  const retryOffline = useCallback(async () => {
    const result = await flushWaitlistQueue();
    await queryClient.invalidateQueries({ queryKey: ['buddyWaitlist'] });
    await queryClient.invalidateQueries({ queryKey: ['buddyWaitlistOffline'] });
    await queryClient.invalidateQueries({ queryKey: ['buddyWaitlistCache'] });
    await queryClient.invalidateQueries({ queryKey: ['buddyPeers'] });
    await queryClient.invalidateQueries({ queryKey: ['buddyThreads'] });
    if (result.sent > 0) {
      setWaitlistNoteKind('server');
      setWaitlistNote(
        result.remaining
          ? `Sent ${result.sent} queued request${result.sent === 1 ? '' : 's'} to the server. ${result.remaining} still on this device.`
          : `Sent ${result.sent} queued request${result.sent === 1 ? '' : 's'} to the server.`,
      );
      setWaitlistError(null);
    }
    return result;
  }, [queryClient]);

  useEffect(() => {
    retryOffline().catch(() => undefined);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') retryOffline().catch(() => undefined);
    });
    return () => sub.remove();
  }, [retryOffline]);

  const matches = mutation.data?.matches ?? [];
  const searched = mutation.isSuccess || mutation.isError;
  const waitlistRequests = waitlistQuery.data?.requests ?? waitlistCacheQuery.data?.requests ?? [];
  const waitlistSource = waitlistQuery.data?.source ?? (waitlistCacheQuery.data ? 'cache' : null);
  const waitlistSyncedAt = waitlistQuery.data?.syncedAt ?? waitlistCacheQuery.data?.syncedAt ?? null;
  const queuedIds = new Set(waitlistRequests.map((r) => r.groupId));
  const deviceDrafts = deviceQuery.data ?? [];
  const deviceIds = new Set(deviceDrafts.map((r) => r.groupId));

  function requestJoin(match?: BuddyMatch) {
    if (!ageConfirmed) {
      setWaitlistError('Confirm you are 18 or older before joining a waitlist.');
      return;
    }
    joinMutation.mutate({
      groupId: match?.groupId ?? OPEN_WAITLIST_ID,
      groupName: match?.name ?? 'Golden Triangle open waitlist',
    });
  }

  return (
    <View style={styles.screenWrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: spacing.md, paddingBottom: spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <Ionicons name="people-outline" size={12} color={colors.primary} />
            <Text style={styles.eyebrow}>TRAVEL BUDDY MATCH</Text>
          </View>
          <Text style={styles.title}>Find Your People</Text>
          <Text style={styles.subtitle}>
            Aggregate compatibility scoring based on shared corridor timing, pace, and interests. Personal details
            remain private until mutual consent. Chat only opens after both of you agree.
          </Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.label}>Your Travel Intent & Style</Text>
          <TextInput
            value={request}
            onChangeText={setRequest}
            multiline
            style={styles.input}
            placeholder="Describe your destination, dates, vibe, and pace..."
            placeholderTextColor={colors.inkSubtle}
          />
          <TouchableOpacity onPress={() => setAgeConfirmed((value) => !value)} style={styles.tag}>
            <Text style={styles.tagText}>
              {ageConfirmed ? '18+ confirmed' : 'I confirm I am 18 or older'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, (mutation.isPending || request.trim().length < 3 || !ageConfirmed) && styles.buttonDisabled]}
            onPress={() => {
              setWaitlistNote(null);
              setWaitlistError(null);
              mutation.mutate();
            }}
            disabled={mutation.isPending || request.trim().length < 3 || !ageConfirmed}
            activeOpacity={0.85}
          >
            {mutation.isPending ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <View style={styles.btnInner}>
                <Ionicons name="sparkles" size={16} color={colors.white} style={{ marginRight: 6 }} />
                <Text style={styles.buttonText}>Find Compatible Groups</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {mutation.isError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={14} color={colors.error} />
            <Text style={styles.errorText}>Could not find groups. Check your network.</Text>
          </View>
        ) : null}

        {waitlistQuery.isLoading && !waitlistCacheQuery.data ? (
          <View style={styles.toast}>
            <ActivityIndicator color={colors.sage} />
            <Text style={styles.toastText}>Loading your waitlist…</Text>
          </View>
        ) : null}

        {waitlistSource && (waitlistRequests.length > 0 || waitlistSource === 'cache') ? (
          <View style={waitlistSource === 'cache' ? styles.offlineCard : styles.toast}>
            <Ionicons
              name={waitlistSource === 'cache' ? 'cloud-offline-outline' : 'cloud-done-outline'}
              size={14}
              color={waitlistSource === 'cache' ? colors.goldDark : colors.sage}
            />
            <Text style={waitlistSource === 'cache' ? styles.offlineToastText : styles.toastText}>
              {waitlistSource === 'live'
                ? `Live from server${waitlistSyncedAt ? ` · synced ${formatWaitlistSyncedAt(waitlistSyncedAt)}` : ''}`
                : `Last synced ${waitlistSyncedAt ? formatWaitlistSyncedAt(waitlistSyncedAt) : 'earlier'} · showing the saved list, not live`}
            </Text>
          </View>
        ) : null}

        {waitlistQuery.isError && !waitlistCacheQuery.data ? (
          <View style={styles.offlineCard}>
            <Text style={styles.offlineHint}>
              Could not load server waitlist. Requests saved on this device still appear below.
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => waitlistQuery.refetch()} activeOpacity={0.85}>
              <Text style={styles.retryButtonText}>Retry server list</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {waitlistRequests.length > 0 ? (
          <View style={styles.queuedCard}>
            <Text style={styles.sectionTitle}>
              {waitlistSource === 'cache' ? 'On the server (last synced)' : 'On the server'}
            </Text>
            {waitlistRequests.map((entry) => (
              <View key={entry.id} style={styles.queuedRow}>
                <Ionicons name="cloud-done-outline" size={14} color={colors.sage} />
                <Text style={styles.queuedText}>
                  {entry.groupName} · {entry.status}
                </Text>
              </View>
            ))}
            {waitlistSource === 'cache' ? (
              <TouchableOpacity style={styles.retryButton} onPress={() => waitlistQuery.refetch()} activeOpacity={0.85}>
                <Text style={styles.retryButtonText}>Retry live list</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {deviceDrafts.length > 0 ? (
          <View style={styles.offlineCard}>
            <Text style={styles.sectionTitle}>On this device — not yet sent</Text>
            <Text style={styles.offlineHint}>
              These requests never reached the server. They stay here until a retry succeeds.
            </Text>
            {deviceDrafts.map((entry) => (
              <View key={entry.id} style={styles.queuedRow}>
                <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
                <Text style={styles.offlineText}>
                  {entry.groupName}
                  {entry.lastError ? ` · ${entry.lastError}` : ''}
                </Text>
              </View>
            ))}
            <TouchableOpacity style={styles.retryButton} onPress={() => retryOffline()} activeOpacity={0.85}>
              <Text style={styles.retryButtonText}>Retry sending now</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {(peersQuery.data?.peers.length ?? 0) > 0 ? (
          <View style={styles.queuedCard}>
            <Text style={styles.sectionTitle}>Queued travelers</Text>
            <Text style={styles.demoNote}>Names stay hidden until both of you consent.</Text>
            {peersQuery.data!.peers.map((peer) => (
              <View key={peer.peerId} style={styles.peerCard}>
                <Text style={styles.queuedText}>
                  {peer.chatUnlocked ? peer.displayName : peer.label} · {peer.groupName}
                </Text>
                <Text style={styles.peerMeta}>
                  {peer.chatUnlocked
                    ? 'Mutual consent — chat is open'
                    : peer.youConsented
                      ? 'Waiting for them to consent'
                      : peer.theyConsented
                        ? 'They offered consent — yours unlocks chat'
                        : 'Anonymous traveler on the same waitlist'}
                </Text>
                {peer.chatUnlocked && peer.pairId ? (
                  <TouchableOpacity
                    style={styles.waitlistButton}
                    onPress={() =>
                      router.push({
                        pathname: '/buddy/chat/[pairId]',
                        params: { pairId: peer.pairId as string },
                      })
                    }
                    activeOpacity={0.85}
                  >
                    <Text style={styles.waitlistButtonText}>Open chat</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.waitlistButton, (peer.youConsented || consentMutation.isPending) && styles.buttonDisabled]}
                    onPress={() => {
                      if (!ageConfirmed) {
                        setWaitlistError('Confirm you are 18 or older before offering consent.');
                        return;
                      }
                      consentMutation.mutate(peer.peerId);
                    }}
                    disabled={peer.youConsented || consentMutation.isPending}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.waitlistButtonText}>
                      {peer.youConsented ? 'Consent offered' : 'Offer consent to chat'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        ) : waitlistRequests.length > 0 ? (
          <Text style={styles.emptySub}>
            When another traveler queues for the same group, they appear here as an anonymous card. Chat stays locked
            until you both consent.
          </Text>
        ) : null}

        {(threadsQuery.data?.threads.length ?? 0) > 0 ? (
          <View style={styles.queuedCard}>
            <Text style={styles.sectionTitle}>Open chats</Text>
            {threadsQuery.data!.threads.map((thread) => (
              <TouchableOpacity
                key={thread.pairId}
                style={styles.queuedRow}
                onPress={() =>
                  router.push({ pathname: '/buddy/chat/[pairId]', params: { pairId: thread.pairId } })
                }
                activeOpacity={0.85}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.sage} />
                <Text style={styles.queuedText}>
                  {thread.displayName} · {thread.groupName}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {searched && !mutation.isPending && matches.length === 0 && !mutation.isError ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="people-outline" size={32} color={colors.inkSubtle} />
            <Text style={styles.emptyTitle}>No matches yet</Text>
            <Text style={styles.emptySub}>
              Join the open corridor waitlist. A successful send is stored on the server. If you’re offline, it stays
              on this device until retry — still no chat until mutual consent.
            </Text>
            <TouchableOpacity
              style={[styles.waitlistButton, joiningGroupId === OPEN_WAITLIST_ID && styles.buttonDisabled]}
              onPress={() => requestJoin()}
              disabled={joinMutation.isPending || queuedIds.has(OPEN_WAITLIST_ID) || deviceIds.has(OPEN_WAITLIST_ID)}
              activeOpacity={0.85}
            >
              {joiningGroupId === OPEN_WAITLIST_ID ? (
                <ActivityIndicator color={colors.sage} />
              ) : (
                <Text style={styles.waitlistButtonText}>
                  {queuedIds.has(OPEN_WAITLIST_ID)
                    ? 'Already on open waitlist'
                    : deviceIds.has(OPEN_WAITLIST_ID)
                      ? 'Waiting on this device'
                      : 'Request to join (waitlist)'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {matches.length > 0 ? (
          <View style={styles.matchesSection}>
            <Text style={styles.sectionTitle}>Compatible Golden Triangle Groups</Text>
            <Text style={styles.demoNote}>Demo groups · join requests are saved, not live chat</Text>
            {matches.map((match) => {
              const queued = queuedIds.has(match.groupId);
              const onDevice = deviceIds.has(match.groupId);
              const busy = joiningGroupId === match.groupId;
              return (
                <View key={match.groupId} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.scorePill}>
                      <Text style={styles.scoreText}>{match.compatibility}% MATCH</Text>
                    </View>
                    <View style={styles.membersBadge}>
                      <Ionicons name="person-outline" size={12} color={colors.inkMuted} />
                      <Text style={styles.members}>{match.members} travelers</Text>
                    </View>
                  </View>

                  <Text style={styles.groupName}>{match.name}</Text>

                  <View style={styles.tagRow}>
                    <View style={styles.tag}>
                      <Ionicons name="location-outline" size={11} color={colors.primary} />
                      <Text style={styles.tagText}>{match.destination}</Text>
                    </View>
                    <View style={styles.tag}>
                      <Ionicons name="calendar-outline" size={11} color={colors.inkMuted} />
                      <Text style={styles.tagText}>{match.dateRange}</Text>
                    </View>
                    <View style={styles.tag}>
                      <Ionicons name="wallet-outline" size={11} color={colors.sage} />
                      <Text style={styles.tagText}>{match.budgetBand}</Text>
                    </View>
                  </View>

                  <View style={styles.styleBox}>
                    <Text style={styles.styleLabel}>STYLE · INTERESTS</Text>
                    <Text style={styles.styleText}>
                      {match.style} · {match.interests}
                    </Text>
                  </View>
                  <Text style={styles.styleText}>
                    Request to join stays private. Chat opens only after mutual consent.
                  </Text>
                  <TouchableOpacity
                    style={[styles.waitlistButton, (busy || queued || onDevice) && styles.buttonDisabled]}
                    onPress={() => requestJoin(match)}
                    disabled={joinMutation.isPending || queued || onDevice}
                    activeOpacity={0.85}
                  >
                    {busy ? (
                      <ActivityIndicator color={colors.sage} />
                    ) : (
                      <Text style={styles.waitlistButtonText}>
                        {queued
                          ? 'Already queued on server'
                          : onDevice
                            ? 'Waiting on this device'
                            : 'Request to join (waitlist)'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : null}

        {waitlistError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={14} color={colors.error} />
            <Text style={styles.errorText}>{waitlistError}</Text>
          </View>
        ) : null}

        {waitlistNote ? (
          <View style={waitlistNoteKind === 'device' ? styles.offlineToast : styles.toast}>
            <Ionicons
              name={waitlistNoteKind === 'device' ? 'cloud-offline-outline' : 'checkmark-circle'}
              size={16}
              color={waitlistNoteKind === 'device' ? colors.goldDark : colors.sage}
            />
            <Text style={waitlistNoteKind === 'device' ? styles.offlineToastText : styles.toastText}>
              {waitlistNote}
            </Text>
          </View>
        ) : null}
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
  header: {
    alignItems: 'flex-start',
    gap: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
    marginBottom: 4,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontSize: typography.fontSize.display,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
    maxWidth: 320,
  },

  formCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    ...shadows.md,
  },
  label: {
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
    color: colors.ink,
  },
  input: {
    backgroundColor: colors.backgroundWarm,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 88,
    padding: spacing.md,
    textAlignVertical: 'top',
    fontSize: typography.fontSize.body,
    color: colors.ink,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    height: 48,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.white,
    fontSize: typography.fontSize.body,
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radii.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.fontSize.caption,
    flex: 1,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.headline,
    fontWeight: '700',
  },
  emptySub: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
    textAlign: 'center',
    lineHeight: 18,
  },
  waitlistButton: {
    backgroundColor: colors.sageSoft,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xs,
    minHeight: 40,
    justifyContent: 'center',
  },
  waitlistButtonText: {
    color: colors.sage,
    fontSize: typography.fontSize.caption,
    fontWeight: '800',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successBg,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  toastText: {
    color: colors.sage,
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
    flex: 1,
  },
  offlineToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningBg,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  offlineToastText: {
    color: colors.goldDark,
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
    flex: 1,
  },
  queuedCard: {
    backgroundColor: colors.sageSoft,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  queuedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  queuedText: {
    color: colors.sageDark,
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
    flex: 1,
  },
  peerCard: {
    gap: 4,
    paddingTop: spacing.xs,
  },
  peerMeta: {
    color: colors.sageDark,
    fontSize: typography.fontSize.micro,
    lineHeight: 16,
  },
  offlineCard: {
    backgroundColor: colors.warningBg,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  offlineHint: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
    lineHeight: 18,
  },
  offlineText: {
    color: colors.goldDark,
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
    flex: 1,
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.caption,
    fontWeight: '800',
  },
  demoNote: {
    color: colors.inkSubtle,
    fontSize: typography.fontSize.micro,
    fontWeight: '600',
    marginTop: -4,
  },

  matchesSection: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.title2,
    fontWeight: '800',
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.sm,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scorePill: {
    backgroundColor: colors.sageSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  scoreText: {
    color: colors.sage,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  membersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  members: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
  },
  groupName: {
    color: colors.ink,
    fontSize: typography.fontSize.headline,
    fontWeight: '800',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.cardWarm,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.xs,
  },
  tagText: {
    color: colors.ink,
    fontSize: typography.fontSize.micro,
    fontWeight: '600',
  },
  styleBox: {
    backgroundColor: colors.cardWarm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    gap: 2,
    marginTop: 2,
  },
  styleLabel: {
    color: colors.primary,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  styleText: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
  },
});
