/** Place search for event locations, using Photon (OpenStreetMap data, no API key). */
export type Coordinates = { lat: number; lon: number };
export type PlaceSuggestion = {
  id: string;
  /** What's saved as the event's location. */
  label: string;
  name: string;
  detail: string;
  place: Coordinates;
};
type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
};

export const PHOTON_URL = "https://photon.komoot.io/api/";

export function toSuggestion(feature: PhotonFeature): PlaceSuggestion | null {
  const p = feature.properties;
  const [lon, lat] = feature.geometry?.coordinates ?? [];
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  const street = [p.street, p.housenumber].filter(Boolean).join(" ");
  const name = p.name || street;
  if (!name) return null;
  const detail = [
    ...new Set(
      [
        p.name ? street : "",
        p.district || p.locality,
        p.city,
        p.state,
        p.country,
      ].filter((part): part is string => Boolean(part) && part !== name),
    ),
  ];
  return {
    id: `${p.osm_type ?? ""}${p.osm_id ?? `${lat},${lon}`}`,
    label: [name, ...detail.slice(0, 2)].join(", ").slice(0, 200),
    name,
    detail: detail.join(", "),
    place: { lat, lon },
  };
}

export async function searchPlaces(
  query: string,
  near: Coordinates | undefined,
  signal: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({ q: query, limit: "5", lang: "en" });
  // Prefer places near ones the family has used before.
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lon));
  }
  const response = await fetch(`${PHOTON_URL}?${params}`, { signal });
  if (!response.ok) return [];
  const body = (await response.json()) as { features?: PhotonFeature[] };
  const seen = new Set<string>();
  return (body.features ?? [])
    .map(toSuggestion)
    .filter((s): s is PlaceSuggestion => {
      if (!s || seen.has(s.label)) return false;
      seen.add(s.label);
      return true;
    });
}

/** Opens directions in Google Maps (the app on phones, the website elsewhere). */
export function directionsUrl(location: string, place?: Coordinates) {
  const destination = place ? `${place.lat},${place.lon}` : location;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export function mapEmbedUrl({ lat, lon }: Coordinates) {
  const d = 0.004;
  const bbox = [lon - d * 1.6, lat - d, lon + d * 1.6, lat + d]
    .map((n) => n.toFixed(5))
    .join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(5)},${lon.toFixed(5)}`;
}
