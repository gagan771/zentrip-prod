import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { cacheDirectory, EncodingType, writeAsStringAsync } from 'expo-file-system/legacy';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + step));
  }
  return btoa(binary);
}

export function decodeBase64Bytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function pcm16ToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const size = pcm.byteLength;
  view.setUint32(0, 0x52494646, false); // RIFF
  view.setUint32(4, 36 + size, true);
  view.setUint32(8, 0x57415645, false); // WAVE
  view.setUint32(12, 0x666d7420, false); // fmt
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false); // data
  view.setUint32(40, size, true);
  const out = new Uint8Array(44 + size);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

type Clip = { pcm: Uint8Array; sampleRate: number };

let queue: Clip[] = [];
let pumping = false;
let player: AudioPlayer | null = null;
let generation = 0;

export function stopPcmPlayback() {
  generation += 1;
  queue = [];
  pumping = false;
  try {
    player?.pause();
    player?.remove();
  } catch {
    // Already released.
  }
  player = null;
}

export function enqueuePcmPlayback(pcm: Uint8Array, sampleRate: number) {
  if (pcm.byteLength < 2) return;
  queue.push({ pcm, sampleRate: sampleRate || 16000 });
  if (!pumping) void pump();
}

async function pump() {
  pumping = true;
  const gen = generation;
  while (queue.length && gen === generation) {
    const clip = queue.shift();
    if (!clip) break;
    try {
      await playClip(clip, gen);
    } catch {
      // Keep draining so a bad clip does not stall the call.
    }
  }
  if (gen === generation) pumping = false;
}

async function playClip(clip: Clip, gen: number): Promise<void> {
  if (!cacheDirectory || gen !== generation) return;
  const wav = pcm16ToWav(clip.pcm, clip.sampleRate);
  const uri = `${cacheDirectory}zenny-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`;
  await writeAsStringAsync(uri, bytesToBase64(wav), { encoding: EncodingType.Base64 });
  if (gen !== generation) return;
  if (!player) player = createAudioPlayer({ uri });
  else player.replace({ uri });
  player.play();
  const ms = Math.ceil((clip.pcm.byteLength / 2 / clip.sampleRate) * 1000) + 80;
  await delay(ms);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
