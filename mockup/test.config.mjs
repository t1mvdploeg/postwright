// Reuse the app's test suite, keeping generated files within the mockup boundary.
import original from "../vitest.config.ts";

export default {
  ...original,
  cacheDir: "mockup/.tmp/vite",
  test: { ...original.test, cache: false },
};
