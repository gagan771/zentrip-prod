import { requireOptionalNativeModule } from 'expo';

/** LiveKit WebRTC is a custom native module. Expo Go will always return false. */
export function livekitNativeAvailable(): boolean {
  try {
    return (
      requireOptionalNativeModule('LiveKitReactNative') != null ||
      requireOptionalNativeModule('WebRTCModule') != null ||
      requireOptionalNativeModule('LivekitReactNativeWebRTC') != null
    );
  } catch {
    return false;
  }
}
