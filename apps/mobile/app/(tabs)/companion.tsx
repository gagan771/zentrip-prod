import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type ZennyVoiceTurn } from '../../lib/zenny-voice';
import { sendAgentMessage } from '../../lib/agent';
import { useZennyCall, type CallPhase } from '../../lib/zenny-call';
import { speakNow } from '../../lib/speech';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';
import { useStore } from '../../store/useStore';

const STATUS_CONFIG: Record<
  CallPhase,
  { label: string; sublabel: string; color: string; bg: string; icon: string }
> = {
  idle: {
    label: 'Ready to Call',
    sublabel: 'Tap once for a live voice call — keep talking, interrupt anytime',
    color: colors.primary,
    bg: colors.primarySoft,
    icon: 'call-outline',
  },
  connecting: {
    label: 'Connecting…',
    sublabel: 'Opening the live microphone',
    color: colors.goldDark,
    bg: colors.goldSoft,
    icon: 'ellipsis-horizontal-circle-outline',
  },
  live: {
    label: 'Live',
    sublabel: 'Mic is open — speak naturally, no need to hold or tap',
    color: '#D9381E',
    bg: '#FEE2E2',
    icon: 'radio-outline',
  },
  speaking: {
    label: 'Zenny Speaking',
    sublabel: 'Keep talking to interrupt — you do not have to wait',
    color: colors.sage,
    bg: colors.sageSoft,
    icon: 'volume-high-outline',
  },
};

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const SUGGESTED_PROMPTS = [
  '“Tell me about the Taj Mahal secrets.”',
  '“What is the best way from Delhi to Agra?”',
  '“How do I pay with UPI as a foreigner?”',
  '“Suggest a peaceful morning walk in Jaipur.”',
];

