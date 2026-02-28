/**
 * Kimi (Moonshot) API 余额查询工具
 * API 文档: https://platform.moonshot.cn/docs/api/balance
 */
import { createLogger } from "../shared/logger.js";
import type { ToolDefinition } from "../shared/types.js";

const log = createLogger("kimi-balance");

const BALANCE_URL = "https://api.moonshot.cn/v1/balance";

export interface KimiBalanceConfig {
  apiKey?: string;
  /** 可选，覆盖默认 balance 地址 */
  endpoint?: string;
}

/**
 * 创建 kimi_balance 工具，用于查询 Moonshot/Kimi API 账户余额。
 * 使用 config 中的 Kimi API Key，调用 GET /v1/balance。
 */
export function createKimiBalanceTool(config: KimiBalanceConfig): ToolDefinition {
  return {
    name: "kimi_balance",
    description:
      "Query the current balance (quota) of the Kimi/Moonshot API account. Use when the user asks about Kimi API balance, quota, remaining credits, or 余额.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    async execute(_params, _context) {
      const apiKey = config.apiKey;
      const url = config.endpoint ? `${config.endpoint.replace(/\/$/, "")}/balance` : BALANCE_URL;

      if (!apiKey) {
        return {
          content:
            "kimi_balance is not configured: no KIMI_API_KEY found in models.profiles (kimi provider).",
          isError: true,
        };
      }

      try {
        const res = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          signal: AbortSignal.timeout(10_000),
        });

        const raw = (await res.text()) || "{}";
        let data: unknown;
        try {
          data = JSON.parse(raw) as unknown;
        } catch {
          log.warn({ raw }, "Kimi balance API returned non-JSON");
          return { content: `Balance API returned non-JSON: ${raw.slice(0, 200)}`, isError: true };
        }

        if (!res.ok) {
          const errMsg =
            (data && typeof data === "object" && "error" in data && String((data as { error: unknown }).error)) ||
            `HTTP ${res.status}`;
          log.error({ status: res.status, errMsg }, "Kimi balance API error");
          return { content: `Balance request failed: ${errMsg}`, isError: true };
        }

        // 常见响应格式: { data: { balance: number } } 或 { balance: number }
        const obj = data as Record<string, unknown>;
        const dataBlock = obj?.data as Record<string, unknown> | undefined;
        const balance = (dataBlock?.balance ?? obj?.balance) as number | string | undefined;
        const currency = (dataBlock?.currency ?? obj?.currency) as string | undefined;

        if (balance !== undefined && balance !== null) {
          const amount = typeof balance === "number" ? balance : Number(balance);
          const cur = currency ?? "CNY";
          log.info({ balance: amount, currency: cur }, "Kimi balance fetched");
          return {
            content: `Kimi API 账户余额：**${amount} ${cur}**`,
          };
        }

        return {
          content: `Kimi balance response:\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error({ err: msg }, "Kimi balance request failed");
        return { content: `Balance request failed: ${msg}`, isError: true };
      }
    },
  };
}
