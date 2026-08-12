import {
  CalendarRange,
  LayoutDashboard,
  Ship,
  Sprout,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

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
}

export interface NavGroup {
  label: string;
  pages: Page[];
}

/**
 * Navigation grouped by what each section is *for*: what the platform does,
 * what it knows, and what came of it. The group label doubles as the first
 * breadcrumb segment, so the header never needs its own copy of the tree.
 *
 * There is deliberately no "Data Sources" page. Provenance is not a subject in
 * its own right — it is a property of a figure, and it means something only
 * beside the figure it produced. Every page therefore carries its own source
 * panel naming just the publishers behind *its* numbers and what each one
 * contributed; see `src/source-map.ts`.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    pages: [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        title: "AI Agent Pipeline",
        description:
          "The coordination loop end to end — autonomous at every step except the approval gate.",
      },
    ],
  },
  {
    label: "Intelligence",
    pages: [
      {
        id: "farm-to-market",
        label: "Farm-to-Market",
        icon: TrendingUp,
        title: "Farm-to-Market",
        description:
          "Where the region buys outside itself something a member state already supplies into it.",
      },
      {
        id: "soil",
        label: "Soil & Crop Intel",
        icon: Sprout,
        title: "Soil & Crop Intel",
        description:
          "Growing conditions per member state — soil under the main growing area, climate exposure, and what the land yields.",
      },
      {
        id: "planting",
        label: "Planting Coordination",
        icon: CalendarRange,
        title: "Planting Coordination",
        description:
          "Rain-fed windows lined up across states, so the region covers more of the calendar instead of gluting the same weeks.",
      },
      {
        id: "logistics",
        label: "Port & Logistics",
        icon: Ship,
        title: "Port & Logistics",
        description:
          "The lanes a coordination plan would actually move over: distance, transit, and live weather at both ends.",
      },
    ],
  },
  {
    label: "Outcomes",
    pages: [
      {
        id: "impact",
        label: "Impact Metrics",
        icon: Target,
        title: "Impact Metrics",
        description:
          "What the coordination layer is worth against the region's import bill, and every decision the agents took to get there.",
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

/** The three destinations worth a thumb on a phone. */
export const MOBILE_TABS: { id: PageId; label: string }[] = [
  { id: "dashboard", label: "Home" },
  { id: "farm-to-market", label: "Intel" },
  { id: "logistics", label: "Ports" },
];
