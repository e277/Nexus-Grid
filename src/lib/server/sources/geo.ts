/**
 * Real coordinates for CARICOM islands, shared by the weather and routing
 * providers so both work from the same ground truth.
 *
 * Coordinates are each island's capital/main port (approximate, public
 * knowledge) — enough precision for regional weather lookups and
 * inter-island distance estimates, not for navigation.
 */

export type Coordinates = readonly [latitude: number, longitude: number];

/** (latitude, longitude) of each island's capital / main port */
export const ISLAND_COORDINATES: Record<string, Coordinates> = {
  jamaica: [17.9712, -76.7936], // Kingston
  trinidad: [10.6549, -61.5019], // Port of Spain
  "trinidad and tobago": [10.6549, -61.5019],
  barbados: [13.1132, -59.5988], // Bridgetown
  "saint lucia": [14.0101, -60.9875], // Castries
  "st. lucia": [14.0101, -60.9875],
  "st lucia": [14.0101, -60.9875],
  dominica: [15.3092, -61.3794], // Roseau
  grenada: [12.0561, -61.7488], // St. George's
  antigua: [17.1274, -61.8468], // St. John's
  "antigua and barbuda": [17.1274, -61.8468],
  "saint kitts and nevis": [17.3026, -62.7177], // Basseterre
  "st. kitts": [17.3026, -62.7177],
  "st kitts": [17.3026, -62.7177],
  "saint vincent": [13.1587, -61.2248], // Kingstown
  "st. vincent": [13.1587, -61.2248],
  guyana: [6.8013, -58.1551], // Georgetown
  suriname: [5.852, -55.2038], // Paramaribo
  belize: [17.5046, -88.1962], // Belize City
  bahamas: [25.048, -77.3554], // Nassau
  martinique: [14.6161, -61.0588], // Fort-de-France
  guadeloupe: [16.265, -61.551], // Pointe-à-Pitre
  haiti: [18.5944, -72.3074], // Port-au-Prince
  "dominican republic": [18.4861, -69.9312], // Santo Domingo
};

/** Case-insensitive lookup; returns null for unrecognized/blank names. */
export function lookupIsland(island: string | null | undefined): Coordinates | null {
  if (!island) return null;
  return ISLAND_COORDINATES[island.trim().toLowerCase()] ?? null;
}

/** Great-circle distance between two (lat, lon) points, in kilometers. */
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(a[0]);
  const lon1 = toRad(a[1]);
  const lat2 = toRad(b[0]);
  const lon2 = toRad(b[1]);
  const dlat = lat2 - lat1;
  const dlon = lon2 - lon1;
  const h =
    Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
  return 2 * 6371.0 * Math.asin(Math.sqrt(h));
}
