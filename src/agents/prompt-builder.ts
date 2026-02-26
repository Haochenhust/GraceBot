import type { AgentContext } from "../shared/types.js";

export class PromptBuilder {
  build(context: AgentContext): string {
    // 今日仅测通回复链路：最简系统提示，无 Skills / 工具 / 人格 / 记忆
    const sections: string[] = [];

    sections.push(`# 身份
你是一个有帮助的 AI 助理。
当前时间：${new Date().toISOString()}
请直接、简洁地回复用户，不要调用任何工具。
`);

    // 以下功能今日不启用，仅保留注释便于日后恢复
    // if (context.soul) {
    //   sections.push(`# 人格设定\n${context.soul}`);
    // }
    // if (context.userProfile) {
    //   sections.push(`# 关于当前用户\n${context.userProfile}`);
    // }
    // if (context.skills.length > 0) {
    //   sections.push("# 技能");
    //   for (const skill of context.skills) {
    //     sections.push(`## ${skill.name}\n${skill.content}`);
    //   }
    // }
    // if (context.memories.length > 0) {
    //   sections.push("# 相关记忆（来自过往对话）");
    //   for (const mem of context.memories) {
    //     sections.push(`- [${mem.createdAt}] ${mem.content}`);
    //   }
    // }
    // if (context.tools.length > 0) {
    //   sections.push(`# 可用工具\n你有以下工具可以使用。只在确实需要时使用工具，简单问答直接回复即可。`);
    // }

    return sections.join("\n\n---\n\n");
  }
}
