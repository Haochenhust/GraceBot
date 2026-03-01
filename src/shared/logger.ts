import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import pino from "pino";

const LOG_DIR = "logs";
const RUN_LOG_FILE = "run.log";

/** 单次运行的日志目录名：年月日时分秒 */
function getRunDirName(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}-${h}${min}${s}`;
}

const RUN_DIR_NAME = getRunDirName();

function ensureRunDir(): string {
  const base = join(process.cwd(), LOG_DIR);
  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true });
  }
  const runDir = join(base, RUN_DIR_NAME);
  if (!existsSync(runDir)) {
    mkdirSync(runDir, { recursive: true });
  }
  return runDir;
}

const runDir = ensureRunDir();
const fileStream = pino.destination({
  dest: join(runDir, RUN_LOG_FILE),
  append: true,
  mkdir: false,
});

const streams: pino.StreamEntry[] = [
  { stream: process.stdout },
  { stream: fileStream, level: "debug" },
];
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

/** 当前本次运行的日志目录（便于排查时打开） */
export function getRunLogDir(): string {
  return runDir;
}

/** 当前本次运行的全流程日志文件路径 */
export function getLogFilePath(): string {
  return join(runDir, RUN_LOG_FILE);
}
