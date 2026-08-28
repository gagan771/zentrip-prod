import { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '../../lib/theme';

type Blade = {
  left: number;
  bottom: number;
  height: number;
  width: number;
  color: string;
  delay: number;
  lean: number;
};

const BLADE_COLORS = ['#2F6A38', '#3F7A45', '#5A9A4A', '#2A542F', '#6BA85A', '#356B3C', '#4C8F4A'];

function makeBlades(count: number, width: number): Blade[] {
  return Array.from({ length: count }, (_, index) => ({
    left: ((index * 53) % (width + 36)) - 18,
    bottom: (index % 8) * 9 + (index % 4) * 3,
    height: 58 + ((index * 17) % 76),
    width: 5 + (index % 3),
    color: BLADE_COLORS[index % BLADE_COLORS.length],
    delay: (index % 13) * 80,
    lean: (index % 2 === 0 ? 1 : -1) * (5 + (index % 6)),
  }));
}

function GrassBlade({ blade, gust }: { blade: Blade; gust: number }) {
  const swing = useSharedValue(blade.lean * 0.4);

  useEffect(() => {
    swing.value = withRepeat(
      withTiming(-blade.lean * gust, {
        duration: 1500 + blade.delay,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );
  }, [blade.delay, blade.lean, gust, swing]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: blade.height / 2 },
      { rotate: `${swing.value}deg` },
      { translateY: -blade.height / 2 },
    ],
  }));

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: blade.left,
        bottom: blade.bottom,
        width: blade.width,
        height: blade.height,
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}
    >
      <Animated.View
        style={[
          styles.blade,
          {
            height: blade.height,
            width: blade.width,
            backgroundColor: blade.color,
            borderTopLeftRadius: blade.width,
            borderTopRightRadius: blade.width,
          },
          style,
        ]}
      />
    </View>
  );
}

function DriftCloud({
  top,
  size,
  duration,
  start,
}: {
  top: number;
  size: number;
  duration: number;
  start: number;
}) {
  const x = useSharedValue(start);
  const width = useWindowDimensions().width;

  useEffect(() => {
    x.value = start;
    x.value = withRepeat(
      withSequence(
        withTiming(width + size, { duration, easing: Easing.linear }),
        withTiming(start, { duration: 0 })
      ),
      -1,
      false
    );
  }, [duration, size, start, width, x]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.cloud, { top, width: size, height: size * 0.4 }, style]}>
      <View style={[styles.cloudPuff, { width: size * 0.5, height: size * 0.3, left: size * 0.04 }]} />
      <View style={[styles.cloudPuff, { width: size * 0.4, height: size * 0.26, left: size * 0.4, top: 8 }]} />
    </Animated.View>
  );
}

function Sun() {
  const glow = useSharedValue(0);

  useEffect(() => {
    glow.value = withRepeat(
      withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [glow]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(glow.value, [0, 1], [1, 1.08]) }],
    opacity: interpolate(glow.value, [0, 1], [0.9, 1]),
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.sunWrap, style]}>
      <View style={styles.sunHalo} />
      <View style={styles.sun} />
    </Animated.View>
  );
}

export function MeadowBackground({ lively = false }: { lively?: boolean }) {
  const { width } = useWindowDimensions();
  const gust = lively ? 1.45 : 0.9;
  const blades = useMemo(() => makeBlades(32, width), [width]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.sky} />
      <View style={styles.haze} />
      <Sun />
      <DriftCloud top={68} size={128} duration={28000} start={-160} />
      <DriftCloud top={112} size={92} duration={36000} start={48} />
      <View style={styles.hillBack} />
      <View style={styles.hillFront} />
      <View style={styles.field} />
      <View style={styles.fieldLight} />
      {blades.map((blade, index) => (
        <GrassBlade key={index} blade={blade} gust={gust} />
      ))}
      <View style={[styles.flower, { left: width * 0.18, bottom: 54, backgroundColor: '#F4C7B8' }]} />
      <View style={[styles.flower, { left: width * 0.72, bottom: 72, backgroundColor: '#F6E7A3' }]} />
      <View style={[styles.flower, { left: width * 0.46, bottom: 36, backgroundColor: '#FFFFFF' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  sky: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.sky,
  },
  haze: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '26%',
    height: '34%',
    backgroundColor: colors.skyWarm,
    opacity: 0.72,
  },
  sunWrap: {
    position: 'absolute',
    top: 54,
    right: 28,
    width: 86,
    height: 86,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunHalo: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: 'rgba(255, 214, 120, 0.28)',
  },
  sun: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F6D26A',
  },
  hillBack: {
    position: 'absolute',
    left: -48,
    right: 70,
    bottom: '33%',
    height: 96,
    borderRadius: 96,
    backgroundColor: '#4F8A52',
    opacity: 0.42,
  },
  hillFront: {
    position: 'absolute',
    left: 50,
    right: -60,
    bottom: '29%',
    height: 118,
    borderRadius: 118,
    backgroundColor: '#3C7342',
    opacity: 0.58,
  },
  field: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '42%',
    backgroundColor: colors.grassDeep,
  },
  fieldLight: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '28%',
    height: '16%',
    backgroundColor: colors.grass,
    opacity: 0.55,
  },
  blade: {},
  cloud: {
    position: 'absolute',
    opacity: 0.58,
  },
  cloudPuff: {
    position: 'absolute',
    backgroundColor: '#F7FBFF',
    borderRadius: 40,
  },
  flower: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    opacity: 0.9,
  },
});
