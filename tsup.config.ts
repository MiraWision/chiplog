import { defineConfig } from "tsup";

export default defineConfig({
  // Core has zero dependencies; the Hono adapter is a separate entry so an app
  // that does not use Hono never resolves it, and so the optional peer stays
  // genuinely optional.
  entry: ["src/index.ts", "src/hono.ts", "src/elysia.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  platform: "node",
  target: "node18",
  external: ["hono", "elysia"],
});
