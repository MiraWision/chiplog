import { describe, expect, it } from "vitest";

import { correlationId, currentFlow, set, stage, traceparent } from "../src/index";
import { harness } from "./helpers";

/** Stands in for a repository three layers below the route handler. */
async function deepDown(): Promise<void> {
  await Promise.resolve();
  stage("db_query", { table: "orders" });
}

async function middleLayer(): Promise<void> {
  stage("service_entered");
  await deepDown();
}

describe("ambient context", () => {
  it("records stages from anywhere in the call stack with nothing threaded through", async () => {
    const { chiplog, events } = harness();

    await chiplog.run("orders.create", async () => {
      stage("received");
      await middleLayer();
    });

    expect(events[0]!.stages.map((s) => s.name)).toEqual([
      "received",
      "service_entered",
      "db_query",
    ]);
  });

  it("survives await boundaries including Promise.all", async () => {
    const { chiplog, events } = harness();

    await chiplog.run("fanout", async () => {
      await Promise.all([
        (async () => {
          await Promise.resolve();
          stage("branch_a");
        })(),
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          stage("branch_b");
        })(),
      ]);
    });

    expect(events[0]!.stages.map((s) => s.name).sort()).toEqual(["branch_a", "branch_b"]);
  });

  it("keeps concurrent flows completely separate", async () => {
    const { chiplog, events } = harness();

    await Promise.all([
      chiplog.run("a", async () => {
        stage("a1");
        await new Promise((resolve) => setTimeout(resolve, 5));
        stage("a2");
        set({ which: "a" });
      }),
      chiplog.run("b", async () => {
        stage("b1");
        await new Promise((resolve) => setTimeout(resolve, 1));
        stage("b2");
        set({ which: "b" });
      }),
    ]);

    const byFlow = Object.fromEntries(events.map((event) => [event.flow, event]));
    expect(byFlow.a!.stages.map((s) => s.name)).toEqual(["a1", "a2"]);
    expect(byFlow.b!.stages.map((s) => s.name)).toEqual(["b1", "b2"]);
    expect(byFlow.a!.which).toBe("a");
    expect(byFlow.b!.which).toBe("b");
    expect(byFlow.a!.correlationId).not.toBe(byFlow.b!.correlationId);
  });

  it("is a silent no-op outside any flow", () => {
    expect(() => stage("orphan", { a: 1 })).not.toThrow();
    expect(() => set({ a: 1 })).not.toThrow();
    expect(currentFlow()).toBeUndefined();
    expect(correlationId()).toBeUndefined();
    expect(traceparent()).toBeUndefined();
  });

  it("exposes the correlation id and traceparent of the flow in scope", async () => {
    const { chiplog, events } = harness();
    let seenId: string | undefined;
    let seenParent: string | undefined;

    await chiplog.run("x", () => {
      seenId = correlationId();
      seenParent = traceparent();
    });

    expect(seenId).toBe(events[0]!.correlationId);
    expect(seenParent).toBe(events[0]!.traceparent);
  });
});