export default function CompanionScreen() {
  const insets = useSafeAreaInsets();
  const user = useStore((state) => state.user);
  const { phase, turns, error, level, pending, partial, inCall, startCall, endCall, nudge, setError, pushTurn } =
    useZennyCall();
  const [typed, setTyped] = useState('');
  const [textBusy, setTextBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const isGuest = !user || user.id === 'guest';
  const turn = turns.length > 0 ? turns[turns.length - 1] : null;

  useEffect(() => {
    if (!inCall) {
      setElapsed(0);
      return;
    }
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [inCall]);

  // Leaving the tab must hang up; a call running behind another screen would
  // keep the mic hot and speak over whatever the traveller navigated to.
  useFocusEffect(
    useCallback(() => {
      return () => endCall();
    }, [endCall])
  );

  function handleOrbPress() {
    if (inCall) {
      nudge();
      return;
    }
    if (isGuest) {
      setError('Sign in to call Zenny. Offline Explore remains available as a guest.');
      return;
    }
    void startCall();
  }

  function replaySpeech(text: string) {
    speakNow(text, 'en-IN');
  }

  async function sendTypedMessage() {
    const text = typed.trim();
    if (!text || textBusy) return;
    if (isGuest) {
      setError('Sign in to chat with Zenny.');
      return;
    }
    setTextBusy(true);
    setError(null);
    try {
      const response = await sendAgentMessage(text);
      const typedTurn: ZennyVoiceTurn = {
        sessionId: response.sessionId ?? 'typed',
        transcript: text,
        spokenText: response.reply,
        intent: response.intent,
        policyTier: response.policyTier,
        confidence: response.confidence,
        citations: response.citations,
        items: response.items,
      };
      pushTurn(typedTurn);
      setTyped('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Zenny could not answer that.');
    } finally {
      setTextBusy(false);
    }
  }

  const isBusy = phase === 'connecting';
  const live = phase === 'live' || phase === 'speaking';
  const currentStatus = STATUS_CONFIG[phase];
  const orbLabel =
    phase === 'connecting'
      ? 'CONNECTING'
      : phase === 'speaking'
        ? pending
          ? 'LIVE · TALK OVER'
          : 'TALK TO INTERRUPT'
        : phase === 'live'
          ? pending
            ? 'LIVE · ANSWERING'
            : 'LIVE'
          : 'TAP TO CALL';
  const voiceScale = live ? 1 + level * 0.16 : 1;

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
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerBadge}>
            <Ionicons name="sparkles" size={12} color={colors.primary} />
            <Text style={styles.eyebrow}>AI VOICE ASSISTANT</Text>
          </View>
          <Text style={styles.title}>Talk to Zenny</Text>
          <Text style={styles.subtitle}>
            This is a live voice call. Speak naturally — Zenny answers out loud and you can interrupt anytime.
          </Text>
        </View>

        {/* Central Orb Area */}
        <View style={styles.orbArea}>
          {/* Outer Ripple Rings */}
          <View
            style={[
              styles.outerRippleRing,
              live && styles.outerRippleListening,
              phase === 'speaking' && styles.outerRippleSpeaking,
            ]}
          >
            <View
              style={[
                styles.middleRippleRing,
                live && styles.middleRippleListening,
                phase === 'speaking' && styles.middleRippleSpeaking,
                { transform: [{ scale: voiceScale }] },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={inCall ? 'Interrupt Zenny' : 'Start a live call with Zenny'}
                disabled={phase === 'connecting'}
                onPress={handleOrbPress}
                style={({ pressed }) => [
                  styles.micOrb,
                  phase === 'live' && styles.micOrbListening,
                  phase === 'speaking' && styles.micOrbSpeaking,
                  pressed && styles.micOrbPressed,
                  isBusy && styles.micOrbBusy,
                ]}
              >
                <View style={styles.orbInnerContent}>
                  {isBusy ? (
                    <ActivityIndicator size="large" color={colors.white} />
                  ) : (
                    <Ionicons
                      name={phase === 'speaking' ? 'volume-high' : live ? 'radio' : 'call'}
                      size={42}
                      color={colors.white}
                    />
                  )}
                  <Text style={styles.orbLabel}>{orbLabel}</Text>
                </View>
              </Pressable>
            </View>
          </View>

          {/* Phase Badge & Description */}
          <View style={[styles.phasePill, { backgroundColor: currentStatus.bg }]}>
            <Ionicons name={currentStatus.icon as any} size={14} color={currentStatus.color} />
            <Text style={[styles.phaseLabel, { color: currentStatus.color }]}>
              {currentStatus.label}
            </Text>
            {inCall ? <Text style={styles.callTimer}>{formatDuration(elapsed)}</Text> : null}
          </View>
          <Text style={styles.phaseSublabel}>
            {partial
              ? `Hearing: ${partial}`
              : pending && phase === 'live'
                ? 'Zenny is answering — keep talking if you want to add more'
                : currentStatus.sublabel}
          </Text>

          {inCall ? (
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.hangUpBtn}
              onPress={endCall}
              activeOpacity={0.85}
            >
              <Ionicons name="call" size={15} color={colors.white} style={styles.hangUpIcon} />
              <Text style={styles.hangUpText}>End call</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Error Alert */}
        {error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Active Turn Card */}
        {turn ? (
          <View style={styles.turnCard}>
            <View style={styles.turnTopline}>
              <View style={styles.speakerTag}>
                <Ionicons name="person-circle-outline" size={14} color={colors.inkMuted} />
                <Text style={styles.speakerLabel}>YOU ASKED</Text>
              </View>
              <Text style={styles.confidenceTag}>
                {turn.confidence} confidence
              </Text>
            </View>

            <Text style={styles.transcript}>“{turn.transcript}”</Text>

            <View style={styles.zennyAnswerWrap}>
              <View style={styles.zennyHeader}>
                <View style={styles.zennyBadge}>
                  <Text style={styles.zennyBadgeStar}>✦</Text>
                  <Text style={styles.zennyBadgeText}>ZENNY REPLY</Text>
                </View>
                <TouchableOpacity
                  style={styles.replayBtn}
                  onPress={() => replaySpeech(turn.spokenText)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="volume-medium-outline" size={16} color={colors.primary} />
                  <Text style={styles.replayText}>Replay audio</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.answerText}>{turn.spokenText}</Text>
            </View>

            {/* Quick Grocery Hand-off if parsed items exist */}
            {turn.items && turn.items.length > 0 ? (
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.groceryBtn}
                onPress={() =>
                  router.push({
                    pathname: '/services/grocery',
                    params: { items: turn.items.join('|') },
                  })
                }
                activeOpacity={0.85}
              >
                <View style={styles.groceryBtnLeft}>
                  <View style={styles.groceryIconBadge}>
                    <Ionicons name="cart-outline" size={16} color={colors.white} />
                  </View>
                  <View>
                    <Text style={styles.groceryBtnTitle}>Hand off items to Quick Grocery</Text>
                    <Text style={styles.groceryBtnSub}>
                      {turn.items.length} item{turn.items.length === 1 ? '' : 's'} ready for Blinkit / Zepto
                    </Text>
                  </View>
                </View>
                <Ionicons name="arrow-forward" size={16} color={colors.white} />
              </TouchableOpacity>
            ) : null}

            {/* Verified Sources */}
            {turn.citations && turn.citations.length > 0 ? (
              <View style={styles.sources}>
                <View style={styles.sourcesHeader}>
                  <Ionicons name="shield-checkmark" size={12} color={colors.sage} />
                  <Text style={styles.sourceTitle}>VERIFIED SOURCES</Text>
                </View>
                {turn.citations.map((citation, index) => (
                  <View key={`${citation.sourceName}-${index}`} style={styles.citationRow}>
                    <Ionicons name="document-text-outline" size={13} color={colors.inkMuted} />
                    <Text style={styles.sourceText}>
                      {citation.sourceName} · verified {citation.lastVerified}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          /* Suggestion Starter Card */
          <View style={styles.promptCard}>
            <View style={styles.promptHeader}>
              <Ionicons name="bulb-outline" size={16} color={colors.goldDark} />
              <Text style={styles.promptTitle}>Sample ideas to ask Zenny</Text>
            </View>
            <View style={styles.promptList}>
              {SUGGESTED_PROMPTS.map((prompt) => (
                <View key={prompt} style={styles.promptItem}>
                  <Text style={styles.promptBullet}>✦</Text>
                  <Text style={styles.promptText}>{prompt}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {inCall ? null : (
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Type to Zenny</Text>
            <TextInput
              style={styles.chatInput}
              value={typed}
              onChangeText={setTyped}
              placeholder="Ask about the Taj, UPI, trains, or safety…"
              placeholderTextColor={colors.inkSubtle}
              multiline
            />
            <TouchableOpacity
              style={[styles.groceryBtn, (textBusy || !typed.trim()) && styles.groceryBtnDisabled]}
              onPress={sendTypedMessage}
              disabled={textBusy || !typed.trim()}
            >
              <Text style={styles.groceryBtnTitle}>{textBusy ? 'Sending…' : 'Send text turn'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {turns.length > 1 ? (
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Call transcript</Text>
            {turns
              .slice(0, -1)
              .reverse()
              .map((item, index) => (
                <View key={`${item.transcript}-${index}`} style={styles.transcriptRow}>
                  <Text style={styles.transcriptWho}>YOU</Text>
                  <Text style={styles.promptText}>{item.transcript}</Text>
                  <Text style={[styles.transcriptWho, styles.transcriptWhoZenny]}>ZENNY</Text>
                  <Text style={styles.promptText}>{item.spokenText}</Text>
                </View>
              ))}
          </View>
        ) : null}

        {/* Privacy Note */}
        <View style={styles.privacyRow}>
          <Ionicons name="lock-closed-outline" size={12} color={colors.inkSubtle} />
          <Text style={styles.privacy}>
            Voice data is streamed securely to Zenny for this turn only and never stored locally.
          </Text>
        </View>
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
  headerBadge: {
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

  orbArea: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  outerRippleRing: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(158, 61, 36, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRippleListening: {
    backgroundColor: 'rgba(217, 56, 30, 0.12)',
  },
  outerRippleThinking: {
    backgroundColor: 'rgba(201, 139, 44, 0.12)',
  },
  outerRippleSpeaking: {
    backgroundColor: 'rgba(59, 89, 73, 0.12)',
  },

  middleRippleRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(158, 61, 36, 0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  middleRippleListening: {
    backgroundColor: 'rgba(217, 56, 30, 0.2)',
  },
  middleRippleThinking: {
    backgroundColor: 'rgba(201, 139, 44, 0.2)',
  },
  middleRippleSpeaking: {
    backgroundColor: 'rgba(59, 89, 73, 0.2)',
  },

  micOrb: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  micOrbListening: {
    backgroundColor: '#D9381E',
    transform: [{ scale: 1.05 }],
  },
  micOrbSpeaking: {
    backgroundColor: colors.sage,
    transform: [{ scale: 1.05 }],
  },
  micOrbPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  micOrbBusy: {
    backgroundColor: colors.inkMuted,
  },
  orbInnerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbLabel: {
    color: colors.white,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginTop: 6,
  },

  phasePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.full,
    marginTop: spacing.md,
  },
  phaseLabel: {
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  phaseSublabel: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
    marginTop: 4,
    textAlign: 'center',
  },
  callTimer: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  hangUpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.error,
    borderRadius: radii.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    ...shadows.sm,
  },
  hangUpIcon: {
    transform: [{ rotate: '135deg' }],
  },
  hangUpText: {
    color: colors.white,
    fontSize: typography.fontSize.caption,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: colors.error,
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
    flex: 1,
  },

  turnCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadows.md,
  },
  turnTopline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  speakerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  speakerLabel: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  confidenceTag: {
    color: colors.sage,
    fontSize: typography.fontSize.micro,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  transcript: {
    color: colors.ink,
    fontSize: typography.fontSize.title2,
    fontWeight: '600',
    fontStyle: 'italic',
    lineHeight: typography.lineHeight.title2,
  },

  zennyAnswerWrap: {
    backgroundColor: colors.cardWarm,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  zennyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  zennyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  zennyBadgeStar: {
    color: colors.primary,
    fontSize: 12,
  },
  zennyBadgeText: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  replayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  replayText: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '700',
  },
  answerText: {
    color: colors.ink,
    fontSize: typography.fontSize.body,
    fontWeight: '500',
    lineHeight: typography.lineHeight.body,
  },

  groceryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  groceryBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  groceryIconBadge: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groceryBtnTitle: {
    color: colors.white,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  groceryBtnSub: {
    color: '#D1D7DC',
    fontSize: typography.fontSize.micro,
  },
  groceryBtnDisabled: {
    opacity: 0.5,
  },

  sources: {
    borderTopColor: colors.borderLight,
    borderTopWidth: 1,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  sourcesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  sourceTitle: {
    color: colors.sage,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  citationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceText: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
  },

  promptCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.sm,
  },
  promptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  promptTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.headline,
    fontWeight: '700',
  },
  promptList: {
    gap: spacing.sm,
  },
  promptItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  promptBullet: {
    color: colors.goldDark,
    fontSize: 12,
    marginTop: 2,
  },
  promptText: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.body,
    flex: 1,
    lineHeight: typography.lineHeight.body,
  },
  transcriptRow: {
    borderTopColor: colors.borderLight,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    gap: 2,
  },
  transcriptWho: {
    color: colors.inkSubtle,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  transcriptWhoZenny: {
    color: colors.primary,
    marginTop: spacing.xs,
  },

  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
  },
  privacy: {
    color: colors.inkSubtle,
    fontSize: typography.fontSize.micro,
    textAlign: 'center',
  },
  chatInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 72,
    textAlignVertical: 'top',
    color: colors.ink,
    backgroundColor: colors.backgroundWarm,
  },
});
