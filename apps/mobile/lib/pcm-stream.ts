import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

const TARGET_RATE = 16000;

/**
 * Live 20ms PCM needs ExpoStreamAudio in the native binary.
 * Expo Go / an old `expo start` client does not have it — never import the
 * JS package in that case, because its load throws and LogBoxs.
 */
export function pcmStreamingSupported(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  return requireOptionalNativeModule('ExpoStreamAudio') != null;
}

export function decodePcm16Base64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function toPcm16k(pcm: Uint8Array, sampleRate: number): Uint8Array {
  if (sampleRate === TARGET_RATE || sampleRate <= 0 || pcm.byteLength < 2) return pcm;
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  const step = sampleRate / TARGET_RATE;
  const count = Math.max(1, Math.floor(samples.length / step));
  const down = new Int16Array(count);
  for (let index = 0; index < count; index += 1) {
    down[index] = samples[Math.min(samples.length - 1, Math.floor(index * step))];
  }
  return new Uint8Array(down.buffer);
}

export function pcmToArrayBuffer(pcm: Uint8Array): ArrayBuffer {
  return pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer;
}

export async function startPcmMic(handlers: {
  onFrame: (pcm: Uint8Array, level: number) => void;
  onError?: (message: string) => void;
}): Promise<() => Promise<void>> {
  if (!pcmStreamingSupported()) {
    throw new Error('PCM live mic is not in this native build');
  }

  const streamAudio = await import('expo-stream-audio');

  const frameSub = streamAudio.addFrameListener((frame) => {
    const pcm = toPcm16k(decodePcm16Base64(frame.pcmBase64), frame.sampleRate || TARGET_RATE);
    if (pcm.byteLength < 2) return;
    const level = Math.min(1, (frame.level ?? 0) * 5);
    handlers.onFrame(pcm, level);
  });
  const errorSub = streamAudio.addErrorListener((event) => {
    handlers.onError?.(event.message);
  });

  try {
    await streamAudio.start({
      sampleRate: 16000,
      frameDurationMs: 20,
      channels: 1,
      enableLevelMeter: true,
      enableBackground: false,
    });
  } catch (caught) {
    frameSub.remove();
    errorSub.remove();
    throw caught;
  }

  return async () => {
    frameSub.remove();
    errorSub.remove();
    try {
      await streamAudio.stop();
    } catch {
      // Already stopped.
    }
  };
}
