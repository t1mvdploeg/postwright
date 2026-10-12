// The desktop test opens a real window, so it runs on its own: npm run test:desktop.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  test: {
    include: ["desktop/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
