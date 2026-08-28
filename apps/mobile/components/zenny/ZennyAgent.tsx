import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { CallPhase } from '../../lib/zenny-call';
import { colors } from '../../lib/theme';

export function ZennyAgent({
  phase,
  level,
  onPress,
  disabled,
}: {
  phase: CallPhase;
  level: number;
  onPress: () => void;
  disabled?: boolean;
}) {
  const hop = useSharedValue(0);
  const squash = useSharedValue(1);
  const speaking = phase === 'speaking';
  const live = phase === 'live' || speaking;

  useEffect(() => {
    const up = speaking ? 38 : live ? 22 : 10;
    const hang = speaking ? 70 : live ? 180 : 420;
    cancelAnimation(hop);
    cancelAnimation(squash);
    hop.value = withRepeat(
      withSequence(
        withTiming(-up, { duration: speaking ? 220 : 320, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: speaking ? 180 : 260, easing: Easing.in(Easing.quad) }),
        withTiming(0, { duration: hang })
      ),
      -1,
      false
    );
    squash.value = withRepeat(
      withSequence(
        withTiming(0.92, { duration: 120 }),
        withTiming(1.06, { duration: speaking ? 200 : 300 }),
        withTiming(1, { duration: 160 }),
        withTiming(1, { duration: hang })
      ),
      -1,
      false
    );
    return () => {
      cancelAnimation(hop);
      cancelAnimation(squash);
    };
  }, [hop, live, speaking, squash]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hop.value }, { scaleX: 2 - squash.value }, { scaleY: squash.value }],
  }));

  const glow = 1 + Math.min(0.22, level * 0.3);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={live ? 'Talk with Zenny' : 'Start a live call with Zenny'}
      disabled={disabled}
      onPress={onPress}
      style={styles.hit}
    >
      <View style={[styles.shadow, { transform: [{ scaleX: glow }] }]} />
      <Animated.View style={[styles.character, bodyStyle]}>
        <View style={styles.earLeft} />
        <View style={styles.earRight} />
        <View style={styles.head}>
          <View style={styles.blushLeft} />
          <View style={styles.blushRight} />
          <View style={styles.eyeLeft} />
          <View style={styles.eyeRight} />
          <View style={[styles.mouth, speaking && styles.mouthTalk]} />
        </View>
        <View style={styles.body}>
          <View style={styles.belly} />
        </View>
        <View style={styles.footLeft} />
        <View style={styles.footRight} />
        {speaking ? (
          <View style={styles.notes}>
            <View style={styles.noteDot} />
            <View style={[styles.noteDot, styles.noteDotTwo]} />
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: 180,
    height: 210,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  shadow: {
    position: 'absolute',
    bottom: 8,
    width: 88,
    height: 18,
    borderRadius: 40,
    backgroundColor: 'rgba(20, 40, 24, 0.28)',
  },
  character: {
    width: 128,
    height: 168,
    alignItems: 'center',
  },
  earLeft: {
    position: 'absolute',
    top: 10,
    left: 18,
    width: 22,
    height: 28,
    borderRadius: 12,
    backgroundColor: colors.primary,
    transform: [{ rotate: '-18deg' }],
  },
  earRight: {
    position: 'absolute',
    top: 10,
    right: 18,
    width: 22,
    height: 28,
    borderRadius: 12,
    backgroundColor: colors.primary,
    transform: [{ rotate: '18deg' }],
  },
  head: {
    width: 92,
    height: 84,
    borderRadius: 46,
    backgroundColor: '#F4D7C4',
    marginTop: 22,
    alignItems: 'center',
    zIndex: 2,
  },
  blushLeft: {
    position: 'absolute',
    left: 10,
    top: 46,
    width: 16,
    height: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(184, 78, 50, 0.28)',
  },
  blushRight: {
    position: 'absolute',
    right: 10,
    top: 46,
    width: 16,
    height: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(184, 78, 50, 0.28)',
  },
  eyeLeft: {
    position: 'absolute',
    left: 24,
    top: 32,
    width: 10,
    height: 14,
    borderRadius: 6,
    backgroundColor: colors.ink,
  },
  eyeRight: {
    position: 'absolute',
    right: 24,
    top: 32,
    width: 10,
    height: 14,
    borderRadius: 6,
    backgroundColor: colors.ink,
  },
  mouth: {
    position: 'absolute',
    bottom: 16,
    width: 18,
    height: 8,
    borderRadius: 8,
    backgroundColor: colors.primaryDark,
  },
  mouthTalk: {
    width: 26,
    height: 16,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  body: {
    width: 78,
    height: 58,
    borderRadius: 28,
    backgroundColor: colors.primary,
    marginTop: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  belly: {
    width: 36,
    height: 28,
    borderRadius: 16,
    backgroundColor: '#F7E6D4',
    marginTop: 6,
  },
  footLeft: {
    position: 'absolute',
    bottom: 4,
    left: 28,
    width: 22,
    height: 14,
    borderRadius: 8,
    backgroundColor: colors.primaryDark,
  },
  footRight: {
    position: 'absolute',
    bottom: 4,
    right: 28,
    width: 22,
    height: 14,
    borderRadius: 8,
    backgroundColor: colors.primaryDark,
  },
  notes: {
    position: 'absolute',
    right: -8,
    top: 8,
    gap: 6,
  },
  noteDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.goldLight,
  },
  noteDotTwo: {
    width: 6,
    height: 6,
    marginLeft: 10,
    backgroundColor: colors.white,
  },
});
