/**
 * Where a paused run is kept.
 *
 * The approval gate is the one point a run is not autonomous, and a human
 * takes human time over it. With an in-memory checkpointer every gate died
 * with the process — a deploy, a crash or a hot reload silently discarded a
 * decision someone was in the middle of making, and the thread id in the
 * client became unresumable with no way to tell why.
 *
 * SQLite is the smallest thing that fixes that: one file, no server, no
 * container. The app keeps its "no database required" property — the file is
 * created on demand and nothing else in the system reads it.
 */

import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";

import { MemorySaver, type BaseCheckpointSaver } from "@langchain/langgraph";

import { getSettings } from "../config";

const globalCheckpointer = globalThis as typeof globalThis & {
  __nexusGridCheckpointer?: BaseCheckpointSaver;
  __nexusGridCheckpointerKind?: CheckpointerKind;
};

export type CheckpointerKind = "sqlite" | "memory";

/** Which store is actually in use, for the health surface. */
export function checkpointerKind(): CheckpointerKind {
  getCheckpointer();
  return globalCheckpointer.__nexusGridCheckpointerKind ?? "memory";
}

/**
 * The process-wide checkpointer.
 *
 * Held on `globalThis` so a hot reload reuses the same handle rather than
 * opening a second one against the same file.
 */
export function getCheckpointer(): BaseCheckpointSaver {
  if (globalCheckpointer.__nexusGridCheckpointer) {
    return globalCheckpointer.__nexusGridCheckpointer;
  }

  const path = getSettings().checkpointDbPath.trim();
  if (path) {
    try {
      // Loaded lazily through createRequire: the SQLite saver pulls in a
      // native module, a deployment that sets CHECKPOINT_DB_PATH="" should not
      // need it built, and a bare `require` is not defined in an ESM bundle.
      const { SqliteSaver } = createRequire(import.meta.url)(
        "@langchain/langgraph-checkpoint-sqlite"
      ) as { SqliteSaver: { fromConnString(connString: string): BaseCheckpointSaver } };

      // Relative paths resolve against the working directory on their own.
      // Building an absolute one with `process.cwd()` makes the path opaque to
      // Turbopack's tracer, which then pulls the entire project into the
      // server output rather than the files it actually needs.
      mkdirSync(dirname(path), { recursive: true });
      globalCheckpointer.__nexusGridCheckpointer = SqliteSaver.fromConnString(path);
      globalCheckpointer.__nexusGridCheckpointerKind = "sqlite";
      console.info(`Workflow checkpointer: sqlite (${path})`);
      return globalCheckpointer.__nexusGridCheckpointer;
    } catch (error) {
      // A missing native build should degrade the guarantee, not the app.
      console.error(
        "SQLite checkpointer unavailable — falling back to in-memory. " +
          "Paused approval gates will not survive a restart.",
        error
      );
    }
  }

  globalCheckpointer.__nexusGridCheckpointer = new MemorySaver();
  globalCheckpointer.__nexusGridCheckpointerKind = "memory";
  console.info("Workflow checkpointer: in-memory");
  return globalCheckpointer.__nexusGridCheckpointer;
}
