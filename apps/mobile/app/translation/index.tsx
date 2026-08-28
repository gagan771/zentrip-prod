import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { translatePhoto, translateSpeech, translateText, type TranslationResponse } from '../../lib/translation';
import { lookupOfflinePhrase, OFFLINE_PHRASE_LIST } from '../../lib/offline-phrasebook';
import { speakNow, stopRecordingSafely, VOICE_RECORDING } from '../../lib/speech';
import { colors, radii, shadows, spacing, typography } from '../../lib/theme';

const LANGUAGES = [
  { id: 'hindi', label: 'Hindi', speech: 'hi-IN' },
  { id: 'tamil', label: 'Tamil', speech: 'ta-IN' },
  { id: 'punjabi', label: 'Punjabi', speech: 'pa-IN' },
  { id: 'bengali', label: 'Bengali', speech: 'bn-IN' },
  { id: 'malayalam', label: 'Malayalam', speech: 'ml-IN' },
];

type Side = 'you' | 'them';

type LocalTurn = TranslationResponse & { side: Side };

function offlineTurn(text: string, targetLanguage: string, side: Side): LocalTurn | null {
  const hit = lookupOfflinePhrase(text, targetLanguage);
  if (!hit) return null;
  return {
    sourceText: hit.english,
    targetLanguage,
    translatedText: hit.native,
    pronunciation: hit.pronunciation,
    confidence: 'verified',
    mode: 'offline_phrasebook',
    context: [],
    side,
  };
}

