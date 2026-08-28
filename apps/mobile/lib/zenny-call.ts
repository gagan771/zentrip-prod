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
  createZennyLiveSession,
  createZennyLivekitToken,
  getVoiceSessionId,
  getZennyVoiceStatus,
  sendZennyVoiceTurn,
  zennyAgentSocketUrl,
  zennyLiveSocketUrl,
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
  const [liveSttReady, setLiveSttReady] = useState(false);
  const [deepgramReady, setDeepgramReady] = useState(false);
  const [livekitReady, setLivekitReady] = useState(false);
  const [knowledgeMode, setKnowledgeMode] = useState('shared_gateway');

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
          setLiveSttReady(Boolean(status.liveSttReady));
          setDeepgramReady(Boolean(status.deepgramReady));
          setLivekitReady(Boolean(status.livekitReady));
          setKnowledgeMode(status.knowledgeMode || 'shared_gateway');
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

  const startDeepgramLive = useCallback(async () => {
    setError(null);
    updatePhase('connecting');
    stopSpeaking();
    stopPcmPlayback();
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) throw new Error('Microphone permission is needed to talk to Zenny.');
    await setAudioModeAsync(CALL_AUDIO_MODE);
    const session = await createZennyLiveSession(tripId, 'deepgram');
    const socket = new WebSocket(zennyLiveSocketUrl(session));
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;
    duplexRef.current = true;
    modeRef.current = 'duplex';
    setMode('duplex');

    await new Promise<void>((resolve, reject) => {
      const fail = (message: string) => reject(new Error(message));
      socket.onopen = () => resolve();
      socket.onerror = () => fail('Could not reach Zenny. Check you are on the same network as the API.');
      socket.onclose = (event) => {
        if (phaseRef.current === 'connecting') fail(`Zenny hung up (${event.code}).`);
      };
      setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) fail('Zenny took too long to answer.');
      }, 12000);
    });

    let streamedTurnIndex = -1;
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const message = JSON.parse(event.data) as {
          type?: string;
          text?: string;
          message?: string;
          transcript?: string;
          spokenText?: string;
          interactionId?: string | null;
          sessionId?: string;
          intent?: string;
          policyTier?: string;
          confidence?: string;
          citations?: ZennyVoiceTurn['citations'];
          items?: string[];
          brain?: string;
          phase?: string;
        };
        if (message.type === 'status' && message.phase === 'speaking') updatePhase('speaking');
        if (message.type === 'status' && message.phase === 'listening' && duplexRef.current) {
          updatePhase('live');
        }
        if ((message.type === 'partial' || message.type === 'final') && message.text) {
          if (message.type === 'final') streamedTurnIndex = -1;
          if (phaseRef.current === 'speaking') {
            stopPcmPlayback();
            stopSpeaking();
          }
          setPartial(message.text);
        }
        if (message.type === 'speak' && message.text) {
          setPartial('');
          setTurns((previous) => {
            const index = streamedTurnIndex >= 0 ? streamedTurnIndex : previous.length;
            const next = previous.slice();
            const existing = next[index];
            next[index] = existing
              ? { ...existing, spokenText: `${existing.spokenText} ${message.text}`.trim() }
              : {
                  sessionId: session.sessionId,
                  transcript: '',
                  spokenText: message.text || '',
                  intent: 'chat',
                  policyTier: 'no_confirmation',
                  confidence: 'estimated',
                  citations: [],
                  items: [],
                  brain: 'zentrip-shared-knowledge-gateway',
                };
            streamedTurnIndex = index;
            return next;
          });
          updatePhase('speaking');
        }
        if (message.type === 'reply' && message.spokenText) {
          setTurns((previous) => {
            const index = streamedTurnIndex >= 0 ? streamedTurnIndex : previous.length;
            const next = previous.slice();
            const existing = next[index];
            next[index] = {
              sessionId: message.sessionId || existing?.sessionId || session.sessionId,
              transcript: message.transcript || existing?.transcript || '',
              spokenText: message.spokenText || existing?.spokenText || '',
              interactionId: message.interactionId ?? existing?.interactionId,
              intent: message.intent || existing?.intent || 'chat',
              policyTier: message.policyTier || existing?.policyTier || 'no_confirmation',
              confidence: message.confidence || existing?.confidence || 'estimated',
              citations: message.citations || existing?.citations || [],
              items: message.items || existing?.items || [],
              brain: message.brain || existing?.brain || 'zentrip-shared-knowledge-gateway',
            };
            return next;
          });
          streamedTurnIndex = -1;
          updatePhase('speaking');
          void speakAsync(message.spokenText, 'en-IN')
            .then(() => {
              if (duplexRef.current) updatePhase('live');
            })
            .catch(() => undefined);
        }
        if (message.type === 'interrupt') {
          stopPcmPlayback();
          stopSpeaking();
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
      if (knowledgeMode === 'shared_gateway' && deepgramReady && pcmStreamingSupported()) {
        await startDeepgramLive();
        return;
      }
      if (knowledgeMode !== 'shared_gateway' && livekitReady && livekitNativeAvailable()) {
        await startLivekit();
        return;
      }
      if (knowledgeMode !== 'shared_gateway' && agentReady && pcmStreamingSupported()) {
        await startDuplex();
        return;
      }
      await startListening();
    } catch (caught) {
      await teardownDuplex();
      updatePhase('idle');
      const raw = caught instanceof Error ? caught.message : 'Unable to open the microphone.';
      if ((knowledgeMode === 'shared_gateway' && deepgramReady) || (knowledgeMode !== 'shared_gateway' && (liveSttReady || livekitReady))) {
        setError(`${raw} Falling back to tap-to-talk.`);
        try {
          await startListening();
          return;
        } catch (fallback) {
          setError(fallback instanceof Error ? fallback.message : raw);
          return;
        }
      }
      if (knowledgeMode !== 'shared_gateway' && agentReady && /PCM live mic is not in this native build/i.test(raw)) {
        setError(null);
        try {
          await startListening();
          return;
        } catch (fallback) {
          setError(fallback instanceof Error ? fallback.message : raw);
          return;
        }
      }
      if (knowledgeMode !== 'shared_gateway' && agentReady && pcmStreamingSupported()) {
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
  }, [agentReady, deepgramReady, knowledgeMode, liveSttReady, livekitReady, startDeepgramLive, startDuplex, startListening, startLivekit, teardownDuplex, updatePhase]);

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
    knowledgeMode,
    turns,
    error,
    level,
    pending,
    partial,
    inCall: phase !== 'idle',
    canDuplex:
      (knowledgeMode === 'shared_gateway' && deepgramReady && pcmStreamingSupported()) ||
      (knowledgeMode !== 'shared_gateway' && livekitReady && livekitNativeAvailable()) ||
      (knowledgeMode !== 'shared_gateway' && agentReady && pcmStreamingSupported()),
    startCall,
    endCall,
    nudge: toggleTalk,
    toggleTalk,
    clearError: useCallback(() => setError(null), []),
    pushTurn: useCallback((turn: ZennyVoiceTurn) => setTurns((prev) => [...prev, turn]), []),
    setError,
  };
}
