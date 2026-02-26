import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { createLogger } from "../shared/logger.js";
import type { Skill } from "../shared/types.js";

const log = createLogger("skill-loader");

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

    try {
      const files = await readdir(dir);

      for (const file of files) {
        if (!file.endsWith(".md")) continue;
        try {
          const content = await readFile(join(dir, file), "utf-8");
          const name = file.replace(/\.md$/, "");
          skills.push({ name, content, source });
        } catch (err) {
          log.warn({ file, err }, "Failed to load skill file");
        }
      }
    } catch {
      // Directory doesn't exist yet
    }

    return skills;
  }
}
