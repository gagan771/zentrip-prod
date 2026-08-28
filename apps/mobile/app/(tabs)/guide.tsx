import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { identifyLandmark, type GuideIdentifyResult } from '../../lib/guide';
import { speakNow } from '../../lib/speech';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';

type ScreenPhase = 'camera' | 'identifying' | 'result';

const CORRIDOR_CITIES = ['Delhi', 'Agra', 'Jaipur'] as const;
const CONTENT_MODES = [
  { id: 'overview', label: '30 sec' },
  { id: 'deep_history', label: 'Deep history' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'kids', label: 'Kids' },
  { id: 'academic', label: 'Academic' },
  { id: 'tourists_miss', label: 'Hidden detail' },
] as const;

export default function GuideScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<ScreenPhase>('camera');
  const [city, setCity] = useState<(typeof CORRIDOR_CITIES)[number] | null>(null);
  const [contentMode, setContentMode] = useState<(typeof CONTENT_MODES)[number]['id']>('overview');
  const [result, setResult] = useState<GuideIdentifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);

  async function capture() {
    if (!cameraRef.current || !cameraReady) return;
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, skipProcessing: true });
      if (!photo?.uri) throw new Error('The photo was not saved. Please try again.');
      setPhase('identifying');
      let location: { latitude: number; longitude: number } | undefined;
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.granted) {
          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          location = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        }
      } catch {
        // Camera identification remains usable when the traveler declines location access.
      }
      const identifyResult = await identifyLandmark(photo.uri, city ?? undefined, contentMode, location);
      setResult(identifyResult);
      setPhase('result');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not identify that photo.');
      setPhase('camera');
    }
  }

  function playNarration(text: string) {
    if (isPlayingAudio) {
      Speech.stop();
      setIsPlayingAudio(false);
      return;
    }
    setIsPlayingAudio(true);
    speakNow(text, 'en-IN', () => setIsPlayingAudio(false));
  }

  function retake() {
    Speech.stop();
    setIsPlayingAudio(false);
    setResult(null);
    setError(null);
    setPhase('camera');
  }

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centerContent, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.permissionIconCircle}>
          <Ionicons name="camera-outline" size={40} color={colors.primary} />
        </View>
        <Text style={styles.title}>Heritage Lens</Text>
        <Text style={styles.subtitle}>
          Point your camera at monuments, fort gates, and havelis across India to get verified historical explanations and audio stories.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Enable Camera Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'result' && result) {
    return (
      <View style={styles.screenWrapper}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[
            styles.resultContent,
            { paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxxl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Status Badge */}
          <View style={styles.resultBadgeRow}>
            <View style={[styles.statusPill, result.matched ? styles.matchedPill : styles.unmatchedPill]}>
              <Ionicons
                name={result.matched ? 'shield-checkmark' : 'help-circle-outline'}
                size={13}
                color={result.matched ? colors.sage : colors.goldDark}
              />
              <Text style={[styles.statusPillText, { color: result.matched ? colors.sage : colors.goldDark }]}>
                {result.matched ? 'IDENTIFIED & GROUNDED' : 'UNCONFIRMED MATCH'}
              </Text>
            </View>

            {result.matched ? (
              <View style={styles.confidencePill}>
                <Text style={styles.confidencePillText}>{result.confidence} confidence</Text>
              </View>
            ) : null}
          </View>

          {/* Monument Title */}
          <Text style={styles.resultMonumentTitle}>
            {result.matched ? result.entityName : 'Unrecognized Landmark'}
          </Text>

          {/* Audio Story Narration Button */}
          {result.reply ? (
            <TouchableOpacity
              style={[styles.audioBtn, isPlayingAudio && styles.audioBtnActive]}
              onPress={() => playNarration(result.reply)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={isPlayingAudio ? 'pause-circle' : 'volume-high-outline'}
                size={22}
                color={isPlayingAudio ? colors.white : colors.primary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.audioBtnTitle, isPlayingAudio && styles.audioBtnTitleActive]}>
                  {isPlayingAudio ? 'Playing Audio Story...' : 'Listen to Audio Story'}
                </Text>
                <Text style={[styles.audioBtnSubtitle, isPlayingAudio && styles.audioBtnSubActive]}>
                  {isPlayingAudio ? 'Tap to pause' : 'Hands-free narration for this landmark'}
                </Text>
              </View>
            </TouchableOpacity>
          ) : null}

          {/* Main Sourced Story Card */}
          <View style={styles.storyCard}>
            <View style={styles.storyHeader}>
              <Ionicons name="book-outline" size={16} color={colors.primary} />
              <Text style={styles.storyTitle}>Historical Insight</Text>
            </View>
            <Text style={styles.storyText}>{result.reply}</Text>
          </View>

          {/* Verified Citations */}
          {result.citations && result.citations.length > 0 ? (
            <View style={styles.sources}>
              <View style={styles.sourcesHeader}>
                <Ionicons name="ribbon-outline" size={14} color={colors.sage} />
                <Text style={styles.sourceTitle}>OFFICIAL ARCHIVES & CITATIONS</Text>
              </View>
              {result.citations.map((citation, index) => (
                <View key={`${citation.sourceName}-${index}`} style={styles.citationRow}>
                  <Ionicons name="document-text-outline" size={13} color={colors.inkMuted} />
                  <Text style={styles.sourceText}>
                    {citation.sourceName} · verified {citation.lastVerified}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Actions */}
          <TouchableOpacity style={styles.retakeBtn} onPress={retake} activeOpacity={0.85}>
            <Ionicons name="camera-reverse-outline" size={18} color={colors.white} style={{ marginRight: 6 }} />
            <Text style={styles.retakeBtnText}>Scan Another Monument</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.cameraContainer}>
      {/* Camera Viewfinder */}
      <View style={styles.cameraWrap}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          onCameraReady={() => setCameraReady(true)}
        />
        <View style={styles.cameraOverlay} pointerEvents="box-none">
          <View style={[styles.topFloatingBar, { paddingTop: insets.top + spacing.xs }]}>
            <View style={styles.citySelectorBar}>
              <Text style={styles.cityFilterLabel}>CITY HINT:</Text>
              {CORRIDOR_CITIES.map((option) => {
                const active = city === option;
                return (
                  <TouchableOpacity
                    key={option}
                    onPress={() => setCity((curr) => (curr === option ? null : option))}
                    style={[styles.cityHintChip, active && styles.cityHintChipActive]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.cityHintText, active && styles.cityHintTextActive]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.viewfinderFrame} pointerEvents="none">
            <View style={[styles.reticleCorner, styles.reticleTopLeft]} />
            <View style={[styles.reticleCorner, styles.reticleTopRight]} />
            <View style={[styles.reticleCorner, styles.reticleBottomLeft]} />
            <View style={[styles.reticleCorner, styles.reticleBottomRight]} />
            <Text style={styles.viewfinderHint}>Align monument in frame</Text>
          </View>

          {phase === 'identifying' ? (
            <View style={styles.identifyingOverlay}>
              <ActivityIndicator color={colors.white} size="large" />
              <Text style={styles.identifyingText}>Analyzing Architecture & Inscriptions...</Text>
              <Text style={styles.identifyingSub}>Querying grounded Knowledge Base</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Bottom Shutter Controls */}
      <View style={[styles.bottomControls, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.modeRow}>
          {CONTENT_MODES.map((mode) => <TouchableOpacity key={mode.id} onPress={() => setContentMode(mode.id)} style={[styles.modeChip, contentMode === mode.id && styles.modeChipActive]}><Text style={[styles.modeChipText, contentMode === mode.id && styles.modeChipTextActive]}>{mode.label}</Text></TouchableOpacity>)}
        </View>
        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={14} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.shutterRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Capture photo"
            disabled={!cameraReady || phase === 'identifying'}
            onPress={capture}
            style={({ pressed }) => [styles.shutterOuter, pressed && styles.shutterOuterPressed]}
          >
            <View style={styles.shutterRing}>
              <View style={styles.shutterCore} />
            </View>
          </Pressable>
        </View>
      </View>
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
    backgroundColor: colors.background,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  permissionIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.ink,
    fontSize: typography.fontSize.hero,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
    textAlign: 'center',
    maxWidth: 300,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    height: 50,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    width: '100%',
    ...shadows.sm,
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: typography.fontSize.body,
    fontWeight: '700',
  },

  cameraWrap: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
  },

  topFloatingBar: {
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  citySelectorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 24, 27, 0.75)',
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    gap: 6,
  },
  cityFilterLabel: {
    color: '#E8D2AA',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cityHintChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  cityHintChipActive: {
    backgroundColor: colors.primary,
  },
  cityHintText: {
    color: '#D1D7DC',
    fontSize: typography.fontSize.micro,
    fontWeight: '600',
  },
  cityHintTextActive: {
    color: colors.white,
    fontWeight: '700',
  },

  viewfinderFrame: {
    position: 'absolute',
    top: '20%',
    left: '10%',
    right: '10%',
    height: '45%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reticleCorner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#E8D2AA',
  },
  reticleTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 6,
  },
  reticleTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 6,
  },
  reticleBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 6,
  },
  reticleBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 6,
  },
  viewfinderHint: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: typography.fontSize.caption,
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.full,
  },

  identifyingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20, 24, 27, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.xl,
  },
  identifyingText: {
    color: colors.white,
    fontSize: typography.fontSize.headline,
    fontWeight: '700',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  identifyingSub: {
    color: '#D1D7DC',
    fontSize: typography.fontSize.caption,
    textAlign: 'center',
  },

  bottomControls: {
    backgroundColor: colors.ink,
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  modeChip: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modeChipActive: {
    backgroundColor: colors.white,
    borderColor: colors.white,
  },
  modeChipText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  modeChipTextActive: {
    color: colors.ink,
  },
  shutterRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuterPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
  shutterRing: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCore: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.errorBg,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.sm,
    marginBottom: spacing.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.fontSize.caption,
  },

  resultContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  resultBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  matchedPill: {
    backgroundColor: colors.sageSoft,
  },
  unmatchedPill: {
    backgroundColor: colors.goldSoft,
  },
  statusPillText: {
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  confidencePill: {
    backgroundColor: colors.cardWarm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  confidencePillText: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  resultMonumentTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.hero,
    fontWeight: '800',
    letterSpacing: -0.4,
  },

  audioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  audioBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  audioBtnTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  audioBtnTitleActive: {
    color: colors.white,
  },
  audioBtnSubtitle: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
  },
  audioBtnSubActive: {
    color: '#F9EDE9',
  },

  storyCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.sm,
  },
  storyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  storyTitle: {
    color: colors.ink,
    fontSize: typography.fontSize.headline,
    fontWeight: '700',
  },
  storyText: {
    color: colors.ink,
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
  },

  sources: {
    backgroundColor: colors.cardWarm,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
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
    letterSpacing: 1,
  },
  citationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceText: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.micro,
  },

  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    height: 50,
    ...shadows.sm,
  },
  retakeBtnText: {
    color: colors.white,
    fontSize: typography.fontSize.body,
    fontWeight: '700',
  },
});
