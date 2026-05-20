import * as Location from "expo-location";

export const LOCATION_PERMISSION_DENIED = "LOCATION_PERMISSION_DENIED";
export const LOCATION_TIMEOUT = "LOCATION_TIMEOUT";

const FRESH_LOCATION_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.Highest,
  mayShowUserSettingsDialog: true,
  timeInterval: 1000,
  distanceInterval: 0,
};

function toCoordinates(location: Location.LocationObject) {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
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
        FRESH_LOCATION_OPTIONS,
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
  const { status } = await withTimeout(Location.requestForegroundPermissionsAsync(), 10000);
  if (status !== "granted") {
    throw new Error(LOCATION_PERMISSION_DENIED);
  }

  const location = await withTimeout(Location.getCurrentPositionAsync(FRESH_LOCATION_OPTIONS), 15000);
  if (Date.now() - location.timestamp <= 15000) {
    return toCoordinates(location);
  }

  try {
    return await waitForFreshUpdate(12000);
  } catch {
    return toCoordinates(location);
  }
}
