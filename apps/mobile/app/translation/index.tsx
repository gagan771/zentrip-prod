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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { translatePhoto, translateSpeech, translateText, type TranslationResponse } from '../../lib/translation';
import { speakNow, stopRecordingSafely, VOICE_RECORDING } from '../../lib/speech';
import { colors, radii, spacing } from '../../lib/theme';

const LANGUAGES = [
  { id: 'hindi', label: 'Hindi', speech: 'hi-IN' },
  { id: 'tamil', label: 'Tamil', speech: 'ta-IN' },
  { id: 'punjabi', label: 'Punjabi', speech: 'pa-IN' },
  { id: 'bengali', label: 'Bengali', speech: 'bn-IN' },
  { id: 'malayalam', label: 'Malayalam', speech: 'ml-IN' },
];
const QUICK_PHRASES = [
  'Thank you',
  'How much does this cost?',
  'Where is the toilet?',
  'I need help',
  'I am vegetarian',
  'I need drinking water',
  'Where is the railway station?',
  'Please make it less spicy',
];

type Side = 'you' | 'them';

export default function TranslationScreen() {
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(VOICE_RECORDING);
  useAudioRecorderState(recorder);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [text, setText] = useState('Thank you');
  const [targetLanguage, setTargetLanguage] = useState('hindi');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Array<TranslationResponse & { side: Side }>>([]);
  const selected = LANGUAGES.find((language) => language.id === targetLanguage) ?? LANGUAGES[0];
  const recordingStarted = useRef(false);
  const voiceSide = useRef<Side>('you');

  function speak(value: string, locale: string) {
    speakNow(value, locale);
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to start the microphone.');
    }
  }

  async function finishVoice() {
    if (!recordingStarted.current) return;
    recordingStarted.current = false;
    const side = voiceSide.current;
    setBusy(true);
    try {
      await stopRecordingSafely(recorder);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!recorder.uri) throw new Error('The recording was not saved.');
      const sourceLanguage = side === 'you' ? 'en' : targetLanguage;
      const target = side === 'you' ? targetLanguage : 'english';
      const result = await translateSpeech(recorder.uri, { sourceLanguage, targetLanguage: target });
      setTurns((prev) => [{ ...result, side }, ...prev.slice(0, 11)]);
      speak(result.translatedText, side === 'you' ? selected.speech : 'en-IN');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Voice translation failed');
    } finally {
      setBusy(false);
    }
  }

  async function runText() {
    setBusy(true);
    setError(null);
    try {
      const result = await translateText({ text: text.trim(), targetLanguage, sourceLanguage: 'en' });
      setTurns((prev) => [{ ...result, side: 'you' }, ...prev.slice(0, 11)]);
      speak(result.translatedText, selected.speech);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Translation failed');
    } finally {
      setBusy(false);
    }
  }

  async function captureMenu() {
    if (!cameraRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.45, skipProcessing: true });
      if (!photo?.uri) throw new Error('The photo was not saved.');
      const result = await translatePhoto(photo.uri, { targetLanguage });
      setTurns((prev) => [{ ...result, side: 'them' }, ...prev.slice(0, 11)]);
      speak(result.translatedText, selected.speech);
      setCameraOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Camera translation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.eyebrow}>LIVE TWO-PERSON TRANSLATOR</Text>
      <Text style={styles.title}>Speak, type, or scan a menu.</Text>
      <Text style={styles.subtitle}>
        Phrasebook first, then live translation. Hold You to speak English; hold Them for the local language. Camera reads menus and signs.
      </Text>

      <Text style={styles.label}>Local language</Text>
      <View style={styles.languageRow}>
        {LANGUAGES.map((language) => (
          <Pressable
            key={language.id}
            style={[styles.languageChip, targetLanguage === language.id && styles.languageChipActive]}
            onPress={() => setTargetLanguage(language.id)}
          >
            <Text style={targetLanguage === language.id ? styles.languageTextActive : styles.languageText}>{language.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.talkRow}>
        <Pressable
          style={styles.talkButton}
          disabled={busy}
          onPressIn={() => startVoice('you')}
          onPressOut={finishVoice}
        >
          <Text style={styles.talkTitle}>You</Text>
          <Text style={styles.talkSub}>English · hold to talk</Text>
        </Pressable>
        <Pressable
          style={[styles.talkButton, styles.talkThem]}
          disabled={busy}
          onPressIn={() => startVoice('them')}
          onPressOut={finishVoice}
        >
          <Text style={styles.talkTitle}>Them</Text>
          <Text style={styles.talkSub}>{selected.label} · hold to talk</Text>
        </Pressable>
      </View>

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
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>CAPTURE & TRANSLATE</Text>}
          </Pressable>
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.label}>Or type a phrase</Text>
        <TextInput value={text} onChangeText={setText} multiline style={styles.input} placeholder="Type in English" placeholderTextColor="#8A8F92" />
        <View style={styles.quickRow}>
          {QUICK_PHRASES.map((phrase) => (
            <Pressable key={phrase} style={styles.quickChip} onPress={() => setText(phrase)}>
              <Text style={styles.quickText}>{phrase}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable style={[styles.primaryButton, (!text.trim() || busy) && styles.disabled]} disabled={!text.trim() || busy} onPress={runText}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>TRANSLATE PHRASE</Text>}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

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
  screen: { flex: 1, backgroundColor: '#FBFAF6' },
  content: { padding: 20, paddingBottom: 48, gap: 14 },
  eyebrow: { color: '#8C3C29', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#1C2128', fontSize: 28, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#687078', fontSize: 14, lineHeight: 21, marginTop: -8 },
  label: { color: '#1C2128', fontSize: 13, fontWeight: '800' },
  panel: { backgroundColor: '#fff', borderColor: '#E5E1D7', borderRadius: 16, borderWidth: 1, gap: 10, padding: 16 },
  input: { color: '#1C2128', fontSize: 17, minHeight: 76, textAlignVertical: 'top' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  quickChip: { backgroundColor: '#F1EAD6', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7 },
  quickText: { color: '#1C2128', fontSize: 12, fontWeight: '600' },
  languageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  languageChip: { borderWidth: 1, borderColor: '#E5E1D7', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 },
  languageChipActive: { backgroundColor: '#8C3C29', borderColor: '#8C3C29' },
  languageText: { color: '#1C2128', fontWeight: '700' },
  languageTextActive: { color: '#fff', fontWeight: '700' },
  talkRow: { flexDirection: 'row', gap: 10 },
  talkButton: {
    flex: 1,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: 16,
    minHeight: 88,
    justifyContent: 'center',
  },
  talkThem: { backgroundColor: colors.sageSoft },
  talkTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  talkSub: { color: colors.inkMuted, marginTop: 4 },
  secondary: { borderWidth: 1, borderColor: '#E5E1D7', borderRadius: 14, padding: 12, alignItems: 'center' },
  secondaryText: { fontWeight: '800', color: '#1C2128' },
  cameraWrap: { height: 280, borderRadius: 16, overflow: 'hidden', gap: 8 },
  camera: { flex: 1 },
  primaryButton: { backgroundColor: '#8C3C29', borderRadius: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontWeight: '800' },
  disabled: { opacity: 0.5 },
  error: { color: '#B42318' },
  resultPanel: { backgroundColor: '#fff', borderColor: '#E5E1D7', borderRadius: 16, borderWidth: 1, padding: 16, gap: 6 },
  source: { color: '#687078', fontSize: 13 },
  nativeText: { color: '#1C2128', fontSize: 22, fontWeight: '800' },
  pronunciation: { color: '#687078' },
});
