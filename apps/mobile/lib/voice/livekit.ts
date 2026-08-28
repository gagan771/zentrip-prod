import { livekitNativeAvailable } from './livekit-available';

type LivekitRoom = {
  connect: (url: string, token: string) => Promise<unknown>;
  disconnect: () => Promise<unknown> | void;
  localParticipant: { setMicrophoneEnabled: (enabled: boolean) => Promise<unknown> };
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

export async function connectLivekitRoom(url: string, token: string): Promise<() => Promise<void>> {
  if (!livekitNativeAvailable()) {
    throw new Error('LiveKit needs a development build. Run npx expo run:android (Expo Go cannot do WebRTC).');
  }

  let RoomCtor: new () => LivekitRoom;
  let AudioSession: { startAudioSession: () => Promise<void>; stopAudioSession: () => Promise<void> };
  let RoomEvent: { Disconnected: string; Reconnecting: string };
  try {
    const livekit = require('@livekit/react-native') as {
      Room: new () => LivekitRoom;
      AudioSession: { startAudioSession: () => Promise<void>; stopAudioSession: () => Promise<void> };
      RoomEvent: { Disconnected: string; Reconnecting: string };
      registerGlobals?: () => void;
    };
    livekit.registerGlobals?.();
    RoomCtor = livekit.Room;
    AudioSession = livekit.AudioSession;
    RoomEvent = livekit.RoomEvent;
  } catch {
    throw new Error('Install @livekit/react-native and rebuild the dev client.');
  }

  await AudioSession.startAudioSession();
  const room = new RoomCtor();
  await room.connect(url, token);
  await room.localParticipant.setMicrophoneEnabled(true);

  return async () => {
    try {
      await room.localParticipant.setMicrophoneEnabled(false);
    } catch {
      // Already muted.
    }
    try {
      await room.disconnect();
    } catch {
      // Already left.
    }
    try {
      await AudioSession.stopAudioSession();
    } catch {
      // Session already stopped.
    }
    void RoomEvent;
  };
}
