/**
 * Names for the trading partners outside CARICOM.
 *
 * The member-state table only knows the fifteen members, so every external
 * partner fell back to `Partner 842` — and those partners are the whole point
 * of a substitution finding. "Guyana buys its cereals from Partner 842" tells
 * an operator nothing and puts an opaque code into the agent's prompt, where
 * it then reappears in a recommendation.
 *
 * Codes are UN M49, which is what Comtrade reports, plus the few aggregates
 * Comtrade adds of its own. Anything still unrecognised keeps a labelled
 * fallback rather than being dropped — an unnamed partner is better than a
 * missing one, and it is visibly a code rather than a name.
 */

export const PARTNER_NAMES: Record<number, string> = {
  0: "World",
  32: "Argentina",
  36: "Australia",
  40: "Austria",
  56: "Belgium",
  68: "Bolivia",
  76: "Brazil",
  100: "Bulgaria",
  124: "Canada",
  152: "Chile",
  156: "China",
  170: "Colombia",
  188: "Costa Rica",
  192: "Cuba",
  203: "Czechia",
  208: "Denmark",
  214: "Dominican Republic",
  218: "Ecuador",
  222: "El Salvador",
  246: "Finland",
  250: "France",
  276: "Germany",
  300: "Greece",
  320: "Guatemala",
  340: "Honduras",
  348: "Hungary",
  356: "India",
  360: "Indonesia",
  372: "Ireland",
  376: "Israel",
  380: "Italy",
  388: "Jamaica",
  392: "Japan",
  404: "Kenya",
  410: "Republic of Korea",
  442: "Luxembourg",
  458: "Malaysia",
  484: "Mexico",
  504: "Morocco",
  528: "Netherlands",
  554: "New Zealand",
  558: "Nicaragua",
  566: "Nigeria",
  578: "Norway",
  586: "Pakistan",
  591: "Panama",
  600: "Paraguay",
  604: "Peru",
  608: "Philippines",
  616: "Poland",
  620: "Portugal",
  642: "Romania",
  643: "Russian Federation",
  682: "Saudi Arabia",
  702: "Singapore",
  703: "Slovakia",
  710: "South Africa",
  724: "Spain",
  752: "Sweden",
  756: "Switzerland",
  764: "Thailand",
  784: "United Arab Emirates",
  788: "Tunisia",
  792: "Türkiye",
  804: "Ukraine",
  826: "United Kingdom",
  840: "United States",
  // Comtrade reports United States trade under 842, which folds in Puerto
  // Rico and the US Virgin Islands.
  842: "United States",
  858: "Uruguay",
  862: "Venezuela",
  704: "Viet Nam",
  // Comtrade aggregates, kept named so a finding can cite them honestly.
  97: "European Union",
  490: "Other Asia, not elsewhere specified",
  899: "Areas, not elsewhere specified",
};

/** A partner's name, or a visibly-a-code fallback. */
export function partnerNameFor(code: number): string | null {
  return PARTNER_NAMES[code] ?? null;
}
