import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { createLogger } from "../shared/logger.js";
import type { Skill } from "../shared/types.js";

const log = createLogger("skill-loader");

const SKILL_FILE = "SKILL.md";

/**
 * OpenClaw/AgentSkills-compatible format: each skill is a directory with SKILL.md
 * containing YAML frontmatter (name, description) and Markdown instructions.
 */
function parseSkillMd(raw: string, fallbackName: string): { name: string; description?: string; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { name: fallbackName, content: raw.trim() };
  }
  let name = fallbackName;
  let description: string | undefined;
  try {
    const meta = parseYaml(match[1]) as Record<string, unknown>;
    if (meta && typeof meta.name === "string") name = meta.name;
    if (meta && typeof meta.description === "string") description = meta.description;
  } catch {
    // ignore invalid frontmatter
  }
  const content = match[2].trim();
  return { name, description, content };
}

export class SkillLoader {
  async loadGlobal(): Promise<Skill[]> {
    return this.loadFromDir("data/shared/skills", "global");
  }

  async loadUser(userId: string): Promise<Skill[]> {
    return this.loadFromDir(`data/users/${userId}/skills`, "user");
  }

  async loadAll(userId: string): Promise<Skill[]> {
    const globalSkills = await this.loadGlobal();
    const userSkills = await this.loadUser(userId);

    // User skills override global skills with the same name
    const merged = new Map<string, Skill>();
    for (const s of globalSkills) merged.set(s.name, s);
    for (const s of userSkills) merged.set(s.name, s);

    return Array.from(merged.values());
  }

  private async loadFromDir(
    dir: string,
    source: "global" | "user",
  ): Promise<Skill[]> {
    const skills: Skill[] = [];
    const seenNames = new Set<string>();

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      // 1) OpenClaw format: subdir/SKILL.md
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillPath = join(dir, entry.name, SKILL_FILE);
        try {
          const raw = await readFile(skillPath, "utf-8");
          const { name, description, content } = parseSkillMd(raw, entry.name);
          skills.push({ name, description, content, source });
          seenNames.add(name);
        } catch (err) {
          log.warn({ skillDir: entry.name, err }, "Failed to load skill SKILL.md");
        }
      }

      // 2) Legacy: top-level .md (e.g. user overrides or old bundles)
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          const name = entry.name.replace(/\.md$/i, "");
          if (seenNames.has(name)) continue;
          try {
            const raw = await readFile(join(dir, entry.name), "utf-8");
            const { name: parsedName, description, content } = parseSkillMd(raw, name);
            skills.push({ name: parsedName, description, content, source });
          } catch (err) {
            log.warn({ file: entry.name, err }, "Failed to load legacy skill file");
          }
        }
      }
    } catch {
      // Directory doesn't exist yet
    }

    return skills;
  }
}
