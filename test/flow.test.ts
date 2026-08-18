import { describe, expect, it, vi } from "vitest";

import { stage } from "../src/index";
import { harness } from "./helpers";

describe("run", () => {
  it("emits exactly one event with the stages in order", async () => {
    const { chiplog, events, advance } = harness();

    await chiplog.run("orders.create", (flow) => {
      advance(5);
      flow.stage("validated", { itemCount: 3 });
      advance(20);
      flow.stage("charged");
    });

    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.outcome).toBe("ok");
    expect(event.level).toBe("info");
    expect(event.message).toBe("flow orders.create ok");
    expect(event.stageCount).toBe(2);
    expect(event.stages.map((s) => s.name)).toEqual(["validated", "charged"]);
    expect(event.stages[0]).toMatchObject({ atMs: 5, durationMs: 5, meta: { itemCount: 3 } });
    expect(event.stages[1]).toMatchObject({ atMs: 25, durationMs: 20 });
    expect(event.durationMs).toBe(25);
  });

  it("returns the resolved value untouched", async () => {
    const { chiplog } = harness();
    await expect(chiplog.run("x", () => "result")).resolves.toBe("result");
  });

  it("marks the flow failed at the running stage and rethrows unchanged", async () => {
    const { chiplog, events } = harness();
    const boom = new Error("card declined");

    await expect(
      chiplog.run("orders.create", (flow) => {
        flow.stage("validated");
        flow.stage("charged");
        throw boom;
      }),
    ).rejects.toBe(boom);

    const event = events[0]!;
    expect(event.outcome).toBe("failed");
    expect(event.level).toBe("error");
    expect(event.failedStage).toBe("charged");
    expect(event.message).toBe("flow orders.create failed at charged");
    expect(event.error).toMatchObject({ name: "Error", message: "card declined" });
    expect(event.error?.stack).toBeTypeOf("string");
  });

  it("cannot report ok for a flow that threw, even with no stages", async () => {
    const { chiplog, events } = harness();
    await expect(chiplog.run("bare", () => Promise.reject(new Error("nope")))).rejects.toThrow();
    expect(events[0]!.outcome).toBe("failed");
    expect(events[0]!.failedStage).toBeUndefined();
    expect(events[0]!.message).toBe("flow bare failed");
  });

  it("serialises a thrown non-Error", async () => {
    const { chiplog, events } = harness();
    await expect(chiplog.run("x", () => Promise.reject("plain string"))).rejects.toBe(
      "plain string",
    );
    expect(events[0]!.error).toEqual({ name: "NonError", message: "plain string" });
  });

  it("omits the stack when includeStack is false", async () => {
    const { chiplog, events } = harness({ includeStack: false });
    await expect(chiplog.run("x", () => Promise.reject(new Error("e")))).rejects.toThrow();
    expect(events[0]!.error?.stack).toBeUndefined();
  });
});

describe("set", () => {
  it("merges fields flat onto the event", async () => {
    const { chiplog, events } = harness();
    await chiplog.run("x", (flow) => flow.set({ orgId: "org_1", retries: 2 }));
    expect(events[0]).toMatchObject({ orgId: "org_1", retries: 2 });
  });

  it("reports reserved-key collisions instead of dropping them silently", async () => {
    const { chiplog, events } = harness();
    await chiplog.run("x", (flow) => flow.set({ outcome: "hijacked", flow: "nope", ok: 1 }));
    expect(events[0]!.outcome).toBe("ok");
    expect(events[0]!.flow).toBe("x");
    expect(events[0]!.shadowedFields).toEqual(["outcome", "flow"]);
    expect(events[0]!.ok).toBe(1);
  });

  it("skips undefined values", async () => {
    const { chiplog, events } = harness();
    await chiplog.run("x", (flow) => flow.set({ a: undefined, b: null }));
    expect("a" in events[0]!).toBe(false);
    expect(events[0]!.b).toBeNull();
  });
});

describe("nesting", () => {
  it("gives a child its own event linked to the parent", async () => {
    const { chiplog, events } = harness();

    await chiplog.run("outer", async (outer) => {
      outer.stage("started");
      await chiplog.run("inner", (inner) => inner.stage("worked"));
    });

    expect(events).toHaveLength(2);
    const [inner, outer] = events;
    expect(inner!.flow).toBe("inner");
    expect(outer!.flow).toBe("outer");
    expect(inner!.correlationId).toBe(outer!.correlationId);
    expect(inner!.parentFlowId).toBe(outer!.flowId);
    expect(outer!.parentFlowId).toBeUndefined();
  });
});

describe("seeds and trace context", () => {
  it("continues an upstream traceparent", async () => {
    const { chiplog, events } = harness();
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const seed = chiplog.seedFromHeaders((name) =>
      name === "traceparent" ? `00-${traceId}-00f067aa0ba902b7-01` : undefined,
    );

    await chiplog.run("http.GET /x", () => undefined, seed);

    expect(events[0]!.correlationId).toBe(traceId);
    expect(events[0]!.traceparent).toMatch(new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`));
  });

  it("falls back to x-request-id, and ignores a malformed traceparent", async () => {
    const { chiplog, events } = harness();
    const seed = chiplog.seedFromHeaders((name) => {
      if (name === "traceparent") return "garbage";
      if (name === "x-request-id") return "req-42";
      return undefined;
    });
    await chiplog.run("x", () => undefined, seed);
    expect(events[0]!.correlationId).toBe("req-42");
  });
});

describe("sink safety", () => {
  it("does not let a throwing sink replace the caller's error", async () => {
    const onSinkError = vi.fn();
    const { chiplog } = harness({
      sink: () => {
        throw new Error("logger is down");
      },
      onSinkError,
    });

    await expect(chiplog.run("x", () => Promise.reject(new Error("real failure")))).rejects.toThrow(
      "real failure",
    );
    expect(onSinkError).toHaveBeenCalledOnce();
  });
});

describe("wrap and runSync", () => {
  it("wrap turns every call into a flow", async () => {
    const { chiplog, events } = harness();
    const charge = chiplog.wrap("billing.charge", (amount: number) => {
      stage("authorised", { amount });
      return amount * 2;
    });
    await expect(charge(21)).resolves.toBe(42);
    expect(events[0]!.stages[0]).toMatchObject({ name: "authorised", meta: { amount: 21 } });
  });

  it("runSync flushes synchronously", () => {
    const { chiplog, events } = harness();
    const value = chiplog.runSync("sync", (flow) => {
      flow.stage("did");
      return 7;
    });
    expect(value).toBe(7);
    expect(events).toHaveLength(1);
  });
});
