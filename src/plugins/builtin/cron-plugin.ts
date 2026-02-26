import type { GraceBotPlugin } from "../../shared/types.js";

export const cronPlugin: GraceBotPlugin = {
  name: "cron",
  version: "1.0.0",

  cron: [
    {
      schedule: "0 9 * * *",
      async handler() {
        // TODO: send daily summary to owner
      },
    },
  ],

  hooks: {
    "after-agent": async (_ctx) => {
      // TODO: collect conversation stats
    },
  },
};
