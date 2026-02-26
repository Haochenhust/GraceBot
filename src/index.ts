import { loadConfig } from "./shared/config.js";
import { createLogger, getLogFilePath } from "./shared/logger.js";
import { createGateway } from "./gateway/index.js";
import { FeishuAPI } from "./gateway/feishu-api.js";
import { CentralController } from "./kernel/central-controller.js";
import { Scheduling } from "./kernel/scheduling.js";
import { Tasking } from "./kernel/tasking.js";
import { SessionManager } from "./kernel/session-manager.js";
import { AgentRunner } from "./agents/runner.js";
import { PromptBuilder } from "./agents/prompt-builder.js";
import { ModelRouter } from "./agents/model-router.js";
import { Compaction } from "./agents/compaction.js";
import { ToolRegistry } from "./tools/registry.js";
import { MemoryManager } from "./memory/memory-manager.js";
import { MockEmbedding } from "./memory/embedding.js";
import { SkillLoader } from "./skills/skill-loader.js";
import { HookBus } from "./plugins/hook-bus.js";
// import { PluginManager } from "./plugins/plugin-manager.js";
// import { cronPlugin } from "./plugins/builtin/cron-plugin.js";

// import { execTool } from "./tools/exec.js";
// import { fileReadTool } from "./tools/file-read.js";
// import { fileWriteTool } from "./tools/file-write.js";
// import { fileEditTool } from "./tools/file-edit.js";
// import { webSearchTool } from "./tools/web-search.js";
// import { webFetchTool } from "./tools/web-fetch.js";
// import { mcpCallTool } from "./tools/mcp-call.js";
// import { createMemoryReadTool } from "./tools/memory-read.js";
// import { createMemoryWriteTool } from "./tools/memory-write.js";

const log = createLogger("main");

async function main() {
  log.info("Starting GraceBot...");

  const config = loadConfig();

  // ── Core services ──
  const hookBus = new HookBus();
  const feishuAPI = new FeishuAPI(config.feishu);
  const sessionManager = new SessionManager(config.agent.session_timeout_minutes);
  const embedding = new MockEmbedding();
  const memoryManager = new MemoryManager(embedding);
  const skillLoader = new SkillLoader();

  // ── Tool Registry（今日仅测通回复链路，不注册任何工具）──
  const toolRegistry = new ToolRegistry();
  // toolRegistry.register(execTool);
  // toolRegistry.register(fileReadTool);
  // toolRegistry.register(fileWriteTool);
  // toolRegistry.register(fileEditTool);
  // toolRegistry.register(webSearchTool);
  // toolRegistry.register(webFetchTool);
  // toolRegistry.register(mcpCallTool);
  // toolRegistry.register(createMemoryReadTool(memoryManager));
  // toolRegistry.register(createMemoryWriteTool(memoryManager));

  // ── Agent ──
  const modelRouter = new ModelRouter({
    primary: config.models.primary,
    fallbacks: config.models.fallbacks,
    profiles: config.models.profiles,
  });
  const promptBuilder = new PromptBuilder();
  const compaction = new Compaction(modelRouter, config.models.compaction_model);
  const agentRunner = new AgentRunner(
    promptBuilder,
    modelRouter,
    compaction,
    toolRegistry,
    hookBus,
    config.agent.max_tool_rounds,
  );

  // ── Kernel ──
  const tasking = new Tasking(
    sessionManager,
    agentRunner,
    toolRegistry,
    memoryManager,
    skillLoader,
    hookBus,
  );
  const scheduling = new Scheduling(tasking, {
    concurrency: config.queue.concurrency,
    retries: config.queue.retries,
  });
  const centralController = new CentralController(
    sessionManager,
    scheduling,
    feishuAPI,
    hookBus,
  );
  tasking.setCentralController(centralController);

  // ── Gateway（飞书长连接 + HTTP 健康检查）──
  const app = createGateway(centralController, config.feishu);

  // ── Plugins（今日不启用）──
  // const pluginManager = new PluginManager(toolRegistry, hookBus, app);
  // pluginManager.register(cronPlugin);

  // ── Start server ──
  const port = config.server.port;
  log.info(
    { port, logFile: getLogFilePath() },
    "GraceBot is ready (logs also written to file)",
  );

  Bun.serve({
    port,
    fetch: app.fetch,
  });
}

main().catch((err) => {
  log.fatal({ err }, "GraceBot failed to start");
  process.exit(1);
});