export default function TranslationScreen() {
  const recorder = useAudioRecorder(VOICE_RECORDING);
  useAudioRecorderState(recorder);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [text, setText] = useState('Thank you');
  const [targetLanguage, setTargetLanguage] = useState('hindi');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<LocalTurn[]>([]);
  const selected = LANGUAGES.find((language) => language.id === targetLanguage) ?? LANGUAGES[0];
  const recordingStarted = useRef(false);
  const voiceSide = useRef<Side>('you');

  function speak(value: string, locale: string) {
    speakNow(value, locale);
  }

  function pushTurn(turn: LocalTurn) {
    setTurns((prev) => [turn, ...prev.slice(0, 11)]);
  }

  async function startVoice(side: Side) {
    if (busy || recordingStarted.current) return;
    voiceSide.current = side;
    setError(null);
    try {
      const mic = await requestRecordingPermissionsAsync();
      if (!mic.granted) throw new Error('Microphone permission is needed for live translation.');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingStarted.current = true;
      setRecording(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to start the microphone.');
    }
  }

  async function finishVoice() {
    if (!recordingStarted.current) return;
    recordingStarted.current = false;
    setRecording(false);
    const side = voiceSide.current;
    setBusy(true);
    try {
      await stopRecordingSafely(recorder);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!recorder.uri) throw new Error('The recording was not saved.');
      const sourceLanguage = side === 'you' ? 'en' : targetLanguage;
      const target = side === 'you' ? targetLanguage : 'english';
      const result = await translateSpeech(recorder.uri, { sourceLanguage, targetLanguage: target });
      pushTurn({ ...result, side });
      speak(result.translatedText, side === 'you' ? selected.speech : 'en-IN');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `${caught.message} Tip: use Offline phrasebook below when the network is weak.`
          : 'Voice translation failed'
      );
    } finally {
      setBusy(false);
    }
  }

  async function runText() {
    const phrase = text.trim();
    if (!phrase) return;
    setBusy(true);
    setError(null);
    try {
      const result = await translateText({ text: phrase, targetLanguage, sourceLanguage: 'en' });
      pushTurn({ ...result, side: 'you' });
      speak(result.translatedText, selected.speech);
    } catch (caught) {
      const fallback = offlineTurn(phrase, targetLanguage, 'you');
      if (fallback) {
        pushTurn(fallback);
        speak(fallback.translatedText, selected.speech);
        setError('Live translation unavailable — used offline phrasebook.');
      } else {
        setError(
          caught instanceof Error
            ? `${caught.message} This phrase is not in the offline book yet.`
            : 'Translation failed'
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function runOffline(phrase: string) {
    setText(phrase);
    const fallback = offlineTurn(phrase, targetLanguage, 'you');
    if (!fallback) {
      setError('That phrase is not in the curated offline book yet.');
      return;
    }
    setError(null);
    pushTurn(fallback);
    speak(fallback.translatedText, selected.speech);
  }

  async function captureMenu() {
    if (!cameraRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.45, skipProcessing: true });
      if (!photo?.uri) throw new Error('The photo was not saved.');
      const result = await translatePhoto(photo.uri, { targetLanguage });
      pushTurn({ ...result, side: 'them' });
      speak(result.translatedText, selected.speech);
      setCameraOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Camera translation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>TRAVEL TRANSLATOR</Text>
      <Text style={styles.title}>Speak, type, or scan a menu</Text>
      <Text style={styles.subtitle}>
        Offline phrasebook works without data. Hold You for English; hold Them for the local language.
      </Text>

      <Text style={styles.label}>Local language</Text>
      <View style={styles.languageRow}>
        {LANGUAGES.map((language) => (
          <Pressable
            key={language.id}
            style={[styles.languageChip, targetLanguage === language.id && styles.languageChipActive]}
            onPress={() => setTargetLanguage(language.id)}
          >
            <Text style={targetLanguage === language.id ? styles.languageTextActive : styles.languageText}>
              {language.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.talkRow}>
        <Pressable
          style={[styles.talkButton, recording && voiceSide.current === 'you' && styles.talkRecording]}
          disabled={busy}
          onPressIn={() => startVoice('you')}
          onPressOut={finishVoice}
        >
          <Text style={styles.talkTitle}>You</Text>
          <Text style={styles.talkSub}>
            {recording && voiceSide.current === 'you' ? 'Recording… release to translate' : 'English · hold to talk'}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.talkButton,
            styles.talkThem,
            recording && voiceSide.current === 'them' && styles.talkRecording,
          ]}
          disabled={busy}
          onPressIn={() => startVoice('them')}
          onPressOut={finishVoice}
        >
          <Text style={styles.talkTitle}>Them</Text>
          <Text style={styles.talkSub}>
            {recording && voiceSide.current === 'them'
              ? 'Recording… release to translate'
              : `${selected.label} · hold to talk`}
          </Text>
        </Pressable>
      </View>

      {recording ? (
        <View style={styles.recordingBanner}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>Listening — release when finished</Text>
        </View>
      ) : null}

      <Pressable
        style={styles.secondary}
        disabled={busy}
        onPress={async () => {
          if (!permission?.granted) {
            const next = await requestPermission();
            if (!next.granted) {
              setError('Camera permission is needed for menu translation.');
              return;
            }
          }
          setCameraOpen((value) => !value);
        }}
      >
        <Text style={styles.secondaryText}>{cameraOpen ? 'Close camera' : 'Scan menu or sign'}</Text>
      </Pressable>
      {cameraOpen ? (
        <View style={styles.cameraWrap}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back" onCameraReady={() => undefined} />
          <Pressable style={styles.primaryButton} disabled={busy} onPress={captureMenu}>
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>CAPTURE & TRANSLATE</Text>}
          </Pressable>
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.label}>Offline phrasebook</Text>
        <Text style={styles.panelHint}>Works without network. Tap a phrase for {selected.label}.</Text>
        <View style={styles.quickRow}>
          {OFFLINE_PHRASE_LIST.map((phrase) => (
            <Pressable key={phrase} style={styles.quickChip} onPress={() => runOffline(phrase)}>
              <Text style={styles.quickText}>{phrase}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.label}>Or type a phrase</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          style={styles.input}
          placeholder="Type in English"
          placeholderTextColor={colors.inkSubtle}
        />
      </View>

      <Pressable
        style={[styles.primaryButton, (!text.trim() || busy) && styles.disabled]}
        disabled={!text.trim() || busy}
        onPress={runText}
      >
        {busy && !recording ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.primaryText}>TRANSLATE PHRASE</Text>
        )}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!turns.length ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No conversation yet</Text>
          <Text style={styles.emptySubtitle}>
            Start with an offline phrase, or hold You / Them when you have a connection for live speech.
          </Text>
        </View>
      ) : null}

      {turns.map((turn, index) => (
        <View key={`${turn.sourceText}-${index}`} style={styles.resultPanel}>
          <Text style={styles.eyebrow}>
            {turn.side === 'you' ? 'YOU' : 'THEM'} · {turn.confidence.toUpperCase()} · {turn.mode.replace('_', ' ')}
          </Text>
          <Text style={styles.source}>{turn.sourceText}</Text>
          <Pressable onPress={() => speak(turn.translatedText, turn.side === 'you' ? selected.speech : 'en-IN')}>
            <Text style={styles.nativeText}>{turn.translatedText}</Text>
          </Pressable>
          {turn.pronunciation ? <Text style={styles.pronunciation}>Say it like: “{turn.pronunciation}”</Text> : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.fontSize.micro,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: {
    color: colors.ink,
    fontSize: typography.fontSize.display,
    fontWeight: '800',
    marginTop: 2,
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
    marginTop: -4,
  },
  label: {
    color: colors.ink,
    fontSize: typography.fontSize.caption,
    fontWeight: '800',
  },
  panel: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
    ...shadows.sm,
  },
  panelHint: {
    color: colors.inkMuted,
    fontSize: typography.fontSize.caption,
    marginTop: -4,
  },
  input: {
    color: colors.ink,
    fontSize: typography.fontSize.title2,
    minHeight: 76,
    textAlignVertical: 'top',
  },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  quickChip: {
    backgroundColor: colors.sandLight,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  quickText: { color: colors.ink, fontSize: typography.fontSize.caption, fontWeight: '600' },
  languageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  languageChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  languageChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  languageText: { color: colors.ink, fontWeight: '700' },
  languageTextActive: { color: colors.white, fontWeight: '700' },
  talkRow: { flexDirection: 'row', gap: spacing.sm },
  talkButton: {
    flex: 1,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: spacing.lg,
    minHeight: 88,
    justifyContent: 'center',
  },
  talkThem: { backgroundColor: colors.sageSoft },
  talkRecording: {
    borderWidth: 2,
    borderColor: colors.error,
  },
  talkTitle: { fontSize: typography.fontSize.title2, fontWeight: '800', color: colors.ink },
  talkSub: { color: colors.inkMuted, marginTop: 4, fontSize: typography.fontSize.caption },
  recordingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  recordingText: {
    color: colors.error,
    fontSize: typography.fontSize.caption,
    fontWeight: '700',
  },
  secondary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  secondaryText: { fontWeight: '800', color: colors.ink },
  cameraWrap: { height: 280, borderRadius: radii.lg, overflow: 'hidden', gap: spacing.sm },
  camera: { flex: 1 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.white, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  error: { color: colors.error, fontSize: typography.fontSize.caption, lineHeight: 18 },
  emptyState: {
    backgroundColor: colors.cardWarm,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: { color: colors.ink, fontWeight: '800', fontSize: typography.fontSize.headline },
  emptySubtitle: { color: colors.inkMuted, fontSize: typography.fontSize.caption, lineHeight: 18 },
  resultPanel: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: 6,
    ...shadows.sm,
  },
  source: { color: colors.inkMuted, fontSize: typography.fontSize.caption },
  nativeText: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  pronunciation: { color: colors.inkMuted },
});
