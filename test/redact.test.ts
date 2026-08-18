import { describe, expect, it } from "vitest";

import { redactKeys } from "../src/index";
import { harness } from "./helpers";

describe("redaction", () => {
  it("masks configured keys anywhere in the tree, case-insensitively", async () => {
    const { chiplog, events } = harness({ redact: redactKeys(["email", "token"]) });

    await chiplog.run("signup", (flow) => {
      flow.stage("received", { Email: "a@b.com", nested: { token: "secret", id: 7 } });
      flow.set({ email: "c@d.com" });
    });

    expect(events[0]!.stages[0]!.meta).toEqual({
      Email: "[redacted]",
      nested: { token: "[redacted]", id: 7 },
    });
    expect(events[0]!.email).toBe("[redacted]");
  });

  it("drops a key entirely when the redactor returns undefined", async () => {
    const { chiplog, events } = harness({ redact: (key, value) => (key === "gone" ? undefined : value) });
    await chiplog.run("x", (flow) => flow.stage("s", { gone: 1, kept: 2 }));
    expect(events[0]!.stages[0]!.meta).toEqual({ kept: 2 });
  });
});

describe("bounded values", () => {
  it("truncates long strings with a marker", async () => {
    const { chiplog, events } = harness({ maxStringLength: 10 });
    await chiplog.run("x", (flow) => flow.stage("s", { blob: "x".repeat(25) }));
    expect(events[0]!.stages[0]!.meta!.blob).toBe(`${"x".repeat(10)}…(+15)`);
  });

  it("replaces cycles instead of throwing", async () => {
    const { chiplog, events } = harness();
    const cyclic: Record<string, unknown> = { name: "root" };
    cyclic.self = cyclic;
    await chiplog.run("x", (flow) => flow.stage("s", { cyclic }));
    expect(events[0]!.stages[0]!.meta!.cyclic).toEqual({ name: "root", self: "[circular]" });
  });

  it("stops at the depth limit", async () => {
    const { chiplog, events } = harness({ maxDepth: 2 });
    await chiplog.run("x", (flow) => flow.stage("s", { a: { b: { c: { d: 1 } } } }));
    expect(events[0]!.stages[0]!.meta).toEqual({ a: { b: "[depth limit]" } });
  });

  it("caps object keys and array length", async () => {
    const { chiplog, events } = harness({ maxKeys: 2, maxArrayLength: 2 });
    await chiplog.run("x", (flow) =>
      flow.stage("s", { wide: { a: 1, b: 2, c: 3, d: 4 }, list: [1, 2, 3, 4, 5] }),
    );
    const meta = events[0]!.stages[0]!.meta!;
    expect(meta.wide).toEqual({ a: 1, b: 2, "…": "(+2 keys)" });
    expect(meta.list).toEqual([1, 2, "…(+3 items)"]);
  });

  it("reduces hostile types to labels rather than dumping them", async () => {
    const { chiplog, events } = harness();
    await chiplog.run("x", (flow) =>
      flow.stage("s", {
        buffer: new Uint8Array(1024),
        fn: () => "nope",
        when: new Date("2026-01-02T03:04:05.000Z"),
        big: 10n,
        nope: Number.NaN,
        err: new Error("inner"),
        set: new Set([1, 2]),
        map: new Map([["k", "v"]]),
      }),
    );
    expect(events[0]!.stages[0]!.meta).toEqual({
      buffer: "[Uint8Array(1024 bytes)]",
      when: "2026-01-02T03:04:05.000Z",
      big: "10n",
      nope: "NaN",
      err: { name: "Error", message: "inner" },
      set: [1, 2],
      map: { k: "v" },
    });
  });
});
