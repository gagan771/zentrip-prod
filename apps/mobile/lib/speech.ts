import {
  AudioQuality,
  IOSOutputFormat,
  type AudioMode,
  type AudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import * as Speech from 'expo-speech';

/** Native TTS is already local; keep rate snappy and don't wait on a long paragraph. */
const TTS_RATE = 1.22;

/** PlayAndRecord for the whole call so TTS and the mic can overlap (barge-in). */
export const CALL_AUDIO_MODE: Partial<AudioMode> = {
  allowsRecording: true,
  playsInSilentMode: true,
  interruptionMode: 'doNotMix',
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
};

/** Prefer WAV/PCM on iOS so the live socket can skip an AAC decode hop. Android stays AAC. */
export const LIVE_RECORDING: RecordingOptions = {
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    sampleRate: 16000,
    audioSource: 'voice_communication',
  },
  ios: {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.LOW,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 24000,
  },
};

/** 16 kHz mono AAC — Whisper's native rate, ~4× smaller than the 44.1 kHz stereo presets. */
export const VOICE_RECORDING: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 24000,
  // Metering drives end-of-turn detection in the live Zenny call loop.
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    sampleRate: 16000,
    audioSource: 'voice_communication',
  },
  ios: {
    extension: '.m4a',
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.LOW,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 24000,
  },
};

/**
 * expo-audio rejects `stop()` unless the recorder is actively recording, so a
 * double stop, an OS interruption, or a stop racing the start throws
 * "Call to function 'AudioRecorder.stop' has been rejected". None of those
 * leave state worth recovering, so they must not surface to the traveller.
 */
export async function stopRecordingSafely(recorder: AudioRecorder): Promise<void> {
  try {
    // Read native state instead of the React-facing property. The property can
    // lag briefly while expo-audio is finishing a stop/auto-stop transition.
    if (recorder.getStatus().isRecording) await recorder.stop();
  } catch {
    // Recorder was already torn down.
  }
}

export function spokenPreview(text: string, maxChars = 360): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxChars) return compact;
  const window = compact.slice(0, maxChars);
  const stops = ['. ', '! ', '? '];
  let best = -1;
  for (const stop of stops) {
    const at = window.lastIndexOf(stop);
    if (at > best && at >= 40) best = at;
  }
  if (best >= 40) return window.slice(0, best + 1).trim();
  const trimmed = window.replace(/\s+\S*$/, '').trim();
  return (trimmed || window) + '…';
}

export function speakNow(text: string, language = 'en-IN', onEnd?: () => void) {
  Speech.stop();
  Speech.speak(spokenPreview(text), {
    language,
    pitch: 1,
    rate: TTS_RATE,
    onDone: onEnd,
    onStopped: onEnd,
    onError: onEnd,
  });
}

export function stopSpeaking() {
  Speech.stop();
}

/** Queue a sentence without cutting the previous one. Barge-in still uses stopSpeaking(). */
export function speakChunk(text: string, language = 'en-IN') {
  const spoken = spokenPreview(text, 280);
  if (!spoken) return;
  Speech.speak(spoken, {
    language,
    pitch: 1,
    rate: TTS_RATE,
  });
}

/**
 * Awaitable TTS. The live call keeps the mic open while this runs so the
 * traveller can barge in. Some Android engines never fire a terminal callback,
 * so a length-based watchdog guarantees the promise settles.
 */
export function speakAsync(text: string, language = 'en-IN'): Promise<void> {
  const spoken = spokenPreview(text);
  return new Promise((resolve) => {
    let settled = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (watchdog) clearTimeout(watchdog);
      resolve();
    };

    Speech.stop();
    Speech.speak(spoken, {
      language,
      pitch: 1,
      rate: TTS_RATE,
      onDone: finish,
      onStopped: finish,
      onError: finish,
    });

    const estimatedMs = (spoken.split(/\s+/).length / (2.6 * TTS_RATE)) * 1000;
    watchdog = setTimeout(finish, Math.min(90000, estimatedMs + 6000));
  });
}
