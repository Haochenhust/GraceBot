/**
 * Kimi (Moonshot) API 余额查询工具
 * API 文档: https://platform.moonshot.cn/docs/api/balance
 */
import { createLogger } from "../shared/logger.js";
import type { ToolDefinition } from "../shared/types.js";

const log = createLogger("kimi-balance");

/** 官方文档: https://platform.moonshot.cn/docs/api/balance */
const BALANCE_PATH = "/v1/users/me/balance";
const DEFAULT_BALANCE_URL = "https://api.moonshot.cn" + BALANCE_PATH;

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
      const base = config.endpoint?.replace(/\/$/, "") ?? "https://api.moonshot.cn";
      const url = base.replace(/\/v1\/?$/, "") + BALANCE_PATH;

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

        // 官方格式: { code: 0, data: { available_balance, voucher_balance, cash_balance }, status: true }
        const obj = data as Record<string, unknown>;
        const dataBlock = obj?.data as Record<string, unknown> | undefined;
        const available = dataBlock?.available_balance as number | undefined;
        const voucher = dataBlock?.voucher_balance as number | undefined;
        const cash = dataBlock?.cash_balance as number | undefined;

        if (
          typeof available === "number" ||
          typeof voucher === "number" ||
          typeof cash === "number"
        ) {
          log.info(
            { available_balance: available, voucher_balance: voucher, cash_balance: cash },
            "Kimi balance fetched",
          );
          const lines = [
            `**可用余额**：${available ?? 0} 元（现金 ${cash ?? 0} 元 + 代金券 ${voucher ?? 0} 元）`,
          ];
          if (typeof available === "number" && available <= 0) {
            lines.push("可用余额 ≤ 0 时无法调用推理 API，请充值或使用代金券。");
          }
          return { content: lines.join("\n\n") };
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
