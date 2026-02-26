import { readFile, writeFile, mkdir, copyFile, access } from "fs/promises";
import { dirname } from "path";

export function generateId(): string {
  return crypto.randomUUID();
}

export async function readJSON<T>(path: string): Promise<T | null> {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function writeJSON(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), "utf-8");
}

export async function readTextFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

export async function writeTextFile(
  path: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf-8");
}

export function getUserDataDir(userId: string): string {
  return `data/users/${userId}`;
}

export function getUserWorkspace(userId: string): string {
  return `data/users/${userId}/workspace`;
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function initUserSpace(userId: string): Promise<void> {
  const baseDir = getUserDataDir(userId);

  if (await pathExists(baseDir)) return;

  await mkdir(`${baseDir}/memory`, { recursive: true });
  await mkdir(`${baseDir}/skills`, { recursive: true });
  await mkdir(`${baseDir}/sessions`, { recursive: true });
  await mkdir(`${baseDir}/workspace`, { recursive: true });

  await copyFile("data/shared/defaults/SOUL.md", `${baseDir}/SOUL.md`);

  await writeFile(
    `${baseDir}/USER.md`,
    "# 用户画像\n\n（尚未建立，将在对话中自动积累）\n",
    "utf-8",
  );
}

export function truncateResult(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + "\n...[truncated]";
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
