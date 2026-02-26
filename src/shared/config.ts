import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import type { AppConfig } from "./types.js";

let cachedConfig: AppConfig | null = null;

function resolveEnvVars(obj: unknown): unknown {
  if (typeof obj === "string") {
    return obj.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] ?? "");
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVars);
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVars(value);
    }
    return result;
  }
  return obj;
}

export function loadConfig(path = "config.yaml"): AppConfig {
  if (cachedConfig) return cachedConfig;

  const raw = readFileSync(path, "utf-8");
  const parsed = parseYaml(raw);
  cachedConfig = resolveEnvVars(parsed) as AppConfig;

  return cachedConfig;
}

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}
