import type { AgentContext } from "../shared/types.js";

export class PromptBuilder {
  build(context: AgentContext): string {
    const sections: string[] = [];

    sections.push(`# 身份
你是 GraceBot，一个强大的个人 AI 助理。
当前时间：${new Date().toISOString()}
`);

    if (context.soul) {
      sections.push(`# 人格设定\n${context.soul}`);
    }

    if (context.userProfile) {
      sections.push(`# 关于当前用户\n${context.userProfile}`);
    }

    if (context.skills.length > 0) {
      sections.push("# 技能");
      for (const skill of context.skills) {
        sections.push(`## ${skill.name}\n${skill.content}`);
      }
    }

    if (context.memories.length > 0) {
      sections.push("# 相关记忆（来自过往对话）");
      for (const mem of context.memories) {
        sections.push(`- [${mem.createdAt}] ${mem.content}`);
      }
    }

    sections.push(`# 可用工具
你有以下工具可以使用。当你需要执行操作时，请调用对应工具。
只在确实需要时使用工具，简单问答直接回复即可。
`);

    return sections.join("\n\n---\n\n");
  }
}
