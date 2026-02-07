import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "openclaw/plugin-sdk": path.join(
        repoRoot,
        "..",
        "openclaw",
        "src",
        "plugin-sdk",
        "index.ts",
      ),
    },
  },
  test: {
    testTimeout: 30_000,
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**", "**/*.live.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
