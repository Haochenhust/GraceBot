import type { ToolDefinition } from "../shared/types.js";

interface ExecParams {
  command: string;
  timeout?: number;
  cwd?: string;
}

export const execTool: ToolDefinition = {
  name: "exec",
  description:
    "在服务器上执行 Shell 命令。可以用来运行脚本、安装软件、查看系统状态等。",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "要执行的 Shell 命令" },
      timeout: {
        type: "number",
        description: "超时时间(秒)，默认 30",
        default: 30,
      },
      cwd: { type: "string", description: "工作目录，默认为用户 workspace" },
    },
    required: ["command"],
  },
  async execute(params, context) {
    const { command, timeout = 30, cwd } = params as ExecParams;
    const workDir = cwd ?? context.workspaceDir;

    const proc = Bun.spawn(["sh", "-c", command], {
      cwd: workDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const timer = setTimeout(() => proc.kill(), timeout * 1000);

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    clearTimeout(timer);

    let output = "";
    if (stdout) output += stdout;
    if (stderr) output += `\n[stderr]\n${stderr}`;
    if (exitCode !== 0) output += `\n[exit code: ${exitCode}]`;

    return { content: output || "(no output)", isError: exitCode !== 0 };
  },
};
