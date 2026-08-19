import { configDefaults, defineConfig } from "vitest/config";

const NODE_MAJOR = Number(process.versions.node.split(".")[0]);

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Elysia requires Node 20+: it reaches for the global `crypto`, which Node
    // 18 does not define. The file has to be excluded rather than its suite
    // skipped — a skipped suite is still collected, and collection runs the
    // import that throws. chiplog's own core supports 18 and the rest of the
    // suite proves it there.
    exclude: [
      ...configDefaults.exclude,
      ...(NODE_MAJOR < 20 ? ["test/elysia.test.ts"] : []),
    ],
  },
});
