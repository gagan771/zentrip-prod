import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MeadowBackground } from '../../components/zenny/MeadowBackground';
import { ZennyAgent } from '../../components/zenny/ZennyAgent';
import { useZennyCall, type CallPhase } from '../../lib/zenny-call';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';
import { useStore } from '../../store/useStore';

const HINT: Record<CallPhase, string> = {
  idle: 'Tap Zenny, talk, then tap again to send',
  connecting: 'Zenny is answering…',
  live: 'Listening — tap when you finish',
  speaking: 'Tap to interrupt and ask again',
};

const DUPLEX_HINT: Record<CallPhase, string> = {
  idle: 'Tap Zenny to start a live call',
  connecting: 'Connecting to Zenny…',
  live: 'Live — just talk. Hang up when you are done',
  speaking: 'Zenny is speaking — talk over her to interrupt',
};

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function CompanionScreen() {
  const insets = useSafeAreaInsets();
  const user = useStore((state) => state.user);
  const setUser = useStore((state) => state.setUser);
  const {
    phase,
    mode,
    turns,
    error,
    level,
    pending,
    partial,
    inCall,
    canDuplex,
    knowledgeMode,
    startCall,
    toggleTalk,
    endCall,
    setError,
  } = useZennyCall();
  const [elapsed, setElapsed] = useState(0);
  const [lastItems, setLastItems] = useState<string[]>([]);

  const isGuest = !user || user.id === 'guest';
  const turn = turns.length > 0 ? turns[turns.length - 1] : null;
  const turnRef = useRef(turn);
  turnRef.current = turn;
  const groceryItems = turn?.items && turn.items.length > 0 ? turn.items : lastItems;
  const lively = inCall || phase === 'speaking';
  const isGuestError = Boolean(error && isGuest);

  function handleEndCall() {
    if (turn?.items && turn.items.length > 0) {
      setLastItems(turn.items);
    }
    endCall();
  }

  useEffect(() => {
    if (!inCall) {
      setElapsed(0);
      return;
    }
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [inCall]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        const items = turnRef.current?.items;
        if (items && items.length > 0) {
          setLastItems(items);
        }
        endCall();
      };
    }, [endCall])
  );

  function handleAgentPress() {
    if (mode === 'duplex' && inCall) {
      toggleTalk();
      return;
    }
    if (inCall) {
      void toggleTalk();
      return;
    }
    if (isGuest) {
      setError('Sign in to call Zenny. Offline Explore stays open as a guest.');
      return;
    }
    void startCall();
  }

  const bubbleText = partial
    ? partial
    : phase === 'connecting'
      ? 'One moment…'
      : phase === 'speaking' || pending
        ? turn?.spokenText || '…'
        : inCall
          ? 'I’m listening.'
          : 'Hi — tap me and just talk.';

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <MeadowBackground lively={lively} />

      <View style={[styles.overlay, { paddingTop: insets.top + 8, paddingBottom: spacing.md }]}>
        <View style={styles.topBar}>
          <View style={styles.nameBlock}>
            <Text style={styles.name}>Zenny</Text>
            <Text style={styles.role}>Your meadow companion</Text>
          </View>
          {inCall ? (
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{formatDuration(elapsed)}</Text>
            </View>
          ) : (
            <View style={styles.idlePill}>
              <Text style={styles.idleText}>LIVE VOICE</Text>
            </View>
          )}
        </View>

        <View style={styles.stage}>
          <View style={styles.bubble}>
            <Text style={styles.bubbleLabel}>{partial ? 'YOU' : 'ZENNY'}</Text>
            <Text style={styles.bubbleText} numberOfLines={5}>
              {bubbleText}
            </Text>
          </View>

          <ZennyAgent
            phase={phase}
            level={level}
            onPress={handleAgentPress}
            disabled={phase === 'connecting'}
          />

          {phase === 'connecting' ? (
            <ActivityIndicator color={colors.white} style={styles.spinner} />
          ) : (
            <Text style={styles.hint}>
              {((mode === 'duplex' || (canDuplex && phase === 'idle')) ? DUPLEX_HINT : HINT)[phase]}
            </Text>
          )}
        </View>

        <View style={styles.bottom}>
          {error ? (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
              {isGuestError ? (
                <View style={styles.errorActions}>
                  <Pressable
                    style={styles.signInCta}
                    onPress={() => {
                      setError(null);
                      setUser(null);
                      router.replace('/(auth)/login');
                    }}
                  >
                    <Text style={styles.signInCtaText}>Sign in</Text>
                  </Pressable>
                  <Pressable
                    style={styles.keepExploring}
                    onPress={() => {
                      setError(null);
                      router.push('/(tabs)/explore');
                    }}
                  >
                    <Text style={styles.keepExploringText}>Keep exploring</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

          {groceryItems.length > 0 ? (
            <Pressable
              style={styles.groceryChip}
              onPress={() =>
                router.push({
                  pathname: '/services/grocery',
                  params: { items: groceryItems.join('|') },
                })
              }
            >
              <Ionicons name="cart-outline" size={16} color={colors.white} />
              <Text style={styles.groceryText}>
                {groceryItems.length} grocery item{groceryItems.length === 1 ? '' : 's'}
              </Text>
              <Ionicons name="arrow-forward" size={14} color={colors.white} />
            </Pressable>
          ) : null}

          {turn?.citations?.length ? (
            <Pressable
              style={styles.sourceCard}
              disabled={!turn.citations[0]?.sourceUrl}
              onPress={() => {
                const url = turn.citations[0]?.sourceUrl;
                if (url) void Linking.openURL(url);
              }}
            >
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.sageDark} />
              <View style={styles.sourceCopy}>
                <Text style={styles.sourceTitle}>
                  Grounded in {turn.citations.length} reviewed source{turn.citations.length === 1 ? '' : 's'}
                </Text>
                <Text style={styles.sourceDetail} numberOfLines={1}>
                  {turn.citations[0].sourceName} · {turn.confidence}
                </Text>
              </View>
              {turn.citations[0].sourceUrl ? (
                <Ionicons name="open-outline" size={14} color={colors.sageDark} />
              ) : null}
            </Pressable>
          ) : null}

          {inCall ? (
            <Pressable style={styles.hangUp} onPress={handleEndCall}>
              <Ionicons name="call" size={18} color={colors.white} style={styles.hangUpIcon} />
              <Text style={styles.hangUpText}>End call</Text>
            </Pressable>
          ) : (
            <Text style={styles.privacy}>
              {canDuplex || mode === 'duplex'
                ? `Live voice via ${knowledgeMode === 'shared_gateway' ? 'Zenny’s shared travel brain' : 'voice provider'}. Speak naturally. Hang up anytime.`
                : 'Tap Zenny in the grass. Speak, tap again to send, hang up anytime.'}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.sky,
  },
  overlay: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameBlock: {
    gap: 2,
  },
  name: {
    color: colors.ink,
    fontSize: typography.fontSize.title1,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  role: {
    color: colors.sageDark,
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(185, 28, 28, 0.92)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.full,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.white,
  },
  liveText: {
    color: colors.white,
    fontSize: typography.fontSize.caption,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  idlePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.full,
  },
  idleText: {
    color: colors.sageDark,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  stage: {
    alignItems: 'center',
    gap: spacing.md,
  },
  bubble: {
    maxWidth: 300,
    backgroundColor: 'rgba(255, 252, 247, 0.92)',
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadows.md,
  },
  bubbleLabel: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.3,
    marginBottom: 4,
  },
  bubbleText: {
    color: colors.ink,
    fontSize: typography.fontSize.headline,
    lineHeight: typography.lineHeight.headline,
    fontWeight: '600',
  },
  spinner: {
    marginTop: 4,
  },
  hint: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(20, 40, 24, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bottom: {
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 88,
  },
  errorCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: 340,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
    flex: 1,
  },
  errorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
    marginTop: 2,
  },
  signInCta: {
    backgroundColor: colors.ink,
    borderRadius: radii.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  signInCtaText: {
    color: colors.white,
    fontSize: typography.fontSize.caption,
    fontWeight: '800',
  },
  keepExploring: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  keepExploringText: {
    color: colors.sageDark,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  groceryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.ink,
    borderRadius: radii.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  groceryText: {
    color: colors.white,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 252, 247, 0.9)',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: 340,
  },
  sourceCopy: {
    flex: 1,
    gap: 2,
  },
  sourceTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
    fontWeight: '800',
  },
  sourceDetail: {
    color: colors.sageDark,
    fontSize: typography.fontSize.micro,
    fontWeight: '600',
  },
  hangUp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.error,
    borderRadius: radii.full,
    paddingHorizontal: 28,
    paddingVertical: 12,
    ...shadows.md,
  },
  hangUpIcon: {
    transform: [{ rotate: '135deg' }],
  },
  hangUpText: {
    color: colors.white,
    fontSize: typography.fontSize.body,
    fontWeight: '800',
  },
  privacy: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: typography.fontSize.micro,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 16,
  },
});
