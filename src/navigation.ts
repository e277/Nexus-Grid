import { LayoutDashboard, Target, type LucideIcon } from "lucide-react";

export type PageId = "dashboard" | "impact";

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
 * Two pages: what the platform is doing, and what it has concluded.
 *
 * It was seven. Farm-to-Market, Soil & Crop Intel, Planting Coordination and
 * Port & Logistics were each one agent's reading of one domain, and splitting
 * them across four destinations put the reasoning a navigation step away from
 * the run it justifies — an operator deciding at the approval gate wants the
 * market and weather readings on the same screen as the decision. They are now
 * a switcher under the loop.
 *
 * Provenance never earned a page of its own either: it is a property of a
 * figure, so each reading carries its own source panel naming just the
 * publishers behind it. See `src/source-map.ts`.
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
          "The coordination loop end to end — autonomous at every step except the approval gate — and the regional intelligence it acts on.",
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
          "Everything the agents concluded, as charts you can cut: findings by domain and severity, the confidence behind them, how suppliers scored, and every decision taken.",
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

/** Both destinations fit the bottom bar on a phone. */
export const MOBILE_TABS: { id: PageId; label: string }[] = [
  { id: "dashboard", label: "Pipeline" },
  { id: "impact", label: "Analysis" },
];
