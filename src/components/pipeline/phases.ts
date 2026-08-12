/**
 * The five phases of the control loop, the graph nodes that act in each, and
 * where everything sits on the diagram's 1280×600 canvas.
 *
 * The grouping is presentational. The node ids are the real ones the graph
 * reports in `updates`, so a card only lights up when that node actually ran —
 * see `src/lib/server/workflows/supply-chain-graph.ts`.
 */

export type PhaseId = "perceive" | "reason" | "plan" | "execute" | "recover";

export interface PhaseSpec {
  id: PhaseId;
  label: string;
  desc: string;
  /** Column geometry on the 1280-wide canvas. */
  x: number;
  /** Graph node ids acting in this phase, top to bottom. */
  nodes: string[];
  /** CSS custom-property stem — `--phase-<token>`, `-bg`, `-tx`. */
  token: string;
}

/**
 * Geometry is sized around the *gutters*, not the cards.
 *
 * Every edge carries a data-source badge, and those badges sit at the midpoint
 * between two cards. Columns are 251 apart and cards are 156 wide, which
 * leaves a 95px gutter — enough for the longest badge to sit clear of both
 * cards it connects. Widening the cards eats that gutter and the badges start
 * colliding with card text.
 */
export const CANVAS = { width: 1280, height: 540 } as const;
export const COLUMN = { width: 236, top: 44, height: 400 } as const;
export const CARD = { width: 156, height: 84 } as const;
/** Where the re-plan feedback edge runs, below the columns. */
export const LOOP_LANE = 500;

export const PHASES: PhaseSpec[] = [
  {
    id: "perceive",
    label: "Perceive",
    desc: "Read the signal",
    x: 20,
    nodes: ["perceive"],
    token: "perceive",
  },
  {
    id: "reason",
    label: "Reason",
    desc: "Assess & recommend",
    x: 271,
    nodes: ["assess", "recommend"],
    token: "reason",
  },
  {
    id: "plan",
    label: "Plan",
    desc: "Shape the action",
    x: 522,
    nodes: ["plan"],
    token: "plan",
  },
  {
    id: "execute",
    label: "Execute",
    desc: "Dispatch or hold",
    x: 773,
    nodes: ["hold", "execute"],
    token: "execute",
  },
  {
    id: "recover",
    label: "Recover",
    desc: "Watch & follow up",
    x: 1024,
    nodes: ["recover", "monitor"],
    token: "recover",
  },
];

/**
 * Centre point of each node card.
 *
 * Two rows at y 190 and 372; a phase with one node sits on the midline
 * between them so the forward path reads as a straight run.
 */
export const NODE_CENTER: Record<string, { x: number; y: number }> = {
  perceive: { x: 138, y: 281 },
  assess: { x: 389, y: 190 },
  recommend: { x: 389, y: 372 },
  plan: { x: 640, y: 281 },
  hold: { x: 891, y: 190 },
  execute: { x: 891, y: 372 },
  recover: { x: 1142, y: 190 },
  monitor: { x: 1142, y: 372 },
};

export const PHASE_OF_NODE: Record<string, PhaseId> = Object.fromEntries(
  PHASES.flatMap((phase) => phase.nodes.map((node) => [node, phase.id]))
);

export interface EdgeSpec {
  from: string;
  to: string;
  /**
   * What the target node reads across this edge. Rendered as a badge on the
   * curve — the point of the diagram is that each hop is fed by something
   * published, not by the platform's own opinion.
   */
  source: string;
  /** Branch label, where the edge is one of two ways out of a node. */
  label?: string;
  /** Drawn as an orthogonal feedback loop under the columns. */
  loop?: boolean;
}

export const EDGES: EdgeSpec[] = [
  { from: "perceive", to: "assess", source: "UN Comtrade" },
  { from: "assess", to: "recommend", source: "Regional picture" },
  { from: "recommend", to: "plan", source: "Model output" },
  { from: "plan", to: "hold", source: "Approval rule", label: "needs approval" },
  { from: "plan", to: "execute", source: "Auto-dispatch", label: "auto" },
  { from: "hold", to: "recover", source: "Operator call" },
  { from: "execute", to: "monitor", source: "Open-Meteo" },
  { from: "monitor", to: "recover", source: "Climate check" },
  { from: "monitor", to: "assess", source: "Disruption", label: "re-plan", loop: true },
];
