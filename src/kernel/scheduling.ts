import { createLogger } from "../shared/logger.js";
import type { AgentTask } from "../shared/types.js";
import type { Tasking } from "./tasking.js";

const log = createLogger("scheduling");

interface QueueJob {
  data: AgentTask;
  id: string;
}

export class Scheduling {
  private queue: QueueJob[] = [];
  private processing = 0;
  private concurrency: number;
  private retries: number;

  constructor(
    private tasking: Tasking,
    options: { concurrency?: number; retries?: number } = {},
  ) {
    this.concurrency = options.concurrency ?? 2;
    this.retries = options.retries ?? 1;
  }

  async enqueue(task: AgentTask): Promise<void> {
    const deduplicationKey = task.message.messageId;

    if (this.queue.some((job) => job.id === deduplicationKey)) {
      log.debug({ messageId: deduplicationKey }, "Duplicate task, skipping");
      return;
    }

    this.queue.push({ data: task, id: deduplicationKey });
    log.info({ messageId: deduplicationKey }, "Task enqueued");

    this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.processing >= this.concurrency || this.queue.length === 0) return;

    const job = this.queue.shift();
    if (!job) return;

    this.processing++;

    try {
      await this.executeWithRetry(job.data, this.retries);
    } catch (err) {
      log.error({ err, jobId: job.id }, "Task failed after retries");
    } finally {
      this.processing--;
      this.processNext();
    }
  }

  private async executeWithRetry(
    task: AgentTask,
    retriesLeft: number,
  ): Promise<void> {
    try {
      await this.tasking.execute(task);
    } catch (err) {
      if (retriesLeft > 0) {
        log.warn({ err, retriesLeft }, "Task failed, retrying...");
        await this.executeWithRetry(task, retriesLeft - 1);
      } else {
        throw err;
      }
    }
  }
}
