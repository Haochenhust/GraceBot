import { appendFileSync } from "fs";
import { join } from "path";
import { getRunLogDir } from "./logger.js";

const TRACE_FILE = "trace.jsonl";

export interface SpanAttributes {
  [key: string]: string | number | boolean | string[] | undefined;
}

export interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  phase: string;
  startTime: string; // ISO
  endTime: string;
  durationMs: number;
  attributes?: SpanAttributes;
  /** 仅错误时存在 */
  error?: string;
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function traceFilePath(): string {
  return join(getRunLogDir(), TRACE_FILE);
}

function writeSpan(record: SpanRecord): void {
  try {
    appendFileSync(traceFilePath(), JSON.stringify(record) + "\n", "utf8");
  } catch (e) {
    // 避免 trace 写失败影响主流程
    console.error("[tracer] write failed", e);
  }
}

/**
 * 开始一个 span，在调用 end() 时写入一条 trace 记录到 trace.jsonl。
 * 便于按请求串联全链路并做可视化。
 */
export function startSpan(
  traceId: string,
  name: string,
  phase: string,
  attributes?: SpanAttributes,
  parentSpanId?: string,
): { spanId: string; end: (err?: Error) => void } {
  const spanId = genId();
  const startTime = new Date().toISOString();

  return {
    spanId,
    end(err?: Error) {
      const endTime = new Date().toISOString();
      const startMs = new Date(startTime).getTime();
      const endMs = new Date(endTime).getTime();
      const record: SpanRecord = {
        traceId,
        spanId,
        ...(parentSpanId && { parentSpanId }),
        name,
        phase,
        startTime,
        endTime,
        durationMs: endMs - startMs,
        ...(attributes && Object.keys(attributes).length > 0 && { attributes }),
        ...(err && { error: err.message }),
      };
      writeSpan(record);
    },
  };
}
