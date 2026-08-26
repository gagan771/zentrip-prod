import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Speech from 'expo-speech';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { sendZennyVoiceTurn, type ZennyVoiceTurn } from '../../lib/zenny-voice';
import { useStore } from '../../store/useStore';

type VoicePhase = 'ready' | 'listening' | 'thinking' | 'speaking' | 'error';

const STATUS_COPY: Record<VoicePhase, string> = {
  ready: 'Hold to speak',
  listening: 'Listening… release when you are done',
  thinking: 'Zenny is thinking…',
  speaking: 'Zenny is speaking',
  error: 'Try again',
};

export default function CompanionScreen() {
  const user = useStore((state) => state.user);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [phase, setPhase] = useState<VoicePhase>('ready');
  const [turn, setTurn] = useState<ZennyVoiceTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recordingStarted = useRef(false);
  const releaseRequested = useRef(false);
  const processing = useRef(false);

  async function startRecording() {
    if (processing.current || recordingStarted.current) return;
    if (!user || user.id === 'guest') {
      setError('Sign in to speak with Zenny. Explore remains available as a guest.');
      setPhase('error');
      return;
    }

    releaseRequested.current = false;
    setError(null);
    try {
      await Speech.stop();
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Microphone permission is needed to talk with Zenny.');
        setPhase('error');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingStarted.current = true;
      setPhase('listening');
      if (releaseRequested.current) await finishRecording();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to start the microphone.');
      setPhase('error');
    }
  }

  async function finishRecording() {
    releaseRequested.current = true;
    if (!recordingStarted.current || processing.current) return;
    recordingStarted.current = false;
    processing.current = true;
    setPhase('thinking');
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!recorder.uri) throw new Error('The recording was not saved. Please try again.');

      const response = await sendZennyVoiceTurn(recorder.uri);
      setTurn(response);
      setPhase('speaking');
      Speech.speak(response.spokenText, {
        language: 'en-US',
        pitch: 1,
        rate: 0.96,
        onDone: () => setPhase('ready'),
        onStopped: () => setPhase('ready'),
        onError: () => setPhase('ready'),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Zenny could not complete that voice turn.');
      setPhase('error');
    } finally {
      processing.current = false;
    }
  }

  const isBusy = phase === 'thinking' || phase === 'speaking';
  const recording = phase === 'listening' || recorderState.isRecording;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>YOUR VOICE COMPANION</Text>
        <Text style={styles.title}>Talk to Zenny</Text>
        <Text style={styles.subtitle}>Ask about your trip, compare options, or explore a landmark.</Text>
      </View>

      <View style={styles.orbArea}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hold to speak with Zenny"
          disabled={isBusy}
          onPressIn={startRecording}
          onPressOut={finishRecording}
          style={({ pressed }) => [styles.micButton, recording && styles.micButtonListening, pressed && styles.micButtonPressed, isBusy && styles.micButtonBusy]}
        >
          <Text style={styles.micIcon}>{recording ? '●' : '⌁'}</Text>
          <Text style={styles.micLabel}>{recording ? 'RELEASE' : 'HOLD TO TALK'}</Text>
        </Pressable>
        <Text style={styles.status}>{STATUS_COPY[phase]}</Text>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {turn ? (
        <View style={styles.turnCard}>
          <Text style={styles.cardLabel}>Zenny heard</Text>
          <Text style={styles.transcript}>“{turn.transcript}”</Text>
          <Text style={styles.cardLabel}>Answer · {turn.confidence}</Text>
          <Text style={styles.answer}>{turn.spokenText}</Text>
          {turn.citations.length > 0 ? (
            <View style={styles.sources}>
              <Text style={styles.sourceTitle}>SOURCES</Text>
              {turn.citations.map((citation, index) => (
                <Text key={`${citation.sourceName}-${index}`} style={styles.sourceText}>
                  {citation.sourceName} · verified {citation.lastVerified}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.promptCard}>
          <Text style={styles.promptTitle}>Try saying</Text>
          <Text style={styles.promptText}>“Tell me about the Taj Mahal.”</Text>
          <Text style={styles.promptText}>“What should I see in Jaipur?”</Text>
        </View>
      )}

      <Text style={styles.privacy}>Your recording is sent only to Zenny for this voice turn and is not kept by the app.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FBFAF6', padding: 20 },
  header: { paddingTop: 12 },
  eyebrow: { color: '#687078', fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  title: { color: '#1C2128', fontSize: 30, fontWeight: '800', marginTop: 8 },
  subtitle: { color: '#687078', fontSize: 14, lineHeight: 21, marginTop: 7, maxWidth: 315 },
  orbArea: { alignItems: 'center', paddingVertical: 34 },
  micButton: { alignItems: 'center', backgroundColor: '#1C2128', borderRadius: 110, height: 180, justifyContent: 'center', width: 180, shadowColor: '#1C2128', shadowOpacity: 0.18, shadowRadius: 18, elevation: 5 },
  micButtonListening: { backgroundColor: '#A4402A', transform: [{ scale: 1.04 }] },
  micButtonPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  micButtonBusy: { backgroundColor: '#687078' },
  micIcon: { color: '#fff', fontSize: 44, lineHeight: 48 },
  micLabel: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 9 },
  status: { color: '#687078', fontSize: 13, marginTop: 17 },
  turnCard: { backgroundColor: '#F1EAD6', borderRadius: 18, padding: 16 },
  cardLabel: { color: '#687078', fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 5 },
  transcript: { color: '#515963', fontSize: 14, fontStyle: 'italic', lineHeight: 20, marginBottom: 16 },
  answer: { color: '#1C2128', fontSize: 16, fontWeight: '500', lineHeight: 23 },
  sources: { borderTopColor: '#D7CEB8', borderTopWidth: 1, marginTop: 16, paddingTop: 12 },
  sourceTitle: { color: '#687078', fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 4 },
  sourceText: { color: '#515963', fontSize: 12, lineHeight: 18 },
  promptCard: { borderColor: '#E5E1D7', borderRadius: 18, borderWidth: 1, padding: 16 },
  promptTitle: { color: '#1C2128', fontSize: 13, fontWeight: '700', marginBottom: 7 },
  promptText: { color: '#687078', fontSize: 14, lineHeight: 22 },
  errorCard: { backgroundColor: '#F9E6E1', borderRadius: 12, marginBottom: 14, padding: 13 },
  errorText: { color: '#8C3C29', fontSize: 13, lineHeight: 19 },
  privacy: { color: '#8A8F86', fontSize: 11, lineHeight: 16, marginTop: 'auto', paddingTop: 14, textAlign: 'center' },
});
