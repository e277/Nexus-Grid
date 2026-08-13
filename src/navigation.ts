export type PageId = "dashboard";

export interface Page {
  id: PageId;
  /** Page heading and standfirst, shown above the view. */
  title: string;
  description: string;
}

/**
 * One page: the loop, and what it concluded.
 *
 * It was seven. Farm-to-Market, Soil & Crop Intel, Planting Coordination and
 * Port & Logistics were each one agent's reading of one domain, and splitting
 * them across four destinations put the reasoning a navigation step away from
 * the run it justifies — an operator deciding at the approval gate wants the
 * market and weather readings on the same screen as the decision.
 *
 * Impact Metrics was the last to fold in, for the same reason: the findings,
 * the supplier scores and the gate history are the output of the loop, so
 * reading them should not mean leaving it. With nowhere left to navigate, the
 * rail, the drawer and the phone's tab bar went with it — along with the group
 * labels and per-page icons that only ever existed to fill them.
 *
 * Provenance never earned a page of its own either: it is a property of a
 * figure, so each reading carries its own source panel naming just the
 * publishers behind it. See `src/source-map.ts`.
 *
 * This module stays rather than folding into the view: the heading and
 * standfirst are copy about the product, and they are easier to find and
 * revise here than inside an 800-line component.
 */
export const PAGES: Page[] = [
  {
    id: "dashboard",
    title: "AI Agent Pipeline",
    description:
      "The coordination loop end to end — autonomous at every step except the approval gate — and everything the agents concluded from it: findings by domain and severity, the confidence behind them, how suppliers scored, and every decision taken.",
  },
];

export function findPage(id: PageId): Page {
  return PAGES.find((page) => page.id === id) ?? PAGES[0];
}
