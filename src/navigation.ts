import {
  LayoutDashboard,
  Leaf,
  Ship,
  Sprout,
  Store,
  Target,
  type LucideIcon,
} from "lucide-react";

import type { AnalysisDomain } from "./types";

export type PageId =
  | "dashboard"
  | "farm-to-market"
  | "soil"
  | "planting"
  | "logistics"
  | "impact";

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
 * Six destinations: the loop, the four specialists, and the analysis.
 *
 * They were collapsed to one page, and one page was wrong for what this is.
 * Each specialist reads a different part of the food system — trade, soil,
 * planting calendars, freight — and a rail that names them is the only thing
 * on screen that says the platform covers all four. Folded into a single
 * scroll, that breadth read as one long page of charts.
 *
 * The groups mirror how the work divides rather than how the code does:
 * Operations is what the platform is doing now, Intelligence is what each
 * agent has concluded about its own domain, Analysis is the cross-cutting
 * view where those conclusions are compared.
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
    label: "Intelligence",
    pages: [
      {
        id: "farm-to-market",
        label: "Farm-to-Market",
        icon: Store,
        domain: "market",
        title: "Farm-to-Market Intelligence",
        description:
          "Where the region buys food from outside itself when a neighbour already grows it — the substitution the coordination loop exists to act on.",
      },
      {
        id: "soil",
        label: "Soil & Crop",
        icon: Leaf,
        domain: "soil",
        title: "Soil & Crop Intelligence",
        description:
          "What the ground can carry: soil readings against the crops each member state is being asked to supply.",
      },
      {
        id: "planting",
        label: "Planting Coordination",
        icon: Sprout,
        domain: "planting",
        title: "Regional Planting Coordination",
        description:
          "Whether planting calendars line up across islands — the difference between a region that covers its own gaps and one that gluts and shorts the same crop in the same season.",
      },
      {
        id: "logistics",
        label: "Port & Logistics",
        icon: Ship,
        domain: "logistics",
        title: "Port & Logistics Coordination",
        description:
          "Whether the food can actually move: transit windows, routing between member states, and the weather that closes them.",
      },
    ],
  },
  {
    label: "Analysis",
    pages: [
      {
        id: "impact",
        label: "Impact Metrics",
        icon: Target,
        title: "Impact Metrics",
        description:
          "Every agent's conclusions in one place, as charts you can cut: findings by domain and severity, the confidence behind them, how suppliers scored, and every decision taken at the gate.",
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

