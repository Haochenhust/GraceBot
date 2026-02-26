module.exports = {
  apps: [
    {
      name: "gracebot",
      script: "src/index.ts",
      interpreter: "bun",
      watch: false,
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
