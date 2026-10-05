import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: { TZ: "Europe/Amsterdam" },
    testTimeout: 30000,
  },
});
