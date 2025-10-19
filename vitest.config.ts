import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    setupFiles: "./test/setup.ts",
    include: ["./test/**/*.test.ts"],
    hookTimeout: 20_000,
    testTimeout: 20_000,
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["node_modules", "dist"],
      reporter: ["text", "json", "html"],
      all: true,
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
