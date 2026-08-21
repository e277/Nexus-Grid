import {
  Activity,
  LayoutDashboard,
  Leaf,
  Ship,
  Sprout,
  Store,
  Truck,
  Warehouse,
  LineChart,
  type LucideIcon,
} from "lucide-react";

import type { AnalysisDomain } from "./types";

export type PageId =
  | "dashboard"
  | "farm-to-market"
  | "soil"
  | "planting"
  | "logistics"
  | "crop-planning"
  | "freight"
  | "distribution"
  | "visibility";

export interface Page {
  id: PageId;
  /** Sidebar label — short enough to survive the 240px rail. */
  label: string;
  icon: LucideIcon;
  /** Page heading and standfirst, shown above the view. */
  title: string;
  description: string;
  /**
   * The analysis domain this page renders, when it is one agent's reading.
   * Absent on the dashboard and on the cross-cutting analysis.
   */
  domain?: AnalysisDomain;
}

export interface NavGroup {
  label: string;
  pages: Page[];
}

/**
 * The coordination loop, and one page for each of the track's eight build
 * areas.
 *
 * Titles and descriptions are the track's own words, in the track's own order,
 * so a reader holding the brief can match a page to an area without
 * translating. What each page actually contains is on the page — including,
 * for the two areas this platform does not implement, a note saying so and
 * naming the dataset that would close it.
 *
 * A description here states the area, not the implementation. That is the
 * point of quoting the brief, and it is only honest because every page that
 * falls short of its area says where it falls short, above the fold.
 *
 * Provenance never earned a page of its own: it is a property of a figure, so
 * each finding carries its own evidence, and each reading names the publishers
 * behind it. See `src/source-map.ts`.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    pages: [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        title: "AI Agent Pipeline",
        description:
          "The coordination loop end to end — autonomous at every step except the approval gate — and the sourcing gaps it sweeps.",
      },
    ],
  },
  {
    label: "Food systems",
    pages: [
      {
        id: "farm-to-market",
        label: "Farm-to-Market",
        icon: Store,
        domain: "market",
        title: "Farm-to-Market Intelligence",
        description:
          "Systems that connect agricultural supply with regional demand—giving producers visibility into where food is needed most.",
      },
      {
        id: "crop-planning",
        label: "Crop Planning",
        icon: LineChart,
        title: "Crop Planning & Yield Forecasting",
        description:
          "Forecasting tools that align planting decisions with projected demand and environmental conditions across regions.",
      },
      {
        id: "soil",
        label: "Soil Monitoring",
        icon: Leaf,
        domain: "soil",
        title: "Soil Monitoring & Agricultural Intelligence",
        description:
          "Platforms that track soil health, land use, and growing conditions to optimize crop cycles and agricultural output.",
      },
      {
        id: "planting",
        label: "Planting Coordination",
        icon: Sprout,
        domain: "planting",
        title: "Regional Planting Coordination",
        description:
          "Systems that align planting schedules across farms and islands to reduce oversupply, prevent shortages, and stabilize markets.",
      },
      {
        id: "freight",
        label: "Freight Matching",
        icon: Truck,
        title: "Freight Matching & Route Optimization",
        description:
          "Matching freight capacity with agricultural supply in real time, optimizing shipping routes across islands.",
      },
      {
        id: "logistics",
        label: "Port & Logistics",
        icon: Ship,
        domain: "logistics",
        title: "Port & Logistics Coordination",
        description:
          "Coordination layers for port operations, customs processing, and inter-island freight movement.",
      },
      {
        id: "distribution",
        label: "Distribution",
        icon: Warehouse,
        domain: "distribution",
        title: "Food Distribution & Inventory Optimization",
        description:
          "Optimization systems for food distribution, warehouse management, and inventory across island markets.",
      },
      {
        // Last on purpose: this is the audit trail over what the other seven
        // pages' agents did, not a step in the analysis itself — it belongs
        // after the domains it reports on, not ahead of the last one.
        id: "visibility",
        label: "Supply Chain Visibility",
        icon: Activity,
        title: "Supply Chain Visibility & Tracking",
        description:
          "End-to-end visibility systems that track food from farm to market across the regional supply chain.",
      },
    ],
  },
];

export const PAGES: Page[] = NAV_GROUPS.flatMap((group) => group.pages);

export function findPage(id: PageId): Page {
  return PAGES.find((page) => page.id === id) ?? PAGES[0];
}

/** The group a page sits under — the middle breadcrumb segment. */
export function groupOf(id: PageId): string {
  return NAV_GROUPS.find((g) => g.pages.some((p) => p.id === id))?.label ?? "";
}

/**
 * The page that renders one analysis domain, if any.
 *
 * `impact` has no page of its own — it was folded into Farm-to-Market's
 * sourcing view — so this genuinely returns `null` for it rather than a
 * fallback page, and callers driving navigation off an analysis result
 * (a domain rollup, say) need to handle that rather than assume every
 * domain is a click away.
 */
export function pageForDomain(domain: AnalysisDomain): PageId | null {
  return PAGES.find((p) => p.domain === domain)?.id ?? null;
}

