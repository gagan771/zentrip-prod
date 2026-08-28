import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { pcmToArrayBuffer, pcmStreamingSupported, startPcmMic } from './pcm-stream';
import { decodeBase64Bytes, enqueuePcmPlayback, stopPcmPlayback } from './pcm-play';
import { livekitNativeAvailable } from './voice/livekit-available';
import { connectLivekitRoom } from './voice/livekit';
import {
  CALL_AUDIO_MODE,
  VOICE_RECORDING,
  speakAsync,
  stopRecordingSafely,
  stopSpeaking,
} from './speech';
import {
  createZennyAgentSession,
  createZennyLivekitToken,
  getVoiceSessionId,
  getZennyVoiceStatus,
  sendZennyVoiceTurn,
  zennyAgentSocketUrl,
  type ZennyVoiceTurn,
} from './zenny-voice';
import { useStore } from '../store/useStore';

export type CallPhase = 'idle' | 'connecting' | 'live' | 'speaking';
export type CallMode = 'tap' | 'duplex';

const MIN_TALK_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeLevel(db: number): number {
  const clamped = Math.max(-60, Math.min(0, db));
  return (clamped + 60) / 60;
}

export function useZennyCall() {
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const recState = useAudioRecorderState(recorder, 80);
  const tripId = useStore((state) => state.activeTripId);

  const [phase, setPhase] = useState<CallPhase>('idle');
  const [mode, setMode] = useState<CallMode>('tap');
  const [turns, setTurns] = useState<ZennyVoiceTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [pending, setPending] = useState(false);
  const [partial, setPartial] = useState('');
  const [agentReady, setAgentReady] = useState(false);
  const [livekitReady, setLivekitReady] = useState(false);

  const recorderRef = useRef(recorder);
  const phaseRef = useRef<CallPhase>('idle');
  const modeRef = useRef<CallMode>('tap');
  const busy = useRef(false);
  const startedAt = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const stopMicRef = useRef<(() => Promise<void>) | null>(null);
  const leaveLivekitRef = useRef<(() => Promise<void>) | null>(null);
  const duplexRef = useRef(false);
  recorderRef.current = recorder;

  const updatePhase = useCallback((next: CallPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const resetLevels = useCallback(() => {
    setLevel(0);
    setPending(false);
    setPartial('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getZennyVoiceStatus()
      .then((status) => {
        if (!cancelled) {
          setAgentReady(status.agentReady);
          setLivekitReady(Boolean(status.livekitReady));
        }
      })
      .catch(() => {
        if (!cancelled) setAgentReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== 'live' || mode === 'duplex') return;
    if (typeof recState.metering === 'number') setLevel(normalizeLevel(recState.metering));
  }, [mode, phase, recState.metering]);

  const releaseMic = useCallback(async () => {
    await stopRecordingSafely(recorderRef.current);
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
      });
    } catch {
      // Best-effort teardown.
    }
  }, []);

  const teardownDuplex = useCallback(async () => {
    duplexRef.current = false;
    stopPcmPlayback();
    stopSpeaking();
    const stopMic = stopMicRef.current;
    stopMicRef.current = null;
    if (stopMic) {
      try {
        await stopMic();
      } catch {
        // Mic already closed.
      }
    }
    const leaveLivekit = leaveLivekitRef.current;
    leaveLivekitRef.current = null;
    if (leaveLivekit) {
      try {
        await leaveLivekit();
      } catch {
        // Room already closed.
      }
    }
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState <= WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: 'hangup' }));
        socket.close();
      } catch {
        // Socket already gone.
      }
    }
    await releaseMic();
    resetLevels();
  }, [releaseMic, resetLevels]);

  const startLivekit = useCallback(async () => {
    setError(null);
    updatePhase('connecting');
    stopSpeaking();
    stopPcmPlayback();
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) throw new Error('Microphone permission is needed to talk to Zenny.');
    await setAudioModeAsync(CALL_AUDIO_MODE);
    const sessionId = await getVoiceSessionId();
    const session = await createZennyLivekitToken(sessionId);
    const leave = await connectLivekitRoom(session.url, session.token);
    leaveLivekitRef.current = leave;
    duplexRef.current = true;
    modeRef.current = 'duplex';
    setMode('duplex');
    startedAt.current = Date.now();
    updatePhase('live');
  }, [updatePhase]);

  const startDuplex = useCallback(async () => {
    setError(null);
    updatePhase('connecting');
    stopSpeaking();
    stopPcmPlayback();
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) throw new Error('Microphone permission is needed to talk to Zenny.');
    await setAudioModeAsync(CALL_AUDIO_MODE);
    const session = await createZennyAgentSession(tripId);
    const socket = new WebSocket(zennyAgentSocketUrl(session));
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;
    duplexRef.current = true;
    modeRef.current = 'duplex';
    setMode('duplex');

    await new Promise<void>((resolve, reject) => {
      const fail = (message: string) => {
        reject(new Error(message));
      };
      socket.onopen = () => resolve();
      socket.onerror = () => fail('Could not reach Zenny. Check you are on the same network as the API.');
      socket.onclose = (event) => {
        if (phaseRef.current === 'connecting') fail(`Zenny hung up (${event.code}).`);
      };
      setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) fail('Zenny took too long to answer.');
      }, 12000);
    });

    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const message = JSON.parse(event.data) as {
          type?: string;
          text?: string;
          data?: string;
          sampleRate?: number;
          spokenText?: string;
          interactionId?: string | null;
          transcript?: string;
          items?: string[];
          message?: string;
          phase?: string;
        };
        if (message.type === 'status' && message.phase === 'speaking') updatePhase('speaking');
        if (message.type === 'status' && message.phase === 'listening' && duplexRef.current) {
          updatePhase('live');
        }
        if (message.type === 'partial' && message.text) setPartial(message.text);
        if (message.type === 'speak' && message.text) {
          setPartial('');
          setTurns((previous) => [
            ...previous,
            {
              sessionId: session.sessionId,
              transcript: '',
              spokenText: message.text || '',
              intent: 'chat',
              policyTier: 'no_confirmation',
              confidence: 'verified',
              citations: [],
              items: [],
              brain: 'sarvam-voice-agent',
            },
          ]);
        }
        if (message.type === 'reply' && message.spokenText) {
          setTurns((previous) => {
            const last = previous[previous.length - 1];
            if (last && last.spokenText === message.spokenText) {
              const copy = previous.slice();
              copy[copy.length - 1] = {
                ...last,
                transcript: message.transcript || last.transcript,
                interactionId: message.interactionId || last.interactionId,
              };
              return copy;
            }
            return previous;
          });
        }
        if (message.type === 'audio' && message.data) {
          enqueuePcmPlayback(decodeBase64Bytes(message.data), message.sampleRate || 16000);
        }
        if (message.type === 'interrupt') {
          stopPcmPlayback();
          updatePhase('live');
        }
        if (message.type === 'error' && message.message) setError(message.message);
      } catch {
        // Ignore a malformed frame.
      }
    };
    socket.onclose = () => {
      if (!duplexRef.current) return;
      duplexRef.current = false;
      void teardownDuplex().then(() => updatePhase('idle'));
    };

    const stopMic = await startPcmMic({
      onFrame: (pcm, nextLevel) => {
        setLevel(nextLevel);
        if (socket.readyState !== WebSocket.OPEN) return;
        try {
          socket.send(pcmToArrayBuffer(pcm));
        } catch {
          // Drop a frame rather than killing the call.
        }
      },
      onError: (message) => setError(message),
    });
    stopMicRef.current = stopMic;
    startedAt.current = Date.now();
    updatePhase('live');
  }, [teardownDuplex, tripId, updatePhase]);

  const startListening = useCallback(async () => {
    setError(null);
    updatePhase('connecting');
    stopSpeaking();
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) throw new Error('Microphone permission is needed to talk to Zenny.');
    await setAudioModeAsync(CALL_AUDIO_MODE);
    const rec = recorderRef.current;
    await stopRecordingSafely(rec);
    await delay(60);
    await rec.prepareToRecordAsync();
    rec.record();
    startedAt.current = Date.now();
    setPending(false);
    setPartial('');
    modeRef.current = 'tap';
    setMode('tap');
    updatePhase('live');
  }, [updatePhase]);

  const finishAndReply = useCallback(async () => {
    const rec = recorderRef.current;
    const talkedMs = Date.now() - startedAt.current;
    updatePhase('connecting');
    setPending(true);
    await stopRecordingSafely(rec);
    await delay(80);
    const uri = rec.uri;
    if (talkedMs < MIN_TALK_MS || !uri) {
      await releaseMic();
      resetLevels();
      updatePhase('idle');
      setError('Tap Zenny, ask your question out loud, then tap again to send.');
      return;
    }
    try {
      const turn = await sendZennyVoiceTurn(uri, tripId);
      setTurns((previous) => [...previous, turn]);
      setPartial(turn.transcript);
      updatePhase('speaking');
      setPending(false);
      await speakAsync(turn.spokenText, 'en-IN');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Zenny could not hear that.';
      setError(message);
    } finally {
      await releaseMic();
      resetLevels();
      if (phaseRef.current !== 'idle') updatePhase('idle');
    }
  }, [releaseMic, resetLevels, tripId, updatePhase]);

  const startCall = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (livekitReady && livekitNativeAvailable()) {
        await startLivekit();
        return;
      }
      if (agentReady && pcmStreamingSupported()) {
        await startDuplex();
        return;
      }
      await startListening();
    } catch (caught) {
      await teardownDuplex();
      updatePhase('idle');
      const raw = caught instanceof Error ? caught.message : 'Unable to open the microphone.';
      if (livekitReady) {
        setError(`${raw} Falling back to tap-to-talk.`);
        try {
          await startListening();
          return;
        } catch (fallback) {
          setError(fallback instanceof Error ? fallback.message : raw);
          return;
        }
      }
      if (agentReady && /PCM live mic is not in this native build/i.test(raw)) {
        setError(null);
        try {
          await startListening();
          return;
        } catch (fallback) {
          setError(fallback instanceof Error ? fallback.message : raw);
          return;
        }
      }
      if (agentReady && pcmStreamingSupported()) {
        setError(`${raw} Falling back to tap-to-talk.`);
        try {
          await startListening();
          return;
        } catch {
          setError(raw);
        }
        return;
      }
      setError(raw);
    } finally {
      busy.current = false;
    }
  }, [agentReady, livekitReady, startDuplex, startListening, startLivekit, teardownDuplex, updatePhase]);

  const toggleTalk = useCallback(async () => {
    if (busy.current) return;
    if (modeRef.current === 'duplex' && duplexRef.current) {
      if (phaseRef.current === 'speaking') {
        stopPcmPlayback();
        stopSpeaking();
        updatePhase('live');
      }
      return;
    }
    busy.current = true;
    try {
      const current = phaseRef.current;
      if (current === 'connecting') return;
      if (current === 'live') {
        await finishAndReply();
        return;
      }
      if (current === 'speaking') {
        stopSpeaking();
        await startListening();
        return;
      }
      await startListening();
    } catch (caught) {
      await releaseMic();
      resetLevels();
      updatePhase('idle');
      setError(caught instanceof Error ? caught.message : 'Unable to open the microphone.');
    } finally {
      busy.current = false;
    }
  }, [finishAndReply, releaseMic, resetLevels, startListening, updatePhase]);

  const endCall = useCallback(() => {
    busy.current = false;
    void teardownDuplex();
    updatePhase('idle');
  }, [teardownDuplex, updatePhase]);

  return {
    phase,
    mode,
    duplex: mode === 'duplex' && phase !== 'idle',
    agentReady,
    turns,
    error,
    level,
    pending,
    partial,
    inCall: phase !== 'idle',
    canDuplex: (livekitReady && livekitNativeAvailable()) || (agentReady && pcmStreamingSupported()),
    startCall,
    endCall,
    nudge: toggleTalk,
    toggleTalk,
    clearError: useCallback(() => setError(null), []),
    pushTurn: useCallback((turn: ZennyVoiceTurn) => setTurns((prev) => [...prev, turn]), []),
    setError,
  };
}
