import * as Location from "expo-location";

export const LOCATION_PERMISSION_DENIED = "LOCATION_PERMISSION_DENIED";
export const LOCATION_TIMEOUT = "LOCATION_TIMEOUT";

const CURRENT_LOCATION_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.Balanced,
  mayShowUserSettingsDialog: true,
  timeInterval: 1000,
  distanceInterval: 0,
};
const WATCH_LOCATION_OPTIONS: Location.LocationOptions = {
  ...CURRENT_LOCATION_OPTIONS,
  accuracy: Location.Accuracy.High,
};
const CURRENT_LOCATION_TIMEOUT_MS = 8000;
const WATCH_LOCATION_TIMEOUT_MS = 5000;
const RECENT_LOCATION_MAX_AGE_MS = 60000;

function toCoordinates(location: Location.LocationObject) {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
}

function isRecentLocation(location: Location.LocationObject | null, maxAgeMs = RECENT_LOCATION_MAX_AGE_MS): location is Location.LocationObject {
  return !!location && Date.now() - location.timestamp <= maxAgeMs;
}

function waitForFreshUpdate(timeoutMs: number) {
  return new Promise<{ latitude: number; longitude: number }>(async (resolve, reject) => {
    let subscription: Location.LocationSubscription | null = null;
    const minimumTimestamp = Date.now() - 1000;
    const timeout = setTimeout(() => {
      subscription?.remove();
      reject(new Error("LOCATION_TIMEOUT"));
    }, timeoutMs);

    try {
      subscription = await Location.watchPositionAsync(
        WATCH_LOCATION_OPTIONS,
        (location) => {
          if (location.timestamp < minimumTimestamp) return;
          clearTimeout(timeout);
          subscription?.remove();
          resolve(toCoordinates(location));
        },
        (reason) => {
          clearTimeout(timeout);
          subscription?.remove();
          reject(new Error(reason));
        }
      );
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message = LOCATION_TIMEOUT) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

export async function requestCurrentCoordinates() {
  let permission = await withTimeout(Location.getForegroundPermissionsAsync(), 5000);
  if (permission.status !== "granted") {
    permission = await withTimeout(Location.requestForegroundPermissionsAsync(), 10000);
  }
  const { status } = permission;
  if (status !== "granted") {
    throw new Error(LOCATION_PERMISSION_DENIED);
  }

  const recentLastKnown = Location.getLastKnownPositionAsync({
    maxAge: RECENT_LOCATION_MAX_AGE_MS,
    requiredAccuracy: 100,
  }).catch(() => null);

  const location = await withTimeout(
    Location.getCurrentPositionAsync(CURRENT_LOCATION_OPTIONS),
    CURRENT_LOCATION_TIMEOUT_MS
  ).catch(async (error) => {
    const fallback = await recentLastKnown;
    if (isRecentLocation(fallback)) {
      return fallback;
    }
    throw error;
  });

  if (isRecentLocation(location)) {
    return toCoordinates(location);
  }

  try {
    return await waitForFreshUpdate(WATCH_LOCATION_TIMEOUT_MS);
  } catch {
    return toCoordinates(location);
  }
}
