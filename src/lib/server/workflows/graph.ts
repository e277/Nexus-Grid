/**
 * A minimal stateful graph runtime.
 *
 * Supported: typed shared state that nodes update by returning partial
 * objects, plain and conditional edges, a checkpointer keyed by thread id,
 * and `interrupt()` for human-in-the-loop pauses that resume on the same
 * thread.
 *
 * `interrupt()` works as follows: the first time a node calls it, the run
 * halts and the state *before* that node is checkpointed. When the thread is
 * resumed with a decision, the node re-runs from the top and `interrupt()`
 * returns that decision instead of halting.
 */

export const END = "__end__";

/** Thrown by `interrupt()` to halt the run at a human-decision point. */
class GraphInterrupt extends Error {
  constructor(readonly value: unknown) {
    super("Graph interrupted");
    this.name = "GraphInterrupt";
  }
}

export interface NodeContext {
  /**
   * Pause the graph for a real human decision.
   *
   * Halts the run on first entry; returns the supplied decision when the
   * thread is resumed.
   */
  interrupt(value: unknown): unknown;
}

export type NodeFn<S> = (state: S, context: NodeContext) => Partial<S> | Promise<Partial<S>>;
export type ConditionFn<S> = (state: S) => string;

/** Resume a paused thread with a decision. */
export interface Command {
  resume: unknown;
}

export function isCommand(value: unknown): value is Command {
  return typeof value === "object" && value !== null && "resume" in value;
}

interface Checkpoint<S> {
  state: S;
  /** Node to run when the thread resumes, or null when the run finished. */
  next: string | null;
  interrupt: unknown;
}

/** The state history for one run, inspectable and resumable by thread id. */
export interface Checkpointer<S> {
  get(threadId: string): Checkpoint<S> | undefined;
  put(threadId: string, checkpoint: Checkpoint<S>): void;
}

/** Process-local checkpointer; state survives for the lifetime of the server. */
export class MemoryCheckpointer<S> implements Checkpointer<S> {
  private readonly threads = new Map<string, Checkpoint<S>>();

  get(threadId: string): Checkpoint<S> | undefined {
    return this.threads.get(threadId);
  }

  put(threadId: string, checkpoint: Checkpoint<S>): void {
    this.threads.set(threadId, checkpoint);
  }
}

export interface RunOutcome<S> {
  /** One entry per completed node: `{ [nodeName]: partialUpdate }`. */
  updates: Record<string, Partial<S>>[];
  /** Full state after each completed node. */
  values: S[];
  /** The node the run is paused at, or null when it ran to completion. */
  next: string | null;
  /** The payload passed to `interrupt()` when paused. */
  interrupt: unknown;
}

export class StateGraph<S extends object> {
  private readonly nodes = new Map<string, NodeFn<S>>();
  private readonly edges = new Map<string, string>();
  private readonly conditionalEdges = new Map<
    string,
    { condition: ConditionFn<S>; mapping: Record<string, string> }
  >();
  private entryPoint: string | null = null;

  addNode(name: string, fn: NodeFn<S>): this {
    this.nodes.set(name, fn);
    return this;
  }

  setEntryPoint(name: string): this {
    this.entryPoint = name;
    return this;
  }

  addEdge(from: string, to: string): this {
    this.edges.set(from, to);
    return this;
  }

  addConditionalEdges(
    from: string,
    condition: ConditionFn<S>,
    mapping: Record<string, string>
  ): this {
    this.conditionalEdges.set(from, { condition, mapping });
    return this;
  }

  compile(checkpointer: Checkpointer<S>): CompiledGraph<S> {
    if (this.entryPoint === null) throw new Error("Graph has no entry point");
    return new CompiledGraph(
      this.nodes,
      this.edges,
      this.conditionalEdges,
      this.entryPoint,
      checkpointer
    );
  }
}

export class CompiledGraph<S extends object> {
  constructor(
    private readonly nodes: Map<string, NodeFn<S>>,
    private readonly edges: Map<string, string>,
    private readonly conditionalEdges: Map<
      string,
      { condition: ConditionFn<S>; mapping: Record<string, string> }
    >,
    private readonly entryPoint: string,
    private readonly checkpointer: Checkpointer<S>
  ) {}

  /** The stored checkpoint for a thread, if it has one. */
  getState(threadId: string): Checkpoint<S> | undefined {
    return this.checkpointer.get(threadId);
  }

  /** Which node follows `current` given the state after it ran. */
  private nextNode(current: string, state: S): string {
    const conditional = this.conditionalEdges.get(current);
    if (conditional) {
      const branch = conditional.condition(state);
      const target = conditional.mapping[branch];
      if (target === undefined) {
        throw new Error(`Node '${current}' routed to unknown branch '${branch}'`);
      }
      return target;
    }
    return this.edges.get(current) ?? END;
  }

  /**
   * Run the graph to completion or its next pause point.
   *
   * Pass fresh input to start a thread, or a `Command` to resume one that is
   * paused at an interrupt.
   */
  async run(threadId: string, input: Partial<S> | Command): Promise<RunOutcome<S>> {
    const updates: Record<string, Partial<S>>[] = [];
    const values: S[] = [];

    let state: S;
    let current: string;
    let resumeValue: unknown;
    let hasResumeValue = false;

    if (isCommand(input)) {
      const checkpoint = this.checkpointer.get(threadId);
      if (!checkpoint || checkpoint.next === null) {
        throw new Error(`No paused run to resume for thread ${threadId}`);
      }
      state = checkpoint.state;
      current = checkpoint.next;
      resumeValue = input.resume;
      hasResumeValue = true;
    } else {
      state = { ...input } as S;
      current = this.entryPoint;
    }

    while (current !== END) {
      const node = this.nodes.get(current);
      if (node === undefined) throw new Error(`Unknown node '${current}'`);

      const context: NodeContext = {
        interrupt: (value: unknown) => {
          // A resume value is consumed by the first interrupt() of the node
          // it was delivered to; later calls pause the run again.
          if (hasResumeValue) {
            hasResumeValue = false;
            return resumeValue;
          }
          throw new GraphInterrupt(value);
        },
      };

      let partial: Partial<S>;
      try {
        partial = await node(state, context);
      } catch (error) {
        if (error instanceof GraphInterrupt) {
          this.checkpointer.put(threadId, { state, next: current, interrupt: error.value });
          return { updates, values, next: current, interrupt: error.value };
        }
        throw error;
      }

      state = { ...state, ...partial };
      updates.push({ [current]: partial });
      values.push({ ...state });
      current = this.nextNode(current, state);
    }

    this.checkpointer.put(threadId, { state, next: null, interrupt: null });
    return { updates, values, next: null, interrupt: null };
  }
}
