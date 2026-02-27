import type { AgentContext } from "../shared/types.js";

export class PromptBuilder {
  build(context: AgentContext): string {
    // All content sent to the model must be in English (see dev/LLM-content-language.md).
    const sections: string[] = [];

    sections.push(`# Identity
You are GraceBot.
Current time: ${new Date().toISOString()}
${context.tools.length === 0 ? "Reply directly and concisely. Do not call any tools." : "Reply concisely. Use tools only when needed (e.g. run commands, read/write files, search, or remember facts)."}
`);

    if (context.soul) {
      sections.push(`# Persona (SOUL)\n${context.soul}`);
    }
    if (context.userProfile) {
      sections.push(`# About the current user\n${context.userProfile}`);
    }
    if (context.skills.length > 0) {
      sections.push("# Skills");
      for (const skill of context.skills) {
        sections.push(`## ${skill.name}\n${skill.content}`);
      }
    }
    if (context.memories.length > 0) {
      sections.push("# Relevant memories (from past conversations)");
      for (const mem of context.memories) {
        sections.push(`- [${mem.createdAt}] ${mem.content}`);
      }
    }
    if (context.tools.length > 0) {
      sections.push(
        `# Available tools\nUse the following tools only when necessary; for simple Q&A, reply directly.`,
      );
    } else {
      sections.push("# Available tools\nNone for now.");
    }

    return sections.join("\n\n---\n\n");
  }
}
