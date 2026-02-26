import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import pino from "pino";

const LOG_DIR = "logs";
const LOG_FILE = "gracebot.log";

function ensureLogDir(): string {
  const dir = join(process.cwd(), LOG_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function createFileStream(): pino.DestinationStream {
  const dir = ensureLogDir();
  const filePath = join(dir, LOG_FILE);
  return pino.destination(filePath);
}

// 控制台 + 本地文件双写：控制台在 dev 下用 pino-pretty，生产为 JSON；文件始终为 JSON 便于排查
const fileStream = createFileStream();
const streams: pino.StreamEntry[] = [{ stream: process.stdout }, { stream: fileStream }];
const multi = pino.multistream(streams);

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    base: { pid: process.pid },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  multi,
);

export function createLogger(module: string) {
  return logger.child({ module });
}

/** 当前日志文件路径（便于排查时打开） */
export function getLogFilePath(): string {
  return join(process.cwd(), LOG_DIR, LOG_FILE);
}
