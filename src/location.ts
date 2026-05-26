import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";

export const LOCATION_PERMISSION_DENIED = "LOCATION_PERMISSION_DENIED";
export const LOCATION_TIMEOUT = "LOCATION_TIMEOUT";
export const LAST_KNOWN_LOCATION_KEY = "lastKnownLocation";

export type Coordinates = {
  latitude: number;
  longitude: number;
};

const QUICK_LOCATION_TIMEOUT_MS = 2500;
const PRECISE_LOCATION_TIMEOUT_MS = 8000;

function toCoordinates(location: Location.LocationObject): Coordinates {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
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

function distanceMeters(a: Coordinates, b: Coordinates) {
  const radius = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export async function getCachedCoordinates() {
  const raw = await AsyncStorage.getItem(LAST_KNOWN_LOCATION_KEY).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Coordinates;
    if (Number.isFinite(parsed.latitude) && Number.isFinite(parsed.longitude)) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

async function cacheCoordinates(coordinates: Coordinates) {
  await AsyncStorage.setItem(LAST_KNOWN_LOCATION_KEY, JSON.stringify(coordinates)).catch(() => undefined);
}

export async function requestCurrentCoordinates(onQuickLocation?: (coordinates: Coordinates) => void) {
  let permission = await withTimeout(Location.getForegroundPermissionsAsync(), 5000);
  if (permission.status !== "granted") {
    permission = await withTimeout(Location.requestForegroundPermissionsAsync(), 10000);
  }
  if (permission.status !== "granted") {
    throw new Error(LOCATION_PERMISSION_DENIED);
  }

  const cached = await getCachedCoordinates();
  if (cached) {
    onQuickLocation?.(cached);
  }

  const quickLocation = await withTimeout(
    Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Lowest,
      timeInterval: 100,
      distanceInterval: 0,
    }),
    QUICK_LOCATION_TIMEOUT_MS
  );
  const quick = toCoordinates(quickLocation);
  onQuickLocation?.(quick);
  await cacheCoordinates(quick);

  try {
    const preciseLocation = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      PRECISE_LOCATION_TIMEOUT_MS
    );
    const precise = toCoordinates(preciseLocation);
    if (!quick || distanceMeters(quick, precise) > 15) {
      onQuickLocation?.(precise);
    }
    await cacheCoordinates(precise);
    return precise;
  } catch {
    return quick;
  }
}
