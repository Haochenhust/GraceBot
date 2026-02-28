module.exports = {
  apps: [
    {
      name: "gracebot",
      script: "src/index.ts",
      interpreter: "bun",
      // 崩溃/退出后自动重启
      autorestart: true,
      // 最多连续重启 10 次，避免异常死循环
      max_restarts: 10,
      min_uptime: "10s",
      // 监听代码变更并自动重启（仅监听源码与配置，排除依赖和日志）
      watch: true,
      ignore_watch: ["node_modules", "logs", ".git", "data", "*.log"],
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: "logs/error.log",
      out_file: "logs/output.log",
    },
  ],
};
