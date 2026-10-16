import { useCallback, useEffect, useRef, useState } from "react";
import { Overlay } from "pigeon-maps";

/*
 * Live "you are here" support for Pigeon Maps:
 * - useLiveLocation(): one-shot fix on demand, then watchPosition while mounted.
 * - userLocationOverlays(): accuracy circle + pulsing dot, returned as an
 *   array so it can be placed directly inside <Map> (Pigeon only passes map
 *   props to direct children).
 * - nearestPlace(): closest barangay to the user's position.
 */

export type LocationFix = { lat: number; lng: number; accuracy: number };

const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };

const MSG_BLOCKED = "Location is blocked. Allow location for this site in your browser settings.";
const MSG_UNAVAILABLE = "Couldn't get your location. Try moving near a window or turning on GPS.";
const MSG_INSECURE = "Location needs a secure (HTTPS) connection. Open BAHAba over https:// to use this.";

function friendlyError(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) {
    // Browsers also report insecure origins as "permission denied".
    return typeof window !== "undefined" && !window.isSecureContext ? MSG_INSECURE : MSG_BLOCKED;
  }
  return MSG_UNAVAILABLE;
}

const toFix = (pos: GeolocationPosition): LocationFix => ({
  lat: pos.coords.latitude,
  lng: pos.coords.longitude,
  accuracy: pos.coords.accuracy,
});

/**
 * Nothing is requested until locate() is called. The first fix and every
 * later locate() call trigger onRecenter; background watch updates only move
 * the dot.
 */
export function useLiveLocation(onRecenter: (fix: LocationFix) => void) {
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const watchId = useRef<number | null>(null);
  const fixRef = useRef<LocationFix | null>(null);
  const recenterRef = useRef(onRecenter);
  recenterRef.current = onRecenter;

  useEffect(
    () => () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    },
    [],
  );

  const locate = useCallback(() => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError(MSG_INSECURE);
      return;
    }
    if (!("geolocation" in navigator)) {
      setError(MSG_UNAVAILABLE);
      return;
    }

    setError(null);
    if (fixRef.current) recenterRef.current(fixRef.current);
    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = toFix(pos);
        fixRef.current = next;
        setFix(next);
        setLocating(false);
        recenterRef.current(next);

        if (watchId.current == null) {
          watchId.current = navigator.geolocation.watchPosition(
            (watched) => {
              const update = toFix(watched);
              fixRef.current = update;
              setFix(update);
              setError(null);
            },
            (err) => setError(friendlyError(err)),
            GEO_OPTIONS,
          );
        }
      },
      (err) => {
        setLocating(false);
        setError(friendlyError(err));
      },
      GEO_OPTIONS,
    );
  }, []);

  return { fix, error, locating, locate };
}

/** Ground resolution of 256px web-mercator tiles at this latitude and zoom. */
export function metersPerPixel(lat: number, zoom: number) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

const MAX_CIRCLE_PX = 3000;

export function userLocationOverlays(fix: LocationFix | null, zoom: number) {
  if (!fix) return [];
  const radius = Math.min(fix.accuracy / metersPerPixel(fix.lat, zoom), MAX_CIRCLE_PX);
  const dot = 18;
  return [
    <Overlay key="user-accuracy" anchor={[fix.lat, fix.lng]} offset={[radius, radius]}>
      <div
        aria-hidden="true"
        style={{
          width: radius * 2,
          height: radius * 2,
          borderRadius: "50%",
          background: "rgb(59 130 196 / 0.15)",
          border: "1px solid rgb(59 130 196 / 0.4)",
          pointerEvents: "none",
        }}
      />
    </Overlay>,
    <Overlay key="user-dot" anchor={[fix.lat, fix.lng]} offset={[dot / 2, dot / 2]}>
      <div role="img" aria-label="Your location" className="user-location" style={{ width: dot, height: dot }}>
        <span className="user-location-pulse" />
        <span className="user-location-dot" />
      </div>
    </Overlay>,
  ];
}

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = 6371000;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export function nearestPlace<T extends { lat: number; lng: number }>(fix: LocationFix | null, places: T[]): T | null {
  if (!fix || places.length === 0) return null;
  let best = places[0];
  let bestDistance = Infinity;
  for (const place of places) {
    const d = distanceMeters(fix.lat, fix.lng, place.lat, place.lng);
    if (d < bestDistance) {
      best = place;
      bestDistance = d;
    }
  }
  return best;
}
