import type { ToolDefinition } from "../shared/types.js";

interface ExecParams {
  command: string;
  timeout?: number;
  cwd?: string;
}

export const execTool: ToolDefinition = {
  name: "exec",
  description:
    "Execute a shell command on the server. Use for running scripts, listing files, checking system state, etc. Cwd defaults to user workspace.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to run" },
      timeout: {
        type: "number",
        description: "Timeout in seconds, default 30",
        default: 30,
      },
      cwd: { type: "string", description: "Working directory, default user workspace" },
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
