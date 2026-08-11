/**
 * The CARICOM member states this platform coordinates across, with the
 * identifiers each upstream source uses for them.
 *
 * Sources disagree about how to name a country — the World Bank uses ISO-3,
 * Comtrade uses M49 numeric codes, weather APIs want coordinates. Keeping one
 * table means a country resolved from any source lines up with the same
 * country resolved from every other, which is the whole coordination problem
 * in miniature.
 */

export interface CaricomState {
  iso3: string;
  /** UN M49 numeric code, used by Comtrade. */
  m49: number;
  name: string;
  /** Capital / main port, for weather and logistics lookups. */
  coordinates: readonly [latitude: number, longitude: number];
  /**
   * A point inside the country's main growing area, for soil and
   * agroclimate lookups.
   *
   * Capitals are the wrong place to ask about soil: they sit on the coast, and
   * the global soil grid returns no data over urban and near-shore pixels. These
   * are the recognised agricultural districts instead — Guyana's coastal rice
   * belt, Haiti's Artibonite valley, Belize's Cayo, Trinidad's central plain.
   */
  farmland: readonly [latitude: number, longitude: number];
}

export const CARICOM_STATES: CaricomState[] = [
  { iso3: "ATG", m49: 28, name: "Antigua and Barbuda", coordinates: [17.1274, -61.8468], farmland: [17.08, -61.79] },
  { iso3: "BHS", m49: 44, name: "Bahamas", coordinates: [25.048, -77.3554], farmland: [24.7, -77.95] },
  { iso3: "BRB", m49: 52, name: "Barbados", coordinates: [13.1132, -59.5988], farmland: [13.18, -59.55] },
  { iso3: "BLZ", m49: 84, name: "Belize", coordinates: [17.5046, -88.1962], farmland: [17.19, -88.8] },
  { iso3: "DMA", m49: 212, name: "Dominica", coordinates: [15.3092, -61.3794], farmland: [15.42, -61.34] },
  { iso3: "GRD", m49: 308, name: "Grenada", coordinates: [12.0561, -61.7488], farmland: [12.12, -61.68] },
  { iso3: "GUY", m49: 328, name: "Guyana", coordinates: [6.8013, -58.1551], farmland: [6.4, -57.9] },
  { iso3: "HTI", m49: 332, name: "Haiti", coordinates: [18.5944, -72.3074], farmland: [19.1, -72.4] },
  { iso3: "JAM", m49: 388, name: "Jamaica", coordinates: [17.9712, -76.7936], farmland: [18.15, -77.3] },
  { iso3: "MSR", m49: 500, name: "Montserrat", coordinates: [16.7425, -62.1874], farmland: [16.75, -62.2] },
  { iso3: "KNA", m49: 659, name: "Saint Kitts and Nevis", coordinates: [17.3026, -62.7177], farmland: [17.35, -62.78] },
  { iso3: "LCA", m49: 662, name: "Saint Lucia", coordinates: [14.0101, -60.9875], farmland: [13.9, -60.95] },
  { iso3: "VCT", m49: 670, name: "Saint Vincent and the Grenadines", coordinates: [13.1587, -61.2248], farmland: [13.25, -61.18] },
  { iso3: "SUR", m49: 740, name: "Suriname", coordinates: [5.852, -55.2038], farmland: [5.75, -55.15] },
  { iso3: "TTO", m49: 780, name: "Trinidad and Tobago", coordinates: [10.6549, -61.5019], farmland: [10.45, -61.3] },
];

const BY_ISO3 = new Map(CARICOM_STATES.map((s) => [s.iso3, s]));
const BY_M49 = new Map(CARICOM_STATES.map((s) => [s.m49, s]));
const BY_NAME = new Map(CARICOM_STATES.map((s) => [s.name.toLowerCase(), s]));

/** Aliases for the short island names that appear in operational data. */
const ALIASES: Record<string, string> = {
  trinidad: "TTO",
  tobago: "TTO",
  "saint lucia": "LCA",
  "st. lucia": "LCA",
  "st lucia": "LCA",
  "saint vincent": "VCT",
  "st. vincent": "VCT",
  "saint kitts": "KNA",
  "st. kitts": "KNA",
  "st kitts": "KNA",
  antigua: "ATG",
  barbuda: "ATG",
};

export function byIso3(iso3: string): CaricomState | null {
  return BY_ISO3.get(iso3.toUpperCase()) ?? null;
}

export function byM49(code: number): CaricomState | null {
  return BY_M49.get(code) ?? null;
}

/** Resolve a free-text country or island name to a member state. */
export function byName(name: string | null | undefined): CaricomState | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  const direct = BY_NAME.get(key);
  if (direct) return direct;
  const alias = ALIASES[key];
  return alias ? (BY_ISO3.get(alias) ?? null) : null;
}

export function isCaricom(m49: number): boolean {
  return BY_M49.has(m49);
}

/** Semicolon-joined ISO-3 list, the form the World Bank API expects. */
export const ISO3_LIST = CARICOM_STATES.map((s) => s.iso3).join(";");
