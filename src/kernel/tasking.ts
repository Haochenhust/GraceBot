import { createLogger } from "../shared/logger.js";
import { readTextFile } from "../shared/utils.js";
import type {
  AgentTask,
  AgentContext,
  AgentResult,
} from "../shared/types.js";
import type { SessionManager } from "./session-manager.js";
import type { CentralController } from "./central-controller.js";
import type { AgentRunner } from "../agents/runner.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { MemoryManager } from "../memory/memory-manager.js";
import type { SkillLoader } from "../skills/skill-loader.js";
import type { HookBus } from "../plugins/hook-bus.js";

const log = createLogger("tasking");

export class Tasking {
  private centralController!: CentralController;

  constructor(
    private sessionManager: SessionManager,
    private agentRunner: AgentRunner,
    private toolRegistry: ToolRegistry,
    private memoryManager: MemoryManager,
    private skillLoader: SkillLoader,
    private hookBus: HookBus,
  ) {}

  setCentralController(controller: CentralController): void {
    this.centralController = controller;
  }

  async execute(task: AgentTask): Promise<void> {
    const { userId, message, session } = task;

    log.info({ userId, sessionId: session.id }, "Executing task");

    const soul = await readTextFile(`data/users/${userId}/SOUL.md`);
    const userProfile = await readTextFile(`data/users/${userId}/USER.md`);
    const history = await this.sessionManager.getHistory(userId, session.id);

    const globalSkills = await this.skillLoader.loadGlobal();
    const userSkills = await this.skillLoader.loadUser(userId);

    const memories = await this.memoryManager.search(userId, message.text);

    const context: AgentContext = {
      userId,
      message,
      history,
      soul,
      userProfile,
      skills: [...globalSkills, ...userSkills],
      memories,
      tools: this.toolRegistry.getAvailableTools(),
    };

    let result: AgentResult;
    try {
      result = await this.agentRunner.run(context);
    } catch (err) {
      log.error({ err, userId }, "Agent execution failed");
      result = {
        text: "[GraceBot] 处理消息时发生错误，请稍后再试。",
        toolCalls: [],
        tokensUsed: { input: 0, output: 0 },
      };
    }

    await this.sessionManager.appendHistory(
      userId,
      session.id,
      message,
      result,
    );
    await this.centralController.sendReply(
      userId,
      message.chatId,
      message.messageId,
      result.text,
    );

    await this.hookBus.emit("after-agent", { userId, message, result });
  }
}
