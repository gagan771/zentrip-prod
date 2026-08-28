import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CALL_AUDIO_MODE,
  LIVE_RECORDING,
  speakChunk,
  stopRecordingSafely,
  stopSpeaking,
} from './speech';
import {
  createZennyLiveSession,
  sendZennyVoiceTurn,
  zennyLiveSocketUrl,
  type ZennyVoiceTurn,
} from './zenny-voice';
import { useStore } from '../store/useStore';

export type CallPhase = 'idle' | 'connecting' | 'live' | 'speaking';

const CLIP_MS = 380;
const POLL_MS = 40;
const RECORDER_SETTLE_MS = 120;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function readClip(uri: string): Promise<{ mime: string; data: string } | null> {
  try {
    const response = await fetch(uri);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 64) return null;
    const lower = uri.toLowerCase();
    const mime = lower.includes('.wav')
      ? 'audio/wav'
      : lower.includes('.webm')
        ? 'audio/webm'
        : 'audio/m4a';
    return { mime, data: arrayBufferToBase64(buffer) };
  } catch {
    return null;
  }
}

function normalizeLevel(db: number): number {
  const clamped = Math.max(-60, Math.min(0, db));
  return (clamped + 60) / 60;
}

export function useZennyCall() {
  const recorder = useAudioRecorder(LIVE_RECORDING);
  const tripId = useStore((state) => state.activeTripId);
  const [phase, setPhase] = useState<CallPhase>('idle');
  const [turns, setTurns] = useState<ZennyVoiceTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [pending, setPending] = useState(false);
  const [partial, setPartial] = useState('');

  const recorderRef = useRef(recorder);
  const phaseRef = useRef<CallPhase>('idle');
  const active = useRef(false);
  const looping = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const lastLevel = useRef(0);
  const freshReply = useRef(true);
  const recorderChain = useRef(Promise.resolve());

  recorderRef.current = recorder;

  const withRecorder = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const run = recorderChain.current.then(operation, operation);
    recorderChain.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }, []);

  const updatePhase = useCallback((next: CallPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const publishLevel = useCallback((next: number) => {
    if (Math.abs(next - lastLevel.current) < 0.06) return;
    lastLevel.current = next;
    setLevel(next);
  }, []);

  const sendJson = useCallback((message: object) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  const openMic = useCallback(async () => {
    await setAudioModeAsync(CALL_AUDIO_MODE);
    await withRecorder(async () => {
      const rec = recorderRef.current;
      await stopRecordingSafely(rec);
      await delay(RECORDER_SETTLE_MS);
      await rec.prepareToRecordAsync();
    });
  }, [withRecorder]);

  const releaseMic = useCallback(async () => {
    await withRecorder(async () => {
      await stopRecordingSafely(recorderRef.current);
      await delay(RECORDER_SETTLE_MS);
    });
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
      });
    } catch {
      // Best-effort teardown.
    }
  }, [withRecorder]);

  const pumpClips = useCallback(async () => {
    while (active.current) {
      try {
        const uri = await withRecorder(async () => {
          const rec = recorderRef.current;
          await stopRecordingSafely(rec);
          await delay(RECORDER_SETTLE_MS);
          await rec.prepareToRecordAsync();
          if (!active.current) return null;
          // Use one explicit stop per clip. Combining forDuration with a
          // manual stop races expo-audio's native auto-stop callback.
          rec.record();
          const deadline = Date.now() + CLIP_MS;
          while (active.current && Date.now() < deadline) {
            try {
              const status = rec.getStatus();
              if (typeof status.metering === 'number') publishLevel(normalizeLevel(status.metering));
            } catch {
              break;
            }
            await delay(POLL_MS);
          }
          await stopRecordingSafely(rec);
          await delay(RECORDER_SETTLE_MS);
          return rec.uri;
        });
        lastLevel.current = 0;
        setLevel(0);
        if (uri && active.current) {
          const clip = await readClip(uri);
          if (clip) sendJson({ type: 'audio', mime: clip.mime, data: clip.data });
        }
      } catch {
        await delay(80);
      }
    }
  }, [publishLevel, sendJson, withRecorder]);

  const handleSocketMessage = useCallback(
    (raw: string) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return;
      }
      const kind = message.type;
      if (kind === 'partial' && typeof message.text === 'string') {
        setPartial(message.text);
        setPending(true);
      } else if (kind === 'final' && typeof message.text === 'string') {
        setPartial(message.text);
        setPending(true);
      } else if (kind === 'status') {
        const next = message.phase;
        if (next === 'speaking') updatePhase('speaking');
        else if (next === 'listening' || next === 'thinking') {
          if (next === 'thinking') freshReply.current = true;
          if (next === 'listening') setPending(false);
          else setPending(true);
          if (phaseRef.current !== 'connecting') updatePhase('live');
        }
      } else if (kind === 'speak' && typeof message.text === 'string') {
        if (freshReply.current) {
          stopSpeaking();
          freshReply.current = false;
        }
        updatePhase('speaking');
        speakChunk(message.text, 'en-IN');
      } else if (kind === 'reply' && typeof message.spokenText === 'string') {
        const turn = message as unknown as ZennyVoiceTurn;
        setTurns((previous) => [...previous, turn]);
        setPartial('');
        setPending(false);
      } else if (kind === 'error' && typeof message.message === 'string') {
        setError(message.message);
      }
    },
    [updatePhase]
  );

  const hangUpSocket = useCallback(() => {
    sendJson({ type: 'hangup' });
    const socket = socketRef.current;
    socketRef.current = null;
    try {
      socket?.close();
    } catch {
      // Already closed.
    }
  }, [sendJson]);

  const runLive = useCallback(async () => {
    const session = await createZennyLiveSession(tripId);
    const socket = new WebSocket(zennyLiveSocketUrl(session));
    socketRef.current = socket;
    await new Promise<void>((resolve, reject) => {
      const fail = setTimeout(() => reject(new Error('Live voice timed out connecting')), 8000);
      socket.onopen = () => {
        clearTimeout(fail);
        resolve();
      };
      socket.onerror = () => {
        clearTimeout(fail);
        reject(new Error('Live voice could not connect'));
      };
    });
    socket.onmessage = (event) => {
      if (typeof event.data === 'string') handleSocketMessage(event.data);
    };
    socket.onclose = () => {
      if (active.current) setError('The live call dropped. Tap to call again.');
      active.current = false;
    };
    const ping = setInterval(() => sendJson({ type: 'ping' }), 20000);
    updatePhase('live');
    try {
      await pumpClips();
    } finally {
      clearInterval(ping);
    }
  }, [handleSocketMessage, pumpClips, sendJson, tripId, updatePhase]);

  const runFallback = useCallback(async () => {
    // No paid STT key: keep the companion usable via the old turn upload.
    while (active.current) {
      const capture = await withRecorder(async () => {
        const rec = recorderRef.current;
        await stopRecordingSafely(rec);
        await delay(RECORDER_SETTLE_MS);
        await rec.prepareToRecordAsync();
        if (!active.current) return { heard: false, uri: null };
        rec.record();
        updatePhase('live');
        const started = Date.now();
        let heard = false;
        let lastVoice = started;
        while (active.current) {
          await delay(80);
          let metering: number | undefined;
          try {
            metering = rec.getStatus().metering;
          } catch {
            break;
          }
          if (typeof metering === 'number') {
            publishLevel(normalizeLevel(metering));
            if (metering > -30) {
              heard = true;
              lastVoice = Date.now();
            }
          }
          if (heard && Date.now() - lastVoice > 700) break;
          if (!heard && Date.now() - started > 12000) break;
          if (Date.now() - started > 15000) break;
        }
        await stopRecordingSafely(rec);
        await delay(RECORDER_SETTLE_MS);
        return { heard, uri: rec.uri };
      });
      if (!active.current || !capture.heard || !capture.uri) continue;
      setPending(true);
      try {
        const turn = await sendZennyVoiceTurn(capture.uri, tripId);
        if (!active.current) break;
        setTurns((previous) => [...previous, turn]);
        updatePhase('speaking');
        speakChunk(turn.spokenText, 'en-IN');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Zenny did not catch that.');
      } finally {
        setPending(false);
      }
    }
  }, [publishLevel, tripId, updatePhase, withRecorder]);

  const runLoop = useCallback(async () => {
    if (looping.current) return;
    looping.current = true;
    try {
      await openMic();
      if (!active.current) return;
      try {
        await runLive();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Live voice is unavailable';
        if (message.includes('503') || message.includes('Live voice is not configured')) {
          setError('Live STT is not configured yet — using the slower local fallback. Add SARVAM_API_KEY on the API.');
        }
        if (active.current) await runFallback();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The call with Zenny dropped.');
    } finally {
      active.current = false;
      looping.current = false;
      hangUpSocket();
      stopSpeaking();
      await releaseMic();
      lastLevel.current = 0;
      setLevel(0);
      setPending(false);
      setPartial('');
      updatePhase('idle');
    }
  }, [hangUpSocket, openMic, releaseMic, runFallback, runLive, updatePhase]);

  const startCall = useCallback(async () => {
    if (active.current || looping.current) return;
    setError(null);
    setTurns([]);
    setPartial('');
    setPending(false);
    updatePhase('connecting');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error('Microphone permission is needed to call Zenny.');
    } catch (caught) {
      updatePhase('idle');
      setError(caught instanceof Error ? caught.message : 'Unable to open the microphone.');
      return;
    }
    active.current = true;
    void runLoop();
  }, [runLoop, updatePhase]);

  const endCall = useCallback(() => {
    active.current = false;
    hangUpSocket();
    stopSpeaking();
  }, [hangUpSocket]);

  const nudge = useCallback(() => {
    if (!active.current) return;
    stopSpeaking();
    sendJson({ type: 'barge_in' });
    updatePhase('live');
  }, [sendJson, updatePhase]);

  useEffect(
    () => () => {
      active.current = false;
      hangUpSocket();
      stopSpeaking();
    },
    [hangUpSocket]
  );

  return {
    phase,
    turns,
    error,
    level,
    pending,
    partial,
    inCall: phase !== 'idle',
    startCall,
    endCall,
    nudge,
    clearError: useCallback(() => setError(null), []),
    pushTurn: useCallback((turn: ZennyVoiceTurn) => setTurns((prev) => [...prev, turn]), []),
    setError,
  };
}
