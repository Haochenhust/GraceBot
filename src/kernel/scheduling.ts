import { mkdir } from "fs/promises";
import { dirname } from "path";
import { createLogger } from "../shared/logger.js";
import { readJSON, writeJSON } from "../shared/utils.js";
import type { AgentTask } from "../shared/types.js";
import type { Tasking } from "./tasking.js";

const log = createLogger("scheduling");

const QUEUE_DIR = "data/queue";
const PENDING_FILE = `${QUEUE_DIR}/pending.json`;
const IN_PROGRESS_FILE = `${QUEUE_DIR}/in_progress.json`;

export interface QueueJob {
  data: AgentTask;
  id: string;
}

function isQueueJob(raw: unknown): raw is QueueJob {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "id" in raw &&
    "data" in raw &&
    typeof (raw as QueueJob).id === "string"
  );
}

function parseJobs(raw: unknown): QueueJob[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is QueueJob => isQueueJob(x));
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

  /** 启动时调用：从磁盘恢复 pending + in_progress，保证重启后队列不丢 */
  async loadPendingJobs(): Promise<void> {
    await mkdir(dirname(PENDING_FILE), { recursive: true });
    const inProgress = parseJobs(await readJSON(IN_PROGRESS_FILE));
    const pending = parseJobs(await readJSON(PENDING_FILE));
    this.queue = [...inProgress, ...pending];
    if (this.queue.length > 0) {
      log.info(
        { inProgress: inProgress.length, pending: pending.length },
        "Queue restored from disk",
      );
      await writeJSON(PENDING_FILE, this.queue);
      await writeJSON(IN_PROGRESS_FILE, []);
    }
    this.processNext();
  }

  async enqueue(task: AgentTask): Promise<void> {
    const deduplicationKey = task.message.messageId;

    if (this.queue.some((job) => job.id === deduplicationKey)) {
      log.debug({ messageId: deduplicationKey }, "Duplicate task, skipping");
      return;
    }

    const job: QueueJob = { data: task, id: deduplicationKey };
    this.queue.push(job);
    await this.appendPending(job);
    log.info({ messageId: deduplicationKey }, "Task enqueued");

    this.processNext();
  }

  private async appendPending(job: QueueJob): Promise<void> {
    const pending = parseJobs(await readJSON(PENDING_FILE));
    pending.push(job);
    await writeJSON(PENDING_FILE, pending);
  }

  private async removeFromPending(jobId: string): Promise<void> {
    const pending = parseJobs(await readJSON(PENDING_FILE));
    const next = pending.filter((j) => j.id !== jobId);
    await writeJSON(PENDING_FILE, next);
  }

  private async addToInProgress(job: QueueJob): Promise<void> {
    const inProgress = parseJobs(await readJSON(IN_PROGRESS_FILE));
    inProgress.push(job);
    await writeJSON(IN_PROGRESS_FILE, inProgress);
  }

  private async removeFromInProgress(jobId: string): Promise<void> {
    const inProgress = parseJobs(await readJSON(IN_PROGRESS_FILE));
    const next = inProgress.filter((j) => j.id !== jobId);
    await writeJSON(IN_PROGRESS_FILE, next);
  }

  private async processNext(): Promise<void> {
    if (this.processing >= this.concurrency || this.queue.length === 0) return;

    const job = this.queue.shift()!;
    await this.removeFromPending(job.id);
    await this.addToInProgress(job);

    this.processing++;

    try {
      await this.executeWithRetry(job.data, this.retries);
    } catch (err) {
      log.error({ err, jobId: job.id }, "Task failed after retries");
    } finally {
      this.processing--;
      await this.removeFromInProgress(job.id);
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
