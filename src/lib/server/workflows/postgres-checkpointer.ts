/**
 * Paused runs in Postgres, so an approval gate survives across instances.
 *
 * The saver creates and migrates its own tables with `setup()`, which is
 * async while the graph needs a saver synchronously at compile time. So every
 * operation waits on one shared setup first; after the first call that wait
 * is a resolved promise.
 */

import type { RunnableConfig } from "@langchain/core/runnables";
import type {
  ChannelVersions,
  Checkpoint,
  CheckpointListOptions,
  CheckpointMetadata,
  CheckpointTuple,
  PendingWrite,
} from "@langchain/langgraph-checkpoint";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import type { Pool } from "pg";

export class ReadyPostgresSaver extends PostgresSaver {
  private ready: Promise<void> | null = null;

  constructor(pool: Pool) {
    super(pool);
  }

  private ensureReady(): Promise<void> {
    if (!this.ready) {
      this.ready = this.setup().catch((error) => {
        this.ready = null; // retried by the next operation
        throw error;
      });
    }
    return this.ready;
  }

  override async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    await this.ensureReady();
    return super.getTuple(config);
  }

  override async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions
  ): AsyncGenerator<CheckpointTuple> {
    await this.ensureReady();
    yield* super.list(config, options);
  }

  override async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: ChannelVersions
  ): Promise<RunnableConfig> {
    await this.ensureReady();
    return super.put(config, checkpoint, metadata, newVersions);
  }

  override async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    await this.ensureReady();
    return super.putWrites(config, writes, taskId);
  }

  override async deleteThread(threadId: string): Promise<void> {
    await this.ensureReady();
    return super.deleteThread(threadId);
  }
}
