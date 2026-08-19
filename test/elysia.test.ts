import { Elysia } from "elysia";
import { describe, expect, it } from "vitest";

import { elysiaChiplog } from "../src/elysia";
import { stage } from "../src/index";
import { harness } from "./helpers";

/** `onAfterResponse` fires after `handle()` resolves, so let the loop turn. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

/** Structural, so a fully-typed app with routes is accepted as-is. */
type Handleable = { handle: (request: Request) => Promise<Response> };

const get = (app: Handleable, path: string, headers?: Record<string, string>) =>
  app.handle(new Request(`http://localhost${path}`, headers ? { headers } : undefined));

/**
 * Elysia requires Node 20+: its own code reaches for the global `crypto`, which
 * Node 18 does not define. chiplog's core supports 18, and the rest of the suite
 * proves it there — only this adapter is gated.
 */
const NODE_MAJOR = Number(process.versions.node.split(".")[0]);

describe.skipIf(NODE_MAJOR < 20)("elysia adapter", () => {
  it("wraps a request, labels it by route pattern and returns the correlation id", async () => {
    const { chiplog, events } = harness();
    const app = new Elysia()
      .use(elysiaChiplog(chiplog))
      .get("/users/:id", ({ params }) => {
        stage("loaded", { id: params.id });
        return { ok: true };
      });

    const response = await get(app, "/users/42");
    await settle();

    expect(response.status).toBe(200);
    const event = events[0]!;
    expect(response.headers.get("x-correlation-id")).toBe(event.correlationId);
    expect(event.flow).toBe("http.GET /users/:id");
    expect(event.outcome).toBe("ok");
    expect(event).toMatchObject({
      method: "GET",
      path: "/users/42",
      route: "/users/:id",
      status: 200,
    });
    expect(event.stages[0]).toMatchObject({ name: "loaded", meta: { id: "42" } });
  });

  it("records stages raised deep below the handler", async () => {
    const { chiplog, events } = harness();

    async function repository(): Promise<void> {
      await new Promise((resolve) => setTimeout(resolve, 1));
      stage("db_query", { table: "orders" });
    }
    async function service(): Promise<void> {
      stage("service_entered");
      await repository();
    }

    const app = new Elysia().use(elysiaChiplog(chiplog)).get("/orders", async () => {
      stage("received");
      await service();
      return "ok";
    });

    await get(app, "/orders");
    await settle();

    expect(events[0]!.stages.map((s) => s.name)).toEqual([
      "received",
      "service_entered",
      "db_query",
    ]);
  });

  it("keeps concurrent requests completely separate", async () => {
    const { chiplog, events } = harness();
    const app = new Elysia().use(elysiaChiplog(chiplog)).get("/w/:id", async ({ params }) => {
      stage(`start_${params.id}`);
      await new Promise((resolve) => setTimeout(resolve, params.id === "slow" ? 30 : 1));
      stage(`end_${params.id}`);
      return params.id;
    });

    await Promise.all([get(app, "/w/slow"), get(app, "/w/fast"), get(app, "/w/mid")]);
    await settle();

    expect(events).toHaveLength(3);
    const ids = new Set(events.map((event) => event.correlationId));
    expect(ids.size).toBe(3);
    for (const event of events) {
      const names = event.stages.map((s) => s.name);
      expect(names).toHaveLength(2);
      const which = names[0]!.replace("start_", "");
      expect(names).toEqual([`start_${which}`, `end_${which}`]);
      expect(event.path).toBe(`/w/${which}`);
    }
  });

  it("continues an inbound traceparent", async () => {
    const { chiplog, events } = harness();
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const app = new Elysia().use(elysiaChiplog(chiplog)).get("/", () => "ok");

    await get(app, "/", { traceparent: `00-${traceId}-00f067aa0ba902b7-01` });
    await settle();

    expect(events[0]!.correlationId).toBe(traceId);
  });

  it("fails the flow at the stage a thrown handler died on", async () => {
    const { chiplog, events } = harness();
    const app = new Elysia().use(elysiaChiplog(chiplog)).get("/boom", () => {
      stage("about_to_fail");
      throw new Error("handler exploded");
    });

    const response = await get(app, "/boom");
    await settle();

    expect(response.status).toBe(500);
    const event = events[0]!;
    expect(event.outcome).toBe("failed");
    expect(event.failedStage).toBe("about_to_fail");
    expect(event.error?.message).toBe("handler exploded");
    expect(event.status).toBe(500);
  });

  it("treats a 404 as a normal outcome, not a failed flow", async () => {
    const { chiplog, events } = harness();
    const app = new Elysia().use(elysiaChiplog(chiplog)).get("/", () => "ok");

    const response = await get(app, "/nothing/here");
    await settle();

    expect(response.status).toBe(404);
    const event = events[0]!;
    expect(event.outcome).toBe("ok");
    expect(event.errorCode).toBe("NOT_FOUND");
    expect(event.status).toBe(404);
    expect(event.flow).toBe("http.GET (unmatched)");
    expect(event.route).toBeUndefined();
  });

  it("can be told which errors count as failures", async () => {
    const { chiplog, events } = harness();
    const app = new Elysia()
      .use(elysiaChiplog(chiplog, { failed: ({ error }) => error }))
      .get("/", () => "ok");

    await get(app, "/nothing/here");
    await settle();

    expect(events[0]!.outcome).toBe("failed");
  });

  it("can be told not to send a response header", async () => {
    const { chiplog } = harness();
    const app = new Elysia()
      .use(elysiaChiplog(chiplog, { responseHeader: null }))
      .get("/", () => "ok");

    const response = await get(app, "/");
    expect(response.headers.get("x-correlation-id")).toBeNull();
  });

  it("does not let a finished request's context capture later stages", async () => {
    // `enter()` uses `enterWith`, which mutates the current execution context
    // instead of creating one, so the store can outlive the request in the
    // caller's context. It is inert rather than wrong: a flushed flow ignores
    // everything, so a stray ambient call cannot append to a shipped event or
    // resurrect it.
    const { chiplog, events } = harness();
    const app = new Elysia().use(elysiaChiplog(chiplog)).get("/", () => "ok");

    await get(app, "/");
    await settle();
    const before = JSON.stringify(events[0]);

    stage("long_after_the_response", { leaked: true });
    await settle();

    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0])).toBe(before);
  });

  it("emits exactly one event per request", async () => {
    const { chiplog, events } = harness();
    const app = new Elysia().use(elysiaChiplog(chiplog)).get("/", () => "ok");

    await get(app, "/");
    await get(app, "/");
    await settle();

    expect(events).toHaveLength(2);
  });
});
