import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // These files cannot load yet (they import modules that are not in this repo) and are left out
    // until the task named above each line brings them back. Remove the line in that task.
    exclude: [
      ...configDefaults.exclude,
      // Task 4 removes this line (AI help: needs the AI provider).
      "tests/marketing-schrijfhulp.test.ts",
      // Task 4 removes this line (AI ideas: needs the AI provider; its pure parts come back with it).
      "tests/marketing-ideeen.test.ts",
      // Task 6 removes this line (templates; it also reads the brand files that Task 7 adds).
      "tests/marketing-sjablonen.test.ts",
    ],
    env: { TZ: "Europe/Amsterdam" },
    testTimeout: 30000,
  },
});
