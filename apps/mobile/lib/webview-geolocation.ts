/**
 * WebView Geolocation Helper
 *
 * The native WebView geolocation bridge (geolocationEnabled prop) is unreliable
 * on both Android (New Architecture) and iOS (WKWebView restrictions).
 *
 * This module provides a reliable alternative:
 * 1. Gets the device location natively via expo-location
 * 2. Generates a JS polyfill that overrides navigator.geolocation in the WebView
 *    so websites receive coordinates directly without needing the native bridge.
 */

import * as Location from 'expo-location';
import { Alert, Platform } from 'react-native';

export interface DeviceCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
}

// Prevent multiple concurrent calls (handleOpenModal + handleWebViewLoadEnd
// can both call getDeviceLocation at the same time).
let _locationInFlight: Promise<DeviceCoords | null> | null = null;

/**
 * Request location permission and get the device's current position.
 * Returns null if permission is denied or location unavailable.
 *
 * @param options.silent - If true, suppress the "Location Services Off" alert.
 *   Used by handleWebViewLoadEnd retries so the alert doesn't pop up after
 *   the user has been browsing (or after they close the modal).
 */
export function getDeviceLocation(options?: { silent?: boolean }): Promise<DeviceCoords | null> {
  // When silent, skip the in-flight dedup so we don't piggyback on a
  // non-silent call that might be showing an alert.
  if (!options?.silent && _locationInFlight) return _locationInFlight;
  const promise = _getDeviceLocationImpl(options?.silent).finally(() => {
    if (_locationInFlight === promise) _locationInFlight = null;
  });
  if (!options?.silent) _locationInFlight = promise;
  return promise;
}

async function _getDeviceLocationImpl(silent?: boolean): Promise<DeviceCoords | null> {
  try {
    const servicesOn = await Location.hasServicesEnabledAsync();
    if (!servicesOn) {
      if (!silent) {
        Alert.alert(
          'Turn On Location',
          'Location helps grocery apps detect your delivery area.',
        );
      }
      return null;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return null;
    }

    // Try last-known position first (instant on both platforms).
    // Fall back to getCurrentPositionAsync with a 10s timeout — without a
    // timeout, iOS can hang indefinitely waiting for a GPS fix while Android
    // returns quickly via network location.
    let location = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000, requiredAccuracy: 1000 });
    if (!location) {
      const positionPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      positionPromise.catch(() => {}); // prevent unhandled rejection if timeout wins the race
      location = await Promise.race([
        positionPromise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('location timeout')), 10000)),
      ]);
    }

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy ?? 20,
      altitude: location.coords.altitude,
      altitudeAccuracy: location.coords.altitudeAccuracy,
      heading: location.coords.heading,
      speed: location.coords.speed,
    };
  } catch {
    return null;
  }
}

/**
 * Generate JavaScript that overrides navigator.geolocation in the WebView.
 * Websites calling getCurrentPosition/watchPosition will receive the provided coords.
 *
 * Inject this via webViewRef.current.injectJavaScript(script).
 */
export function buildGeolocationPolyfill(coords: DeviceCoords): string {
  return `(function() {
  if (window.__geoPolyfillInstalled) return;
  window.__geoPolyfillInstalled = true;

  var _coords = {
    latitude: ${coords.latitude},
    longitude: ${coords.longitude},
    accuracy: ${coords.accuracy},
    altitude: ${coords.altitude ?? 'null'},
    altitudeAccuracy: ${coords.altitudeAccuracy ?? 'null'},
    heading: ${coords.heading ?? 'null'},
    speed: ${coords.speed ?? 'null'},
  };

  var _makePosition = function() {
    return {
      coords: Object.assign({}, _coords),
      timestamp: Date.now(),
    };
  };

  var _watchId = 0;
  var _watches = {};

  navigator.geolocation.getCurrentPosition = function(success, error, options) {
    if (typeof success === 'function') {
      setTimeout(function() { success(_makePosition()); }, 50);
    }
  };

  navigator.geolocation.watchPosition = function(success, error, options) {
    var id = ++_watchId;
    if (typeof success === 'function') {
      setTimeout(function() { success(_makePosition()); }, 50);
      _watches[id] = setInterval(function() {
        success(_makePosition());
      }, 10000);
    }
    return id;
  };

  navigator.geolocation.clearWatch = function(id) {
    if (_watches[id]) {
      clearInterval(_watches[id]);
      delete _watches[id];
    }
  };

  // Also override the Permissions API for geolocation so sites see 'granted'
  if (navigator.permissions && navigator.permissions.query) {
    var _origQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = function(desc) {
      if (desc && desc.name === 'geolocation') {
        return Promise.resolve({ state: 'granted', onchange: null });
      }
      return _origQuery(desc);
    };
  }
})(); true;`;
}
